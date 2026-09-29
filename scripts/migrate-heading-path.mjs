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
 * (same tradeoff as scripts/reindex-embeddings.mjs) — every other document's
 * chunks stay searchable throughout the run.
 *
 * Logic lives in scripts/lib/migrate-heading-path-core.mjs (unit-tested in
 * src/lib/documents/migrate-heading-path.test.ts); this file only wires it to
 * the real Firestore + Gemini.
 *
 * Run:
 *   node scripts/migrate-heading-path.mjs
 *   node scripts/migrate-heading-path.mjs --dry-run   # report only, no writes
 */

import { loadEnv, initClients, embedTexts } from "./lib/runtime.mjs";
import { migrateHeadingPaths } from "./lib/migrate-heading-path-core.mjs";

const dryRun = process.argv.includes("--dry-run");
const { db, FieldValue, ai } = await initClients(loadEnv());

console.log(`🔍  Migrating headingPath onto indexed documents...${dryRun ? " (dry run — no writes)" : ""}\n`);

const summary = await migrateHeadingPaths({
  db,
  FieldValue,
  embed: (texts) => embedTexts(ai, texts, "RETRIEVAL_DOCUMENT"),
  dryRun,
});

console.log(`\n─────────────────────────────`);
console.log(`${dryRun ? "🔎  Would migrate" : "✅  Migrated"}     : ${summary.migrated}`);
console.log(`✅  Already done  : ${summary.alreadyDone}`);
console.log(`⏭️   Skipped (empty): ${summary.skippedEmpty}`);
console.log(`❌  Failed        : ${summary.failed}`);
console.log(`─────────────────────────────`);

if (summary.failed > 0) process.exit(1);
