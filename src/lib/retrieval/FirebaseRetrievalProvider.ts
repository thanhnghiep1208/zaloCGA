import { RetrievalProvider, RetrievedSnippet } from "./interfaces";
import { adminDb } from "@/lib/firebase-admin";
import { buildBudgetedExcerpt, rankDocumentsForQuery } from "./excerptBudget";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Indexed docs to scan from Firestore (read cap). */
const FIRESTORE_FETCH_LIMIT = envInt("RETRIEVAL_FIRESTORE_FETCH_LIMIT", 120);
/** Snippets passed to the LLM after ranking + excerpt trimming. */
const MAX_SNIPPETS = envInt("RETRIEVAL_MAX_SNIPPETS", 6);
/** Max characters per document excerpt (~900–1100 tokens depending on language). */
const MAX_CHARS_PER_SNIPPET = envInt("RETRIEVAL_MAX_CHARS_PER_SNIPPET", 3500);

export class FirebaseRetrievalProvider implements RetrievalProvider {
  async search(queryText: string, limit: number = 100): Promise<RetrievedSnippet[]> {
    try {
      const fetchCap = Math.min(Math.max(1, limit), FIRESTORE_FETCH_LIMIT);
      console.log(
        `[AdminRetrieval] Query "${queryText.slice(0, 120)}${queryText.length > 120 ? "…" : ""}" — fetch up to ${fetchCap} indexed docs, return ≤${MAX_SNIPPETS} snippets × ≤${MAX_CHARS_PER_SNIPPET} chars`
      );

      if (!adminDb) {
        throw new Error("Firebase Admin SDK not initialized. Check server logs for details.");
      }

      const snapshot = await adminDb
        .collection("documents")
        .where("status", "==", "indexed")
        .select("fileName", "textContent")
        .limit(fetchCap)
        .get();

      console.log(`[AdminRetrieval] Fetched ${snapshot.size} indexed documents.`);

      const docs = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          const text = typeof data.textContent === "string" ? data.textContent : "";
          const fileName =
            typeof data.fileName === "string" && data.fileName.trim()
              ? data.fileName
              : doc.id;
          return { id: doc.id, fileName, text };
        })
        .filter((d) => d.text.trim().length > 0);

      if (docs.length === 0) {
        console.warn("[AdminRetrieval] No documents with textContent.");
        return [];
      }

      const ranked = rankDocumentsForQuery(docs, queryText, MAX_SNIPPETS);

      const snippets: RetrievedSnippet[] = ranked.map((d) => ({
        docId: d.id,
        fileName: d.fileName,
        excerpt: buildBudgetedExcerpt(d.text, queryText, MAX_CHARS_PER_SNIPPET),
        reference: `/references/${d.id}`,
      }));

      console.log(
        `[AdminRetrieval] Returning ${snippets.length} snippet(s): ${snippets.map((s) => s.fileName).join(", ")}`
      );

      return snippets;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[AdminRetrieval] Fatal Error during document fetch:", msg);
      return [];
    }
  }
}
