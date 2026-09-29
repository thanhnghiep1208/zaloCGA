import { vi, describe, it, expect, beforeEach } from "vitest";

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

process.env.GEMINI_API_KEY = "test-key";

import { rewriteQuery } from "@/lib/chat/query-rewrite";

const history = [
  { role: "user" as const, content: "Toast nên dài tối đa bao nhiêu?" },
  { role: "assistant" as const, content: "Tối đa 2 dòng." },
];

beforeEach(() => {
  mockGenerateContent.mockReset();
});

describe("rewriteQuery", () => {
  it("returns the original query unchanged when there is no conversation history (skips the LLM call)", async () => {
    const result = await rewriteQuery("còn snackbar thì sao?", []);
    expect(result).toEqual({ rewriteQuery: "còn snackbar thì sao?", intent: null, ok: false });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("parses a well-formed JSON response", async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"rewrite_query": "Snackbar nên dài tối đa bao nhiêu?", "intent": "guideline"}',
    });
    const result = await rewriteQuery("còn snackbar thì sao?", history);
    expect(result).toEqual({
      rewriteQuery: "Snackbar nên dài tối đa bao nhiêu?",
      intent: "guideline",
      ok: true,
    });
  });

  it("strips a ```json code fence if the model adds one", async () => {
    mockGenerateContent.mockResolvedValue({
      text: '```json\n{"rewrite_query": "abc", "intent": "microcopy"}\n```',
    });
    const result = await rewriteQuery("abc?", history);
    expect(result).toEqual({ rewriteQuery: "abc", intent: "microcopy", ok: true });
  });

  it("falls back to the original query when the model throws", async () => {
    mockGenerateContent.mockRejectedValue(new Error("model overloaded"));
    const result = await rewriteQuery("còn snackbar thì sao?", history);
    expect(result).toEqual({ rewriteQuery: "còn snackbar thì sao?", intent: null, ok: false });
  });

  it("falls back to the original query when the response is not valid JSON", async () => {
    mockGenerateContent.mockResolvedValue({ text: "Xin lỗi, tôi không hiểu." });
    const result = await rewriteQuery("còn snackbar thì sao?", history);
    expect(result).toEqual({ rewriteQuery: "còn snackbar thì sao?", intent: null, ok: false });
  });

  it("falls back to the original query when rewrite_query is missing", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"intent": "guideline"}' });
    const result = await rewriteQuery("còn snackbar thì sao?", history);
    expect(result).toEqual({ rewriteQuery: "còn snackbar thì sao?", intent: null, ok: false });
  });

  it("reports ok:true with null intent when intent is an unrecognized value", async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"rewrite_query": "abc", "intent": "something-else"}',
    });
    const result = await rewriteQuery("abc?", history);
    expect(result).toEqual({ rewriteQuery: "abc", intent: null, ok: true });
  });

  it("falls back to the original query when the response has no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });
    const result = await rewriteQuery("còn snackbar thì sao?", history);
    expect(result).toEqual({ rewriteQuery: "còn snackbar thì sao?", intent: null, ok: false });
  });

  it("times out and falls back when the model call never resolves", async () => {
    mockGenerateContent.mockImplementation(() => new Promise(() => {}));
    const result = await rewriteQuery("còn snackbar thì sao?", history, 50);
    expect(result).toEqual({ rewriteQuery: "còn snackbar thì sao?", intent: null, ok: false });
  });
});
