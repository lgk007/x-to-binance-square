import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("content/composer.js", "utf8");

test("closed composer does not intercept pointer input", () => {
  assert.match(source, /\.backdrop\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(source, /\.panel\s*\{[^}]*pointer-events:\s*none;/s);
});

test("open composer restores pointer input for its backdrop and panel", () => {
  assert.match(source, /\.shell\.open \.backdrop\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(source, /\.shell\.open \.panel\s*\{[^}]*pointer-events:\s*auto;/s);
});

test("uncertain composer requires explicit confirmation before retrying", () => {
  assert.match(source, /我已确认未发布，重新发布/);
  assert.match(source, /retryToken/);
  assert.doesNotMatch(source, /retryConfirmed/);
});
