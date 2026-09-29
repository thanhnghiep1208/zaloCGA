/**
 * Gemini API paid-tier Standard prices, USD per 1M tokens (text input; output
 * includes thinking tokens). Source: https://ai.google.dev/gemini-api/docs/pricing
 * — checked 2026-09-29. gemini-3.8-flash / 3.7-flash input is a launch price
 * valid through 2026-12-31; update this table when it changes.
 */
export const GEMINI_PRICES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

export const GEMINI_PRICING_SOURCE_URL = "https://ai.google.dev/gemini-api/docs/pricing";
export const GEMINI_PRICING_CHECKED_AT = "2026-09-29";

/** Estimated cost in USD, or null when the model has no known price. */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const price = GEMINI_PRICES_USD_PER_1M[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
