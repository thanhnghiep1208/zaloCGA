import { vi, describe, it, expect, beforeEach } from "vitest";

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

process.env.GEMINI_API_KEY = "test-key";

import { resolveRetrievalQuery, rewriteQuery } from "@/lib/chat/query-rewrite";

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

describe("resolveRetrievalQuery", () => {
  const naive = "Toast nên dài tối đa bao nhiêu?\ncòn snackbar thì sao?";

  it("searches with the rewritten query when the rewrite succeeded", () => {
    const result = resolveRetrievalQuery(
      { rewriteQuery: "Snackbar nên dài tối đa bao nhiêu?", intent: "guideline", ok: true },
      naive,
      "microcopy"
    );
    expect(result.retrievalQuery).toBe("Snackbar nên dài tối đa bao nhiêu?");
  });

  it("falls back to the naive history-prefixed query when the rewrite failed", () => {
    const result = resolveRetrievalQuery(
      { rewriteQuery: "còn snackbar thì sao?", intent: null, ok: false },
      naive,
      "guideline"
    );
    expect(result.retrievalQuery).toBe(naive);
  });

  it("uses the rewrite's intent as the analytics query type when present", () => {
    const result = resolveRetrievalQuery(
      { rewriteQuery: "x", intent: "microcopy", ok: true },
      naive,
      "guideline"
    );
    expect(result.queryType).toBe("microcopy");
  });

  it("uses the heuristic query type when the rewrite succeeded but gave no intent", () => {
    const result = resolveRetrievalQuery(
      { rewriteQuery: "x", intent: null, ok: true },
      naive,
      "guideline"
    );
    expect(result.queryType).toBe("guideline");
  });

  it("ignores any intent from a failed rewrite and uses the heuristic", () => {
    const result = resolveRetrievalQuery(
      { rewriteQuery: "x", intent: "microcopy", ok: false },
      naive,
      "guideline"
    );
    expect(result.queryType).toBe("guideline");
  });
});
