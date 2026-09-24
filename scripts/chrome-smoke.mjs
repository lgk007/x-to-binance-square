import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const extensionRoot = resolve(process.argv[2] || ".");
const defaultChromePath = process.platform === "win32"
  ? join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
  : "google-chrome";
const chromePath = process.env.CHROME_PATH || defaultChromePath;

if (process.platform === "win32" && !existsSync(chromePath)) {
  throw new Error(`Chrome not found at ${chromePath}. Set CHROME_PATH to override.`);
}

const profileDir = mkdtempSync(join(tmpdir(), "x-to-binance-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--allow-file-access-from-files",
  `--user-data-dir=${profileDir}`,
  "--remote-debugging-pipe",
  "--enable-unsafe-extension-debugging",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });

const commandPipe = chrome.stdio[3];
const responsePipe = chrome.stdio[4];
if (!commandPipe || !responsePipe) throw new Error("Chrome debugging pipes were not created.");

let nextId = 0;
let responseBuffer = "";
const pending = new Map();
const stderr = [];

chrome.stderr.on("data", (chunk) => {
  stderr.push(chunk.toString());
  if (stderr.length > 20) stderr.shift();
});

responsePipe.on("data", (chunk) => {
  responseBuffer += chunk.toString();
  let delimiter;
  while ((delimiter = responseBuffer.indexOf("\0")) >= 0) {
    const raw = responseBuffer.slice(0, delimiter);
    responseBuffer = responseBuffer.slice(delimiter + 1);
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) continue;
    const { resolve: resolveCommand, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(`${message.error.code}: ${message.error.message}`));
    else resolveCommand(message.result);
  }
});

function command(method, params = {}, sessionId = null) {
  const id = ++nextId;
  return new Promise((resolveCommand, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 15_000);
    pending.set(id, { resolve: resolveCommand, reject, timer });
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    commandPipe.write(`${JSON.stringify(message)}\0`);
  });
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

try {
  await command("Browser.getVersion");
  const { id } = await command("Extensions.loadUnpacked", { path: extensionRoot });
  const { extensions } = await command("Extensions.getExtensions");

  let targets = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    ({ targetInfos: targets } = await command("Target.getTargets"));
    if (targets.some((target) => target.type === "service_worker" && target.url.startsWith(`chrome-extension://${id}/`))) break;
    await wait(250);
  }

  const loaded = extensions.find((extension) => extension.id === id);
  const serviceWorker = targets.find((target) => target.type === "service_worker" && target.url.startsWith(`chrome-extension://${id}/`));
  const optionsPage = targets.find((target) => target.type === "page" && target.url === `chrome-extension://${id}/options/options.html`);
  if (!loaded?.enabled) throw new Error("Chrome returned the extension but it is not enabled.");
  if (!serviceWorker) throw new Error("The extension loaded, but its Service Worker did not start.");

  const fixtureUrl = pathToFileURL(resolve("tests/fixtures/composer-clickthrough.html")).href;
  const { targetId } = await command("Target.createTarget", { url: fixtureUrl });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  let clickthrough = false;
  let hitTarget = "not-ready";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const evaluation = await command("Runtime.evaluate", {
      expression: "({ passed: window.__composerClickthrough === true, hitTarget: window.__composerHitTarget || 'not-ready' })",
      returnByValue: true,
    }, sessionId);
    clickthrough = evaluation.result?.value?.passed === true;
    hitTarget = evaluation.result?.value?.hitTarget || "unknown";
    if (clickthrough) break;
    await wait(250);
  }
  if (!clickthrough) throw new Error(`Closed composer still intercepted the click; hit target: ${hitTarget}`);

  console.log(JSON.stringify({
    extensionId: id,
    name: loaded.name,
    version: loaded.version,
    enabled: loaded.enabled,
    serviceWorker: serviceWorker.url,
    optionsPageOpened: Boolean(optionsPage),
    closedComposerClickthrough: clickthrough,
  }, null, 2));
} catch (error) {
  const details = stderr.join("").trim();
  if (details) console.error(details);
  throw error;
} finally {
  if (chrome.exitCode === null) {
    const exitPromise = new Promise((resolveExit) => chrome.once("exit", resolveExit));
    await command("Browser.close").catch(() => {});
    await Promise.race([exitPromise, wait(3_000)]);
  }
  if (chrome.exitCode === null) chrome.kill();
  const tempRoot = resolve(tmpdir());
  const resolvedProfile = resolve(profileDir);
  if (resolvedProfile.startsWith(`${tempRoot}\\`) || resolvedProfile.startsWith(`${tempRoot}/`)) {
    try {
      rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      console.warn(`Chrome smoke test passed, but its temporary profile could not be removed: ${resolvedProfile}`);
    }
  }
}
