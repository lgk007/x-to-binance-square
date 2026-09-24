const SETTINGS_KEY = "settings";
const API_KEY = "squareOpenApiKey";
const SYNC_RECORDS_KEY = "syncRecords";

const elements = {
  form: document.querySelector("#settings-form"),
  handle: document.querySelector("#x-handle"),
  apiKey: document.querySelector("#api-key"),
  appendSource: document.querySelector("#append-source"),
  keyState: document.querySelector("#key-state"),
  removeKey: document.querySelector("#remove-key"),
  clearHistory: document.querySelector("#clear-history"),
  history: document.querySelector("#history"),
  formMessage: document.querySelector("#form-message"),
  configurationStatus: document.querySelector("#configuration-status"),
  statusLight: document.querySelector("#status-light"),
  runDiagnostics: document.querySelector("#run-diagnostics"),
  probeResults: document.querySelector("#probe-results"),
  networkConclusion: document.querySelector("#network-conclusion"),
};

function normalizeHandle(value) {
  return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function maskApiKey(key) {
  if (!key) return "";
  if (key.length <= 9) return `${key.slice(0, 2)}...`;
  return `${key.slice(0, 5)}...${key.slice(-4)}`;
}

function setMessage(message, kind = "") {
  elements.formMessage.textContent = message;
  elements.formMessage.className = `form-message ${kind}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "时间未知" : date.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(status) {
  return {
    published: "已发布",
    uncertain: "待确认",
    failed: "失败",
    publishing: "处理中",
  }[status] || status;
}

async function removeRecord(tweetId) {
  const result = await chrome.storage.local.get([SYNC_RECORDS_KEY]);
  const records = result[SYNC_RECORDS_KEY] || {};
  delete records[tweetId];
  await chrome.storage.local.set({ [SYNC_RECORDS_KEY]: records });
  renderHistory(records);
}

function renderHistory(records) {
  elements.history.replaceChildren();
  const entries = Object.entries(records).sort(([, a], [, b]) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
  );
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有同步记录。发布第一条内容后会显示在这里。";
    elements.history.append(empty);
    return;
  }

  for (const [tweetId, record] of entries) {
    const row = document.createElement("div");
    row.className = "record";
    const badge = document.createElement("span");
    badge.className = `record-status ${record.status}`;
    badge.textContent = statusLabel(record.status);
    const main = document.createElement("div");
    main.className = "record-main";
    const link = document.createElement("a");
    link.href = record.shareLink || record.sourceUrl || `https://x.com/i/status/${tweetId}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = record.shareLink || record.sourceUrl || `推文 ${tweetId}`;
    const meta = document.createElement("span");
    const imageInfo = Number.isInteger(record.imageCount)
      ? ` · 图片 ${record.uploadedImageCount ?? record.imageCount}/${record.imageCount}`
      : "";
    meta.textContent = `${formatDate(record.updatedAt || record.publishedAt)} · ${record.message || `推文 ${tweetId}`}${imageInfo}`;
    main.append(link, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.title = "删除这条记录";
    remove.setAttribute("aria-label", "删除这条记录");
    remove.textContent = "×";
    remove.addEventListener("click", () => removeRecord(tweetId));
    row.append(badge, main, remove);
    elements.history.append(row);
  }
}

async function load() {
  const result = await chrome.storage.local.get([SETTINGS_KEY, API_KEY, SYNC_RECORDS_KEY]);
  const settings = result[SETTINGS_KEY] || {};
  const key = String(result[API_KEY] || "");
  elements.handle.value = settings.xHandle || "";
  elements.appendSource.checked = settings.defaultAppendSource !== false;
  elements.keyState.textContent = key ? `已保存：${maskApiKey(key)}` : "尚未保存 Key。";
  elements.removeKey.disabled = !key;
  const ready = Boolean(settings.xHandle && key);
  elements.configurationStatus.textContent = ready ? "可以开始同步" : "还需要完成设置";
  elements.statusLight.classList.toggle("ready", ready);
  renderHistory(result[SYNC_RECORDS_KEY] || {});
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const xHandle = normalizeHandle(elements.handle.value);
  if (!/^[a-z0-9_]{1,15}$/i.test(xHandle)) {
    setMessage("请输入有效的 X 用户名（1–15 位字母、数字或下划线）。", "error");
    elements.handle.focus();
    return;
  }

  const update = {
    [SETTINGS_KEY]: {
      xHandle,
      defaultAppendSource: elements.appendSource.checked,
    },
  };
  const newKey = elements.apiKey.value.trim();
  if (newKey) update[API_KEY] = newKey;
  await chrome.storage.local.set(update);
  elements.apiKey.value = "";
  setMessage("设置已保存。请刷新已经打开的 X 页面。", "success");
  await load();
});

elements.removeKey.addEventListener("click", async () => {
  if (!confirm("确定从这台 Chrome 中移除 Square OpenAPI Key 吗？")) return;
  await chrome.storage.local.remove(API_KEY);
  setMessage("Key 已移除。", "success");
  await load();
});

elements.clearHistory.addEventListener("click", async () => {
  if (!confirm("确定清空所有同步记录吗？清空后插件将无法阻止同一推文再次发布。")) return;
  await chrome.storage.local.set({ [SYNC_RECORDS_KEY]: {} });
  setMessage("同步记录已清空。", "success");
  renderHistory({});
});

const PROBE_OUTCOME_LABELS = {
  ok: "通过",
  blocked: "被拦截",
  non_json: "响应异常",
  network_error: "连不上",
};

function renderProbe(probe) {
  const row = document.createElement("div");
  row.className = "probe";
  const badge = document.createElement("span");
  badge.className = `probe-status ${probe.outcome}`;
  badge.textContent = PROBE_OUTCOME_LABELS[probe.outcome] || probe.outcome;
  const main = document.createElement("div");
  main.className = "probe-main";
  const label = document.createElement("b");
  label.textContent = probe.label;
  const note = document.createElement("span");
  note.textContent = probe.note || "";
  main.append(label, note);
  const elapsed = document.createElement("small");
  elapsed.textContent = Number.isInteger(probe.elapsedMs) ? `${probe.elapsedMs}ms` : "";
  row.append(badge, main, elapsed);
  return row;
}

async function runDiagnostics() {
  elements.runDiagnostics.disabled = true;
  elements.runDiagnostics.textContent = "检测中…";
  elements.probeResults.replaceChildren();
  elements.networkConclusion.textContent = "";
  elements.networkConclusion.className = "network-conclusion";
  try {
    const response = await chrome.runtime.sendMessage({ type: "DIAGNOSE_NETWORK" });
    if (!response?.ok) throw new Error(response?.error?.message || "扩展后台未响应诊断请求。");
    const { probes, conclusion, checkedAt } = response.report;
    elements.probeResults.replaceChildren(...probes.map(renderProbe));
    elements.networkConclusion.textContent = `${conclusion}（检测时间 ${new Date(checkedAt).toLocaleString("zh-CN", { hour12: false })}）`;
    const apiOk = probes.find((probe) => probe.id === "binance_api")?.outcome === "ok";
    elements.networkConclusion.classList.add(apiOk ? "ok" : "bad");
  } catch (error) {
    elements.networkConclusion.textContent = `诊断失败：${error.message}`;
    elements.networkConclusion.classList.add("bad");
  } finally {
    elements.runDiagnostics.disabled = false;
    elements.runDiagnostics.textContent = "开始检测";
  }
}

elements.runDiagnostics.addEventListener("click", runDiagnostics);

load().catch(() => setMessage("读取扩展设置失败，请重新加载此页面。", "error"));
