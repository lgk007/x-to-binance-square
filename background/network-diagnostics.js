const BINANCE_API_PROBE_URL = "https://www.binance.com/bapi/composite/v2/public/pgc/openApi/image/imageStatus";
const BINANCE_PAGE_PROBE_URL = "https://www.binance.com/";
const X_PROBE_URL = "https://x.com/";

export const PROBE_TIMEOUT_MS = 10_000;
const BLOCKED_STATUSES = new Set([401, 403, 407, 429, 451]);

function previewText(value, limit = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function classifyJsonProbe(response, rawText) {
  const httpStatus = response.status;
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === "object") {
    return {
      outcome: "ok",
      httpStatus,
      note: `接口返回 code=${parsed.code ?? "无"}，链路可达（诊断使用假票据，无副作用）。`,
    };
  }

  if (BLOCKED_STATUSES.has(httpStatus)) {
    return { outcome: "blocked", httpStatus, note: `HTTP ${httpStatus}，疑似币安或代理网关拦截。响应预览：${previewText(rawText) || "（空）"}` };
  }

  return { outcome: "non_json", httpStatus, note: `HTTP ${httpStatus}，响应不是 JSON（多为网关/验证页）。响应预览：${previewText(rawText) || "（空）"}` };
}

export function classifyPageProbe(response) {
  const httpStatus = response.status;
  if (BLOCKED_STATUSES.has(httpStatus)) {
    return { outcome: "blocked", httpStatus, note: `HTTP ${httpStatus}，能连通但被拒绝，疑似风控或代理拦截。` };
  }
  return { outcome: "ok", httpStatus, note: `HTTP ${httpStatus}，能建立连接并收到响应。` };
}

export function classifyNetworkFailure(error, elapsedMs, timeoutMs) {
  if (error?.name === "AbortError") {
    return { outcome: "network_error", httpStatus: null, elapsedMs, note: `请求超过 ${timeoutMs}ms 未完成，已中断。` };
  }
  return {
    outcome: "network_error",
    httpStatus: null,
    elapsedMs,
    note: `请求抛错：${previewText(error?.message || error) || "未知原因"}。`,
  };
}

async function runProbe({ id, label, fetchImpl, url, init, classify, timeoutMs, now }) {
  const startedAt = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, cache: "no-store", signal: controller.signal });
    return { id, label, elapsedMs: now() - startedAt, ...(await classify(response)) };
  } catch (error) {
    return { id, label, ...classifyNetworkFailure(error, now() - startedAt, timeoutMs) };
  } finally {
    clearTimeout(timer);
  }
}

export function buildConclusion(probes) {
  const byId = Object.fromEntries(probes.map((probe) => [probe.id, probe]));
  const api = byId.binance_api;
  const page = byId.binance_page;
  const x = byId.x_page;
  const failed = (probe) => probe?.outcome === "network_error";

  if (api?.outcome === "ok") {
    return "币安发布接口从扩展后台可达，发布链路正常。如果之前发布失败，请重试；持续失败时查看同步记录里的错误码。";
  }
  if (failed(api) && failed(page) && failed(x)) {
    return "x.com 和币安域名在扩展后台全部连不上：代理很可能未生效或未对 Chrome 生效。请确认 VPN 客户端已开启并覆盖 Chrome 流量。";
  }
  if (failed(api) && !failed(page)) {
    return "网页都能打开、只有 /bapi/ 接口连接失败：分流规则或代理网关对 API 请求单独断连。请让 www.binance.com 整域（含路径）走代理或开全局模式后重试。";
  }
  if (!failed(x) && (failed(page) || failed(api))) {
    return "x.com 可达但币安域名连不上：分流规则没有覆盖 www.binance.com。请把该域名加入代理规则，或直接切换全局代理。";
  }
  if (api?.outcome === "non_json" || api?.outcome === "blocked") {
    return "币安接口能连上但返回了验证页或被拒绝：多为代理出口 IP 触发币安风控。请更换出口节点后重试；若仍被拦，稍后再试。";
  }
  if (api) {
    return "诊断结果混杂，未能定位单一原因。请逐项查看下方状态，或稍后重试一次。";
  }
  return "未获得任何探测结果。";
}

export async function runNetworkDiagnostics({
  fetchImpl = (url, init) => globalThis.fetch(url, init),
  apiKey = "",
  timeoutMs = PROBE_TIMEOUT_MS,
  now = () => Date.now(),
} = {}) {
  const apiProbe = await runProbe({
    id: "binance_api",
    label: "币安发布接口（与真实发布同链路）",
    fetchImpl,
    url: BINANCE_API_PROBE_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        clienttype: "binanceSkill",
        ...(apiKey ? { "X-Square-OpenAPI-Key": apiKey } : {}),
      },
      body: JSON.stringify({ fileTicket: "xtb-network-diagnostic" }),
    },
    classify: async (response) => classifyJsonProbe(response, await response.text()),
    timeoutMs,
    now,
  });

  const pageProbe = await runProbe({
    id: "binance_page",
    label: "币安网页（www.binance.com）",
    fetchImpl,
    url: BINANCE_PAGE_PROBE_URL,
    init: { method: "GET" },
    classify: classifyPageProbe,
    timeoutMs,
    now,
  });

  const xProbe = await runProbe({
    id: "x_page",
    label: "X 网页（x.com，对照组）",
    fetchImpl,
    url: X_PROBE_URL,
    init: { method: "GET" },
    classify: classifyPageProbe,
    timeoutMs,
    now,
  });

  const probes = [apiProbe, pageProbe, xProbe];
  return { checkedAt: new Date(now()).toISOString(), probes, conclusion: buildConclusion(probes) };
}
