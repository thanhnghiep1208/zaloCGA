import { vi, describe, it, expect, beforeEach } from "vitest";

// Task 7.10: the route must not hand the browser's pre-computed vector (of the
// raw input) to vector search once the rewrite has changed the search text.

const mockGetContext = vi.hoisted(() => vi.fn());
const mockRewriteQuery = vi.hoisted(() => vi.fn());
const mockGenerateChatResponse = vi.hoisted(() => vi.fn());
const mockLogAnalyticsEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-request-auth", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api-request-auth")>()),
  requireUidFromRequest: vi.fn().mockResolvedValue("uid-1"),
}));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: null }));
vi.mock("@/lib/rate-limit", () => ({ checkChatRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/analytics-events", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/analytics-events")>()),
  logAnalyticsEvent: mockLogAnalyticsEvent,
}));
vi.mock("@/lib/RetrievalService", () => ({
  RetrievalService: { getContext: mockGetContext, generateChatResponse: mockGenerateChatResponse },
}));
vi.mock("@/lib/chat/query-rewrite", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/chat/query-rewrite")>()),
  rewriteQuery: mockRewriteQuery,
}));

import { POST } from "@/app/api/chat/route";

const CLIENT_VECTOR = [0.1, 0.2, 0.3];

function chatRequest(body: object): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function vectorPassedToRetrieval(body: object): Promise<unknown> {
  // Stop right after retrieval — the rest of the route is not under test.
  mockGetContext.mockRejectedValueOnce(new Error("stop"));
  await POST(chatRequest(body));
  expect(mockGetContext).toHaveBeenCalledTimes(1);
  return mockGetContext.mock.calls[0][1];
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockGetContext.mockReset();
  mockRewriteQuery.mockReset();
  mockGenerateChatResponse.mockReset();
  mockLogAnalyticsEvent.mockReset();
  mockLogAnalyticsEvent.mockResolvedValue(undefined);
});

describe("POST /api/chat — client embedding vs rewritten query", () => {
  it("drops the client vector when the rewrite produced a different query", async () => {
    mockRewriteQuery.mockResolvedValue({
      rewriteQuery: "độ dài tối đa của label nút",
      intent: "guideline",
      ok: true,
    });

    const vector = await vectorPassedToRetrieval({
      query: "còn nút thì sao?",
      conversation: [
        { role: "user", content: "toast dài tối đa bao nhiêu?" },
        { role: "assistant", content: "Tối đa 2 dòng." },
      ],
      embedding: CLIENT_VECTOR,
    });

    expect(mockGetContext.mock.calls[0][0]).toBe("độ dài tối đa của label nút");
    expect(vector).toBeUndefined();
  });

  it("keeps the client vector on a first turn with no rewrite and no scope", async () => {
    mockRewriteQuery.mockResolvedValue({ rewriteQuery: "", intent: "guideline", ok: false });

    const vector = await vectorPassedToRetrieval({
      query: "toast dài tối đa bao nhiêu?",
      embedding: CLIENT_VECTOR,
    });

    expect(vector).toEqual(CLIENT_VECTOR);
  });
});

describe("POST /api/chat — token usage in response_delivered", () => {
  async function* chatChunks() {
    yield { text: "Tối đa " };
    yield {
      text: "2 dòng.",
      usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 40, thoughtsTokenCount: 10 },
    };
  }

  it("logs the session, the answering model and every Gemini call's tokens", async () => {
    mockRewriteQuery.mockImplementation(async (q, _h, _t, onUsage) => {
      onUsage({ step: "rewrite", model: "gemini-2.5-flash", input_tokens: 200, output_tokens: 20 });
      return { rewriteQuery: q, intent: "guideline", ok: true };
    });
    mockGetContext.mockImplementation(async (_q, _e, _s, onUsage) => {
      onUsage({ step: "relevance", model: "gemini-2.5-flash", input_tokens: 2500, output_tokens: 8 });
      return [{ fileName: "toast.pdf", excerpt: "Toast tối đa 2 dòng." }];
    });
    mockGenerateChatResponse.mockResolvedValue({ stream: chatChunks(), model: "gemini-3.8-flash" });

    const res = await POST(
      chatRequest({
        query: "còn toast?",
        sessionId: "s-1",
        conversation: [{ role: "user", content: "snackbar dài bao nhiêu?" }],
      })
    );
    await res.text();

    const delivered = mockLogAnalyticsEvent.mock.calls.find(([name]) => name === "response_delivered");
    expect(delivered?.[1]).toMatchObject({
      session_id: "s-1",
      model: "gemini-3.8-flash",
      llm_usage: [
        { step: "rewrite", model: "gemini-2.5-flash", input_tokens: 200, output_tokens: 20 },
        { step: "relevance", model: "gemini-2.5-flash", input_tokens: 2500, output_tokens: 8 },
        { step: "chat", model: "gemini-3.8-flash", input_tokens: 3000, output_tokens: 50 },
      ],
    });
  });
});
