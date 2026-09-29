#!/usr/bin/env node
/**
 * Backfill `headingPath` onto existing `document_chunks` (PRD M5, FR#23-26).
 *
 * Idempotent: a document is skipped if its chunks already carry the
 * `headingPath` field (present, even if `null` — that's a legitimate "no
 * heading" result, distinct from "not migrated yet"). Safe to re-run after a
 * partial failure or interruption.
 *
 * No global downtime: only the single document currently being re-indexed has
 * a brief gap between its old chunks being deleted and the new ones written
 * (same tradeoff as the existing scripts/reindex-embeddings.mjs) — every other
 * document's chunks stay searchable throughout the run.
 *
 * Run:
 *   node scripts/migrate-heading-path.mjs
 *   node scripts/migrate-heading-path.mjs --dry-run   # report only, no writes
 *
 * Reads GEMINI_API_KEY and FIREBASE_SERVICE_ACCOUNT_KEY from .env.local.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── env loader (same as reindex-embeddings.mjs) ─────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const content = readFileSync(filePath, "utf8");
  let i = 0;
  while (i < content.length) {
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
    const quoteChar = afterEq[0] === "'" ? "'" : afterEq[0] === '"' ? '"' : null;
    if (quoteChar) {
      const searchFrom = content.indexOf("=", i) + 1;
      const openPos = content.indexOf(quoteChar, searchFrom);
      if (openPos === -1) {
        i = lineEnd === -1 ? content.length : lineEnd + 1;
        continue;
      }
      let closePos = openPos + 1;
      while (closePos < content.length) {
        if (content[closePos] === quoteChar && content[closePos - 1] !== "\\") break;
        closePos++;
      }
      out[key] = content.slice(openPos + 1, closePos);
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
if (!GEMINI_API_KEY || !SERVICE_ACCOUNT_KEY) {
  console.error("❌  GEMINI_API_KEY / FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local");
  process.exit(1);
}

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
const { GoogleGenAI } = await import("@google/genai");

initializeApp({ credential: cert(JSON.parse(SERVICE_ACCOUNT_KEY)) });
const db = getFirestore();
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta" } });

// ─── chunking + heading extraction (mirrors src/lib/documents/chunking.ts) ───

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 200;

function findSplitBoundary(text, targetPos) {
  const window = text.slice(targetPos, Math.min(text.length, targetPos + 300));
  const para = window.indexOf("\n\n");
  if (para >= 0 && para < 200) return targetPos + para + 2;
  const nl = window.indexOf("\n");
  if (nl >= 0 && nl < 150) return targetPos + nl + 1;
  for (const sep of [". ", "! ", "? "]) {
    const idx = window.indexOf(sep);
    if (idx >= 0 && idx < 150) return targetPos + idx + sep.length;
  }
  const space = window.indexOf(" ");
  return targetPos + (space >= 0 ? space + 1 : Math.min(100, window.length));
}

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/;

function extractHeadings(text) {
  const headings = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const match = HEADING_LINE.exec(line);
    if (match) headings.push({ index: lineStart, level: match[1].length, title: match[2].trim() });
    lineStart += line.length + 1;
  }
  return headings;
}

function headingPathAt(headings, pos) {
  const stack = [];
  for (const h of headings) {
    if (h.index > pos) break;
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack.length > 0 ? stack.map((h) => h.title).join(" > ") : null;
}

function chunkText(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const headings = extractHeadings(trimmed);
  if (trimmed.length <= CHUNK_TARGET_CHARS) {
    return [{ text: trimmed, chunkIndex: 0, headingPath: headingPathAt(headings, 0) }];
  }
  const chunks = [];
  let pos = 0, idx = 0;
  while (pos < trimmed.length) {
    const targetEnd = Math.min(pos + CHUNK_TARGET_CHARS, trimmed.length);
    const splitAt = targetEnd >= trimmed.length ? targetEnd : findSplitBoundary(trimmed, targetEnd);
    const chunk = trimmed.slice(pos, splitAt).trim();
    if (chunk.length >= 50) {
      chunks.push({ text: chunk, chunkIndex: idx++, headingPath: headingPathAt(headings, pos) });
    }
    if (splitAt >= trimmed.length) break;
    pos = Math.max(pos + 1, splitAt - CHUNK_OVERLAP_CHARS);
  }
  return chunks;
}

// ─── Gemini embedding ─────────────────────────────────────────────────────────

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIM = 1536;
const BATCH_CONCURRENCY = 3;

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

// ─── chunk read/write ─────────────────────────────────────────────────────────

/** True if this doc's chunks already have `headingPath` written (idempotency check). */
async function isAlreadyMigrated(docId) {
  const snap = await db.collection("document_chunks").where("docId", "==", docId).limit(1).get();
  if (snap.empty) return false; // no chunks at all — not "migrated", just handle via normal write
  return snap.docs[0].get("headingPath") !== undefined;
}

async function deleteChunks(docId) {
  const snap = await db.collection("document_chunks").where("docId", "==", docId).select().get();
  if (snap.empty) return 0;
  const BATCH_SIZE = 400;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const b = db.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  return snap.size;
}

async function writeChunks(docId, fileName, text) {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const embedInputs = chunks.map((c) => (c.headingPath ? `[${c.headingPath}] ${c.text}` : c.text));
  const embeddings = await embedBatch(embedInputs);

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

console.log(`🔍  Fetching indexed documents...${DRY_RUN ? " (dry run — no writes)" : ""}`);

const snap = await db
  .collection("documents")
  .where("status", "==", "indexed")
  .select("fileName", "title", "textContent", "contentPlain")
  .get();

if (snap.empty) {
  console.log("⚠️   No indexed documents found.");
  process.exit(0);
}

console.log(`📄  Found ${snap.size} document(s).\n`);

let migrated = 0, alreadyDone = 0, skippedEmpty = 0, failed = 0;

for (const doc of snap.docs) {
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

  if (!text.trim()) {
    console.log(`⏭️   [${migrated + alreadyDone + skippedEmpty + failed + 1}/${snap.size}] ${fileName} — no text content, skipping`);
    skippedEmpty++;
    continue;
  }

  const done = await isAlreadyMigrated(doc.id);
  if (done) {
    console.log(`✅  [${migrated + alreadyDone + skippedEmpty + failed + 1}/${snap.size}] ${fileName} — already migrated, skipping`);
    alreadyDone++;
    continue;
  }

  if (DRY_RUN) {
    const chunks = chunkText(text);
    const withHeadings = chunks.filter((c) => c.headingPath !== null).length;
    console.log(
      `🔎  [${migrated + alreadyDone + skippedEmpty + failed + 1}/${snap.size}] ${fileName} — would write ${chunks.length} chunk(s), ${withHeadings} with a headingPath`
    );
    migrated++;
    continue;
  }

  try {
    process.stdout.write(`⚙️   [${migrated + alreadyDone + skippedEmpty + failed + 1}/${snap.size}] ${fileName} — deleting old chunks... `);
    const deleted = await deleteChunks(doc.id);
    process.stdout.write(`deleted ${deleted}. Re-embedding with headingPath... `);
    const count = await writeChunks(doc.id, fileName, text);
    console.log(`✅  wrote ${count} chunk(s)`);
    migrated++;
  } catch (e) {
    console.error(`\n❌  ${fileName} — ${e.message}`);
    failed++;
  }
}

console.log(`\n─────────────────────────────`);
console.log(`${DRY_RUN ? "🔎  Would migrate" : "✅  Migrated"}     : ${migrated}`);
console.log(`✅  Already done  : ${alreadyDone}`);
console.log(`⏭️   Skipped (empty): ${skippedEmpty}`);
console.log(`❌  Failed        : ${failed}`);
console.log(`─────────────────────────────`);

if (failed > 0) process.exit(1);
