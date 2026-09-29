/**
 * Retrieval quality metrics against a golden set — see docs/tasks/prd-retrieval-quality-upgrade.md (M0).
 * Kept dependency-free so `scripts/eval-retrieval.mjs` can mirror the same math without a TS toolchain.
 */

export type GoldenSetItem = {
  query: string;
  expectedDocId: string;
  expectedChunkIndex?: number;
  source: "real" | "synthetic";
  notes?: string;
};

/** 1 if expectedDocId appears anywhere in the top-K result docIds, else 0. */
export function recallAtK(resultDocIds: string[], expectedDocId: string, k: number): 0 | 1 {
  return resultDocIds.slice(0, k).includes(expectedDocId) ? 1 : 0;
}

export function averageRecallAtK(
  results: { resultDocIds: string[]; expectedDocId: string }[],
  k: number
): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + recallAtK(r.resultDocIds, r.expectedDocId, k), 0);
  return sum / results.length;
}

/** Reciprocal rank of expectedDocId in resultDocIds (1-indexed); 0 if absent. */
export function reciprocalRank(resultDocIds: string[], expectedDocId: string): number {
  const idx = resultDocIds.indexOf(expectedDocId);
  return idx === -1 ? 0 : 1 / (idx + 1);
}

export function meanReciprocalRank(
  results: { resultDocIds: string[]; expectedDocId: string }[]
): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + reciprocalRank(r.resultDocIds, r.expectedDocId), 0);
  return sum / results.length;
}
