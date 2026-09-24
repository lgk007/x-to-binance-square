import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

JSON.parse(readFileSync("manifest.json", "utf8"));

const roots = ["background", "content", "options", "scripts", "tests"];
const files = [];

function collect(path) {
  for (const name of readdirSync(path)) {
    const fullPath = join(path, name);
    if (statSync(fullPath).isDirectory()) collect(fullPath);
    else if (name.endsWith(".js") || name.endsWith(".mjs")) files.push(fullPath);
  }
}

for (const root of roots) {
  try {
    collect(root);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log(`Checked manifest and ${files.length} JavaScript files.`);
