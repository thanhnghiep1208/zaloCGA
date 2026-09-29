#!/usr/bin/env node
/**
 * Calibrate vector distance / lexical score thresholds for "not found" detection
 * (PRD M4, FR#21) using a positive set (must-find) and negative set (must-not-find).
 *
 * Run: node scripts/calibrate-not-found-threshold.mjs
 * Read-only: only queries Firestore + Gemini embeddings, never writes.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    if (!trimmed || trimmed.startsWith("#")) { i = lineEnd === -1 ? content.length : lineEnd + 1; continue; }
    const eq = trimmed.indexOf("=");
    if (eq === -1) { i = lineEnd === -1 ? content.length : lineEnd + 1; continue; }
    const key = trimmed.slice(0, eq).trim();
    const afterEq = trimmed.slice(eq + 1);
    const quoteChar = afterEq[0] === "'" ? "'" : afterEq[0] === '"' ? '"' : null;
    if (quoteChar) {
      const searchFrom = content.indexOf("=", i) + 1;
      const openPos = content.indexOf(quoteChar, searchFrom);
      if (openPos === -1) { i = lineEnd === -1 ? content.length : lineEnd + 1; continue; }
      let closePos = openPos + 1;
      while (closePos < content.length) { if (content[closePos] === quoteChar && content[closePos - 1] !== "\\") break; closePos++; }
      out[key] = content.slice(openPos + 1, closePos);
      i = closePos + 1;
    } else { out[key] = afterEq.trim(); i = lineEnd === -1 ? content.length : lineEnd + 1; }
  }
  return out;
}

const env = { ...loadEnvFile(resolve(root, ".env")), ...loadEnvFile(resolve(root, ".env.local")), ...process.env };
const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
const { GoogleGenAI } = await import("@google/genai");
initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
const db = getFirestore();
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta" } });

const STOP = new Set(["và","của","cho","với","là","có","được","trong","một","các","như","này","đó","the","a","an","is","are","was","were","be","been","being","to","of","in","on","for","and","or","not","no","yes","as","at","by","it","its","if","then","else"]);
function normalizeToken(t) { return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""); }
function extractQueryTerms(q) { return Array.from(new Set(q.split(/[\s,.;:!?()[\]{}'"\/\\]+/u).map(s=>normalizeToken(s.trim())).filter(t=>t.length>=2 && !STOP.has(t)))); }
function countTermHits(hay, terms) { if (terms.length===0) return 0; let hits=0; for (const t of terms){ if(!t) continue; let idx=0; while(idx<hay.length){const f=hay.indexOf(t,idx); if(f===-1) break; hits++; idx=f+t.length;} } return hits; }

async function embedQuery(text) {
  const res = await ai.models.embedContent({ model: "gemini-embedding-2", contents: text, config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: 1536 } });
  return res.embeddings?.[0]?.values ?? [];
}

let _docsCache = null;
async function fetchDocs() {
  if (_docsCache) return _docsCache;
  const snap = await db.collection("documents").where("status", "==", "indexed").select("fileName", "title", "textContent").get();
  _docsCache = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, fileName: x.fileName || x.title || d.id, text: x.textContent || "" };
  });
  return _docsCache;
}

/** No distanceThreshold here on purpose — we want the TRUE best distance, not one already gated by the current (possibly too-loose) 0.55 cutoff. */
async function bestVectorDistance(query) {
  const qe = await embedQuery(query);
  const snap = await db.collection("document_chunks").where("status", "==", "indexed").findNearest({
    vectorField: "embedding", queryVector: FieldValue.vector(qe), limit: 5, distanceMeasure: "COSINE", distanceResultField: "_dist",
  }).get();
  if (snap.empty) return Infinity;
  return Math.min(...snap.docs.map((d) => d.data()._dist));
}

async function maxLexicalScore(query) {
  const docs = await fetchDocs();
  const terms = extractQueryTerms(query);
  let max = 0;
  for (const d of docs) {
    const score = countTermHits(normalizeToken(d.text), terms) + countTermHits(normalizeToken(d.fileName), terms) * 3;
    if (score > max) max = score;
  }
  return max;
}

async function measure(items, label) {
  const rows = [];
  for (const item of items) {
    const query = item.query;
    const [dist, lex] = await Promise.all([bestVectorDistance(query), maxLexicalScore(query)]);
    rows.push({ query, dist, lex, ...item });
  }
  console.log(`\n=== ${label} (n=${rows.length}) ===`);
  rows.forEach((r) => console.log(`  dist=${r.dist.toFixed(4)} lex=${r.lex}  "${r.query.slice(0, 60)}"`));
  return rows;
}

const positiveSet = JSON.parse(readFileSync(resolve(root, "src/lib/retrieval/eval/golden-set.json"), "utf8"));
const negativeSet = JSON.parse(readFileSync(resolve(root, "src/lib/retrieval/eval/negative-golden-set.json"), "utf8"));

const posRows = await measure(positiveSet, "POSITIVE (should find something)");
const negRows = await measure(negativeSet, "NEGATIVE (should find nothing)");

const posDistWorst = Math.max(...posRows.map((r) => r.dist)); // largest distance among true matches
const negDistBest = Math.min(...negRows.map((r) => r.dist)); // smallest distance among true non-matches
const posLexWorstNonZero = Math.min(...posRows.map((r) => r.lex).filter((v) => v > 0));
const negLexMax = Math.max(...negRows.map((r) => r.lex));

console.log(`\n=== Separation analysis ===`);
console.log(`Vector distance — positive worst (largest): ${posDistWorst.toFixed(4)}`);
console.log(`Vector distance — negative best (smallest):  ${negDistBest.toFixed(4)}`);
console.log(
  posDistWorst < negDistBest
    ? `=> CLEAN GAP on distance: any threshold in (${posDistWorst.toFixed(4)}, ${negDistBest.toFixed(4)}) separates them perfectly.`
    : `=> NO CLEAN GAP on distance — positive and negative ranges overlap. A single distance threshold cannot perfectly separate them.`
);
console.log(`\nLexical score — positive worst non-zero: ${posLexWorstNonZero}`);
console.log(`Lexical score — negative max: ${negLexMax}`);
console.log(
  posLexWorstNonZero > negLexMax
    ? `=> CLEAN GAP on lexical score.`
    : `=> NO CLEAN GAP on lexical score — same noisy-scorer issue as M3.`
);
