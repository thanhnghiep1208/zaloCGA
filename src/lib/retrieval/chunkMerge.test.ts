import { describe, expect, it } from "vitest";
import { dedupeByContentHash, mergeAdjacentChunksByDoc, type CandidateChunk } from "./chunkMerge";

function chunk(overrides: Partial<CandidateChunk> = {}): CandidateChunk {
  return {
    docId: "doc-1",
    fileName: "doc.pdf",
    chunkIndex: 0,
    text: "some text",
    distance: 0.1,
    ...overrides,
  };
}

describe("dedupeByContentHash", () => {
  it("keeps the first occurrence and drops later exact duplicates", () => {
    const chunks = [
      chunk({ chunkIndex: 0, text: "Hello world", distance: 0.1 }),
      chunk({ chunkIndex: 5, text: "Hello world", distance: 0.3 }),
    ];
    expect(dedupeByContentHash(chunks)).toHaveLength(1);
    expect(dedupeByContentHash(chunks)[0].distance).toBe(0.1);
  });

  it("treats whitespace/case differences as duplicates", () => {
    const chunks = [
      chunk({ text: "Hello   World" }),
      chunk({ text: "hello world" }),
    ];
    expect(dedupeByContentHash(chunks)).toHaveLength(1);
  });

  it("keeps distinct content", () => {
    const chunks = [chunk({ text: "A" }), chunk({ text: "B" })];
    expect(dedupeByContentHash(chunks)).toHaveLength(2);
  });
});

describe("mergeAdjacentChunksByDoc", () => {
  it("merges chunks with adjacent chunkIndex into one snippet", () => {
    const chunks = [
      chunk({ chunkIndex: 4, text: "part4", distance: 0.2 }),
      chunk({ chunkIndex: 5, text: "part5", distance: 0.1 }),
      chunk({ chunkIndex: 6, text: "part6", distance: 0.3 }),
    ];
    const result = mergeAdjacentChunksByDoc(chunks, 3);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("part4\n\npart5\n\npart6");
    expect(result[0].bestDistance).toBe(0.1);
  });

  it("keeps non-adjacent chunks as separate snippets", () => {
    const chunks = [
      chunk({ chunkIndex: 0, text: "start", distance: 0.1 }),
      chunk({ chunkIndex: 10, text: "far away", distance: 0.2 }),
    ];
    const result = mergeAdjacentChunksByDoc(chunks, 3);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.text)).toEqual(["start", "far away"]);
  });

  it("caps the number of snippets kept per doc, keeping the best-scoring runs", () => {
    const chunks = [
      chunk({ chunkIndex: 0, text: "run-a", distance: 0.5 }),
      chunk({ chunkIndex: 5, text: "run-b", distance: 0.1 }),
      chunk({ chunkIndex: 10, text: "run-c", distance: 0.3 }),
      chunk({ chunkIndex: 15, text: "run-d", distance: 0.9 }),
    ];
    const result = mergeAdjacentChunksByDoc(chunks, 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.text)).toEqual(["run-b", "run-c"]);
  });

  it("handles multiple docs independently", () => {
    const chunks = [
      chunk({ docId: "doc-a", chunkIndex: 0, text: "a0", distance: 0.4 }),
      chunk({ docId: "doc-b", chunkIndex: 0, text: "b0", distance: 0.1 }),
    ];
    const result = mergeAdjacentChunksByDoc(chunks, 3);
    expect(result).toHaveLength(2);
    expect(result[0].docId).toBe("doc-b");
    expect(result[1].docId).toBe("doc-a");
  });

  it("returns overall results sorted by bestDistance ascending when each doc has one run", () => {
    const chunks = [
      chunk({ docId: "doc-a", chunkIndex: 0, text: "a0", distance: 0.9 }),
      chunk({ docId: "doc-b", chunkIndex: 0, text: "b0", distance: 0.05 }),
      chunk({ docId: "doc-c", chunkIndex: 0, text: "c0", distance: 0.4 }),
    ];
    const result = mergeAdjacentChunksByDoc(chunks, 3);
    expect(result.map((r) => r.docId)).toEqual(["doc-b", "doc-c", "doc-a"]);
  });

  it("round-robins across docs instead of letting one strong doc's extra runs crowd out a weaker doc entirely", () => {
    // doc-a has 3 non-adjacent, very strong runs; doc-b has 1 weaker run.
    // A flat sort-by-distance would push doc-b to the very end (behind all 3 of
    // doc-a's runs) — this is the exact crowding regression found via
    // scripts/eval-retrieval.mjs (recall@6 100% -> 95.8% on the golden set).
    const chunks = [
      chunk({ docId: "doc-a", chunkIndex: 0, text: "a0", distance: 0.05 }),
      chunk({ docId: "doc-a", chunkIndex: 10, text: "a10", distance: 0.06 }),
      chunk({ docId: "doc-a", chunkIndex: 20, text: "a20", distance: 0.07 }),
      chunk({ docId: "doc-b", chunkIndex: 0, text: "b0", distance: 0.5 }),
    ];
    const result = mergeAdjacentChunksByDoc(chunks, 3);
    // doc-b's only run must appear right after doc-a's best run — not last.
    expect(result.map((r) => r.docId)).toEqual(["doc-a", "doc-b", "doc-a", "doc-a"]);
    expect(result[1].docId).toBe("doc-b");
  });
});
