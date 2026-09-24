import test from "node:test";
import assert from "node:assert/strict";
import { imageNameFromUrl, originalTwitterImageUrl } from "../background/image-uploader.js";

test("derives a stable file name from Twitter media URLs", () => {
  assert.equal(
    imageNameFromUrl("https://pbs.twimg.com/media/GAb-c_1?format=png&name=small"),
    "GAb-c_1.png",
  );
});

test("requests original image quality without changing the host", () => {
  const value = originalTwitterImageUrl("https://pbs.twimg.com/media/abc?format=jpg&name=small");
  const url = new URL(value);
  assert.equal(url.hostname, "pbs.twimg.com");
  assert.equal(url.searchParams.get("name"), "orig");
});
