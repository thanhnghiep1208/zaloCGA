import { vi, describe, it, expect, beforeEach } from "vitest";
import type { RetrievedSnippet } from "./interfaces";

type ChunkRow = { docId: string; fileName: string; text: string; chunkIndex: number; _dist: number };
type DocRow = { id: string; fileName: string; textContent: string };

const state = vi.hoisted(() => ({
  chunks: [] as ChunkRow[],
  docs: [] as DocRow[],
  reads: { chunks: 0, documents: 0, getAll: 0 },
}));

const mockCheckRelevance = vi.hoisted(() =>
  vi.fn(async (_q: string, snippets: RetrievedSnippet[]) => snippets)
);

vi.mock("@/lib/firebase-admin", () => {
  const chunksQuery = {
    where: () => chunksQuery,
    findNearest: () => chunksQuery,
    get: async () => {
      state.reads.chunks++;
      return {
        empty: state.chunks.length === 0,
        size: state.chunks.length,
        docs: state.chunks.map((c, i) => ({ id: `chunk-${i}`, data: () => c })),
      };
    },
  };
  const docsQuery = {
    where: () => docsQuery,
    select: () => docsQuery,
    limit: () => docsQuery,
    doc: (id: string) => ({ id }),
    get: async () => {
      state.reads.documents++;
      return {
        size: state.docs.length,
        docs: state.docs.map((d) => ({ id: d.id, data: () => d })),
      };
    },
  };
  return {
    adminDb: {
      collection: (name: string) => (name === "document_chunks" ? chunksQuery : docsQuery),
      getAll: async (...refs: { id: string }[]) => {
        state.reads.getAll++;
        return refs.map((r) => ({ id: r.id, exists: false, data: () => undefined }));
      },
    },
  };
});

vi.mock("@/lib/documents/embeddings", () => ({
  embedQuery: async () => [0.1, 0.2, 0.3],
}));

vi.mock("./llm-relevance-check", () => ({ checkRelevance: mockCheckRelevance }));

async function loadProvider() {
  const { FirebaseRetrievalProvider } = await import("./FirebaseRetrievalProvider");
  return new FirebaseRetrievalProvider();
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.RETRIEVAL_RELEVANCE_CHECK_ENABLED;
  state.chunks = [];
  state.docs = [];
  state.reads = { chunks: 0, documents: 0, getAll: 0 };
  mockCheckRelevance.mockReset();
  mockCheckRelevance.mockImplementation(async (_q, snippets) => snippets);
});

describe("FirebaseRetrievalProvider.search — relevance check wiring (FR#21)", () => {
  it("returns an empty list when the relevance check finds nothing relevant", async () => {
    state.chunks = [{ docId: "d1", fileName: "a.pdf", text: "nội dung A", chunkIndex: 0, _dist: 0.3 }];
    mockCheckRelevance.mockResolvedValue([]);

    const provider = await loadProvider();
    expect(await provider.search("giá Bitcoin hôm nay")).toEqual([]);
  });

  it("does not call the relevance check when retrieval found nothing at all", async () => {
    const provider = await loadProvider();
    expect(await provider.search("bất kỳ")).toEqual([]);
    expect(mockCheckRelevance).not.toHaveBeenCalled();
  });

  it("skips the relevance check when disabled via RETRIEVAL_RELEVANCE_CHECK_ENABLED=0", async () => {
    process.env.RETRIEVAL_RELEVANCE_CHECK_ENABLED = "0";
    state.chunks = [{ docId: "d1", fileName: "a.pdf", text: "nội dung A", chunkIndex: 0, _dist: 0.3 }];

    const provider = await loadProvider();
    const result = await provider.search("snackbar");
    expect(mockCheckRelevance).not.toHaveBeenCalled();
    expect(result.map((s) => s.docId)).toEqual(["d1"]);
  });
});

describe("FirebaseRetrievalProvider.search — lexical minimum score (FR#20)", () => {
  it("drops lexical documents with zero real term hits instead of using them as filler", async () => {
    state.docs = [
      { id: "match", fileName: "snackbar.pdf", textContent: "Snackbar hiển thị tối đa 2 dòng." },
      { id: "noise", fileName: "other.pdf", textContent: "Nội dung hoàn toàn khác." },
    ];

    const provider = await loadProvider();
    const docIds = (await provider.search("snackbar")).map((s) => s.docId);
    expect(docIds).toContain("match");
    expect(docIds).not.toContain("noise");
  });
});

describe("FirebaseRetrievalProvider.search — Firestore read budget (FR#18)", () => {
  it("does exactly one chunk query and one documents query per unscoped search", async () => {
    state.chunks = [
      { docId: "d1", fileName: "a.pdf", text: "snackbar A", chunkIndex: 0, _dist: 0.2 },
      { docId: "d1", fileName: "a.pdf", text: "snackbar B", chunkIndex: 1, _dist: 0.3 },
      { docId: "d2", fileName: "b.pdf", text: "snackbar C", chunkIndex: 0, _dist: 0.4 },
    ];
    state.docs = [{ id: "d1", fileName: "a.pdf", textContent: "snackbar" }];

    const provider = await loadProvider();
    await provider.search("snackbar");

    expect(state.reads).toEqual({ chunks: 1, documents: 1, getAll: 0 });
  });
});

describe("scripts/lib/pipeline.mjs mirrors search() end to end", () => {
  const LONG = `${"Mở đầu chung về component. ".repeat(80)}Snackbar hiển thị tối đa 2 dòng.\n\n${"Phần cuối khác. ".repeat(120)}`;
  const SCENARIOS: { chunks: ChunkRow[]; docs: DocRow[]; query: string }[] = [
    {
      query: "snackbar tối đa mấy dòng",
      chunks: [
        { docId: "snack", fileName: "002 Snackbar.pdf", text: LONG, chunkIndex: 0, _dist: 0.2 },
        { docId: "snack", fileName: "002 Snackbar.pdf", text: "Chunk kế tiếp của snackbar.", chunkIndex: 1, _dist: 0.25 },
        { docId: "snack", fileName: "002 Snackbar.pdf", text: "Chunk xa của snackbar.", chunkIndex: 7, _dist: 0.3 },
        { docId: "big", fileName: "CG.docx", text: "Nội dung A", chunkIndex: 0, _dist: 0.22 },
        { docId: "big", fileName: "CG.docx", text: "Nội dung B", chunkIndex: 5, _dist: 0.23 },
        { docId: "big", fileName: "CG.docx", text: "nội   dung a", chunkIndex: 9, _dist: 0.4 },
      ],
      docs: [
        { id: "snack", fileName: "002 Snackbar.pdf", textContent: LONG },
        { id: "lexonly", fileName: "Viết theo component.docx", textContent: "Snackbar tối đa 2 dòng, mô tả không quá 11 từ." },
        { id: "noise", fileName: "other.pdf", textContent: "zzz qqq" },
      ],
    },
    {
      query: "giá Bitcoin hôm nay",
      chunks: [],
      docs: [{ id: "noise", fileName: "other.pdf", textContent: "zzz qqq" }],
    },
    {
      query: "tooltip",
      chunks: Array.from({ length: 14 }, (_, i) => ({
        docId: `d${i % 5}`, fileName: `d${i % 5}.pdf`, text: `tooltip phần ${i}`, chunkIndex: i, _dist: 0.1 + i / 100,
      })),
      docs: Array.from({ length: 12 }, (_, i) => ({ id: `lex${i}`, fileName: `lex${i}.pdf`, textContent: `tooltip ${"x ".repeat(i)}` })),
    },
    {
      // Few docs, many non-adjacent runs each: the per-doc cap decides how many survive.
      query: "card",
      chunks: [0, 3, 6, 9].flatMap((ci, i) => [
        { docId: "p", fileName: "p.pdf", text: `card p${ci}`, chunkIndex: ci, _dist: 0.1 + i / 100 },
        { docId: "q", fileName: "q.pdf", text: `card q${ci}`, chunkIndex: ci, _dist: 0.2 + i / 100 },
      ]),
      docs: [],
    },
    {
      // No vector hits: lexical alone fills the result, so its rank limit shows.
      query: "banner",
      chunks: [],
      docs: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, fileName: `b${i}.pdf`, textContent: "banner ".repeat(8 - i) })),
    },
  ];

  it("returns the same snippets (docId, fileName, excerpt) as the app for every scenario", async () => {
    const { createSearch, DEFAULT_CONFIG } = await import("../../../scripts/lib/pipeline.mjs");
    for (const s of SCENARIOS) {
      state.chunks = s.chunks;
      state.docs = s.docs;
      vi.resetModules();
      const provider = await loadProvider();
      const { adminDb } = await import("@/lib/firebase-admin");
      const scriptSearch = createSearch({
        db: adminDb,
        FieldValue: { vector: (v: number[]) => v },
        embedQuery: async () => [0.1, 0.2, 0.3],
        config: DEFAULT_CONFIG,
      });

      const pick = (xs: RetrievedSnippet[]) => xs.map(({ docId, fileName, excerpt }) => ({ docId, fileName, excerpt }));
      expect(pick(await scriptSearch(s.query))).toEqual(pick(await provider.search(s.query)));
    }
  });
});
