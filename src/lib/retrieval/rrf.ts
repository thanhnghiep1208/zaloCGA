/**
 * Reciprocal Rank Fusion — replaces the old "vector first, lexical fills gaps"
 * union merge. See docs/tasks/prd-retrieval-quality-upgrade.md (M3, FR#16-19).
 */

export type RRFWeights = { vector: number; lexical: number; k: number };

/**
 * RRF score for one doc given its 0-based rank in each branch (undefined = doc
 * did not appear in that branch at all — contributes 0, not a hard exclusion).
 * rank is converted to 1-indexed (`rank + 1`) before dividing, the standard RRF form.
 */
export function computeRRFScore(
  rankVector: number | undefined,
  rankLexical: number | undefined,
  weights: RRFWeights
): number {
  const vectorTerm =
    rankVector !== undefined ? weights.vector / (weights.k + rankVector + 1) : 0;
  const lexicalTerm =
    rankLexical !== undefined ? weights.lexical / (weights.k + rankLexical + 1) : 0;
  return vectorTerm + lexicalTerm;
}

export type RankedItem<T> = { docId: string; item: T };

/** First-occurrence 0-based rank per docId, preserving branch order. */
function rankByDocId<T extends { docId?: string }>(items: T[]): Map<string, number> {
  const ranks = new Map<string, number>();
  items.forEach((item, index) => {
    if (!item.docId || ranks.has(item.docId)) return;
    ranks.set(item.docId, index);
  });
  return ranks;
}

/**
 * Fuse two ranked snippet lists (vector, lexical) into one, ordered by RRF score
 * at the doc level.
 *
 * Assembly is **round-robin by RRF-ranked doc order**, not "dump every snippet
 * of doc #1, then every snippet of doc #2, ...". A first implementation did the
 * latter and silently reintroduced the exact crowding bug M1 fixed: a doc with
 * several surviving vector chunks had all of them placed back-to-back right
 * after its first chunk, pushing every *other* doc's single (often only) chunk
 * later — past `maxTotal` for weaker-but-still-relevant docs. Round-robin here
 * mirrors chunkMerge.ts's approach: round 0 takes each ranked doc's first
 * available snippet, round 1 takes each remaining doc's second snippet, etc.
 */
export function fuseSnippetsByDoc<T extends { docId?: string }>(
  vectorItems: T[],
  lexicalItems: T[],
  maxTotal: number,
  weights: RRFWeights
): T[] {
  const vectorRanks = rankByDocId(vectorItems);
  const lexicalRanks = rankByDocId(lexicalItems);

  const docIdsInFirstSeenOrder: string[] = [];
  const seen = new Set<string>();
  for (const item of [...vectorItems, ...lexicalItems]) {
    if (!item.docId || seen.has(item.docId)) continue;
    seen.add(item.docId);
    docIdsInFirstSeenOrder.push(item.docId);
  }

  const scored = docIdsInFirstSeenOrder.map((docId, firstSeenIndex) => ({
    docId,
    firstSeenIndex,
    score: computeRRFScore(vectorRanks.get(docId), lexicalRanks.get(docId), weights),
  }));

  // Higher score first; stable tie-break by original first-seen order.
  scored.sort((a, b) => b.score - a.score || a.firstSeenIndex - b.firstSeenIndex);
  const docOrder = scored.map((s) => s.docId);

  // Per doc: its available snippets, in the order they should be handed out —
  // every vector snippet (already best-first from chunkMerge.ts's round-robin)
  // if the doc has any, otherwise its single lexical snippet.
  const vectorByDoc = new Map<string, T[]>();
  for (const item of vectorItems) {
    if (!item.docId) continue;
    const group = vectorByDoc.get(item.docId);
    if (group) group.push(item);
    else vectorByDoc.set(item.docId, [item]);
  }
  const lexicalByDoc = new Map<string, T>();
  for (const item of lexicalItems) {
    if (item.docId && !lexicalByDoc.has(item.docId)) lexicalByDoc.set(item.docId, item);
  }
  const availableByDoc = new Map<string, T[]>();
  for (const docId of docOrder) {
    availableByDoc.set(docId, vectorByDoc.get(docId) ?? (lexicalByDoc.has(docId) ? [lexicalByDoc.get(docId)!] : []));
  }

  const result: T[] = [];
  const maxDepth = Math.max(0, ...[...availableByDoc.values()].map((v) => v.length));
  for (let depth = 0; depth < maxDepth && result.length < maxTotal; depth++) {
    for (const docId of docOrder) {
      if (result.length >= maxTotal) break;
      const items = availableByDoc.get(docId);
      if (items && items[depth]) result.push(items[depth]);
    }
  }

  return result.slice(0, maxTotal);
}
