#!/usr/bin/env node
/**
 * Retrieval eval — recall@6 / MRR against the golden set (PRD M0).
 * See src/lib/retrieval/eval/golden-set.json and docs/tasks/prd-retrieval-quality-upgrade.md.
 *
 * Mirrors FirebaseRetrievalProvider.ts / excerptBudget.ts / queryTerms.ts logic
 * (same duplication pattern as scripts/reindex-embeddings.mjs — a standalone
 * .mjs script can't import the app's TS path-aliased modules without a bundler).
 * Keep this in sync whenever those files' matching/dedup logic changes.
 *
 * Run:
 *   node scripts/eval-retrieval.mjs
 *
 * Reads GEMINI_API_KEY / FIREBASE_SERVICE_ACCOUNT_KEY from .env.local.
 * Read-only: only queries Firestore, never writes.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ─── env loader (same as reindex-embeddings.mjs) ─────────────────────────────

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

// ─── config (mirrors FirebaseRetrievalProvider.ts defaults) ──────────────────

const VECTOR_CANDIDATES = Number(env.RETRIEVAL_VECTOR_CANDIDATES) || 30;
const MAX_SNIPPETS = Number(env.RETRIEVAL_MAX_SNIPPETS) || 10;
const MAX_SNIPPETS_PER_DOC = Number(env.RETRIEVAL_MAX_SNIPPETS_PER_DOC) || 3;
const FIRESTORE_FETCH_LIMIT = Number(env.RETRIEVAL_FIRESTORE_FETCH_LIMIT) || 120;
const VECTOR_DISTANCE_THRESHOLD = Number(env.RETRIEVAL_VECTOR_DISTANCE_THRESHOLD) || 0.55;
// NB: use `env.X !== undefined` (not `Number(env.X) || default`) — the latter
// silently ignores an explicit "0" override because `0` is falsy in JS. This
// exact bug wasted a debugging session before being caught (see BASELINE.md).
function envFloatVal(raw, fallback) {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
// Default lexical weight is 0 — see BASELINE.md "Sau M3" for why: the existing
// lexicalSearch() scorer is too noisy (short/common Vietnamese syllables match as
// substrings everywhere) to safely carry any real weight in fusion yet on this
// corpus; verified by sweep, only weight 0 fully avoids regressing below M1.
const RRF_WEIGHTS = {
  vector: envFloatVal(env.RETRIEVAL_RRF_WEIGHT_VECTOR, 1.0),
  lexical: envFloatVal(env.RETRIEVAL_RRF_WEIGHT_LEXICAL, 0.0),
  k: envFloatVal(env.RETRIEVAL_RRF_K, 60),
};
const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIM = 1536;
const RECALL_K = 6;

// ─── query terms (mirrors queryTerms.ts) ─────────────────────────────────────

const STOP = new Set([
  "và", "của", "cho", "với", "là", "có", "được", "trong", "một", "các", "như", "này", "đó",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on",
  "for", "and", "or", "not", "no", "yes", "as", "at", "by", "it", "its", "if", "then", "else",
]);

function normalizeToken(t) {
  return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function extractQueryTerms(query) {
  const raw = query
    .split(/[\s,.;:!?()[\]{}'"\/\\]+/u)
    .map((s) => normalizeToken(s.trim()))
    .filter((t) => t.length >= 2 && !STOP.has(t));
  return Array.from(new Set(raw));
}

function countTermHits(haystackLower, terms) {
  if (terms.length === 0) return 0;
  let hits = 0;
  for (const t of terms) {
    if (!t) continue;
    let idx = 0;
    while (idx < haystackLower.length) {
      const found = haystackLower.indexOf(t, idx);
      if (found === -1) break;
      hits += 1;
      idx = found + t.length;
    }
  }
  return hits;
}

// ─── embedding ────────────────────────────────────────────────────────────────

async function embedQuery(text) {
  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: EMBEDDING_DIM },
  });
  return res.embeddings?.[0]?.values ?? [];
}

// ─── chunk merge (mirrors src/lib/retrieval/chunkMerge.ts — M1) ──────────────

function contentSignature(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeByContentHash(chunks) {
  const seen = new Set();
  const out = [];
  for (const c of chunks) {
    const sig = contentSignature(c.text);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(c);
  }
  return out;
}

function mergeAdjacentChunksByDoc(chunks, maxPerDoc) {
  const byDoc = new Map();
  for (const c of chunks) {
    const group = byDoc.get(c.docId);
    if (group) group.push(c);
    else byDoc.set(c.docId, [c]);
  }
  const runsByDoc = [];
  for (const [docId, group] of byDoc) {
    const sorted = [...group].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const runs = [];
    let current = [];
    for (const c of sorted) {
      const prev = current[current.length - 1];
      if (!prev || c.chunkIndex - prev.chunkIndex <= 1) current.push(c);
      else { runs.push(current); current = [c]; }
    }
    if (current.length > 0) runs.push(current);
    const scoredRuns = runs.map((run) => ({
      docId,
      fileName: run[0].fileName,
      text: run.map((r) => r.text).join("\n\n"),
      bestDistance: Math.min(...run.map((r) => r.distance)),
    }));
    scoredRuns.sort((a, b) => a.bestDistance - b.bestDistance);
    runsByDoc.push(scoredRuns.slice(0, Math.max(1, maxPerDoc)));
  }
  // Round-robin across docs (see src/lib/retrieval/chunkMerge.ts for why a flat
  // sort-by-distance crowds out weaker docs behind a strong doc's extra runs).
  const result = [];
  const maxRounds = Math.max(0, ...runsByDoc.map((r) => r.length));
  for (let round = 0; round < maxRounds; round++) {
    const roundEntries = runsByDoc
      .map((runs) => runs[round])
      .filter((r) => r !== undefined)
      .sort((a, b) => a.bestDistance - b.bestDistance);
    result.push(...roundEntries);
  }
  return result;
}

// ─── vector search (mirrors FirebaseRetrievalProvider.vectorSearch — M1: merge, not 1 chunk/doc) ──

async function vectorSearch(queryText) {
  const queryEmbedding = await embedQuery(queryText);
  if (queryEmbedding.length === 0) return [];

  const snapshot = await db
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

  const rawChunks = snapshot.docs.map((doc) => {
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

  const deduped = dedupeByContentHash(rawChunks);
  const merged = mergeAdjacentChunksByDoc(deduped, MAX_SNIPPETS_PER_DOC);
  // Mirrors production: one array slot per merged snippet — a doc with several
  // surviving runs can occupy multiple slots (not deduped to 1-per-doc anymore).
  return merged.map((m) => m.docId).slice(0, MAX_SNIPPETS);
}

// ─── lexical search (mirrors FirebaseRetrievalProvider.lexicalSearch) ────────

let _lexicalDocsCache = null;
async function fetchLexicalDocs() {
  if (_lexicalDocsCache) return _lexicalDocsCache;
  const snapshot = await db
    .collection("documents")
    .where("status", "==", "indexed")
    .select("fileName", "title", "textContent", "contentPlain")
    .limit(FIRESTORE_FETCH_LIMIT)
    .get();

  _lexicalDocsCache = snapshot.docs
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
  return _lexicalDocsCache;
}

function scoreDocument(fileName, text, terms) {
  if (terms.length === 0) return 1;
  const nameLower = normalizeToken(fileName);
  const textLower = normalizeToken(text);
  let score = countTermHits(textLower, terms) + countTermHits(nameLower, terms) * 3;
  if (score === 0) score = 0.01;
  return score;
}

const LEXICAL_MIN_SCORE = Number(env.RETRIEVAL_LEXICAL_MIN_SCORE) || 1;

async function lexicalSearch(queryText) {
  const docs = await fetchLexicalDocs();
  if (docs.length === 0) return [];
  const terms = extractQueryTerms(queryText);
  const ranked = docs
    .map((d) => ({ ...d, score: scoreDocument(d.fileName, d.text, terms) }))
    .filter((d) => d.score >= LEXICAL_MIN_SCORE) // M4 (FR#20): drop the 0.01 no-hit floor
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SNIPPETS);
  return ranked.map((d) => d.id);
}

// ─── RRF fusion (mirrors src/lib/retrieval/rrf.ts — M3) ──────────────────────

function computeRRFScore(rankVector, rankLexical, weights) {
  const vectorTerm = rankVector !== undefined ? weights.vector / (weights.k + rankVector + 1) : 0;
  const lexicalTerm = rankLexical !== undefined ? weights.lexical / (weights.k + rankLexical + 1) : 0;
  return vectorTerm + lexicalTerm;
}

function rankByDocId(docIds) {
  const ranks = new Map();
  docIds.forEach((docId, index) => {
    if (ranks.has(docId)) return;
    ranks.set(docId, index);
  });
  return ranks;
}

function fuseDocIds(vectorIds, lexicalIds, maxTotal, weights) {
  const vectorRanks = rankByDocId(vectorIds);
  const lexicalRanks = rankByDocId(lexicalIds);
  const seen = new Set();
  const docIdsInFirstSeenOrder = [];
  for (const docId of [...vectorIds, ...lexicalIds]) {
    if (seen.has(docId)) continue;
    seen.add(docId);
    docIdsInFirstSeenOrder.push(docId);
  }
  const scored = docIdsInFirstSeenOrder.map((docId, firstSeenIndex) => ({
    docId,
    firstSeenIndex,
    score: computeRRFScore(vectorRanks.get(docId), lexicalRanks.get(docId), weights),
  }));
  scored.sort((a, b) => b.score - a.score || a.firstSeenIndex - b.firstSeenIndex);
  const docOrder = scored.map((s) => s.docId);

  // Mirrors fuseSnippetsByDoc: round-robin by docOrder, not grouped-by-doc —
  // a doc with several vector slots must not push a weaker doc's only slot
  // past maxTotal (this exact bug was found and fixed here — see rrf.ts).
  const vectorCountByDoc = new Map();
  for (const id of vectorIds) vectorCountByDoc.set(id, (vectorCountByDoc.get(id) || 0) + 1);
  const availableByDoc = new Map();
  for (const docId of docOrder) {
    availableByDoc.set(docId, vectorCountByDoc.get(docId) || 1);
  }

  const result = [];
  const maxDepth = Math.max(0, ...[...availableByDoc.values()]);
  for (let depth = 0; depth < maxDepth && result.length < maxTotal; depth++) {
    for (const docId of docOrder) {
      if (result.length >= maxTotal) break;
      if (depth < availableByDoc.get(docId)) result.push(docId);
    }
  }
  return result.slice(0, maxTotal);
}

// ─── merge (mirrors FirebaseRetrievalProvider.mergeResults — M3: RRF fusion) ──

async function search(queryText) {
  const [vectorIds, lexicalIds] = await Promise.all([
    vectorSearch(queryText).catch(() => []),
    lexicalSearch(queryText).catch(() => []),
  ]);
  return fuseDocIds(vectorIds, lexicalIds, MAX_SNIPPETS, RRF_WEIGHTS);
}

// ─── metrics (mirrors src/lib/retrieval/eval/metrics.ts) ─────────────────────

function recallAtK(resultDocIds, expectedDocId, k) {
  return resultDocIds.slice(0, k).includes(expectedDocId) ? 1 : 0;
}
function reciprocalRank(resultDocIds, expectedDocId) {
  const idx = resultDocIds.indexOf(expectedDocId);
  return idx === -1 ? 0 : 1 / (idx + 1);
}

// ─── run ──────────────────────────────────────────────────────────────────────

const goldenSet = JSON.parse(
  readFileSync(resolve(root, "src/lib/retrieval/eval/golden-set.json"), "utf8")
);

console.log(`Running eval on ${goldenSet.length} golden-set queries...\n`);

const rows = [];
for (const item of goldenSet) {
  const resultDocIds = await search(item.query);
  const recall = recallAtK(resultDocIds, item.expectedDocId, RECALL_K);
  const rr = reciprocalRank(resultDocIds, item.expectedDocId);
  rows.push({ ...item, resultDocIds, recall, rr });
  const mark = recall ? "✅" : "❌";
  console.log(`${mark} [${item.source}] "${item.query.slice(0, 60)}" — expected ${item.expectedDocId}, got [${resultDocIds.join(", ")}]`);
}

const avgRecall = rows.reduce((s, r) => s + r.recall, 0) / rows.length;
const avgRecall3 = rows.reduce((s, r) => s + recallAtK(r.resultDocIds, r.expectedDocId, 3), 0) / rows.length;
const mrr = rows.reduce((s, r) => s + r.rr, 0) / rows.length;

console.log(`\n=== Summary (n=${rows.length}) ===`);
console.log(`recall@${RECALL_K}: ${(avgRecall * 100).toFixed(1)}%`);
console.log(`recall@3: ${(avgRecall3 * 100).toFixed(1)}% (thước đo chặt hơn — xem BASELINE.md, corpus nhỏ làm recall@6 dễ chạm trần)`);
console.log(`MRR: ${mrr.toFixed(3)}`);

const misses = rows.filter((r) => !r.recall);
if (misses.length > 0) {
  console.log(`\nMisses (${misses.length}):`);
  misses.forEach((r) => console.log(`  - "${r.query.slice(0, 70)}" (expected ${r.expectedDocId})`));
}
