import { FieldValue } from "firebase-admin/firestore";
import { RetrievalProvider, RetrievedSnippet } from "./interfaces";
import { adminDb } from "@/lib/firebase-admin";
import { embedQuery } from "@/lib/documents/embeddings";
import { buildBudgetedExcerpt, rankDocumentsForQuery } from "./excerptBudget";

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

export class FirebaseRetrievalProvider implements RetrievalProvider {
  async search(queryText: string, _limit?: number, precomputedEmbedding?: number[]): Promise<RetrievedSnippet[]> {
    if (!adminDb) {
      throw new Error("Firebase Admin SDK not initialized.");
    }

    const [vectorResults, lexicalResults] = await Promise.all([
      this.vectorSearch(queryText, precomputedEmbedding).catch((e) => {
        console.warn(`[Retrieval] Vector search failed: ${e instanceof Error ? e.message : e}`);
        return [] as RetrievedSnippet[];
      }),
      this.lexicalSearch(queryText).catch((e) => {
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

  private async vectorSearch(queryText: string, precomputedEmbedding?: number[]): Promise<RetrievedSnippet[]> {
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

    const snippets: RetrievedSnippet[] = [];
    for (const [docId, { text, fileName }] of seen) {
      if (snippets.length >= MAX_SNIPPETS) break;
      snippets.push({
        docId,
        fileName,
        excerpt: buildBudgetedExcerpt(text, queryText, MAX_CHARS_PER_SNIPPET),
        reference: `/references/${docId}`,
      });
    }

    return snippets;
  }

  private async lexicalSearch(queryText: string): Promise<RetrievedSnippet[]> {
    if (!adminDb) throw new Error("Firebase Admin SDK not initialized.");
    console.log(`[Retrieval] Lexical search — fetch up to ${FIRESTORE_FETCH_LIMIT} indexed docs`);

    const snapshot = await adminDb
      .collection("documents")
      .where("status", "==", "indexed")
      .select("type", "fileName", "title", "textContent", "contentPlain")
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
        return { id: doc.id, fileName, text };
      })
      .filter((d) => d.text.trim().length > 0);

    if (docs.length === 0) {
      console.warn("[Retrieval] Lexical: no documents with text content");
      return [];
    }

    const ranked = rankDocumentsForQuery(docs, queryText, MAX_SNIPPETS);
    return ranked.map((d) => ({
      docId: d.id,
      fileName: d.fileName,
      excerpt: buildBudgetedExcerpt(d.text, queryText, MAX_CHARS_PER_SNIPPET),
      reference: `/references/${d.id}`,
    }));
  }
}
