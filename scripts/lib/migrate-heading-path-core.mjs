// Side-effect-free core of scripts/migrate-heading-path.mjs (PRD M5, FR#25),
// taking its Firestore handle and embedder as arguments so it can be tested
// against an in-memory fake (src/lib/documents/migrate-heading-path.test.ts).

import { chunkText, embedInputFor } from "./chunking.mjs";

const WRITE_BATCH_SIZE = 400;

function docText(data) {
  if (typeof data.textContent === "string" && data.textContent.trim()) return data.textContent;
  return typeof data.contentPlain === "string" ? data.contentPlain : "";
}

function docName(id, data) {
  if (typeof data.fileName === "string" && data.fileName.trim()) return data.fileName;
  if (typeof data.title === "string" && data.title.trim()) return data.title;
  return id;
}

/**
 * A document counts as migrated once its chunks carry the `headingPath` field —
 * present even when `null` (a legitimate "no headings" result). Only an absent
 * field means "not migrated yet". A document with no chunks at all is treated
 * as not migrated, so a run that failed between delete and re-write retries it.
 */
async function isAlreadyMigrated(db, docId) {
  const snap = await db.collection("document_chunks").where("docId", "==", docId).limit(1).get();
  if (snap.empty) return false;
  return snap.docs[0].get("headingPath") !== undefined;
}

async function deleteChunks(db, docId) {
  const snap = await db.collection("document_chunks").where("docId", "==", docId).select().get();
  for (let i = 0; i < snap.docs.length; i += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    snap.docs.slice(i, i + WRITE_BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

async function writeChunks(db, FieldValue, embed, docId, fileName, chunks) {
  const embeddings = await embed(chunks.map(embedInputFor));
  const ref = db.collection("document_chunks");
  for (let i = 0; i < chunks.length; i += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    for (let j = i; j < Math.min(i + WRITE_BATCH_SIZE, chunks.length); j++) {
      batch.set(ref.doc(), {
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
    await batch.commit();
  }
}

/**
 * @param {{ db: any, FieldValue: any, embed: (texts: string[]) => Promise<number[][]>, dryRun?: boolean, log?: (line: string) => void }} deps
 * @returns {Promise<{ migrated: number, alreadyDone: number, skippedEmpty: number, failed: number }>}
 */
export async function migrateHeadingPaths({ db, FieldValue, embed, dryRun = false, log = console.log }) {
  const snap = await db
    .collection("documents")
    .where("status", "==", "indexed")
    .select("fileName", "title", "textContent", "contentPlain")
    .get();

  const summary = { migrated: 0, alreadyDone: 0, skippedEmpty: 0, failed: 0 };
  let i = 0;

  for (const doc of snap.docs) {
    const tag = `[${++i}/${snap.size}]`;
    const data = doc.data();
    const text = docText(data);
    const fileName = docName(doc.id, data);

    if (!text.trim()) {
      log(`⏭️   ${tag} ${fileName} — no text content, skipping`);
      summary.skippedEmpty++;
      continue;
    }

    if (await isAlreadyMigrated(db, doc.id)) {
      log(`✅  ${tag} ${fileName} — already migrated, skipping`);
      summary.alreadyDone++;
      continue;
    }

    const chunks = chunkText(text);

    if (dryRun) {
      const withHeadings = chunks.filter((c) => c.headingPath !== null).length;
      log(`🔎  ${tag} ${fileName} — would write ${chunks.length} chunk(s), ${withHeadings} with a headingPath`);
      summary.migrated++;
      continue;
    }

    try {
      const deleted = await deleteChunks(db, doc.id);
      await writeChunks(db, FieldValue, embed, doc.id, fileName, chunks);
      log(`⚙️   ${tag} ${fileName} — deleted ${deleted}, wrote ${chunks.length} chunk(s) with headingPath`);
      summary.migrated++;
    } catch (e) {
      log(`❌  ${tag} ${fileName} — ${e instanceof Error ? e.message : e}`);
      summary.failed++;
    }
  }

  return summary;
}
