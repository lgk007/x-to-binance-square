import test from "node:test";
import assert from "node:assert/strict";
import {
  composePostText,
  isAllowedTwitterImageUrl,
  isAllowedUploadUrl,
  normalizeHandle,
  parseTweetUrl,
  validatePublishPayload,
  ValidationError,
} from "../background/validation.js";

test("normalizes X handles and parses canonical tweet URLs", () => {
  assert.equal(normalizeHandle("  @Satoshi_1 "), "satoshi_1");
  assert.deepEqual(parseTweetUrl("https://x.com/Satoshi_1/status/12345/photo/1"), {
    handle: "satoshi_1",
    tweetId: "12345",
    canonicalUrl: "https://x.com/Satoshi_1/status/12345",
  });
  assert.equal(parseTweetUrl("https://example.com/Satoshi_1/status/12345"), null);
});

test("composes text with an optional source URL", () => {
  assert.equal(composePostText({ text: "Hello", appendSource: true, sourceUrl: "https://x.com/a/status/1" }), "Hello\n\nhttps://x.com/a/status/1");
  assert.equal(composePostText({ text: " Hello ", appendSource: false, sourceUrl: "ignored" }), "Hello");
  assert.equal(composePostText({ text: "", appendSource: true, sourceUrl: "https://x.com/a/status/1" }), "https://x.com/a/status/1");
});

test("validates and deduplicates a publish payload", () => {
  const imageUrl = "https://pbs.twimg.com/media/abc?format=jpg&name=small";
  const result = validatePublishPayload({
    tweetId: "12345",
    sourceUrl: "https://x.com/MyUser/status/12345?s=20",
    text: "Market note",
    appendSource: true,
    imageUrls: [imageUrl, imageUrl],
  }, "@myuser");

  assert.equal(result.sourceUrl, "https://x.com/MyUser/status/12345");
  assert.equal(result.imageUrls.length, 1);
  assert.match(result.postText, /Market note/);
});

test("accepts only bounded string retry tokens", () => {
  const payload = {
    tweetId: "12345",
    sourceUrl: "https://x.com/myuser/status/12345",
    text: "Hello",
    appendSource: false,
    imageUrls: [],
    retryToken: "current-token",
  };

  assert.equal(validatePublishPayload(payload, "myuser").retryToken, "current-token");
  assert.throws(() => validatePublishPayload({ ...payload, retryToken: 42 }, "myuser"), /确认已失效/);
});

test("rejects mismatched authors and arbitrary image URLs", () => {
  assert.throws(() => validatePublishPayload({
    tweetId: "12345",
    sourceUrl: "https://x.com/other/status/12345",
    text: "Hello",
    appendSource: false,
    imageUrls: [],
  }, "myuser"), ValidationError);

  assert.throws(() => validatePublishPayload({
    tweetId: "12345",
    sourceUrl: "https://x.com/myuser/status/12345",
    text: "Hello",
    appendSource: false,
    imageUrls: ["https://evil.example/image.jpg"],
  }, "myuser"), /图片来源/);
});

test("allows only expected image and upload hosts", () => {
  assert.equal(isAllowedTwitterImageUrl("https://pbs.twimg.com/media/abc.jpg"), true);
  assert.equal(isAllowedTwitterImageUrl("https://pbs.twimg.com/profile_images/abc.jpg"), false);
  assert.equal(isAllowedUploadUrl("https://bucket.s3.ap-east-1.amazonaws.com/path"), true);
  assert.equal(isAllowedUploadUrl("https://amazonaws.com.evil.example/path"), false);
});
