import { FieldValue } from "firebase-admin/firestore";
import { RetrievalProvider, RetrievedSnippet, SearchOptions } from "./interfaces";
import { adminDb } from "@/lib/firebase-admin";
import { embedQuery } from "@/lib/documents/embeddings";
import { buildBudgetedExcerpt, rankDocumentsForQuery } from "./excerptBudget";
import { ChatScope, hasScope } from "@/lib/chat/scope-options";
import { dedupeByContentHash, mergeAdjacentChunksByDoc, type CandidateChunk } from "./chunkMerge";
import { fuseSnippetsByDoc, type RRFWeights } from "./rrf";
import { checkRelevance } from "./llm-relevance-check";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const FIRESTORE_FETCH_LIMIT = envInt("RETRIEVAL_FIRESTORE_FETCH_LIMIT", 120);
const MAX_SNIPPETS = envInt("RETRIEVAL_MAX_SNIPPETS", 10);
const MAX_CHARS_PER_SNIPPET = envInt("RETRIEVAL_MAX_CHARS_PER_SNIPPET", 2600);
// Fetch more vector candidates than MAX_SNIPPETS — several chunks per doc can now
// survive (see M1: mergeAdjacentChunksByDoc), so a wider pool avoids starving docs
// whose relevant content spans multiple chunks.
const VECTOR_CANDIDATES = envInt("RETRIEVAL_VECTOR_CANDIDATES", 30);
// Cap how many merged snippets a single document can contribute, so one large file
// doesn't crowd out every other document in the final context.
const MAX_SNIPPETS_PER_DOC = envInt("RETRIEVAL_MAX_SNIPPETS_PER_DOC", 3);
// When a scope is active, widen the lexical ranked pool before boosting/slicing
// so scope-matching docs beyond the top MAX_SNIPPETS by raw score have a chance to surface.
const LEXICAL_RERANK_POOL = envInt("RETRIEVAL_LEXICAL_RERANK_POOL", 20);
// COSINE distance threshold: 0 = identical, 1 = orthogonal, 2 = opposite.
// Only chunks with cosine_distance <= threshold are returned.
// NB: 0.55 is loose, not a reliable "not found" gate — a calibration pass
// (scripts/calibrate-not-found-threshold.mjs) found on-topic and off-topic
// queries overlap fully in this range on this corpus (see eval/BASELINE.md,
// "Sau M4"). It only exists to bound the candidate pool size for performance;
// `checkRelevance()` (M4) is what actually decides relevance/"not found".
function envFloat(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
const VECTOR_DISTANCE_THRESHOLD = envFloat("RETRIEVAL_VECTOR_DISTANCE_THRESHOLD", 0.55);
// `scoreDocument()` in excerptBudget.ts returns exactly 0.01 as a synthetic floor
// when a doc has zero real term-hits (so it can still rank last, never zero-div).
// Anything at or below that floor is noise, not a match — drop it before it can
// occupy a filler slot in the RRF fusion (M4, FR#20).
const LEXICAL_MIN_SCORE = envFloat("RETRIEVAL_LEXICAL_MIN_SCORE", 1);
// M4 (FR#21/22): a calibration pass (scripts/calibrate-not-found-threshold.mjs,
// see eval/BASELINE.md) found no vector-distance or lexical-score threshold that
// separates on-topic from off-topic queries on this corpus — ranges fully
// overlap. An LLM relevance check (also reorders/reranks) replaces the
// threshold approach. Keep an env kill switch in case of cost/latency issues.
const RELEVANCE_CHECK_ENABLED = process.env.RETRIEVAL_RELEVANCE_CHECK_ENABLED !== "0";
// RRF fusion weights (M3). Default lexical weight is 0, NOT the PRD's initial
// suggestion of 0.3 — verified via scripts/eval-retrieval.mjs that any nonzero
// lexical weight regresses recall@3/MRR below the M1 baseline on the current
// golden set, because lexicalSearch()'s scorer (queryTerms.ts) is too noisy on
// this small corpus: short/common Vietnamese syllables match as substrings
// almost everywhere, so long documents win on volume, not relevance. Raising
// this above 0 is only safe once that scorer is fixed — see BASELINE.md "Sau M3".
const RRF_WEIGHTS: RRFWeights = {
  vector: envFloat("RETRIEVAL_RRF_WEIGHT_VECTOR", 1.0),
  lexical: envFloat("RETRIEVAL_RRF_WEIGHT_LEXICAL", 0.0),
  k: envInt("RETRIEVAL_RRF_K", 60),
};

/**
 * How well a snippet's document-level scope tags match the user's selected scope.
 * 2 = both selected facets match, 1 = one selected facet matches, 0 = untagged or conflicting.
 * Untagged docs are never scored lower than conflicting-tag docs, so they still compete
 * on their original relevance rank instead of being pushed to the bottom.
 */
export function scopeMatchScore(snippet: RetrievedSnippet, scope: ChatScope): number {
  let score = 0;
  if (scope.messageType && (snippet.messageType === scope.messageType || snippet.messageType === "all")) score += 1;
  if (scope.uiPattern && (snippet.uiPattern === scope.uiPattern || snippet.uiPattern === "all")) score += 1;
  return score;
}

/**
 * Re-rank candidates so scope-matching docs surface first, without dropping anyone.
 * No-op when no scope is active — keeps today's behavior/perf unchanged for unscoped queries.
 */
export function applyScopeBoost(
  snippets: RetrievedSnippet[],
  scope: ChatScope | null | undefined
): RetrievedSnippet[] {
  if (!hasScope(scope)) return snippets;
  const activeScope = scope as ChatScope;
  return snippets
    .map((snippet, index) => ({ snippet, index }))
    .sort((a, b) => {
      const diff = scopeMatchScore(b.snippet, activeScope) - scopeMatchScore(a.snippet, activeScope);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ snippet }) => snippet);
}

export class FirebaseRetrievalProvider implements RetrievalProvider {
  async search(queryText: string, options?: SearchOptions): Promise<RetrievedSnippet[]> {
    if (!adminDb) {
      throw new Error("Firebase Admin SDK not initialized.");
    }
    const { precomputedEmbedding, scope, onUsage } = options ?? {};

    const [vectorResults, lexicalResults] = await Promise.all([
      this.vectorSearch(queryText, precomputedEmbedding, scope).catch((e) => {
        console.warn(`[Retrieval] Vector search failed: ${e instanceof Error ? e.message : e}`);
        return [] as RetrievedSnippet[];
      }),
      this.lexicalSearch(queryText, scope).catch((e) => {
        console.warn(`[Retrieval] Lexical search failed: ${e instanceof Error ? e.message : e}`);
        return [] as RetrievedSnippet[];
      }),
    ]);

    const merged = this.mergeResults(vectorResults, lexicalResults);
    if (!RELEVANCE_CHECK_ENABLED || merged.length === 0) return merged;

    const checked = await checkRelevance(queryText, merged, undefined, onUsage);
    if (checked.length !== merged.length || checked.some((s, i) => s !== merged[i])) {
      console.log(
        `[Retrieval] Relevance check: ${merged.length} candidates -> ${checked.length} kept/reordered`
      );
    }
    return checked;
  }

  private mergeResults(vector: RetrievedSnippet[], lexical: RetrievedSnippet[]): RetrievedSnippet[] {
    const merged = fuseSnippetsByDoc(vector, lexical, MAX_SNIPPETS, RRF_WEIGHTS);
    if (merged.length === 0) {
      console.warn("[Retrieval] Both vector and lexical search returned 0 results");
    } else {
      console.log(
        `[Retrieval] RRF fused: ${vector.length} vector + ${lexical.length} lexical -> ${merged.length} total (weights=${JSON.stringify(RRF_WEIGHTS)})`
      );
    }
    return merged;
  }

  private async vectorSearch(
    queryText: string,
    precomputedEmbedding: number[] | undefined,
    scope: ChatScope | null | undefined
  ): Promise<RetrievedSnippet[]> {
    if (!adminDb) throw new Error("Firebase Admin SDK not initialized.");
    const queryEmbedding = precomputedEmbedding && precomputedEmbedding.length > 0
      ? precomputedEmbedding
      : await embedQuery(queryText);
    if (queryEmbedding.length === 0) return [];

    const snapshot = await adminDb
      .collection("document_chunks")
      .where("status", "==", "indexed")
      .findNearest({
        vectorField: "embedding",
        queryVector: FieldValue.vector(queryEmbedding),
        limit: VECTOR_CANDIDATES,
        distanceMeasure: "COSINE",
        distanceResultField: "_dist",
        distanceThreshold: VECTOR_DISTANCE_THRESHOLD,
      })
      .get();

    if (snapshot.empty) return [];

    // Keep every candidate chunk (not just the best one per doc) — a large document
    // can legitimately have several distinct relevant chunks. Content-hash dedup still
    // drops true duplicates (e.g. re-ingestion leftovers).
    const rawChunks: CandidateChunk[] = snapshot.docs.map((doc) => {
      const data = doc.data() as {
        docId?: string;
        fileName?: string;
        text?: string;
        chunkIndex?: number;
        _dist?: number;
      };
      const docId = typeof data.docId === "string" ? data.docId : doc.id;
      return {
        docId,
        fileName: typeof data.fileName === "string" ? data.fileName : docId,
        chunkIndex: typeof data.chunkIndex === "number" ? data.chunkIndex : 0,
        text: typeof data.text === "string" ? data.text : "",
        // findNearest returns docs ordered by distance — this preserves relative rank.
        distance: typeof data._dist === "number" ? data._dist : 1,
      };
    });

    const deduped = dedupeByContentHash(rawChunks);
    const merged = mergeAdjacentChunksByDoc(deduped, MAX_SNIPPETS_PER_DOC);

    const uniqueDocIds = [...new Set(merged.map((m) => m.docId))];
    console.log(
      `[Retrieval] Vector candidates: ${snapshot.size}, unique docs: ${uniqueDocIds.length}, merged snippets: ${merged.length}`,
      merged.map((m) => `${m.fileName}(d=${m.bestDistance.toFixed(3)})`).join(", ")
    );

    const scopeActive = hasScope(scope);
    const docMeta = scopeActive ? await this.fetchDocScopeMeta(uniqueDocIds) : null;

    let snippets: RetrievedSnippet[] = merged.map((m) => {
      const meta = docMeta?.get(m.docId);
      return {
        docId: m.docId,
        fileName: m.fileName,
        excerpt: buildBudgetedExcerpt(m.text, queryText, MAX_CHARS_PER_SNIPPET),
        reference: `/references/${m.docId}`,
        messageType: meta?.messageType ?? null,
        uiPattern: meta?.uiPattern ?? null,
      };
    });

    // `merged` is already sorted by bestDistance ascending, so a plain slice keeps
    // the strongest matches when no scope is active.
    snippets = scopeActive
      ? applyScopeBoost(snippets, scope).slice(0, MAX_SNIPPETS)
      : snippets.slice(0, MAX_SNIPPETS);

    return snippets;
  }

  /** Batched lookup of scope tags from `documents`, keyed by docId — only called when a scope is active. */
  private async fetchDocScopeMeta(
    docIds: string[]
  ): Promise<Map<string, { messageType: RetrievedSnippet["messageType"]; uiPattern: RetrievedSnippet["uiPattern"] }>> {
    const meta = new Map<string, { messageType: RetrievedSnippet["messageType"]; uiPattern: RetrievedSnippet["uiPattern"] }>();
    if (!adminDb || docIds.length === 0) return meta;
    const refs = docIds.map((id) => adminDb!.collection("documents").doc(id));
    const snaps = await adminDb.getAll(...refs);
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data() as { messageType?: string | null; uiPattern?: string | null } | undefined;
      meta.set(snap.id, {
        messageType: (data?.messageType as RetrievedSnippet["messageType"]) ?? null,
        uiPattern: (data?.uiPattern as RetrievedSnippet["uiPattern"]) ?? null,
      });
    });
    return meta;
  }

  private async lexicalSearch(
    queryText: string,
    scope: ChatScope | null | undefined
  ): Promise<RetrievedSnippet[]> {
    if (!adminDb) throw new Error("Firebase Admin SDK not initialized.");
    console.log(`[Retrieval] Lexical search — fetch up to ${FIRESTORE_FETCH_LIMIT} indexed docs`);

    const snapshot = await adminDb
      .collection("documents")
      .where("status", "==", "indexed")
      .select("type", "fileName", "title", "textContent", "contentPlain", "messageType", "uiPattern")
      .limit(FIRESTORE_FETCH_LIMIT)
      .get();

    console.log(`[Retrieval] Lexical: fetched ${snapshot.size} docs`);

    const docs = snapshot.docs
      .map((doc) => {
        const data = doc.data() as {
          type?: string;
          fileName?: string;
          title?: string;
          textContent?: string;
          contentPlain?: string;
          messageType?: string | null;
          uiPattern?: string | null;
        };
        const text =
          typeof data.textContent === "string" && data.textContent.trim()
            ? data.textContent
            : typeof data.contentPlain === "string"
            ? data.contentPlain
            : "";
        const fileName =
          typeof data.fileName === "string" && data.fileName.trim()
            ? data.fileName
            : typeof data.title === "string" && data.title.trim()
            ? data.title
            : doc.id;
        return {
          id: doc.id,
          fileName,
          text,
          messageType: (data.messageType as RetrievedSnippet["messageType"]) ?? null,
          uiPattern: (data.uiPattern as RetrievedSnippet["uiPattern"]) ?? null,
        };
      })
      .filter((d) => d.text.trim().length > 0);

    if (docs.length === 0) {
      console.warn("[Retrieval] Lexical: no documents with text content");
      return [];
    }

    const scopeActive = hasScope(scope);
    const rankLimit = scopeActive ? Math.max(MAX_SNIPPETS, LEXICAL_RERANK_POOL) : MAX_SNIPPETS;
    const ranked = rankDocumentsForQuery(docs, queryText, rankLimit).filter(
      (d) => d.score >= LEXICAL_MIN_SCORE
    );
    let snippets: RetrievedSnippet[] = ranked.map((d) => ({
      docId: d.id,
      fileName: d.fileName,
      excerpt: buildBudgetedExcerpt(d.text, queryText, MAX_CHARS_PER_SNIPPET),
      reference: `/references/${d.id}`,
      messageType: d.messageType,
      uiPattern: d.uiPattern,
    }));

    if (scopeActive) {
      snippets = applyScopeBoost(snippets, scope).slice(0, MAX_SNIPPETS);
    }

    return snippets;
  }
}
