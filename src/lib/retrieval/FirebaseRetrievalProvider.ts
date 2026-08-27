import { FieldValue } from "firebase-admin/firestore";
import { RetrievalProvider, RetrievedSnippet, SearchOptions } from "./interfaces";
import { adminDb } from "@/lib/firebase-admin";
import { embedQuery } from "@/lib/documents/embeddings";
import { buildBudgetedExcerpt, rankDocumentsForQuery } from "./excerptBudget";
import { ChatScope, hasScope } from "@/lib/chat/scope-options";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const FIRESTORE_FETCH_LIMIT = envInt("RETRIEVAL_FIRESTORE_FETCH_LIMIT", 120);
const MAX_SNIPPETS = envInt("RETRIEVAL_MAX_SNIPPETS", 6);
const MAX_CHARS_PER_SNIPPET = envInt("RETRIEVAL_MAX_CHARS_PER_SNIPPET", 2600);
// Fetch more vector candidates than MAX_SNIPPETS to allow dedup by docId
const VECTOR_CANDIDATES = envInt("RETRIEVAL_VECTOR_CANDIDATES", 20);
// When a scope is active, widen the lexical ranked pool before boosting/slicing
// so scope-matching docs beyond the top MAX_SNIPPETS by raw score have a chance to surface.
const LEXICAL_RERANK_POOL = envInt("RETRIEVAL_LEXICAL_RERANK_POOL", 20);
// COSINE distance threshold: 0 = identical, 1 = orthogonal, 2 = opposite.
// Only chunks with cosine_distance <= threshold are returned.
// Default 0.55 keeps clearly relevant results and discards unrelated chunks.
function envFloat(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
const VECTOR_DISTANCE_THRESHOLD = envFloat("RETRIEVAL_VECTOR_DISTANCE_THRESHOLD", 0.55);

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
    const { precomputedEmbedding, scope } = options ?? {};

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

    return this.mergeResults(vectorResults, lexicalResults);
  }

  private mergeResults(vector: RetrievedSnippet[], lexical: RetrievedSnippet[]): RetrievedSnippet[] {
    const seen = new Set(vector.map((s) => s.docId));
    const extras = lexical.filter((s) => !seen.has(s.docId));
    const merged = [...vector, ...extras].slice(0, MAX_SNIPPETS);
    if (merged.length === 0) {
      console.warn("[Retrieval] Both vector and lexical search returned 0 results");
    } else {
      console.log(`[Retrieval] Merged: ${vector.length} vector + ${extras.length} lexical-only = ${merged.length} total`);
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

    // Keep best (lowest distance = first) chunk per document
    const seen = new Map<string, { text: string; fileName: string; distance: number }>();
    snapshot.docs.forEach((doc) => {
      const data = doc.data() as {
        docId?: string;
        fileName?: string;
        text?: string;
        _dist?: number;
      };
      const docId = typeof data.docId === "string" ? data.docId : doc.id;
      const fileName = typeof data.fileName === "string" ? data.fileName : docId;
      const text = typeof data.text === "string" ? data.text : "";
      const dist = typeof data._dist === "number" ? data._dist : 1;
      // findNearest returns docs ordered by distance — first occurrence = best match
      if (!seen.has(docId)) {
        seen.set(docId, { text, fileName, distance: dist });
      }
    });

    console.log(
      `[Retrieval] Vector candidates: ${snapshot.size}, unique docs: ${seen.size}`,
      [...seen.values()].map((v) => `${v.fileName}(d=${v.distance.toFixed(3)})`).join(", ")
    );

    const scopeActive = hasScope(scope);
    const docMeta = scopeActive ? await this.fetchDocScopeMeta([...seen.keys()]) : null;

    let snippets: RetrievedSnippet[] = [];
    for (const [docId, { text, fileName }] of seen) {
      // Without a scope, keep the original early-break behavior (cheapest path).
      if (!scopeActive && snippets.length >= MAX_SNIPPETS) break;
      const meta = docMeta?.get(docId);
      snippets.push({
        docId,
        fileName,
        excerpt: buildBudgetedExcerpt(text, queryText, MAX_CHARS_PER_SNIPPET),
        reference: `/references/${docId}`,
        messageType: meta?.messageType ?? null,
        uiPattern: meta?.uiPattern ?? null,
      });
    }

    if (scopeActive) {
      snippets = applyScopeBoost(snippets, scope).slice(0, MAX_SNIPPETS);
    }

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
    const ranked = rankDocumentsForQuery(docs, queryText, rankLimit);
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
