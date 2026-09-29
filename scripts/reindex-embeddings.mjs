#!/usr/bin/env node
/**
 * Re-index all documents with the new gemini-embedding-2 (3072-dim) model.
 *
 * Run after deploying the embedding model upgrade:
 *   node scripts/reindex-embeddings.mjs
 *
 * Reads GEMINI_API_KEY and FIREBASE_SERVICE_ACCOUNT_KEY from .env.local.
 * Safe to re-run — writeDocumentChunks deletes old chunks before writing new ones.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText, embedInputFor } from "./lib/chunking.mjs";

// ─── env loader ──────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const content = readFileSync(filePath, "utf8");
  let i = 0;
  while (i < content.length) {
    // skip blank lines and comments
    const lineEnd = content.indexOf("\n", i);
    const line = lineEnd === -1 ? content.slice(i) : content.slice(i, lineEnd);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i = lineEnd === -1 ? content.length : lineEnd + 1;
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      i = lineEnd === -1 ? content.length : lineEnd + 1;
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const afterEq = trimmed.slice(eq + 1);
    // check for multiline quoted value
    const quoteChar = afterEq[0] === "'" ? "'" : afterEq[0] === '"' ? '"' : null;
    if (quoteChar) {
      // find the closing quote (may span multiple lines)
      const searchFrom = content.indexOf("=", i) + 1;
      const openPos = content.indexOf(quoteChar, searchFrom);
      if (openPos === -1) {
        i = lineEnd === -1 ? content.length : lineEnd + 1;
        continue;
      }
      // find closing quote (not escaped)
      let closePos = openPos + 1;
      while (closePos < content.length) {
        if (content[closePos] === quoteChar && content[closePos - 1] !== "\\") break;
        closePos++;
      }
      const value = content.slice(openPos + 1, closePos);
      out[key] = value;
      i = closePos + 1;
    } else {
      out[key] = afterEq.trim();
      i = lineEnd === -1 ? content.length : lineEnd + 1;
    }
  }
  return out;
}

const env = {
  ...loadEnvFile(resolve(root, ".env")),
  ...loadEnvFile(resolve(root, ".env.local")),
  ...process.env,
};

const GEMINI_API_KEY = env.GEMINI_API_KEY?.trim();
const SERVICE_ACCOUNT_KEY = env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

if (!GEMINI_API_KEY) {
  console.error("❌  GEMINI_API_KEY not set in .env.local");
  process.exit(1);
}
if (!SERVICE_ACCOUNT_KEY) {
  console.error("❌  FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local");
  process.exit(1);
}

// Chunking comes from ./lib/chunking.mjs (kept in sync with src/lib/documents/chunking.ts by tests).

// ─── Firebase Admin ───────────────────────────────────────────────────────────

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

const serviceAccount = JSON.parse(SERVICE_ACCOUNT_KEY);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Gemini embedding ─────────────────────────────────────────────────────────

const { GoogleGenAI } = await import("@google/genai");
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta" } });

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIM = 1536;
const BATCH_CONCURRENCY = 3; // conservative to avoid rate limits

async function embedBatch(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_CONCURRENCY) {
    const slice = texts.slice(i, i + BATCH_CONCURRENCY);
    const embeddings = await Promise.all(
      slice.map(async (text) => {
        const res = await ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: text,
          config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: EMBEDDING_DIM },
        });
        return res.embeddings?.[0]?.values ?? [];
      })
    );
    results.push(...embeddings);
  }
  return results;
}

// ─── delete existing chunks ───────────────────────────────────────────────────

async function deleteChunks(docId) {
  const snap = await db.collection("document_chunks")
    .where("docId", "==", docId)
    .select()
    .get();
  if (snap.empty) return 0;
  const BATCH_SIZE = 400;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const b = db.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  return snap.size;
}

// ─── write new chunks ─────────────────────────────────────────────────────────

async function writeChunks(docId, fileName, text) {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const embeddings = await embedBatch(chunks.map(embedInputFor));

  const ref = db.collection("document_chunks");
  const BATCH_SIZE = 400;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const b = db.batch();
    for (let j = i; j < Math.min(i + BATCH_SIZE, chunks.length); j++) {
      b.set(ref.doc(), {
        docId,
        fileName,
        chunkIndex: chunks[j].chunkIndex,
        text: chunks[j].text,
        headingPath: chunks[j].headingPath,
        embedding: FieldValue.vector(embeddings[j]),
        status: "indexed",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await b.commit();
  }
  return chunks.length;
}

// ─── main ─────────────────────────────────────────────────────────────────────

console.log("🔍  Fetching documents from Firestore...");

const snap = await db.collection("documents")
  .where("status", "==", "indexed")
  .select("fileName", "title", "textContent", "contentPlain")
  .get();

if (snap.empty) {
  console.log("⚠️   No indexed documents found.");
  process.exit(0);
}

console.log(`📄  Found ${snap.size} document(s) to re-index.\n`);

let success = 0, skipped = 0, failed = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const text = (typeof data.textContent === "string" && data.textContent.trim())
    ? data.textContent
    : (typeof data.contentPlain === "string" ? data.contentPlain : "");
  const fileName = (typeof data.fileName === "string" && data.fileName.trim())
    ? data.fileName
    : (typeof data.title === "string" && data.title.trim() ? data.title : doc.id);

  if (!text.trim()) {
    console.log(`⏭️   ${fileName} — no text content, skipping`);
    skipped++;
    continue;
  }

  try {
    process.stdout.write(`⚙️   ${fileName} — deleting old chunks... `);
    const deleted = await deleteChunks(doc.id);
    process.stdout.write(`deleted ${deleted}. Embedding... `);

    const count = await writeChunks(doc.id, fileName, text);
    console.log(`✅  wrote ${count} chunks`);
    success++;
  } catch (e) {
    console.error(`\n❌  ${fileName} — ${e.message}`);
    failed++;
  }
}

console.log(`\n─────────────────────────────`);
console.log(`✅  Success : ${success}`);
console.log(`⏭️   Skipped : ${skipped}`);
console.log(`❌  Failed  : ${failed}`);
console.log(`─────────────────────────────`);

if (failed > 0) process.exit(1);
