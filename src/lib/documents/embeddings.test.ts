import { vi, describe, it, expect, beforeEach } from "vitest";

const mockEmbedContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { embedContent: mockEmbedContent },
  })),
}));

const mockBatchSet = vi.hoisted(() => vi.fn());
const mockBatchCommit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockDocRef = vi.hoisted(() => ({}));
const mockWhereGet = vi.hoisted(() => vi.fn().mockResolvedValue({ empty: true, docs: [] }));

vi.mock("@/lib/firebase-admin", () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === "document_chunks") {
        return {
          doc: () => mockDocRef,
          where: () => ({ select: () => ({ get: mockWhereGet }) }),
        };
      }
      return {};
    }),
    batch: () => ({ set: mockBatchSet, delete: vi.fn(), commit: mockBatchCommit }),
  },
}));

process.env.GEMINI_API_KEY = "test-key";

import { writeDocumentChunks } from "@/lib/documents/embeddings";

beforeEach(() => {
  mockBatchSet.mockReset();
  mockBatchCommit.mockClear();
  mockWhereGet.mockClear();
  mockEmbedContent.mockReset();
  mockEmbedContent.mockImplementation(() =>
    Promise.resolve({ embeddings: [{ values: [0.1, 0.2, 0.3] }] })
  );
});

describe("writeDocumentChunks — headingPath (M5)", () => {
  it("stores the chunk's headingPath alongside the unprefixed text", async () => {
    await writeDocumentChunks("doc-1", "Snackbar.pdf", "# Snackbar\n\nNội dung ngắn.");

    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    const [, data] = mockBatchSet.mock.calls[0];
    expect(data.headingPath).toBe("Snackbar");
    expect(data.text).toBe("# Snackbar\n\nNội dung ngắn."); // stored text has no prefix
  });

  it("prefixes the embedding input with [headingPath] but not the stored text", async () => {
    await writeDocumentChunks("doc-1", "Snackbar.pdf", "# Snackbar\n\nNội dung ngắn.");

    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
    const call = mockEmbedContent.mock.calls[0][0];
    expect(call.contents).toBe("[Snackbar] # Snackbar\n\nNội dung ngắn.");
  });

  it("does not add an empty prefix when the document has no headings", async () => {
    await writeDocumentChunks("doc-1", "plain.txt", "Chỉ là văn bản thuần không có heading.");

    const call = mockEmbedContent.mock.calls[0][0];
    expect(call.contents).toBe("Chỉ là văn bản thuần không có heading.");
    const [, data] = mockBatchSet.mock.calls[0];
    expect(data.headingPath).toBeNull();
  });

  it("returns chunkCount 0 and writes nothing for empty text", async () => {
    const result = await writeDocumentChunks("doc-1", "empty.txt", "   ");
    expect(result).toEqual({ chunkCount: 0 });
    expect(mockBatchSet).not.toHaveBeenCalled();
  });
});
