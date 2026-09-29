import { describe, expect, it } from "vitest";
import { computeRRFScore, fuseSnippetsByDoc } from "./rrf";

const W = { vector: 0.7, lexical: 0.3, k: 60 };

describe("computeRRFScore", () => {
  it("combines both branches when the doc appears in both", () => {
    const score = computeRRFScore(0, 0, W);
    expect(score).toBeCloseTo(0.7 / 61 + 0.3 / 61);
  });

  it("only counts the vector term when absent from lexical", () => {
    const score = computeRRFScore(0, undefined, W);
    expect(score).toBeCloseTo(0.7 / 61);
  });

  it("only counts the lexical term when absent from vector", () => {
    const score = computeRRFScore(undefined, 0, W);
    expect(score).toBeCloseTo(0.3 / 61);
  });

  it("returns 0 when the doc is absent from both branches", () => {
    expect(computeRRFScore(undefined, undefined, W)).toBe(0);
  });

  it("scores a better (lower) rank higher than a worse rank", () => {
    const best = computeRRFScore(0, undefined, W);
    const worst = computeRRFScore(10, undefined, W);
    expect(best).toBeGreaterThan(worst);
  });

  it("respects custom weights", () => {
    const lexicalHeavy = { vector: 0.1, lexical: 0.9, k: 60 };
    const score = computeRRFScore(0, 0, lexicalHeavy);
    expect(score).toBeCloseTo(0.1 / 61 + 0.9 / 61);
  });
});

type Item = { docId: string; label: string };
function item(docId: string, label: string): Item {
  return { docId, label };
}

describe("fuseSnippetsByDoc", () => {
  it("ranks a doc found by both branches above one found by only one branch", () => {
    const vector = [item("both", "v1"), item("vector-only", "v2")];
    const lexical = [item("both", "l1"), item("lexical-only", "l2")];
    const result = fuseSnippetsByDoc(vector, lexical, 10, W);
    expect(result[0].docId).toBe("both");
  });

  it("keeps every vector snippet for a doc that contributed multiple (M1 multi-chunk merge)", () => {
    const vector = [item("doc-a", "chunk1"), item("doc-a", "chunk2"), item("doc-b", "chunk1")];
    const lexical: Item[] = [];
    const result = fuseSnippetsByDoc(vector, lexical, 10, W);
    expect(result.filter((r) => r.docId === "doc-a")).toHaveLength(2);
  });

  it("includes lexical-only docs (not dropped just for missing from vector)", () => {
    const vector = [item("doc-a", "v1")];
    const lexical = [item("doc-a", "l1"), item("doc-b", "l2")];
    const result = fuseSnippetsByDoc(vector, lexical, 10, W);
    expect(result.map((r) => r.docId)).toContain("doc-b");
  });

  it("caps the total result at maxTotal", () => {
    const vector = [item("a", "1"), item("b", "1"), item("c", "1"), item("d", "1")];
    const result = fuseSnippetsByDoc(vector, [], 2, W);
    expect(result).toHaveLength(2);
  });

  it("does not duplicate a lexical entry for a doc already covered by vector", () => {
    const vector = [item("doc-a", "v1")];
    const lexical = [item("doc-a", "l1")];
    const result = fuseSnippetsByDoc(vector, lexical, 10, W);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("v1"); // vector snippet wins, not the lexical duplicate
  });

  it("ranks a doc appearing early in a branch above one appearing late in the same branch", () => {
    const vector = [item("early", "1"), item("mid", "1"), item("late", "1")];
    const result = fuseSnippetsByDoc(vector, [], 10, W);
    expect(result.map((r) => r.docId)).toEqual(["early", "mid", "late"]);
  });

  it("round-robins across docs instead of dumping one doc's extra snippets before other docs' first snippet (regression: an earlier version reintroduced the M1 crowding bug at this layer)", () => {
    // doc-a contributes 3 vector snippets (all rank ahead of doc-b's single one),
    // doc-b contributes exactly 1. A naive "group by doc, then order groups by
    // score" assembly would emit [a1, a2, a3, b1] — doc-b's only snippet pushed
    // to position 4. Round-robin must emit doc-b's snippet right after doc-a's
    // best one, at position 2.
    const vector = [
      item("doc-a", "a1"),
      item("doc-b", "b1"),
      item("doc-a", "a2"),
      item("doc-a", "a3"),
    ];
    const result = fuseSnippetsByDoc(vector, [], 10, W);
    expect(result.map((r) => r.label)).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("stops truncating mid-round when maxTotal is reached, without dropping an earlier round's entries", () => {
    const vector = [
      item("doc-a", "a1"),
      item("doc-b", "b1"),
      item("doc-c", "c1"),
      item("doc-a", "a2"),
    ];
    const result = fuseSnippetsByDoc(vector, [], 2, W);
    expect(result.map((r) => r.label)).toEqual(["a1", "b1"]);
  });
});
