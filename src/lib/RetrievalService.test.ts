import { vi, describe, it, expect, beforeEach } from "vitest";
import type { RetrievedSnippet, SearchOptions } from "@/lib/retrieval/interfaces";

// --- Mocks (hoisted so they're ready before module evaluation) ---

const mockSearch = vi.hoisted(() =>
  vi.fn<(query: string, options?: SearchOptions) => Promise<RetrievedSnippet[]>>()
);

vi.mock("@/lib/retrieval/FirebaseRetrievalProvider", () => ({
  FirebaseRetrievalProvider: vi.fn().mockImplementation(() => ({ search: mockSearch })),
}));

const mockGenerateContentStream = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContentStream: mockGenerateContentStream },
  })),
}));

// Provide API key before the module lazy-initialises the client
process.env.GEMINI_API_KEY = "test-key";

import { RetrievalService } from "@/lib/RetrievalService";
import {
  PROTOTYPE_MESSAGE_TYPES,
  PROTOTYPE_UI_PATTERNS,
} from "@/lib/chat/prototype-spec";

// --- Helpers ---

const fakeStream = Symbol("stream");

function makeSnippet(overrides: Partial<RetrievedSnippet> = {}): RetrievedSnippet {
  return { fileName: "doc.pdf", excerpt: "some text", ...overrides };
}

// --- Tests ---

describe("RetrievalService.getContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to the provider's search method", async () => {
    const snippets = [makeSnippet()];
    mockSearch.mockResolvedValue(snippets);
    const result = await RetrievalService.getContext("query");
    expect(mockSearch).toHaveBeenCalledWith("query", {
      precomputedEmbedding: undefined,
      scope: undefined,
    });
    expect(result).toBe(snippets);
  });

  it("returns empty array when provider finds nothing", async () => {
    mockSearch.mockResolvedValue([]);
    expect(await RetrievalService.getContext("unknown")).toEqual([]);
  });

  it("forwards the scope to the provider's search method", async () => {
    mockSearch.mockResolvedValue([]);
    const scope = { messageType: "error" as const, uiPattern: "snackbar" as const };
    await RetrievalService.getContext("query", [0.1, 0.2], scope);
    expect(mockSearch).toHaveBeenCalledWith("query", {
      precomputedEmbedding: [0.1, 0.2],
      scope,
    });
  });

  it("forwards the usage sink to the provider's search method", async () => {
    mockSearch.mockResolvedValue([]);
    const onUsage = vi.fn();
    await RetrievalService.getContext("query", undefined, null, onUsage);
    expect(mockSearch).toHaveBeenCalledWith("query", {
      precomputedEmbedding: undefined,
      scope: null,
      onUsage,
    });
  });
});

describe("RetrievalService.generateChatResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContentStream.mockResolvedValue(fakeStream);
  });

  it("returns the stream and the model that produced it", async () => {
    const result = await RetrievalService.generateChatResponse("hi", []);
    expect(result).toEqual({ stream: fakeStream, model: "gemini-3.8-flash" });
  });

  it("calls the first model in CHAT_MODELS list", async () => {
    await RetrievalService.generateChatResponse("q", []);
    const call = mockGenerateContentStream.mock.calls[0][0] as { model: string };
    expect(call.model).toMatch(/gemini/);
  });

  it("includes snippet text in the system prompt context", async () => {
    const snippet = makeSnippet({ fileName: "guide.pdf", excerpt: "rule #1" });
    await RetrievalService.generateChatResponse("q", [snippet]);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      config: { systemInstruction: { parts: [{ text: string }] } };
    };
    const systemText = call.config.systemInstruction.parts[0].text;
    expect(systemText).toContain("guide.pdf");
    expect(systemText).toContain("rule #1");
  });

  it("includes reference link in context when snippet has reference", async () => {
    const snippet = makeSnippet({ reference: "https://example.com/doc" });
    await RetrievalService.generateChatResponse("q", [snippet]);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      config: { systemInstruction: { parts: [{ text: string }] } };
    };
    expect(call.config.systemInstruction.parts[0].text).toContain("https://example.com/doc");
  });

  it("uses fallback message when no snippets are provided", async () => {
    await RetrievalService.generateChatResponse("q", []);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      config: { systemInstruction: { parts: [{ text: string }] } };
    };
    expect(call.config.systemInstruction.parts[0].text).toContain(
      "No relevant internal documents found"
    );
  });

  it("describes the zalo-prototype contract, including every allowed enum value", async () => {
    await RetrievalService.generateChatResponse("q", []);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      config: { systemInstruction: { parts: [{ text: string }] } };
    };
    const systemText = call.config.systemInstruction.parts[0].text;
    expect(systemText).toContain("zalo-prototype");
    for (const value of [...PROTOTYPE_UI_PATTERNS, ...PROTOTYPE_MESSAGE_TYPES]) {
      expect(systemText).toContain(value);
    }
  });

  it("keeps the no-image-editing rule while allowing the structured prototype", async () => {
    await RetrievalService.generateChatResponse("q", []);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      config: { systemInstruction: { parts: [{ text: string }] } };
    };
    const systemText = call.config.systemInstruction.parts[0].text;
    expect(systemText).toContain("đính kèm ảnh đã sửa");
    expect(systemText).toContain("Bạn KHÔNG vẽ và KHÔNG xuất ảnh");
    expect(systemText).toContain("bản dựng minh hoạ bên dưới");
  });

  it("maps conversation history to model/user turns in contents", async () => {
    const history = [
      { role: "user" as const, content: "first message" },
      { role: "assistant" as const, content: "first reply" },
    ];
    await RetrievalService.generateChatResponse("follow-up", [], history);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      contents: { role: string; parts: { text: string }[] }[];
    };
    // history + current user message
    expect(call.contents).toHaveLength(3);
    expect(call.contents[0]).toMatchObject({ role: "user", parts: [{ text: "first message" }] });
    expect(call.contents[1]).toMatchObject({ role: "model", parts: [{ text: "first reply" }] });
    expect(call.contents[2]).toMatchObject({ role: "user", parts: expect.arrayContaining([{ text: "follow-up" }]) });
  });

  it("adds fileData parts to the current user turn for attachments", async () => {
    const attachments = [
      { downloadURL: "https://storage.example.com/img.png", mimeType: "image/png", name: "img.png" },
    ];
    await RetrievalService.generateChatResponse("q", [], [], attachments);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      contents: { role: string; parts: unknown[] }[];
    };
    const lastTurn = call.contents[call.contents.length - 1];
    expect(lastTurn.parts).toHaveLength(2); // text + fileData
    expect(lastTurn.parts[1]).toMatchObject({
      fileData: { fileUri: "https://storage.example.com/img.png", mimeType: "image/png" },
    });
  });

  it("falls back to the next model when the first one fails", async () => {
    mockGenerateContentStream
      .mockRejectedValueOnce(new Error("model overloaded"))
      .mockResolvedValueOnce(fakeStream);

    const result = await RetrievalService.generateChatResponse("q", []);
    expect(result).toEqual({ stream: fakeStream, model: "gemini-3.7-flash" });
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(2);
  });

  it("throws when all models fail", async () => {
    mockGenerateContentStream.mockRejectedValue(new Error("unavailable"));
    await expect(RetrievalService.generateChatResponse("q", [])).rejects.toThrow(
      "Failed to generate response"
    );
  });

  it("uses temperature 0.1 in the config", async () => {
    await RetrievalService.generateChatResponse("q", []);
    const call = mockGenerateContentStream.mock.calls[0][0] as {
      config: { temperature: number };
    };
    expect(call.config.temperature).toBe(0.1);
  });
});
