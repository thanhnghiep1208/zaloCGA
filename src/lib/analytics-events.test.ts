import { describe, expect, it } from "vitest";
import { estimateRelevanceScore, inferQueryType } from "@/lib/analytics-events";

describe("inferQueryType", () => {
  it("detects microcopy hints", () => {
    expect(inferQueryType("Viết label cho nút đăng nhập")).toBe("microcopy");
    expect(inferQueryType("Toast lỗi khi upload thất bại")).toBe("microcopy");
  });

  it("defaults to guideline", () => {
    expect(inferQueryType("Quy tắc viết CTA trong Zalo")).toBe("guideline");
  });
});

describe("estimateRelevanceScore", () => {
  it("returns higher score when tokens overlap", () => {
    const low = estimateRelevanceScore("abc xyz", "completely different words here");
    const high = estimateRelevanceScore(
      "guideline tone voice",
      "The guideline explains tone and voice rules"
    );
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});
