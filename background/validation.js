export const MAX_IMAGE_COUNT = 4;
export const MAX_POST_TEXT_LENGTH = 10_000;

export class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

export function normalizeHandle(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function parseTweetUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !["x.com", "www.x.com"].includes(url.hostname)) {
    return null;
  }

  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/i);
  if (!match) return null;

  return {
    handle: normalizeHandle(match[1]),
    tweetId: match[2],
    canonicalUrl: `https://x.com/${match[1]}/status/${match[2]}`,
  };
}

export function isAllowedTwitterImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pbs.twimg.com" && url.pathname.startsWith("/media/");
  } catch {
    return false;
  }
}

export function isAllowedUploadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".amazonaws.com");
  } catch {
    return false;
  }
}

export function composePostText({ text, appendSource, sourceUrl }) {
  const body = String(text ?? "").trim();
  if (!appendSource) return body;
  return body ? `${body}\n\n${sourceUrl}` : sourceUrl;
}

export function validatePublishPayload(payload, configuredHandle) {
  if (!payload || typeof payload !== "object") {
    throw new ValidationError("INVALID_PAYLOAD", "发布数据无效。请刷新页面后重试。");
  }

  const handle = normalizeHandle(configuredHandle);
  if (!handle) {
    throw new ValidationError("MISSING_HANDLE", "请先在扩展设置中填写 X 用户名。");
  }

  const parsedUrl = parseTweetUrl(payload.sourceUrl);
  if (!parsedUrl || parsedUrl.handle !== handle) {
    throw new ValidationError("INVALID_SOURCE", "原推文链接与设置的 X 用户名不匹配。");
  }

  if (String(payload.tweetId ?? "") !== parsedUrl.tweetId) {
    throw new ValidationError("INVALID_TWEET_ID", "推文 ID 与原链接不匹配。");
  }

  if (typeof payload.text !== "string" || payload.text.length > MAX_POST_TEXT_LENGTH) {
    throw new ValidationError("INVALID_TEXT", "正文无效或超过插件的安全长度限制。");
  }

  if (typeof payload.appendSource !== "boolean") {
    throw new ValidationError("INVALID_APPEND_SOURCE", "原链接开关状态无效。");
  }

  if (!Array.isArray(payload.imageUrls) || payload.imageUrls.length > MAX_IMAGE_COUNT) {
    throw new ValidationError("INVALID_IMAGES", "每条内容最多选择 4 张图片。");
  }

  const imageUrls = [...new Set(payload.imageUrls)];
  if (imageUrls.some((url) => !isAllowedTwitterImageUrl(url))) {
    throw new ValidationError("INVALID_IMAGE_URL", "检测到不受支持的图片来源。");
  }

  const sourceUrl = parsedUrl.canonicalUrl;
  const postText = composePostText({
    text: payload.text,
    appendSource: payload.appendSource,
    sourceUrl,
  });
  if (!postText) {
    throw new ValidationError("EMPTY_POST", "正文和原推文链接不能同时为空。");
  }

  let retryToken = "";
  if (Object.hasOwn(payload, "retryToken")) {
    if (typeof payload.retryToken !== "string" || !payload.retryToken || payload.retryToken.length > 128) {
      throw new ValidationError("INVALID_RETRY_TOKEN", "重新发布确认已失效，请关闭后重新打开发布面板。");
    }
    retryToken = payload.retryToken;
  }

  return {
    tweetId: parsedUrl.tweetId,
    sourceUrl,
    text: payload.text,
    appendSource: payload.appendSource,
    postText,
    imageUrls,
    retryToken,
  };
}

export function assertTrustedXSender(sender) {
  const tabUrl = sender?.tab?.url;
  if (!tabUrl) {
    throw new ValidationError("UNTRUSTED_SENDER", "无法确认请求来源。");
  }

  try {
    const url = new URL(tabUrl);
    if (url.protocol !== "https:" || url.hostname !== "x.com") throw new Error("untrusted");
  } catch {
    throw new ValidationError("UNTRUSTED_SENDER", "请求不是来自 x.com。");
  }
}
