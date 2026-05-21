import { describe, expect, it } from "vitest";
import { countTermHits, extractQueryTerms } from "@/lib/retrieval/queryTerms";

describe("extractQueryTerms", () => {
  it("removes stopwords and deduplicates", () => {
    const terms = extractQueryTerms("Viết CTA cho nút đăng nhập và và");
    expect(terms).toContain("cta");
    expect(terms).toContain("nut");
    expect(terms).not.toContain("và");
    expect(terms.length).toBe(new Set(terms).size);
  });
});

describe("countTermHits", () => {
  it("counts repeated term occurrences in haystack", () => {
    const hits = countTermHits("guideline tone guideline", ["guideline", "tone"]);
    expect(hits).toBeGreaterThanOrEqual(3);
  });
});
