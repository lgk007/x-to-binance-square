import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureUncertainRetryTokens,
  recoverStalePublishing,
  STALE_PUBLISHING_MS,
  SYNC_RECORDS_KEY,
} from "../background/sync-store.js";

function fakeStorage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      const result = {};
      for (const key of keys) result[key] = data[key];
      return result;
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
  };
}

test("recovers stale work and gives submit-stage interruptions a fresh retry token", async () => {
  const now = Date.now();
  const staleDate = new Date(now - STALE_PUBLISHING_MS - 1_000).toISOString();
  const storage = fakeStorage({
    [SYNC_RECORDS_KEY]: {
      1: { status: "publishing", stage: "uploading", updatedAt: staleDate },
      2: { status: "publishing", stage: "creating", updatedAt: staleDate },
      3: { status: "published", updatedAt: staleDate },
    },
  });

  const records = await recoverStalePublishing({ storage, now, createRetryToken: () => "recovered-token" });
  assert.equal(records[1].status, "failed");
  assert.equal(records[2].status, "uncertain");
  assert.equal(records[2].retryToken, "recovered-token");
  assert.equal(records[3].status, "published");
});

test("migrates legacy uncertain records without retaining unsafe raw messages", async () => {
  const storage = fakeStorage({
    [SYNC_RECORDS_KEY]: {
      1: {
        status: "uncertain",
        errorCode: "NETWORK",
        message: "raw network details that should be replaced",
      },
      2: { status: "published" },
    },
  });

  const records = await ensureUncertainRetryTokens({ storage, createRetryToken: () => "migration-token" });
  assert.equal(records[1].retryToken, "migration-token");
  assert.equal(records[1].diagnosticKind, "network");
  assert.match(records[1].message, /Veee/);
  assert.doesNotMatch(records[1].message, /raw network details/);
  assert.equal(records[2].retryToken, undefined);

  const unchanged = await ensureUncertainRetryTokens({
    storage,
    createRetryToken: () => { throw new Error("must not rotate an existing token"); },
  });
  assert.equal(unchanged[1].retryToken, "migration-token");
});
