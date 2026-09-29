import { describe, expect, it } from "vitest";
import { countTermHits, extractQueryTerms } from "@/lib/retrieval/queryTerms";

describe("extractQueryTerms", () => {
  it("removes stopwords and deduplicates", () => {
    const terms = extractQueryTerms("Viết CTA cho nút đăng nhập và và");
    expect(terms).toContain("cta");
    expect(terms).toContain("nut");
    // Output is diacritic-stripped, so check the stripped form — "và" can never appear.
    expect(terms).not.toContain("va");
    expect(terms.length).toBe(new Set(terms).size);
  });

  it("removes Vietnamese stopwords written with diacritics", () => {
    expect(extractQueryTerms("của và với là có được trong một các như này đó")).toEqual([]);
  });

  it("removes stopwords even when the query arrives NFD-decomposed", () => {
    expect(extractQueryTerms("của và được".normalize("NFD"))).toEqual([]);
  });

  it("keeps words that differ from a stopword only by diacritics", () => {
    // "cỡ" (size) and "đỏ" (red) strip to the same letters as the stopwords
    // "có" and "đó" — they must survive, they matter for UI guideline questions.
    const terms = extractQueryTerms("cỡ chữ màu đỏ");
    expect(terms).toEqual(["co", "chu", "mau", "đo"]);
  });
});

describe("countTermHits", () => {
  it("counts repeated term occurrences in haystack", () => {
    const hits = countTermHits("guideline tone guideline", ["guideline", "tone"]);
    expect(hits).toBeGreaterThanOrEqual(3);
  });
});
