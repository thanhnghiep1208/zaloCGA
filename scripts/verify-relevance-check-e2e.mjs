#!/usr/bin/env node
/**
 * End-to-end verification for the LLM relevance check (PRD M4, FR#21/22):
 * runs the full retrieval pipeline, then the real relevance-check prompt, over
 * the positive golden set (expected doc must survive) and the negative set
 * (result must be empty). Results: src/lib/retrieval/eval/BASELINE.md.
 *
 * Pipeline, prompt and response handling come from scripts/lib/*.mjs, which
 * tests keep in sync with the app's TS code.
 *
 * Run: node scripts/verify-relevance-check-e2e.mjs   (read-only)
 */

import { loadEnv, initClients, embedTexts, readJson } from "./lib/runtime.mjs";
import { createSearch, configFromEnv } from "./lib/pipeline.mjs";
import { applyRelevanceResponse, buildRelevancePrompt, RELEVANCE_MODEL } from "./lib/retrieval-mirror.mjs";

const env = loadEnv();
const { db, FieldValue, ai } = await initClients(env);
const search = createSearch({
  db,
  FieldValue,
  embedQuery: async (q) => (await embedTexts(ai, [q], "RETRIEVAL_QUERY"))[0],
  config: configFromEnv(env),
});

async function checkRelevance(query, snippets) {
  if (snippets.length === 0) return snippets;
  const res = await ai.models.generateContent({
    model: RELEVANCE_MODEL,
    contents: [{ role: "user", parts: [{ text: buildRelevancePrompt(query, snippets) }] }],
    config: { responseMimeType: "application/json", temperature: 0 },
  });
  return applyRelevanceResponse(snippets, res.text);
}

async function run(items, label, passes) {
  let correct = 0;
  for (const item of items) {
    const candidates = await search(item.query);
    const kept = await checkRelevance(item.query, candidates);
    const ok = passes(item, kept);
    if (ok) correct++;
    console.log(
      `${ok ? "✅" : "❌"} [${label}] "${item.query.slice(0, 55)}" -> kept ${kept.length}/${candidates.length} [${kept.map((s) => s.docId).join(",")}]`
    );
  }
  console.log(`\n${label}: ${correct}/${items.length} correct\n`);
  return correct;
}

const positiveSet = readJson("src/lib/retrieval/eval/golden-set.json");
const negativeSet = readJson("src/lib/retrieval/eval/negative-golden-set.json");

const pos = await run(positiveSet, "POSITIVE (expectedDocId must survive)", (item, kept) =>
  kept.some((s) => s.docId === item.expectedDocId)
);
const neg = await run(negativeSet, "NEGATIVE (must end up empty)", (_item, kept) => kept.length === 0);
console.log(`=== TOTAL: ${pos + neg}/${positiveSet.length + negativeSet.length} ===`);
