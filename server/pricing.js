// OpenAI API pricing snapshot: 2026-06-23.
// Source: https://developers.openai.com/api/docs/pricing#image-generation
export const GPT_IMAGE_2_PRICING_PER_MILLION = Object.freeze({
  textInput: 5,
  imageInput: 8,
  imageOutput: 30,
});

export function calculateImageCost(usage, rates = GPT_IMAGE_2_PRICING_PER_MILLION) {
  const inputDetails = usage?.input_tokens_details ?? {};
  const textInputTokens = Number(inputDetails.text_tokens ?? 0);
  const imageInputTokens = Number(inputDetails.image_tokens ?? 0);
  const outputImageTokens = Number(
    usage?.output_tokens_details?.image_tokens ?? usage?.output_tokens ?? 0,
  );
  const hasDetailedInput =
    Number.isFinite(inputDetails.text_tokens) && Number.isFinite(inputDetails.image_tokens);
  const hasOutput = Number.isFinite(usage?.output_tokens);
  const usd =
    (textInputTokens * rates.textInput +
      imageInputTokens * rates.imageInput +
      outputImageTokens * rates.imageOutput) /
    1_000_000;

  return {
    usd,
    exact: hasDetailedInput && hasOutput,
    tokens: {
      textInput: textInputTokens,
      imageInput: imageInputTokens,
      imageOutput: outputImageTokens,
      total: Number(usage?.total_tokens ?? 0),
    },
  };
}

export function sumCosts(items) {
  return items.reduce(
    (total, item) => ({
      usd: total.usd + item.usd,
      exact: total.exact && item.exact,
      tokens: {
        textInput: total.tokens.textInput + item.tokens.textInput,
        imageInput: total.tokens.imageInput + item.tokens.imageInput,
        imageOutput: total.tokens.imageOutput + item.tokens.imageOutput,
        total: total.tokens.total + item.tokens.total,
      },
    }),
    { usd: 0, exact: true, tokens: { textInput: 0, imageInput: 0, imageOutput: 0, total: 0 } },
  );
}

