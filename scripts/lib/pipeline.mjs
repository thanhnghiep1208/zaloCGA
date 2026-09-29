// Mirror of FirebaseRetrievalProvider.search() for the eval scripts — unscoped,
// and WITHOUT the final LLM relevance check (callers that want it apply it
// themselves, so retrieval recall can be measured on its own). Verified against
// the real provider by src/lib/retrieval/FirebaseRetrievalProvider.search.test.ts.

import {
  buildBudgetedExcerpt,
  dedupeByContentHash,
  fuseSnippetsByDoc,
  mergeAdjacentChunksByDoc,
  rankDocumentsForQuery,
} from "./retrieval-mirror.mjs";
import { envNumber } from "./runtime.mjs";

/** Same defaults as FirebaseRetrievalProvider.ts. */
export const DEFAULT_CONFIG = {
  vectorCandidates: 30,
  maxSnippets: 10,
  maxSnippetsPerDoc: 3,
  maxCharsPerSnippet: 2600,
  fetchLimit: 120,
  distanceThreshold: 0.55,
  lexicalMinScore: 1,
  rrf: { vector: 1.0, lexical: 0.0, k: 60 },
};

export function configFromEnv(env) {
  const d = DEFAULT_CONFIG;
  return {
    vectorCandidates: envNumber(env, "RETRIEVAL_VECTOR_CANDIDATES", d.vectorCandidates),
    maxSnippets: envNumber(env, "RETRIEVAL_MAX_SNIPPETS", d.maxSnippets),
    maxSnippetsPerDoc: envNumber(env, "RETRIEVAL_MAX_SNIPPETS_PER_DOC", d.maxSnippetsPerDoc),
    maxCharsPerSnippet: envNumber(env, "RETRIEVAL_MAX_CHARS_PER_SNIPPET", d.maxCharsPerSnippet),
    fetchLimit: envNumber(env, "RETRIEVAL_FIRESTORE_FETCH_LIMIT", d.fetchLimit),
    distanceThreshold: envNumber(env, "RETRIEVAL_VECTOR_DISTANCE_THRESHOLD", d.distanceThreshold),
    lexicalMinScore: envNumber(env, "RETRIEVAL_LEXICAL_MIN_SCORE", d.lexicalMinScore),
    rrf: {
      vector: envNumber(env, "RETRIEVAL_RRF_WEIGHT_VECTOR", d.rrf.vector),
      lexical: envNumber(env, "RETRIEVAL_RRF_WEIGHT_LEXICAL", d.rrf.lexical),
      k: envNumber(env, "RETRIEVAL_RRF_K", d.rrf.k),
    },
  };
}

/**
 * @param {{ db: any, FieldValue: any, embedQuery: (q: string) => Promise<number[]>, config: typeof DEFAULT_CONFIG }} deps
 * @returns {(query: string) => Promise<{ docId: string, fileName: string, excerpt: string }[]>}
 */
export function createSearch({ db, FieldValue, embedQuery, config }) {
  async function vectorSearch(query) {
    const embedding = await embedQuery(query);
    if (embedding.length === 0) return [];
    const snap = await db
      .collection("document_chunks")
      .where("status", "==", "indexed")
      .findNearest({
        vectorField: "embedding",
        queryVector: FieldValue.vector(embedding),
        limit: config.vectorCandidates,
        distanceMeasure: "COSINE",
        distanceResultField: "_dist",
        distanceThreshold: config.distanceThreshold,
      })
      .get();
    if (snap.empty) return [];

    const rawChunks = snap.docs.map((doc) => {
      const data = doc.data();
      const docId = typeof data.docId === "string" ? data.docId : doc.id;
      return {
        docId,
        fileName: typeof data.fileName === "string" ? data.fileName : docId,
        chunkIndex: typeof data.chunkIndex === "number" ? data.chunkIndex : 0,
        text: typeof data.text === "string" ? data.text : "",
        distance: typeof data._dist === "number" ? data._dist : 1,
      };
    });

    return mergeAdjacentChunksByDoc(dedupeByContentHash(rawChunks), config.maxSnippetsPerDoc)
      .map((m) => ({
        docId: m.docId,
        fileName: m.fileName,
        excerpt: buildBudgetedExcerpt(m.text, query, config.maxCharsPerSnippet),
      }))
      .slice(0, config.maxSnippets);
  }

  async function lexicalSearch(query) {
    const snap = await db
      .collection("documents")
      .where("status", "==", "indexed")
      .select("type", "fileName", "title", "textContent", "contentPlain", "messageType", "uiPattern")
      .limit(config.fetchLimit)
      .get();

    const docs = snap.docs
      .map((doc) => {
        const data = doc.data();
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
        return { id: doc.id, fileName, text };
      })
      .filter((d) => d.text.trim().length > 0);
    if (docs.length === 0) return [];

    return rankDocumentsForQuery(docs, query, config.maxSnippets)
      .filter((d) => d.score >= config.lexicalMinScore)
      .map((d) => ({
        docId: d.id,
        fileName: d.fileName,
        excerpt: buildBudgetedExcerpt(d.text, query, config.maxCharsPerSnippet),
      }));
  }

  return async function search(query) {
    const [vector, lexical] = await Promise.all([
      vectorSearch(query).catch(() => []),
      lexicalSearch(query).catch(() => []),
    ]);
    return fuseSnippetsByDoc(vector, lexical, config.maxSnippets, config.rrf);
  };
}
