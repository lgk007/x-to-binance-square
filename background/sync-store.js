import { normalizeHandle } from "./validation.js";
import { buildUncertainFields, describeUnconfirmedError, createRetryToken as makeRetryToken } from "./publish-state.js";

export const SETTINGS_KEY = "settings";
export const API_KEY = "squareOpenApiKey";
export const SYNC_RECORDS_KEY = "syncRecords";
export const STALE_PUBLISHING_MS = 10 * 60 * 1_000;

function getStorage(storage) {
  return storage || chrome.storage.local;
}

export function maskApiKey(value) {
  const key = String(value ?? "");
  if (!key) return "";
  if (key.length <= 9) return `${key.slice(0, 2)}...`;
  return `${key.slice(0, 5)}...${key.slice(-4)}`;
}

export async function getSettings(storage) {
  const result = await getStorage(storage).get([SETTINGS_KEY]);
  const raw = result[SETTINGS_KEY] || {};
  return {
    xHandle: normalizeHandle(raw.xHandle),
    defaultAppendSource: raw.defaultAppendSource !== false,
  };
}

export async function getApiKey(storage) {
  const result = await getStorage(storage).get([API_KEY]);
  return String(result[API_KEY] ?? "").trim();
}

export async function getPublicSettings(storage) {
  const [settings, apiKey] = await Promise.all([getSettings(storage), getApiKey(storage)]);
  return {
    ...settings,
    hasApiKey: Boolean(apiKey),
    apiKeyMask: maskApiKey(apiKey),
  };
}

export async function getSyncRecords(storage) {
  const result = await getStorage(storage).get([SYNC_RECORDS_KEY]);
  return result[SYNC_RECORDS_KEY] && typeof result[SYNC_RECORDS_KEY] === "object"
    ? result[SYNC_RECORDS_KEY]
    : {};
}

export async function getSyncRecord(tweetId, storage) {
  const records = await getSyncRecords(storage);
  return records[String(tweetId)] || null;
}

export async function setSyncRecord(tweetId, record, storage) {
  const target = getStorage(storage);
  const records = await getSyncRecords(target);
  records[String(tweetId)] = { ...record, tweetId: String(tweetId) };
  await target.set({ [SYNC_RECORDS_KEY]: records });
  return records[String(tweetId)];
}

export async function clearSyncRecords(storage) {
  await getStorage(storage).set({ [SYNC_RECORDS_KEY]: {} });
}

export async function recoverStalePublishing({
  storage,
  now = Date.now(),
  createRetryToken,
} = {}) {
  const target = getStorage(storage);
  const records = await getSyncRecords(target);
  let changed = false;

  for (const [tweetId, record] of Object.entries(records)) {
    if (record.status !== "publishing") continue;
    const updatedAt = Date.parse(record.updatedAt || record.startedAt || "");
    if (!Number.isFinite(updatedAt) || now - updatedAt < STALE_PUBLISHING_MS) continue;

    const { retryToken: _retryToken, ...recordWithoutToken } = record;
    const uncertain = record.stage === "creating";
    records[tweetId] = uncertain
      ? {
          ...recordWithoutToken,
          ...buildUncertainFields({ code: "INTERRUPTED" }, createRetryToken),
          updatedAt: new Date(now).toISOString(),
        }
      : {
          ...recordWithoutToken,
          status: "failed",
          message: "上次发布在提交前中断，可以重新尝试。",
          updatedAt: new Date(now).toISOString(),
        };
    changed = true;
  }

  if (changed) await target.set({ [SYNC_RECORDS_KEY]: records });
  return records;
}

export async function ensureUncertainRetryTokens({ storage, createRetryToken } = {}) {
  const target = getStorage(storage);
  const records = await getSyncRecords(target);
  let changed = false;

  for (const [tweetId, record] of Object.entries(records)) {
    if (record.status !== "uncertain") continue;
    if (record.retryToken && record.diagnosticKind) continue;

    const diagnostic = describeUnconfirmedError(record);
    records[tweetId] = {
      ...record,
      ...diagnostic,
      message: `${diagnostic.message} 未确认是否已经发布。请先到币安广场检查。`,
      retryToken: record.retryToken || makeRetryToken(createRetryToken),
    };
    changed = true;
  }

  if (changed) await target.set({ [SYNC_RECORDS_KEY]: records });
  return records;
}
