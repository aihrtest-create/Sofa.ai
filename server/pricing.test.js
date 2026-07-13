import test from "node:test";
import assert from "node:assert/strict";
import { calculateImageCost, sumCosts } from "./pricing.js";

test("calculates exact gpt-image-2 cost from detailed usage", () => {
  const result = calculateImageCost({
    input_tokens_details: { text_tokens: 1_000, image_tokens: 2_000 },
    output_tokens: 3_000,
    total_tokens: 6_000,
  });
  assert.equal(result.exact, true);
  assert.equal(result.usd, 0.111);
  assert.deepEqual(result.tokens, {
    textInput: 1_000,
    imageInput: 2_000,
    imageOutput: 3_000,
    total: 6_000,
  });
});

test("sums multiple generation costs", () => {
  const one = calculateImageCost({
    input_tokens_details: { text_tokens: 100, image_tokens: 200 },
    output_tokens: 300,
    total_tokens: 600,
  });
  const total = sumCosts([one, one, one]);
  assert.equal(total.usd, one.usd * 3);
  assert.equal(total.tokens.total, 1_800);
  assert.equal(total.exact, true);
});

