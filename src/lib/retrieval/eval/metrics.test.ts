import { describe, expect, it } from "vitest";
import { averageRecallAtK, meanReciprocalRank, recallAtK, reciprocalRank } from "./metrics";

describe("recallAtK", () => {
  it("returns 1 when expected doc is within top K", () => {
    expect(recallAtK(["a", "b", "c"], "b", 6)).toBe(1);
  });

  it("returns 0 when expected doc is outside top K", () => {
    expect(recallAtK(["a", "b", "c", "d", "e", "f", "expected"], "expected", 6)).toBe(0);
  });

  it("returns 0 when expected doc never appears", () => {
    expect(recallAtK(["a", "b"], "missing", 6)).toBe(0);
  });
});

describe("averageRecallAtK", () => {
  it("averages recall across queries", () => {
    const results = [
      { resultDocIds: ["a", "b"], expectedDocId: "a" }, // hit
      { resultDocIds: ["a", "b"], expectedDocId: "z" }, // miss
    ];
    expect(averageRecallAtK(results, 6)).toBe(0.5);
  });

  it("returns 0 for an empty result set", () => {
    expect(averageRecallAtK([], 6)).toBe(0);
  });
});

describe("reciprocalRank", () => {
  it("scores 1 for a first-place match", () => {
    expect(reciprocalRank(["a", "b"], "a")).toBe(1);
  });

  it("scores 1/3 for a third-place match", () => {
    expect(reciprocalRank(["x", "y", "a"], "a")).toBeCloseTo(1 / 3);
  });

  it("scores 0 when absent", () => {
    expect(reciprocalRank(["x", "y"], "a")).toBe(0);
  });
});

describe("meanReciprocalRank", () => {
  it("averages reciprocal rank across queries", () => {
    const results = [
      { resultDocIds: ["a"], expectedDocId: "a" }, // rank 1 -> 1
      { resultDocIds: ["x", "a"], expectedDocId: "a" }, // rank 2 -> 0.5
    ];
    expect(meanReciprocalRank(results)).toBeCloseTo(0.75);
  });

  it("returns 0 for an empty result set", () => {
    expect(meanReciprocalRank([])).toBe(0);
  });
});
