import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSingleShotHistory } from "../src/singleShotHistory.js";

test("single-shot history totals successful generations by model", () => {
  const summary = summarizeSingleShotHistory([
    { modelId: "a1", modelName: "GPT Image 2", cost: { usd: 0.0719 } },
    { modelId: "a1", modelName: "GPT Image 2", cost: { usd: 0.08 } },
    { modelId: "c1", modelName: "Gemini Pro", cost: { usd: 0.14 } },
  ]);

  assert.equal(summary.count, 3);
  assert.ok(Math.abs(summary.usd - 0.2919) < Number.EPSILON);
  assert.equal(summary.byModel.a1.id, "a1");
  assert.equal(summary.byModel.a1.name, "GPT Image 2");
  assert.equal(summary.byModel.a1.count, 2);
  assert.ok(Math.abs(summary.byModel.a1.usd - 0.1519) < Number.EPSILON);
  assert.equal(summary.byModel.c1.count, 1);
});
