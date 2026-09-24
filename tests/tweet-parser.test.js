import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadParser() {
  const context = vm.createContext({ URL });
  vm.runInContext(readFileSync("content/tweet-parser.js", "utf8"), context);
  return context.XToBinance.TweetParser;
}

test("content parser normalizes handles and tweet permalinks", () => {
  const parser = loadParser();
  assert.equal(parser.normalizeHandle(" @Trader_One "), "trader_one");
  const parsed = parser.parseTweetPermalink("/Trader_One/status/998877/photo/1");
  assert.equal(parsed.handle, "trader_one");
  assert.equal(parsed.tweetId, "998877");
  assert.equal(parsed.url, "https://x.com/Trader_One/status/998877");
});

test("content parser rejects links outside X", () => {
  const parser = loadParser();
  assert.equal(parser.parseTweetPermalink("https://example.com/user/status/1"), null);
});

test("expandTruncatedText clicks the localized show-more button once", () => {
  const parser = loadParser();
  const clicked = [];
  const button = { textContent: " 显示更多 ", click: () => clicked.push("show-more") };
  const other = { textContent: "转发", click: () => clicked.push("repost") };
  const article = { querySelectorAll: () => [other, button] };

  assert.equal(parser.expandTruncatedText(article), true);
  assert.deepEqual(clicked, ["show-more"]);
  assert.equal(parser.expandTruncatedText({ querySelectorAll: () => [other] }), false);
  assert.equal(parser.expandTruncatedText(null), false);
});
