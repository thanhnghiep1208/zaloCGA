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

export class FirebaseRetrievalProvider implements RetrievalProvider {
  async search(queryText: string): Promise<RetrievedSnippet[]> {
    if (!adminDb) {
      throw new Error("Firebase Admin SDK not initialized.");
    }

    // Try vector search first; fall back to lexical if it fails or finds nothing
    try {
      const vectorResults = await this.vectorSearch(queryText);
      if (vectorResults.length > 0) {
        console.log(`[Retrieval] Vector search: ${vectorResults.length} snippet(s) from document_chunks`);
        return vectorResults;
      }
      console.log("[Retrieval] Vector search returned 0 results — falling back to lexical");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[Retrieval] Vector search failed (${msg}) — falling back to lexical`);
    }

    return this.lexicalSearch(queryText);
  }

  private async vectorSearch(queryText: string): Promise<RetrievedSnippet[]> {
    if (!adminDb) throw new Error("Firebase Admin SDK not initialized.");
    const queryEmbedding = await embedQuery(queryText);
    if (queryEmbedding.length === 0) return [];

    const snapshot = await adminDb
      .collection("document_chunks")
      .where("status", "==", "indexed")
      .findNearest({
        vectorField: "embedding",
        queryVector: FieldValue.vector(queryEmbedding),
        limit: VECTOR_CANDIDATES,
        distanceMeasure: "COSINE",
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
      };
      const docId = typeof data.docId === "string" ? data.docId : doc.id;
      const fileName = typeof data.fileName === "string" ? data.fileName : docId;
      const text = typeof data.text === "string" ? data.text : "";
      // findNearest returns docs ordered by distance — first occurrence = best match
      if (!seen.has(docId)) {
        seen.set(docId, { text, fileName, distance: 0 });
      }
    });

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
