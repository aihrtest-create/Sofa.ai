export const DEFAULT_GENERATION_MODEL_ID = "openai-gpt-image-2";

export const GENERATION_MODELS = Object.freeze([
  {
    id: DEFAULT_GENERATION_MODEL_ID,
    provider: "openai",
    model: "gpt-image-2",
    label: "OpenAI GPT Image 2",
    shortLabel: "GPT Image 2",
    badge: "A1",
    description: "Базовая production-модель: стабильная цена, preview-lock и финальные кадры.",
    env: ["OPENAI_API_KEY"],
    quality: "medium",
  },
  {
    id: "gemini-flash-image",
    provider: "gemini",
    model: "gemini-3.1-flash-image",
    label: "Gemini 3.1 Flash Image",
    shortLabel: "Gemini Flash",
    badge: "B1",
    description: "Быстрый Google-вариант из benchmark для preview/contact-sheet сравнений.",
    env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    quality: "1K",
  },
  {
    id: "gemini-pro-image",
    provider: "gemini",
    model: "gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    shortLabel: "Gemini Pro",
    badge: "C1",
    description: "Более дорогой Google-вариант из benchmark для сложной геометрии дивана.",
    env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    quality: "1K",
  },
]);

export const GEMINI_IMAGE_PRICING_PER_MILLION = Object.freeze({
  "gemini-3.1-flash-image": {
    input: 0.5,
    outputText: 3,
    outputImage: 60,
  },
  "gemini-3-pro-image": {
    input: 2,
    outputText: 12,
    outputImage: 120,
  },
});

export function findGenerationModel(id) {
  return GENERATION_MODELS.find((item) => item.id === id) ?? null;
}

export function defaultGenerationModel() {
  return findGenerationModel(DEFAULT_GENERATION_MODEL_ID);
}
