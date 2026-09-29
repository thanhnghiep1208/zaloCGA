/**
 * The standalone .mjs scripts (eval/calibrate/verify/migrate) can't import the
 * app's TS modules, so they run a JS copy of the retrieval logic. This test
 * feeds identical inputs to both copies and fails on any divergence — if you
 * change one side, change the other (scripts/lib/*.mjs).
 */
import { vi, describe, expect, it } from "vitest";

const mockGenerateContent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ text: '{"relevant_indices": []}' })
);
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));
process.env.GEMINI_API_KEY = "test-key";

import { countTermHits, extractQueryTerms } from "../queryTerms";
import { buildBudgetedExcerpt, rankDocumentsForQuery } from "../excerptBudget";
import { dedupeByContentHash, mergeAdjacentChunksByDoc, type CandidateChunk } from "../chunkMerge";
import { computeRRFScore, fuseSnippetsByDoc } from "../rrf";
import { checkRelevance } from "../llm-relevance-check";
import { recallAtK, reciprocalRank } from "./metrics";
import { chunkText } from "@/lib/documents/chunking";
import { embeddingInputFor } from "@/lib/documents/embeddings";

import * as mirror from "../../../../scripts/lib/retrieval-mirror.mjs";
import * as mirrorChunking from "../../../../scripts/lib/chunking.mjs";

const QUERIES = [
  "dùng ban thay vì lock được không",
  "Snackbar hiển thị tối đa mấy dòng nội dung?",
  "có được dùng từ \"media\" để chỉ ảnh và video?",
  "và của cho với là có được",
  "a b toast TOAST toast",
  "",
];

const DOCS = [
  { id: "snackbar", fileName: "002 Snackbar.pdf", text: "# Snackbar\n\nSnackbar hiển thị tối đa 2 dòng nội dung." },
  { id: "glossary", fileName: "Glossary.csv", text: "ảnh,photo,,hình,Comm\nmedia,media,,,Comm" },
  { id: "rules", fileName: "Quy tắc chọn từ.docx", text: "Chính xác - rõ ràng - dễ hiểu. Không dùng ban, dùng khoá." },
  { id: "empty-ish", fileName: "other.pdf", text: "zzz qqq" },
];

function chunk(docId: string, chunkIndex: number, distance: number, text = `${docId}-${chunkIndex}`): CandidateChunk {
  return { docId, fileName: `${docId}.pdf`, chunkIndex, text, distance };
}

const CHUNK_SETS: CandidateChunk[][] = [
  [],
  [chunk("a", 0, 0.1)],
  [chunk("a", 4, 0.2), chunk("a", 5, 0.1), chunk("a", 6, 0.3)],
  [chunk("a", 0, 0.05), chunk("a", 10, 0.06), chunk("a", 20, 0.07), chunk("b", 0, 0.5)],
  [chunk("a", 0, 0.1, "Hello World"), chunk("b", 3, 0.2, "hello   world"), chunk("c", 1, 0.3)],
  [chunk("x", 2, 0.4), chunk("y", 0, 0.1), chunk("x", 3, 0.2), chunk("z", 9, 0.9), chunk("y", 7, 0.3)],
];

const WEIGHTS = [
  { vector: 1, lexical: 0, k: 60 },
  { vector: 0.7, lexical: 0.3, k: 60 },
  { vector: 0.5, lexical: 0.5, k: 1 },
];

const RANKED_LISTS: [string[], string[]][] = [
  [[], []],
  [["a", "b", "a", "c"], ["c", "d"]],
  [["a"], ["b", "a", "e"]],
  [["a", "a", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], ["k", "j"]],
];

const TEXTS = [
  "",
  "Văn bản thuần không có heading.",
  "# Snackbar\n\n## Behavior\n\nTối đa 2 dòng.",
  `# Section A\n\n## Sub A\n\n${"Đây là câu văn mẫu. ".repeat(120)}\n\n# Section B\n\n${"Câu khác nữa! ".repeat(150)}`,
  "x".repeat(4000),
];

const toItems = (ids: string[]) => ids.map((docId, i) => ({ docId, label: `${docId}#${i}` }));

describe("script mirror stays in sync with the app's TS retrieval code", () => {
  it("extractQueryTerms / countTermHits", () => {
    for (const q of QUERIES) {
      expect(mirror.extractQueryTerms(q)).toEqual(extractQueryTerms(q));
      const terms = extractQueryTerms(q);
      for (const d of DOCS) {
        expect(mirror.countTermHits(d.text.toLowerCase(), terms)).toBe(countTermHits(d.text.toLowerCase(), terms));
      }
    }
  });

  it("rankDocumentsForQuery (lexical scoring)", () => {
    for (const q of QUERIES) {
      for (const topK of [1, 3, 10]) {
        expect(mirror.rankDocumentsForQuery(DOCS, q, topK)).toEqual(rankDocumentsForQuery(DOCS, q, topK));
      }
    }
  });

  it("buildBudgetedExcerpt", () => {
    const long = `${"Mở đầu chung chung về tài liệu. ".repeat(60)}Snackbar hiển thị tối đa 2 dòng.\n\n${"Phần kết không liên quan! ".repeat(80)}`;
    for (const text of [...TEXTS, long, ...DOCS.map((d) => d.text)]) {
      for (const q of QUERIES) {
        for (const max of [300, 2600]) {
          expect(mirror.buildBudgetedExcerpt(text, q, max)).toBe(buildBudgetedExcerpt(text, q, max));
        }
      }
    }
  });

  it("dedupeByContentHash / mergeAdjacentChunksByDoc", () => {
    for (const set of CHUNK_SETS) {
      expect(mirror.dedupeByContentHash(set)).toEqual(dedupeByContentHash(set));
      for (const maxPerDoc of [1, 2, 3]) {
        expect(mirror.mergeAdjacentChunksByDoc(set, maxPerDoc)).toEqual(mergeAdjacentChunksByDoc(set, maxPerDoc));
      }
    }
  });

  it("computeRRFScore / fuseSnippetsByDoc", () => {
    const ranks: (number | undefined)[] = [undefined, 0, 1, 9];
    for (const w of WEIGHTS) {
      for (const rv of ranks) for (const rl of ranks) {
        expect(mirror.computeRRFScore(rv, rl, w)).toBe(computeRRFScore(rv, rl, w));
      }
      for (const [vector, lexical] of RANKED_LISTS) {
        for (const maxTotal of [2, 10]) {
          expect(mirror.fuseSnippetsByDoc(toItems(vector), toItems(lexical), maxTotal, w)).toEqual(
            fuseSnippetsByDoc(toItems(vector), toItems(lexical), maxTotal, w)
          );
        }
      }
    }
  });

  it("chunkText / embedding input", () => {
    for (const text of TEXTS) {
      const chunks = chunkText(text);
      expect(mirrorChunking.chunkText(text)).toEqual(chunks);
      for (const c of chunks) {
        expect(mirrorChunking.embedInputFor(c)).toBe(embeddingInputFor(c));
      }
    }
  });

  it("relevance-check prompt", async () => {
    const snippets = DOCS.map((d) => ({ docId: d.id, fileName: d.fileName, excerpt: d.text.repeat(200) }));
    for (const q of QUERIES.filter(Boolean)) {
      mockGenerateContent.mockClear();
      await checkRelevance(q, snippets);
      const appCall = mockGenerateContent.mock.calls[0][0];
      expect(mirror.buildRelevancePrompt(q, snippets)).toBe(appCall.contents[0].parts[0].text);
      expect(mirror.RELEVANCE_MODEL).toBe(appCall.model);
    }
  });

  it("relevance-check response handling", async () => {
    const snippets = DOCS.map((d) => ({ docId: d.id, fileName: d.fileName, excerpt: d.text }));
    const responses = [
      '{"relevant_indices": [2, 0]}',
      '{"relevant_indices": []}',
      '```json\n{"relevant_indices": [1]}\n```',
      '{"relevant_indices": [0, 0, 1, 99, -1, 1.5, "2"]}',
      '{"other": 1}',
      "not json",
      "",
    ];
    for (const text of responses) {
      mockGenerateContent.mockResolvedValueOnce({ text });
      const app = await checkRelevance("q", snippets);
      expect(mirror.applyRelevanceResponse(snippets, text)).toEqual(app);
    }
  });

  it("recallAtK / reciprocalRank", () => {
    for (const [ids] of RANKED_LISTS) {
      for (const expected of ["a", "c", "missing"]) {
        for (const k of [1, 3, 6]) expect(mirror.recallAtK(ids, expected, k)).toBe(recallAtK(ids, expected, k));
        expect(mirror.reciprocalRank(ids, expected)).toBe(reciprocalRank(ids, expected));
      }
    }
  });
});
