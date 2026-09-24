const RETRY_CONFIRMATION = "未确认是否已经发布。请先到币安广场检查。";
const NETWORK_BASE_MESSAGE = "无法连接币安发布接口。请确认 Veee 使用全局代理，或让 www.binance.com 走代理后再重试。";

function withNetworkDetail(error) {
  const detail = String(error.detail || "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (!detail) return { message: NETWORK_BASE_MESSAGE };
  return {
    message: `无法连接币安发布接口（底层原因：${detail}）。请在扩展设置页运行“网络诊断”，或让 www.binance.com 走代理后再重试。`,
    detail,
  };
}

export function describeUnconfirmedError(error = {}) {
  const errorCode = String(error.code || error.errorCode || "UNKNOWN");
  const candidateStatus = error.status ?? error.httpStatus;
  const httpStatus = Number.isInteger(candidateStatus) ? candidateStatus : null;

  if (errorCode === "NETWORK") {
    return {
      diagnosticKind: "network",
      errorCode,
      httpStatus,
      ...withNetworkDetail(error),
    };
  }

  if (errorCode === "NON_JSON") {
    return {
      diagnosticKind: "non_json",
      errorCode,
      httpStatus,
      message: `币安发布接口返回了无法识别的响应${httpStatus ? `（HTTP ${httpStatus}）` : ""}。请检查 VPN 分流或稍后重试。`,
    };
  }

  if (errorCode === "TIMEOUT") {
    return {
      diagnosticKind: "timeout",
      errorCode,
      httpStatus,
      message: "币安发布接口请求超时。",
    };
  }

  if (errorCode === "INTERRUPTED") {
    return {
      diagnosticKind: "interrupted",
      errorCode,
      httpStatus,
      message: "上次发布在提交阶段中断。",
    };
  }

  return {
    diagnosticKind: "unknown_interruption",
    errorCode,
    httpStatus,
    message: "币安发布请求意外中断。请检查 VPN 分流或稍后重试。",
  };
}

export function createRetryToken(createToken = () => globalThis.crypto.randomUUID()) {
  const token = String(createToken() || "");
  if (!token) throw new Error("Failed to create retry token");
  return token;
}

export function buildUncertainFields(error, createToken) {
  const diagnostic = describeUnconfirmedError(error);
  return {
    status: "uncertain",
    ...diagnostic,
    message: `${diagnostic.message} ${RETRY_CONFIRMATION}`,
    retryToken: createRetryToken(createToken),
  };
}

export class PublishAttemptGate {
  constructor() {
    this.inFlight = new Set();
  }

  claim({ tweetId, record, retryToken, recentPublishing = false }) {
    const id = String(tweetId);
    const hasRetryToken = Boolean(retryToken);

    if (hasRetryToken) {
      if (record?.status !== "uncertain" || record.retryToken !== retryToken) {
        return { action: "stale-retry" };
      }
      if (this.inFlight.has(id)) return { action: "busy" };
      this.inFlight.add(id);
      return { action: "start", confirmedRetry: true };
    }

    if (record?.status === "published" || record?.status === "uncertain") {
      return { action: "existing" };
    }
    if (recentPublishing || this.inFlight.has(id)) return { action: "busy" };

    this.inFlight.add(id);
    return { action: "start", confirmedRetry: false };
  }

  release(tweetId) {
    this.inFlight.delete(String(tweetId));
  }
}
