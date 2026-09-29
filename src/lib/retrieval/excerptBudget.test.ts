import { describe, expect, it } from "vitest";
import { rankDocumentsForQuery } from "./excerptBudget";

describe("rankDocumentsForQuery score semantics (M4 lexical threshold depends on this)", () => {
  it("gives a doc with real term hits a score of at least 1", () => {
    const docs = [{ id: "a", fileName: "doc.pdf", text: "hướng dẫn dùng snackbar trong app" }];
    const [ranked] = rankDocumentsForQuery(docs, "snackbar", 5);
    expect(ranked.score).toBeGreaterThanOrEqual(1);
  });

  it("gives a doc with zero term hits the synthetic floor score of exactly 0.01, not 0", () => {
    const docs = [{ id: "a", fileName: "unrelated.pdf", text: "nội dung hoàn toàn không liên quan" }];
    const [ranked] = rankDocumentsForQuery(docs, "snackbar zzz_no_match_qqq", 5);
    expect(ranked.score).toBe(0.01);
  });
});
