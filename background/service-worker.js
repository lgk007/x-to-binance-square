import { BinanceSquareClient, SquareApiError } from "./binance-client.js";
import { uploadTwitterImage } from "./image-uploader.js";
import { runNetworkDiagnostics } from "./network-diagnostics.js";
import { buildUncertainFields, PublishAttemptGate } from "./publish-state.js";
import {
  assertTrustedXSender,
  validatePublishPayload,
  ValidationError,
} from "./validation.js";
import {
  getApiKey,
  getPublicSettings,
  getSettings,
  getSyncRecord,
  ensureUncertainRetryTokens,
  recoverStalePublishing,
  setSyncRecord,
  STALE_PUBLISHING_MS,
} from "./sync-store.js";

const publishGate = new PublishAttemptGate();

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await recoverStalePublishing();
  await ensureUncertainRetryTokens();
}

let ready = initialize();

chrome.runtime.onInstalled.addListener((details) => {
  ready = initialize();
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  ready = initialize();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

function serializeError(error) {
  return {
    code: error?.code || "UNKNOWN",
    message: error?.message || "发生未知错误，请重试。",
    ...(error?.detail ? { detail: String(error.detail).slice(0, 160) } : {}),
  };
}

function isTrustedExtensionPageSender(sender) {
  if (sender?.id !== chrome.runtime.id) return false;
  const url = String(sender.url || sender.tab?.url || "");
  return url.startsWith(chrome.runtime.getURL(""));
}

function isRecentPublishing(record) {
  if (record?.status !== "publishing") return false;
  const updatedAt = Date.parse(record.updatedAt || record.startedAt || "");
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_PUBLISHING_MS;
}

async function sendProgress(tabId, tweetId, stage, message, completed = 0, total = 0) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PUBLISH_PROGRESS",
      tweetId,
      stage,
      message,
      completed,
      total,
    });
  } catch {
    // The X tab may have navigated or closed. Publishing can safely continue.
  }
}

async function publishPost(payload, sender) {
  assertTrustedXSender(sender);

  const [settings, apiKey] = await Promise.all([getSettings(), getApiKey()]);
  if (!apiKey) throw new ValidationError("MISSING_KEY", "请先在扩展设置中填写 Square API Key。");

  const post = validatePublishPayload(payload, settings.xHandle);
  const existing = await getSyncRecord(post.tweetId);
  const claim = publishGate.claim({
    tweetId: post.tweetId,
    record: existing,
    retryToken: post.retryToken,
    recentPublishing: isRecentPublishing(existing),
  });
  if (claim.action === "existing") {
    return { ok: true, record: existing, duplicate: true };
  }
  if (claim.action === "stale-retry") {
    throw new ValidationError("STALE_RETRY", "重新发布确认已失效，请关闭后重新打开发布面板。");
  }
  if (claim.action === "busy") {
    throw new ValidationError("ALREADY_PUBLISHING", "这条推文正在发布，请勿重复提交。");
  }

  const tabId = sender.tab?.id;
  const now = new Date().toISOString();
  const imageCount = post.imageUrls.length;
  let stage = "preparing";

  try {
    await setSyncRecord(post.tweetId, {
      status: "publishing",
      stage,
      sourceUrl: post.sourceUrl,
      imageCount,
      startedAt: now,
      updatedAt: now,
    });
    const client = new BinanceSquareClient(apiKey);
    const uploadedImages = [];

    if (post.imageUrls.length) {
      stage = "uploading";
      await setSyncRecord(post.tweetId, {
        status: "publishing",
        stage,
        sourceUrl: post.sourceUrl,
        imageCount,
        startedAt: now,
        updatedAt: new Date().toISOString(),
      });
      await sendProgress(tabId, post.tweetId, stage, `正在上传第 1/${post.imageUrls.length} 张图片…`, 0, post.imageUrls.length);

      for (let index = 0; index < post.imageUrls.length; index += 1) {
        uploadedImages.push(await uploadTwitterImage(post.imageUrls[index], client));
        const completed = index + 1;
        await sendProgress(
          tabId,
          post.tweetId,
          stage,
          completed === post.imageUrls.length
            ? "图片上传完成，准备发布…"
            : `正在上传第 ${completed + 1}/${post.imageUrls.length} 张图片…`,
          completed,
          post.imageUrls.length,
        );
      }
    }

    stage = "creating";
    await setSyncRecord(post.tweetId, {
      status: "publishing",
      stage,
      sourceUrl: post.sourceUrl,
      imageCount,
      startedAt: now,
      updatedAt: new Date().toISOString(),
    });
    await sendProgress(tabId, post.tweetId, stage, "正在发布到币安广场…");

    const result = await client.publishPost({ text: post.postText, imageUrls: uploadedImages });
    if (result?.publishStatus === "uncertain") {
      const record = await setSyncRecord(post.tweetId, {
        ...buildUncertainFields({ code: "TIMEOUT", status: 504 }),
        stage,
        sourceUrl: post.sourceUrl,
        imageCount,
        uploadedImageCount: uploadedImages.length,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, record };
    }

    const postId = result?.id ? String(result.id) : "";
    const shareLink = result?.shareLink || (postId ? `https://www.binance.com/square/post/${postId}` : "");
    const record = await setSyncRecord(post.tweetId, {
      status: "published",
      stage: "complete",
      sourceUrl: post.sourceUrl,
      binancePostId: postId,
      shareLink,
      imageCount,
      uploadedImageCount: uploadedImages.length,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, record };
  } catch (error) {
    const uncertain = stage === "creating" && (!(error instanceof SquareApiError) || !error.confirmed);
    const detailSuffix = error?.detail ? `（底层原因：${String(error.detail).slice(0, 160)}）` : "";
    const record = await setSyncRecord(post.tweetId, {
      ...(uncertain ? buildUncertainFields(error) : { status: "failed" }),
      stage,
      sourceUrl: post.sourceUrl,
      imageCount,
      ...(uncertain ? {} : { message: `${error.message}${detailSuffix}`, errorCode: error.code || "UNKNOWN" }),
      updatedAt: new Date().toISOString(),
    });
    if (uncertain) return { ok: true, record };
    throw error;
  } finally {
    publishGate.release(post.tweetId);
  }
}

async function handleMessage(message, sender) {
  await ready;

  if (message?.type === "DIAGNOSE_NETWORK") {
    if (!isTrustedExtensionPageSender(sender)) {
      throw new ValidationError("UNTRUSTED_SENDER", "无法确认请求来源。");
    }
    const apiKey = await getApiKey();
    return { ok: true, report: await runNetworkDiagnostics({ apiKey }) };
  }

  assertTrustedXSender(sender);

  switch (message?.type) {
    case "GET_PUBLIC_SETTINGS":
      return { ok: true, settings: await getPublicSettings() };
    case "GET_SYNC_STATUS":
      return { ok: true, record: await getSyncRecord(String(message.tweetId ?? "")) };
    case "OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case "PUBLISH_POST":
      return publishPost(message.payload, sender);
    default:
      throw new ValidationError("UNKNOWN_MESSAGE", "扩展收到了无法识别的请求。");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
  return true;
});
