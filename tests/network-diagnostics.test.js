import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConclusion,
  classifyJsonProbe,
  classifyNetworkFailure,
  runNetworkDiagnostics,
} from "../background/network-diagnostics.js";

function response(status, body) {
  return { status, text: async () => body };
}

const API_URL = "https://www.binance.com/bapi/composite/v2/public/pgc/openApi/image/imageStatus";
const PAGE_URL = "https://www.binance.com/";
const X_URL = "https://x.com/";

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (typeof route === "function") return route();
    if (route instanceof Error) throw route;
    return route;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test("classifies API probe responses", () => {
  assert.equal(classifyJsonProbe(response(200, JSON.stringify({ code: "220003" })), JSON.stringify({ code: "220003" })).outcome, "ok");
  assert.equal(classifyJsonProbe(response(403, "<html>blocked</html>"), "<html>blocked</html>").outcome, "blocked");
  assert.equal(classifyJsonProbe(response(502, "<html>bad gateway</html>"), "<html>bad gateway</html>").outcome, "non_json");
});

test("classifies fetch failures and aborts as network errors", () => {
  assert.equal(classifyNetworkFailure(new Error("Failed to fetch"), 30, 10_000).outcome, "network_error");
  const abort = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
  assert.match(classifyNetworkFailure(abort, 10_001, 10_000).note, /超过 10000ms/);
});

test("reports all probes healthy when the API returns JSON", async () => {
  const fetchImpl = mockFetch({
    [API_URL]: response(200, JSON.stringify({ code: "220003", message: "key not exist" })),
    [PAGE_URL]: response(200, "<html>binance</html>"),
    [X_URL]: response(200, "<html>x</html>"),
  });

  const report = await runNetworkDiagnostics({ fetchImpl, apiKey: "my-key" });
  assert.deepEqual(report.probes.map((probe) => probe.outcome), ["ok", "ok", "ok"]);
  assert.match(report.conclusion, /链路正常/);

  const apiCall = fetchImpl.calls.find((call) => call.url === API_URL);
  assert.equal(apiCall.init.headers["X-Square-OpenAPI-Key"], "my-key");
  assert.equal(JSON.parse(apiCall.init.body).fileTicket, "xtb-network-diagnostic");
});

test("omits the key header when no API key is stored", async () => {
  const fetchImpl = mockFetch({
    [API_URL]: response(200, JSON.stringify({ code: "220003" })),
    [PAGE_URL]: response(200, ""),
    [X_URL]: response(200, ""),
  });
  const report = await runNetworkDiagnostics({ fetchImpl });
  assert.equal(report.probes[0].outcome, "ok");
  assert.equal(fetchImpl.calls.find((call) => call.url === API_URL).init.headers["X-Square-OpenAPI-Key"], undefined);
});

test("pinpoints split-proxy rules that miss the API path", async () => {
  const fetchImpl = mockFetch({
    [API_URL]: new Error("Failed to fetch"),
    [PAGE_URL]: response(200, ""),
    [X_URL]: response(200, ""),
  });
  const report = await runNetworkDiagnostics({ fetchImpl });
  assert.deepEqual(report.probes.map((probe) => probe.outcome), ["network_error", "ok", "ok"]);
  assert.match(report.conclusion, /\/bapi\//);
});

test("detects binance domains missing from proxy rules", async () => {
  const fetchImpl = mockFetch({
    [API_URL]: new Error("Failed to fetch"),
    [PAGE_URL]: new Error("Failed to fetch"),
    [X_URL]: response(200, ""),
  });
  const report = await runNetworkDiagnostics({ fetchImpl });
  assert.match(report.conclusion, /www\.binance\.com/);
  assert.match(report.conclusion, /分流规则/);
});

test("detects a fully dead proxy", async () => {
  const fetchImpl = mockFetch({
    [API_URL]: new Error("Failed to fetch"),
    [PAGE_URL]: new Error("Failed to fetch"),
    [X_URL]: new Error("Failed to fetch"),
  });
  const report = await runNetworkDiagnostics({ fetchImpl });
  assert.match(report.conclusion, /代理很可能未生效/);
});

test("suggests node switching when the API returns a block page", async () => {
  const fetchImpl = mockFetch({
    [API_URL]: response(502, "<html>challenge</html>"),
    [PAGE_URL]: response(200, ""),
    [X_URL]: response(200, ""),
  });
  const report = await runNetworkDiagnostics({ fetchImpl });
  assert.equal(report.probes[0].outcome, "non_json");
  assert.match(report.conclusion, /出口节点|风控/);
});

test("conclusion handles blocked API with healthy pages and empty probe lists", () => {
  assert.match(
    buildConclusion([
      { id: "binance_api", outcome: "blocked" },
      { id: "binance_page", outcome: "ok" },
      { id: "x_page", outcome: "ok" },
    ]),
    /风控|节点/,
  );
  assert.match(buildConclusion([]), /未获得任何探测结果/);
});
