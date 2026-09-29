#!/usr/bin/env node
/**
 * Calibrate vector distance / lexical score thresholds for "not found"
 * detection (PRD M4, FR#21) using a positive set (must-find) and a negative
 * set (must-not-find). This is the run that showed the two ranges fully
 * overlap on this corpus (see BASELINE.md) and ruled out a numeric cutoff.
 *
 * Lexical scoring comes from scripts/lib/retrieval-mirror.mjs, which tests
 * keep in sync with the app's lexical scorer.
 *
 * Run: node scripts/calibrate-not-found-threshold.mjs   (read-only)
 */

import { loadEnv, initClients, embedTexts, readJson } from "./lib/runtime.mjs";
import { rankDocumentsForQuery } from "./lib/retrieval-mirror.mjs";

const { db, FieldValue, ai } = await initClients(loadEnv());

let docsCache = null;
async function fetchDocs() {
  if (docsCache) return docsCache;
  const snap = await db.collection("documents").where("status", "==", "indexed").select("fileName", "title", "textContent").get();
  docsCache = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, fileName: x.fileName || x.title || d.id, text: x.textContent || "" };
  });
  return docsCache;
}

/** No distanceThreshold on purpose — we want the TRUE best distance, not one already gated by the 0.55 cutoff. */
async function bestVectorDistance(query) {
  const [embedding] = await embedTexts(ai, [query], "RETRIEVAL_QUERY");
  const snap = await db.collection("document_chunks").where("status", "==", "indexed").findNearest({
    vectorField: "embedding",
    queryVector: FieldValue.vector(embedding),
    limit: 5,
    distanceMeasure: "COSINE",
    distanceResultField: "_dist",
  }).get();
  if (snap.empty) return Infinity;
  return Math.min(...snap.docs.map((d) => d.data()._dist));
}

/** Best lexical score across the corpus, scored exactly like the app; below 1 (the no-hit floor) counts as 0. */
async function maxLexicalScore(query) {
  const [best] = rankDocumentsForQuery(await fetchDocs(), query, 1);
  return best && best.score >= 1 ? best.score : 0;
}

async function measure(items, label) {
  const rows = [];
  for (const item of items) {
    const [dist, lex] = await Promise.all([bestVectorDistance(item.query), maxLexicalScore(item.query)]);
    rows.push({ ...item, dist, lex });
  }
  console.log(`\n=== ${label} (n=${rows.length}) ===`);
  rows.forEach((r) => console.log(`  dist=${r.dist.toFixed(4)} lex=${r.lex}  "${r.query.slice(0, 60)}"`));
  return rows;
}

const posRows = await measure(readJson("src/lib/retrieval/eval/golden-set.json"), "POSITIVE (should find something)");
const negRows = await measure(readJson("src/lib/retrieval/eval/negative-golden-set.json"), "NEGATIVE (should find nothing)");

const posDistWorst = Math.max(...posRows.map((r) => r.dist));
const negDistBest = Math.min(...negRows.map((r) => r.dist));
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
