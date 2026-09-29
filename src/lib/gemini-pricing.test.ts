import { describe, it, expect } from "vitest";
import { estimateCostUsd, GEMINI_PRICES_USD_PER_1M } from "@/lib/gemini-pricing";
import { DEFAULT_GEMINI_CHAT_MODELS } from "@/lib/gemini-models";

describe("estimateCostUsd", () => {
  it("prices input and output tokens per 1M at the model's paid-tier rate", () => {
    // gemini-3.8-flash: $0.75 in / $3.75 out per 1M
    expect(estimateCostUsd("gemini-3.8-flash", 1_000_000, 1_000_000)).toBeCloseTo(4.5, 10);
    expect(estimateCostUsd("gemini-2.5-flash", 2000, 500)).toBeCloseTo(0.0006 + 0.00125, 10);
  });

  it("returns null for a model with no known price instead of guessing", () => {
    expect(estimateCostUsd("gemini-9-ultra", 1000, 1000)).toBeNull();
  });

  it("has a price for every model the chat can fall back to", () => {
    for (const model of DEFAULT_GEMINI_CHAT_MODELS) {
      expect(GEMINI_PRICES_USD_PER_1M[model], model).toBeDefined();
    }
  });
});
