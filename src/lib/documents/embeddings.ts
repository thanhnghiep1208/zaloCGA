import { GoogleGenAI } from "@google/genai";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { chunkText } from "./chunking";

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIM = 3072;
// Parallel calls per batch — stay within Gemini rate limits
const EMBED_BATCH_CONCURRENCY = 5;

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    _ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1beta" } });
  }
  return _ai;
}

async function embedSingle(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"
): Promise<number[]> {
  const ai = getAi();
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { taskType, outputDimensionality: EMBEDDING_DIM },
  });
  return response.embeddings?.[0]?.values ?? [];
}

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += EMBED_BATCH_CONCURRENCY) {
    const batch = texts.slice(i, i + EMBED_BATCH_CONCURRENCY);
    const embeddings = await Promise.all(
      batch.map((t) => embedSingle(t, taskType))
    );
    for (let j = 0; j < embeddings.length; j++) {
      results[i + j] = embeddings[j];
    }
  }
  return results;
}

const _queryEmbedCache = new Map<string, number[]>();
const EMBED_CACHE_MAX = 200;

export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase().slice(0, 500);
  const cached = _queryEmbedCache.get(key);
  if (cached) return cached;
  const vec = await embedSingle(text, "RETRIEVAL_QUERY");
  if (_queryEmbedCache.size >= EMBED_CACHE_MAX) {
    _queryEmbedCache.delete(_queryEmbedCache.keys().next().value!);
  }
  _queryEmbedCache.set(key, vec);
  return vec;
}

export type ChunkWriteResult = { chunkCount: number };

/**
 * Chunk text, generate embeddings, and write all chunks to the
 * `document_chunks` collection. Deletes existing chunks first so
 * re-indexing a document is idempotent.
 */
export async function writeDocumentChunks(
  docId: string,
  fileName: string,
  text: string
): Promise<ChunkWriteResult> {
  if (!adminDb) throw new Error("Firebase Admin not initialized");

  await deleteDocumentChunks(docId);

  const chunks = chunkText(text);
  if (chunks.length === 0) return { chunkCount: 0 };

  const embeddings = await embedTexts(chunks.map((c) => c.text));

  const chunksRef = adminDb.collection("document_chunks");
  const batch = adminDb.batch();

  for (let i = 0; i < chunks.length; i++) {
    const ref = chunksRef.doc();
    batch.set(ref, {
      docId,
      fileName,
      chunkIndex: chunks[i].chunkIndex,
      text: chunks[i].text,
      embedding: FieldValue.vector(embeddings[i]),
      status: "indexed",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { chunkCount: chunks.length };
}

/**
 * Delete all chunks belonging to a document. Safe to call even if
 * the document has no chunks.
 */
export async function deleteDocumentChunks(docId: string): Promise<void> {
  if (!adminDb) return;
  const snap = await adminDb
    .collection("document_chunks")
    .where("docId", "==", docId)
    .select() // only doc refs, no field data
    .get();

  if (snap.empty) return;

  // Firestore batch max = 500 ops
  const BATCH_SIZE = 400;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const b = adminDb.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
}
