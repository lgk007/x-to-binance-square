const API_V1 = "https://www.binance.com/bapi/composite/v1/public/pgc/openApi";
const API_V2 = "https://www.binance.com/bapi/composite/v2/public/pgc/openApi";

const ERROR_MESSAGES = new Map([
  ["220003", "Square API Key 不存在，请在扩展设置中重新填写。"],
  ["220004", "Square API Key 已过期，请在币安创作者中心重新生成。"],
  ["220009", "今天的币安广场发帖次数已达到上限。"],
  ["220014", "今天的图片上传次数已达到上限。"],
  ["20002", "内容包含币安广场不允许的敏感词。"],
  ["20022", "内容包含币安广场不允许的敏感词。"],
  ["20013", "正文超过币安广场允许的长度。"],
  ["20020", "正文不能为空。"],
  ["220011", "正文不能为空。"],
  ["30008", "当前账号或设备被限制发布币安广场内容。"],
  ["2000001", "当前账号或设备被限制发布币安广场内容。"],
  ["2000002", "当前账号或设备被限制发布币安广场内容。"],
]);

export class SquareApiError extends Error {
  constructor(code, message, { confirmed = true, status = null, detail = "" } = {}) {
    super(message);
    this.name = "SquareApiError";
    this.code = String(code);
    this.confirmed = confirmed;
    this.status = status;
    this.detail = detail;
  }
}

export function friendlySquareError(code, fallbackMessage = "币安广场发布失败。") {
  return ERROR_MESSAGES.get(String(code)) || fallbackMessage;
}

async function parseResponse(response, endpoint) {
  if (endpoint === "/content/add" && response.status === 504) {
    return { publishStatus: "uncertain", id: null, shareLink: null };
  }

  const raw = await response.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new SquareApiError(
      "NON_JSON",
      `币安接口返回了无法识别的响应（HTTP ${response.status}）。`,
      { confirmed: false, status: response.status },
    );
  }

  if (json.code !== "000000") {
    const fallback = json.message ? `币安广场发布失败：${json.message}` : "币安广场发布失败。";
    throw new SquareApiError(json.code ?? response.status, friendlySquareError(json.code, fallback), {
      confirmed: true,
      status: response.status,
    });
  }

  return json.data;
}

export class BinanceSquareClient {
  // The arrow wrapper is required: Chrome throws "Illegal invocation" when
  // globalThis.fetch is stored detached and called as an object method.
  constructor(apiKey, { fetchImpl = (url, init) => globalThis.fetch(url, init) } = {}) {
    if (!apiKey) throw new SquareApiError("MISSING_KEY", "请先在扩展设置中填写 Square API Key。");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async request(endpoint, body, baseUrl = API_V2) {
    let response;
    try {
      response = await this.fetchImpl(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "X-Square-OpenAPI-Key": this.apiKey,
          "Content-Type": "application/json",
          clienttype: "binanceSkill",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new SquareApiError("NETWORK", "无法连接币安广场，请检查网络后重试。", {
        confirmed: false,
        detail: String(error?.message || error).slice(0, 160),
      });
    }

    return parseResponse(response, endpoint);
  }

  createImageUpload(imageName) {
    return this.request("/image/presignedUrl", { imageName });
  }

  getImageStatus(fileTicket) {
    return this.request("/image/imageStatus", { fileTicket });
  }

  publishPost({ text, imageUrls }) {
    const body = { contentType: 1, bodyTextOnly: text };
    if (imageUrls.length) body.imageList = imageUrls;
    return this.request("/content/add", body, API_V1);
  }
}
