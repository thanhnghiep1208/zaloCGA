/**
 * Merge multiple relevant chunks from the same document instead of the old
 * "1 chunk per docId" dedup — see docs/tasks/prd-retrieval-quality-upgrade.md (M1).
 */

export type CandidateChunk = {
  docId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  distance: number;
};

export type MergedDocSnippet = {
  docId: string;
  fileName: string;
  text: string;
  bestDistance: number;
};

/** Normalized dedup key for a chunk's content — catches exact/near-exact duplicate chunks. */
function contentSignature(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Drop chunks whose content is a duplicate of one already kept (keeps the first — lowest distance, since callers pass distance-sorted input). */
export function dedupeByContentHash(chunks: CandidateChunk[]): CandidateChunk[] {
  const seen = new Set<string>();
  const out: CandidateChunk[] = [];
  for (const c of chunks) {
    const sig = contentSignature(c.text);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(c);
  }
  return out;
}

/**
 * Group candidate chunks by docId and merge chunks whose `chunkIndex` is adjacent
 * (diff <= 1) into a single snippet per run, capped at `maxPerDoc` runs per doc.
 *
 * Ordering is **round-robin by doc**, not a flat sort by distance: every doc's best
 * run competes in round 1 before any doc's 2nd-best run is considered in round 2.
 * A flat sort would let one long, strongly-matching document occupy several of the
 * final MAX_SNIPPETS slots (verified via scripts/eval-retrieval.mjs — recall@6 on
 * the golden set regressed from 100% to 95.8% with a flat sort), crowding out other
 * relevant documents. Round-robin guarantees every candidate doc gets a slot before
 * any doc gets a second one, so per-doc depth never comes at the cost of doc diversity
 * unless there are truly fewer distinct docs than there are slots to fill.
 */
export function mergeAdjacentChunksByDoc(
  chunks: CandidateChunk[],
  maxPerDoc: number
): MergedDocSnippet[] {
  const byDoc = new Map<string, CandidateChunk[]>();
  for (const c of chunks) {
    const group = byDoc.get(c.docId);
    if (group) group.push(c);
    else byDoc.set(c.docId, [c]);
  }

  // Per doc: build distance-sorted runs, capped at maxPerDoc.
  const runsByDoc: MergedDocSnippet[][] = [];
  for (const [docId, group] of byDoc) {
    const sorted = [...group].sort((a, b) => a.chunkIndex - b.chunkIndex);

    const runs: CandidateChunk[][] = [];
    let current: CandidateChunk[] = [];
    for (const c of sorted) {
      const prev = current[current.length - 1];
      if (!prev || c.chunkIndex - prev.chunkIndex <= 1) {
        current.push(c);
      } else {
        runs.push(current);
        current = [c];
      }
    }
    if (current.length > 0) runs.push(current);

    const scoredRuns: MergedDocSnippet[] = runs.map((run) => ({
      docId,
      fileName: run[0].fileName,
      text: run.map((r) => r.text).join("\n\n"),
      bestDistance: Math.min(...run.map((r) => r.distance)),
    }));
    scoredRuns.sort((a, b) => a.bestDistance - b.bestDistance);
    runsByDoc.push(scoredRuns.slice(0, Math.max(1, maxPerDoc)));
  }

  // Round-robin: round 0 = every doc's best run (sorted by distance among docs),
  // round 1 = every doc's 2nd-best run (if any), etc.
  const result: MergedDocSnippet[] = [];
  const maxRounds = Math.max(0, ...runsByDoc.map((r) => r.length));
  for (let round = 0; round < maxRounds; round++) {
    const roundEntries = runsByDoc
      .map((runs) => runs[round])
      .filter((r): r is MergedDocSnippet => r !== undefined)
      .sort((a, b) => a.bestDistance - b.bestDistance);
    result.push(...roundEntries);
  }

  return result;
}
