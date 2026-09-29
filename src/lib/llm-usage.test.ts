import { describe, it, expect } from "vitest";
import { usageFromMetadata } from "@/lib/llm-usage";

describe("usageFromMetadata", () => {
  it("bills thinking tokens as output, as Gemini pricing does", () => {
    expect(
      usageFromMetadata("chat", "gemini-3.8-flash", {
        promptTokenCount: 1200,
        candidatesTokenCount: 300,
        thoughtsTokenCount: 50,
      })
    ).toEqual({ step: "chat", model: "gemini-3.8-flash", input_tokens: 1200, output_tokens: 350 });
  });

  it("counts tool-use prompt tokens as input", () => {
    expect(
      usageFromMetadata("rewrite", "gemini-2.5-flash", {
        promptTokenCount: 100,
        toolUsePromptTokenCount: 20,
        candidatesTokenCount: 10,
      })
    ).toMatchObject({ input_tokens: 120, output_tokens: 10 });
  });

  it("returns null when the response carried no usage metadata", () => {
    expect(usageFromMetadata("chat", "gemini-3.8-flash", undefined)).toBeNull();
  });
});
