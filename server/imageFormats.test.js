import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMAGE_FORMAT_ID,
  IMAGE_FORMATS,
  findImageFormat,
} from "../shared/imageFormats.js";

test("single-shot formats map UI orientation to both providers", () => {
  assert.equal(DEFAULT_IMAGE_FORMAT_ID, "landscape");
  assert.deepEqual(IMAGE_FORMATS.map((format) => format.ratio), ["16:9", "1:1", "9:16"]);
  assert.equal(findImageFormat("landscape").openaiSize, "1536x864");
  assert.equal(findImageFormat("square").geminiAspectRatio, "1:1");
  assert.equal(findImageFormat("portrait").openaiSize, "864x1536");
  assert.equal(findImageFormat("unknown"), null);
});
