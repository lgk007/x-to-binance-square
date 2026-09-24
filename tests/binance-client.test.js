import test from "node:test";
import assert from "node:assert/strict";
import { BinanceSquareClient, SquareApiError } from "../background/binance-client.js";

function response(status, body) {
  return { status, text: async () => body };
}

test("sends the Square key only in the expected header", async () => {
  let request;
  const client = new BinanceSquareClient("secret-key", {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, JSON.stringify({ code: "000000", data: { id: "42" } }));
    },
  });

  const result = await client.publishPost({ text: "Hello", imageUrls: [] });
  assert.equal(result.id, "42");
  assert.equal(request.options.headers["X-Square-OpenAPI-Key"], "secret-key");
  assert.equal(request.options.headers.clienttype, "binanceSkill");
  assert.doesNotMatch(request.url, /secret-key/);
});

test("maps official API errors to readable Chinese messages", async () => {
  const client = new BinanceSquareClient("key", {
    fetchImpl: async () => response(200, JSON.stringify({ code: "220004", message: "expired" })),
  });

  await assert.rejects(
    () => client.publishPost({ text: "Hello", imageUrls: [] }),
    (error) => error instanceof SquareApiError && error.code === "220004" && /过期/.test(error.message),
  );
});

test("treats a content creation 504 as uncertain instead of retryable failure", async () => {
  const client = new BinanceSquareClient("key", {
    fetchImpl: async () => response(504, "Gateway timeout"),
  });

  const result = await client.publishPost({ text: "Hello", imageUrls: [] });
  assert.equal(result.publishStatus, "uncertain");
});

test("marks network and non-JSON responses as unconfirmed", async () => {
  const networkClient = new BinanceSquareClient("key", { fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(() => networkClient.publishPost({ text: "Hello", imageUrls: [] }), (error) => !error.confirmed);

  const htmlClient = new BinanceSquareClient("key", { fetchImpl: async () => response(502, "<html>bad gateway</html>") });
  await assert.rejects(() => htmlClient.publishPost({ text: "Hello", imageUrls: [] }), (error) => error.code === "NON_JSON" && !error.confirmed);
});
