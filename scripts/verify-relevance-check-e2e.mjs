#!/usr/bin/env node
/**
 * End-to-end verification for the LLM relevance check (PRD M4, FR#21/22) —
 * runs the FULL production pipeline (vector + lexical + RRF fusion, mirroring
 * FirebaseRetrievalProvider.ts exactly like eval-retrieval.mjs) and THEN applies
 * the real checkRelevance() prompt on the properly-fused candidates.
 *
 * (A first attempt, scripts/verify-relevance-check.mjs, used naive top-6-by-raw-
 * distance candidates instead of the full pipeline — several "positive" queries
 * came back empty simply because the correct doc wasn't in that naive top-6 at
 * all, unrelated to whether checkRelevance() itself works. This script fixes
 * that by reusing the exact same search() pipeline as eval-retrieval.mjs.)
 *
 * Run: node scripts/verify-relevance-check-e2e.mjs
 * Read-only.
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

const VECTOR_CANDIDATES = 30;
const MAX_SNIPPETS = 10;
const MAX_SNIPPETS_PER_DOC = 3;
const FIRESTORE_FETCH_LIMIT = 120;
const VECTOR_DISTANCE_THRESHOLD = 0.55;
const LEXICAL_MIN_SCORE = 1;
const RRF_WEIGHTS = { vector: 1.0, lexical: 0.0, k: 60 };

const STOP = new Set(["và","của","cho","với","là","có","được","trong","một","các","như","này","đó","the","a","an","is","are","was","were","be","been","being","to","of","in","on","for","and","or","not","no","yes","as","at","by","it","its","if","then","else"]);
function normalizeToken(t) { return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""); }
function extractQueryTerms(q) { return Array.from(new Set(q.split(/[\s,.;:!?()[\]{}'"\/\\]+/u).map(s=>normalizeToken(s.trim())).filter(t=>t.length>=2 && !STOP.has(t)))); }
function countTermHits(hay, terms) { if (terms.length===0) return 0; let hits=0; for (const t of terms){ if(!t) continue; let idx=0; while(idx<hay.length){const f=hay.indexOf(t,idx); if(f===-1) break; hits++; idx=f+t.length;} } return hits; }

async function embedQuery(text) {
  const res = await ai.models.embedContent({ model: "gemini-embedding-2", contents: text, config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: 1536 } });
  return res.embeddings?.[0]?.values ?? [];
}

function contentSignature(text) { return text.trim().toLowerCase().replace(/\s+/g, " "); }
function dedupeByContentHash(chunks) {
  const seen = new Set(); const out = [];
  for (const c of chunks) { const sig = contentSignature(c.text); if (seen.has(sig)) continue; seen.add(sig); out.push(c); }
  return out;
}
function mergeAdjacentChunksByDoc(chunks, maxPerDoc) {
  const byDoc = new Map();
  for (const c of chunks) { const g = byDoc.get(c.docId); if (g) g.push(c); else byDoc.set(c.docId, [c]); }
  const runsByDoc = [];
  for (const [docId, group] of byDoc) {
    const sorted = [...group].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const runs = []; let current = [];
    for (const c of sorted) {
      const prev = current[current.length - 1];
      if (!prev || c.chunkIndex - prev.chunkIndex <= 1) current.push(c);
      else { runs.push(current); current = [c]; }
    }
    if (current.length > 0) runs.push(current);
    const scoredRuns = runs.map((run) => ({ docId, fileName: run[0].fileName, text: run.map((r) => r.text).join("\n\n"), bestDistance: Math.min(...run.map((r) => r.distance)) }));
    scoredRuns.sort((a, b) => a.bestDistance - b.bestDistance);
    runsByDoc.push(scoredRuns.slice(0, Math.max(1, maxPerDoc)));
  }
  const result = [];
  const maxRounds = Math.max(0, ...runsByDoc.map((r) => r.length));
  for (let round = 0; round < maxRounds; round++) {
    const roundEntries = runsByDoc.map((runs) => runs[round]).filter((r) => r !== undefined).sort((a, b) => a.bestDistance - b.bestDistance);
    result.push(...roundEntries);
  }
  return result;
}

async function vectorSearch(queryText) {
  const qe = await embedQuery(queryText);
  if (qe.length === 0) return [];
  const snap = await db.collection("document_chunks").where("status", "==", "indexed").findNearest({
    vectorField: "embedding", queryVector: FieldValue.vector(qe), limit: VECTOR_CANDIDATES, distanceMeasure: "COSINE", distanceResultField: "_dist", distanceThreshold: VECTOR_DISTANCE_THRESHOLD,
  }).get();
  if (snap.empty) return [];
  const rawChunks = snap.docs.map((doc) => {
    const data = doc.data();
    const docId = typeof data.docId === "string" ? data.docId : doc.id;
    return { docId, fileName: typeof data.fileName === "string" ? data.fileName : docId, chunkIndex: typeof data.chunkIndex === "number" ? data.chunkIndex : 0, text: typeof data.text === "string" ? data.text : "", distance: typeof data._dist === "number" ? data._dist : 1 };
  });
  const merged = mergeAdjacentChunksByDoc(dedupeByContentHash(rawChunks), MAX_SNIPPETS_PER_DOC);
  return merged.slice(0, MAX_SNIPPETS); // full snippet objects, not just docId
}

let _docsCache = null;
async function fetchLexicalDocs() {
  if (_docsCache) return _docsCache;
  const snap = await db.collection("documents").where("status", "==", "indexed").select("fileName", "title", "textContent", "contentPlain").limit(FIRESTORE_FETCH_LIMIT).get();
  _docsCache = snap.docs.map((doc) => {
    const data = doc.data();
    const text = typeof data.textContent === "string" && data.textContent.trim() ? data.textContent : (data.contentPlain || "");
    const fileName = data.fileName || data.title || doc.id;
    return { docId: doc.id, fileName, text };
  }).filter((d) => d.text.trim().length > 0);
  return _docsCache;
}

function scoreDocument(fileName, text, terms) {
  if (terms.length === 0) return 1;
  let score = countTermHits(normalizeToken(text), terms) + countTermHits(normalizeToken(fileName), terms) * 3;
  return score === 0 ? 0.01 : score;
}

async function lexicalSearch(queryText) {
  const docs = await fetchLexicalDocs();
  const terms = extractQueryTerms(queryText);
  return docs
    .map((d) => ({ ...d, score: scoreDocument(d.fileName, d.text, terms) }))
    .filter((d) => d.score >= LEXICAL_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SNIPPETS);
}

function rankByDocId(items) {
  const ranks = new Map();
  items.forEach((item, i) => { if (!ranks.has(item.docId)) ranks.set(item.docId, i); });
  return ranks;
}
function computeRRFScore(rV, rL, w) {
  return (rV !== undefined ? w.vector / (w.k + rV + 1) : 0) + (rL !== undefined ? w.lexical / (w.k + rL + 1) : 0);
}
function fuseSnippetsByDoc(vectorItems, lexicalItems, maxTotal, weights) {
  const vectorRanks = rankByDocId(vectorItems);
  const lexicalRanks = rankByDocId(lexicalItems);
  const seen = new Set(); const docIdsInFirstSeenOrder = [];
  for (const item of [...vectorItems, ...lexicalItems]) { if (seen.has(item.docId)) continue; seen.add(item.docId); docIdsInFirstSeenOrder.push(item.docId); }
  const scored = docIdsInFirstSeenOrder.map((docId, i) => ({ docId, i, score: computeRRFScore(vectorRanks.get(docId), lexicalRanks.get(docId), weights) }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const docOrder = scored.map((s) => s.docId);
  const vectorByDoc = new Map();
  for (const item of vectorItems) { const g = vectorByDoc.get(item.docId); if (g) g.push(item); else vectorByDoc.set(item.docId, [item]); }
  const lexicalByDoc = new Map();
  for (const item of lexicalItems) if (!lexicalByDoc.has(item.docId)) lexicalByDoc.set(item.docId, item);
  const availableByDoc = new Map();
  for (const docId of docOrder) availableByDoc.set(docId, vectorByDoc.get(docId) ?? (lexicalByDoc.has(docId) ? [lexicalByDoc.get(docId)] : []));
  const result = [];
  const maxDepth = Math.max(0, ...[...availableByDoc.values()].map((v) => v.length));
  for (let depth = 0; depth < maxDepth && result.length < maxTotal; depth++) {
    for (const docId of docOrder) { if (result.length >= maxTotal) break; const items = availableByDoc.get(docId); if (items && items[depth]) result.push(items[depth]); }
  }
  return result.slice(0, maxTotal);
}

async function search(queryText) {
  const [vectorItems, lexicalItems] = await Promise.all([vectorSearch(queryText).catch(() => []), lexicalSearch(queryText).catch(() => [])]);
  return fuseSnippetsByDoc(vectorItems, lexicalItems, MAX_SNIPPETS, RRF_WEIGHTS);
}

// ─── real checkRelevance() prompt (mirrors llm-relevance-check.ts exactly) ───

function buildPrompt(query, snippets) {
  // Matches llm-relevance-check.ts EXCERPT_PREVIEW_CHARS (2600, was 400 — see
  // its comment: truncating tighter than the already-budgeted excerpt cuts off
  // the actual answer for any chunk/merged-run longer than ~400 chars).
  const list = snippets.map((s, i) => `[${i}] Tài liệu: ${s.fileName}\n${(s.text || "").slice(0, 2600)}`).join("\n\n");
  return `Bạn nhận một câu hỏi và danh sách đoạn trích ứng viên từ kho tài liệu nội bộ (có thể không liên quan gì đến câu hỏi). Nhiệm vụ: xác định đoạn nào THỰC SỰ giúp trả lời câu hỏi, sắp xếp theo mức độ liên quan giảm dần.

Câu hỏi: "${query}"

Danh sách ứng viên:
${list}

Trả lời DUY NHẤT một JSON object, không markdown, không giải thích thêm:
{"relevant_indices": [0-based index, đã sắp theo độ liên quan giảm dần]}

- Chỉ giữ lại index của đoạn THỰC SỰ giúp trả lời câu hỏi — bỏ hẳn đoạn không liên quan, kể cả khi nó nhắc tới từ khoá trùng tình cờ.
- Nếu KHÔNG đoạn nào giúp trả lời được câu hỏi (câu hỏi ngoài phạm vi kho tài liệu), trả về mảng rỗng: {"relevant_indices": []}.`;
}

async function checkRelevance(query, snippets) {
  if (snippets.length === 0) return [];
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: buildPrompt(query, snippets) }] }],
    config: { responseMimeType: "application/json", temperature: 0 },
  });
  const cleaned = (res.text || "").trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.relevant_indices)) return snippets; // fail open, mirrors production
    return parsed.relevant_indices.filter((i) => Number.isInteger(i) && i >= 0 && i < snippets.length).map((i) => snippets[i]);
  } catch {
    return snippets; // fail open
  }
}

// ─── run ──────────────────────────────────────────────────────────────────────

const positiveSet = JSON.parse(readFileSync(resolve(root, "src/lib/retrieval/eval/golden-set.json"), "utf8"));
const negativeSet = JSON.parse(readFileSync(resolve(root, "src/lib/retrieval/eval/negative-golden-set.json"), "utf8"));

async function run(items, label, expectHit) {
  let correct = 0;
  for (const item of items) {
    const candidates = await search(item.query);
    const kept = await checkRelevance(item.query, candidates);
    const gotHit = expectHit
      ? kept.some((s) => s.docId === item.expectedDocId)
      : kept.length === 0;
    if (gotHit) correct++;
    console.log(`${gotHit ? "✅" : "❌"} [${label}] "${item.query.slice(0, 55)}" -> kept ${kept.length}/${candidates.length} [${kept.map((s)=>s.docId).join(",")}]`);
  }
  console.log(`\n${label}: ${correct}/${items.length} correct\n`);
  return correct;
}

const posCorrect = await run(positiveSet, "POSITIVE (expectedDocId must survive relevance check)", true);
const negCorrect = await run(negativeSet, "NEGATIVE (must end up empty)", false);
console.log(`=== TOTAL: ${posCorrect + negCorrect}/${positiveSet.length + negativeSet.length} ===`);
