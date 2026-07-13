import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GENERATION_MODEL_ID,
  GENERATION_MODELS,
  findGenerationModel,
} from "../shared/generationModels.js";

test("generation model catalog exposes OpenAI default and Gemini benchmark variants", () => {
  assert.equal(findGenerationModel(DEFAULT_GENERATION_MODEL_ID).model, "gpt-image-2");
  assert.deepEqual(
    GENERATION_MODELS.map(({ id, provider, model }) => ({ id, provider, model })),
    [
      { id: "openai-gpt-image-2", provider: "openai", model: "gpt-image-2" },
      { id: "gemini-flash-image", provider: "gemini", model: "gemini-3.1-flash-image" },
      { id: "gemini-pro-image", provider: "gemini", model: "gemini-3-pro-image" },
    ],
  );
  assert.equal(findGenerationModel("missing-model"), null);
});
