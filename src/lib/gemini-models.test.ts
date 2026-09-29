import { afterEach, describe, expect, it } from "vitest";
import { configuredChatModels, DEFAULT_GEMINI_CHAT_MODELS } from "@/lib/gemini-models";

describe("configuredChatModels", () => {
  afterEach(() => {
    delete process.env.GEMINI_CHAT_MODELS;
  });

  it("uses the default chain when GEMINI_CHAT_MODELS is unset", () => {
    expect(configuredChatModels()).toEqual(DEFAULT_GEMINI_CHAT_MODELS);
  });

  it("reads a comma-separated override, trimming blanks", () => {
    process.env.GEMINI_CHAT_MODELS = " gemini-3.7-flash, ,gemini-2.5-flash ";
    expect(configuredChatModels()).toEqual(["gemini-3.7-flash", "gemini-2.5-flash"]);
  });
});
