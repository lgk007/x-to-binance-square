import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUncertainFields,
  describeUnconfirmedError,
  PublishAttemptGate,
} from "../background/publish-state.js";

test("requires the current uncertain token and consumes one attempt in memory", () => {
  const gate = new PublishAttemptGate();
  const record = { status: "uncertain", retryToken: "token-current" };

  assert.equal(gate.claim({ tweetId: "1", record, retryToken: "" }).action, "existing");
  assert.equal(gate.claim({ tweetId: "1", record, retryToken: "token-old" }).action, "stale-retry");

  const first = gate.claim({ tweetId: "1", record, retryToken: "token-current" });
  assert.deepEqual(first, { action: "start", confirmedRetry: true });
  assert.equal(gate.claim({ tweetId: "1", record, retryToken: "token-current" }).action, "busy");

  gate.release("1");
  assert.equal(gate.claim({
    tweetId: "1",
    record: { status: "uncertain", retryToken: "token-next" },
    retryToken: "token-current",
  }).action, "stale-retry");
});

test("a retry token never authorizes missing, failed, publishing, or published records", () => {
  for (const record of [
    null,
    { status: "failed" },
    { status: "publishing" },
    { status: "published" },
  ]) {
    const gate = new PublishAttemptGate();
    assert.equal(gate.claim({ tweetId: "1", record, retryToken: "token" }).action, "stale-retry");
  }
});

test("ordinary attempts keep existing terminal protection", () => {
  const gate = new PublishAttemptGate();
  assert.equal(gate.claim({ tweetId: "1", record: { status: "published" }, retryToken: "" }).action, "existing");
  assert.equal(gate.claim({ tweetId: "2", record: { status: "uncertain" }, retryToken: "" }).action, "existing");
  assert.deepEqual(gate.claim({ tweetId: "3", record: { status: "failed" }, retryToken: "" }), {
    action: "start",
    confirmedRetry: false,
  });
});

test("maps unconfirmed failures to safe actionable diagnostics", () => {
  assert.deepEqual(describeUnconfirmedError({ code: "NETWORK" }), {
    diagnosticKind: "network",
    errorCode: "NETWORK",
    httpStatus: null,
    message: "无法连接币安发布接口。请确认 Veee 使用全局代理，或让 www.binance.com 走代理后再重试。",
  });

  assert.deepEqual(describeUnconfirmedError({ code: "NON_JSON", status: 502 }), {
    diagnosticKind: "non_json",
    errorCode: "NON_JSON",
    httpStatus: 502,
    message: "币安发布接口返回了无法识别的响应（HTTP 502）。请检查 VPN 分流或稍后重试。",
  });

  assert.doesNotMatch(describeUnconfirmedError({
    code: "UNKNOWN",
    message: "secret response body",
  }).message, /secret response body/);
});

test("network diagnostics message carries the underlying fetch cause", () => {
  const withDetail = describeUnconfirmedError({ code: "NETWORK", detail: "  Failed   to fetch " });
  assert.match(withDetail.message, /底层原因：Failed to fetch/);
  assert.equal(withDetail.detail, "Failed to fetch");
  assert.equal(describeUnconfirmedError({ code: "NETWORK" }).detail, undefined);
});

test("creates a fresh token for every uncertain result", () => {
  const tokens = ["token-a", "token-b"];
  const first = buildUncertainFields({ code: "NETWORK" }, () => tokens.shift());
  const second = buildUncertainFields({ code: "NETWORK" }, () => tokens.shift());

  assert.equal(first.retryToken, "token-a");
  assert.equal(second.retryToken, "token-b");
  assert.notEqual(first.retryToken, second.retryToken);
  assert.equal(first.status, "uncertain");
});

