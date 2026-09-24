import { isAllowedTwitterImageUrl, isAllowedUploadUrl, ValidationError } from "./validation.js";
import { SquareApiError } from "./binance-client.js";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 10;

const CONTENT_TYPES = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
]);

function extensionFromUrl(url) {
  const parsed = new URL(url);
  const queryFormat = parsed.searchParams.get("format")?.toLowerCase();
  if (queryFormat && CONTENT_TYPES.has(queryFormat)) return queryFormat;
  const pathExtension = parsed.pathname.split(".").pop()?.toLowerCase();
  return CONTENT_TYPES.has(pathExtension) ? pathExtension : "jpg";
}

export function imageNameFromUrl(value) {
  const url = new URL(value);
  const stem = decodeURIComponent(url.pathname.split("/").pop() || "x-image")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "x-image";
  return `${stem}.${extensionFromUrl(url)}`;
}

export function originalTwitterImageUrl(value) {
  const url = new URL(value);
  url.searchParams.set("name", "orig");
  return url.toString();
}

function contentTypeFor(imageName, responseType) {
  if (responseType?.startsWith("image/")) return responseType.split(";")[0];
  const extension = imageName.split(".").pop()?.toLowerCase();
  return CONTENT_TYPES.get(extension) || "image/jpeg";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadTwitterImage(
  sourceUrl,
  client,
  { fetchImpl = (url, init) => globalThis.fetch(url, init), sleep = delay } = {},
) {
  if (!isAllowedTwitterImageUrl(sourceUrl)) {
    throw new ValidationError("INVALID_IMAGE_URL", "图片不是来自受支持的 X 图片域名。");
  }

  const downloadUrl = originalTwitterImageUrl(sourceUrl);
  let sourceResponse;
  try {
    sourceResponse = await fetchImpl(downloadUrl);
  } catch {
    throw new SquareApiError("IMAGE_DOWNLOAD", "无法从 X 下载图片，请稍后重试。", { confirmed: true });
  }
  if (!sourceResponse.ok) {
    throw new SquareApiError("IMAGE_DOWNLOAD", `X 图片下载失败（HTTP ${sourceResponse.status}）。`, {
      confirmed: true,
      status: sourceResponse.status,
    });
  }

  const imageName = imageNameFromUrl(sourceUrl);
  const contentType = contentTypeFor(imageName, sourceResponse.headers.get("content-type"));
  const bytes = await sourceResponse.arrayBuffer();
  const { presignedUrl, fileTicket } = await client.createImageUpload(imageName);
  if (!presignedUrl || !fileTicket || !isAllowedUploadUrl(presignedUrl)) {
    throw new SquareApiError("INVALID_UPLOAD_URL", "币安返回了不受支持的图片上传地址。", {
      confirmed: true,
    });
  }

  let uploadResponse;
  try {
    uploadResponse = await fetchImpl(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: bytes,
    });
  } catch {
    throw new SquareApiError("IMAGE_UPLOAD", "图片上传中断，请检查网络后重试。", { confirmed: true });
  }
  if (!uploadResponse.ok) {
    throw new SquareApiError("IMAGE_UPLOAD", `图片上传失败（HTTP ${uploadResponse.status}）。`, {
      confirmed: true,
      status: uploadResponse.status,
    });
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const status = await client.getImageStatus(fileTicket);
    if (status?.status === 1 && status.imageUrl) return status.imageUrl;
    if (status?.status === 2) {
      throw new SquareApiError("IMAGE_PROCESSING", status.failedReason || "币安处理图片失败。", {
        confirmed: true,
      });
    }
    if (attempt < MAX_POLL_ATTEMPTS - 1) await sleep(POLL_INTERVAL_MS);
  }

  throw new SquareApiError("IMAGE_TIMEOUT", "等待币安处理图片超时，请稍后重试。", {
    confirmed: true,
  });
}
