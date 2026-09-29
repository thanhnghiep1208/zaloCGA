import { vi, describe, it, expect, beforeEach } from "vitest";
import type { RetrievedSnippet } from "./interfaces";

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

process.env.GEMINI_API_KEY = "test-key";

import { checkRelevance } from "@/lib/retrieval/llm-relevance-check";

function snip(docId: string, fileName: string, excerpt: string): RetrievedSnippet {
  return { docId, fileName, excerpt };
}

const snippets = [
  snip("a", "toast.pdf", "Toast là thông báo ngắn tối đa 2 dòng."),
  snip("b", "snackbar.pdf", "Snackbar tự động dismiss sau vài giây."),
  snip("c", "unrelated.pdf", "Nội dung hoàn toàn không liên quan."),
];

beforeEach(() => {
  mockGenerateContent.mockReset();
});

describe("checkRelevance", () => {
  it("returns the input unchanged (no LLM call) when there are no snippets", async () => {
    const result = await checkRelevance("câu hỏi bất kỳ", []);
    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("reorders snippets by the model's relevant_indices", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"relevant_indices": [1, 0]}' });
    const result = await checkRelevance("toast dài bao nhiêu", snippets);
    expect(result.map((s) => s.docId)).toEqual(["b", "a"]);
  });

  it("drops snippets not included in relevant_indices", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"relevant_indices": [0]}' });
    const result = await checkRelevance("toast dài bao nhiêu", snippets);
    expect(result.map((s) => s.docId)).toEqual(["a"]);
  });

  it("returns an empty array when the model finds nothing relevant (not-found signal)", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"relevant_indices": []}' });
    const result = await checkRelevance("giá Bitcoin hôm nay", snippets);
    expect(result).toEqual([]);
  });

  it("strips a ```json code fence if the model adds one", async () => {
    mockGenerateContent.mockResolvedValue({ text: '```json\n{"relevant_indices": [2]}\n```' });
    const result = await checkRelevance("q", snippets);
    expect(result.map((s) => s.docId)).toEqual(["c"]);
  });

  it("ignores out-of-range or non-integer indices", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"relevant_indices": [0, 99, 1.5, -1]}' });
    const result = await checkRelevance("q", snippets);
    expect(result.map((s) => s.docId)).toEqual(["a"]);
  });

  it("fails open (returns original snippets) when the model throws", async () => {
    mockGenerateContent.mockRejectedValue(new Error("model overloaded"));
    const result = await checkRelevance("q", snippets);
    expect(result).toEqual(snippets);
  });

  it("fails open when the response is not valid JSON", async () => {
    mockGenerateContent.mockResolvedValue({ text: "not json at all" });
    const result = await checkRelevance("q", snippets);
    expect(result).toEqual(snippets);
  });

  it("fails open when relevant_indices is missing", async () => {
    mockGenerateContent.mockResolvedValue({ text: "{}" });
    const result = await checkRelevance("q", snippets);
    expect(result).toEqual(snippets);
  });

  it("fails open when the response has no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });
    const result = await checkRelevance("q", snippets);
    expect(result).toEqual(snippets);
  });

  it("sends the excerpt past its first 400 chars to the model, where the answer often sits", async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"relevant_indices": [0]}' });
    const answer = "Card gồm 5 state: Default, Pressed, Selected, Selected Disabled và Disabled";
    const longExcerpt = `${"Mô tả chung về Card. ".repeat(50)}${answer}`;
    expect(longExcerpt.indexOf(answer)).toBeGreaterThan(1000);

    await checkRelevance("Card có những state nào?", [snip("card", "008 Card.pdf", longExcerpt)]);

    const prompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain(answer);
  });

  it("times out and fails open when the model call never resolves", async () => {
    mockGenerateContent.mockImplementation(() => new Promise(() => {}));
    const result = await checkRelevance("q", snippets, 50);
    expect(result).toEqual(snippets);
  });
});
