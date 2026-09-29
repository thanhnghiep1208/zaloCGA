#!/usr/bin/env node
/**
 * Retrieval eval — recall@6 / recall@3 / MRR against the golden set (PRD M0).
 * Results across milestones: src/lib/retrieval/eval/BASELINE.md.
 *
 * Runs scripts/lib/pipeline.mjs, a JS mirror of FirebaseRetrievalProvider.search()
 * (minus the final LLM relevance check) that tests keep in sync with the app —
 * see scripts/lib/retrieval-mirror.mjs.
 *
 * Run:
 *   node scripts/eval-retrieval.mjs
 *
 * Read-only: only queries Firestore, never writes. Retrieval knobs honour the
 * same RETRIEVAL_* env vars as the app (e.g. RETRIEVAL_RRF_WEIGHT_LEXICAL=0.3).
 */

import { loadEnv, initClients, embedTexts, readJson } from "./lib/runtime.mjs";
import { createSearch, configFromEnv } from "./lib/pipeline.mjs";
import { recallAtK, reciprocalRank } from "./lib/retrieval-mirror.mjs";

const env = loadEnv();
const { db, FieldValue, ai } = await initClients(env);
const search = createSearch({
  db,
  FieldValue,
  embedQuery: async (q) => (await embedTexts(ai, [q], "RETRIEVAL_QUERY"))[0],
  config: configFromEnv(env),
});

const goldenSet = readJson("src/lib/retrieval/eval/golden-set.json");
console.log(`Running eval on ${goldenSet.length} golden-set queries...\n`);

const rows = [];
for (const item of goldenSet) {
  const resultDocIds = (await search(item.query)).map((s) => s.docId);
  const recall6 = recallAtK(resultDocIds, item.expectedDocId, 6);
  rows.push({ ...item, resultDocIds, recall6, rr: reciprocalRank(resultDocIds, item.expectedDocId) });
  console.log(
    `${recall6 ? "✅" : "❌"} [${item.source}] "${item.query.slice(0, 60)}" — expected ${item.expectedDocId}, got [${resultDocIds.join(", ")}]`
  );
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
console.log(`\n=== Summary (n=${rows.length}) ===`);
console.log(`recall@6: ${(mean(rows.map((r) => r.recall6)) * 100).toFixed(1)}%`);
console.log(
  `recall@3: ${(mean(rows.map((r) => recallAtK(r.resultDocIds, r.expectedDocId, 3))) * 100).toFixed(1)}% (primary signal — recall@6 saturates on this small corpus, see BASELINE.md)`
);
console.log(`MRR: ${mean(rows.map((r) => r.rr)).toFixed(3)}`);

const misses = rows.filter((r) => !r.recall6);
if (misses.length > 0) {
  console.log(`\nMisses (${misses.length}):`);
  misses.forEach((r) => console.log(`  - "${r.query.slice(0, 70)}" (expected ${r.expectedDocId})`));
}
