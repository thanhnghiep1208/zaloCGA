import { describe, expect, it } from "vitest";
import { migrateHeadingPaths } from "../../../scripts/lib/migrate-heading-path-core.mjs";

type ChunkData = Record<string, unknown> & { docId: string };
type DocData = { fileName: string; textContent: string };

/** Minimal in-memory Firestore covering exactly the calls the migration makes. */
function fakeDb(documents: Record<string, DocData>, chunks: ChunkData[] = []) {
  const store = new Map<string, ChunkData>();
  let nextId = 0;
  chunks.forEach((c) => store.set(`seed-${nextId++}`, c));
  const ops = { sets: 0, deletes: 0 };

  function chunkQuery(docId?: string, max?: number) {
    return {
      where: (_f: string, _op: string, value: string) => chunkQuery(value, max),
      limit: (n: number) => chunkQuery(docId, n),
      select: () => chunkQuery(docId, max),
      get: async () => {
        let rows = [...store.entries()].filter(([, d]) => docId === undefined || d.docId === docId);
        if (max !== undefined) rows = rows.slice(0, max);
        return {
          empty: rows.length === 0,
          size: rows.length,
          docs: rows.map(([id, data]) => ({ ref: { id }, get: (field: string) => data[field] })),
        };
      },
    };
  }

  const db = {
    collection: (name: string) => {
      if (name === "document_chunks") {
        return { ...chunkQuery(), doc: () => ({ id: `new-${nextId++}` }) };
      }
      const docsQuery = {
        where: () => docsQuery,
        select: () => docsQuery,
        get: async () => ({
          empty: Object.keys(documents).length === 0,
          size: Object.keys(documents).length,
          docs: Object.entries(documents).map(([id, d]) => ({ id, data: () => d })),
        }),
      };
      return docsQuery;
    },
    batch: () => {
      const pending: (() => void)[] = [];
      return {
        set: (ref: { id: string }, data: ChunkData) => pending.push(() => { store.set(ref.id, data); ops.sets++; }),
        delete: (ref: { id: string }) => pending.push(() => { store.delete(ref.id); ops.deletes++; }),
        commit: async () => pending.forEach((fn) => fn()),
      };
    },
  };
  return { db, store, ops };
}

const FieldValue = { vector: (v: number[]) => ({ vector: v }), serverTimestamp: () => "ts" };

function fakeEmbed() {
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    calls.push(texts);
    return texts.map(() => [0.1, 0.2]);
  };
  return { embed, calls };
}

const quiet = () => {};

const DOCS: Record<string, DocData> = {
  withHeadings: { fileName: "snackbar.pdf", textContent: "# Snackbar\n\n## Behavior\n\nTối đa 2 dòng." },
  plain: { fileName: "plain.docx", textContent: "Văn bản thuần không có heading nào." },
};

describe("migrateHeadingPaths (FR#25)", () => {
  it("writes a headingPath field onto every chunk of every document on the first run", async () => {
    const { db, store } = fakeDb(DOCS, [{ docId: "withHeadings", text: "old" }, { docId: "plain", text: "old" }]);
    const { embed } = fakeEmbed();

    const summary = await migrateHeadingPaths({ db, FieldValue, embed, log: quiet });

    expect(summary).toMatchObject({ migrated: 2, alreadyDone: 0, failed: 0 });
    const written = [...store.values()];
    expect(written.every((c) => "headingPath" in c)).toBe(true);
    expect(written.find((c) => c.docId === "withHeadings")?.headingPath).toBe("Snackbar");
    expect(written.find((c) => c.docId === "plain")?.headingPath).toBeNull();
  });

  it("does no embedding and no writes when run a second time", async () => {
    const { db, ops } = fakeDb(DOCS, [{ docId: "withHeadings", text: "old" }, { docId: "plain", text: "old" }]);
    const first = fakeEmbed();
    await migrateHeadingPaths({ db, FieldValue, embed: first.embed, log: quiet });
    const opsAfterFirst = { ...ops };

    const second = fakeEmbed();
    const summary = await migrateHeadingPaths({ db, FieldValue, embed: second.embed, log: quiet });

    expect(summary).toMatchObject({ migrated: 0, alreadyDone: 2, failed: 0 });
    expect(second.calls).toHaveLength(0);
    expect(ops).toEqual(opsAfterFirst);
  });

  it("treats headingPath: null as already migrated, not as missing", async () => {
    const { db } = fakeDb({ plain: DOCS.plain }, [{ docId: "plain", text: "x", headingPath: null }]);
    const { embed, calls } = fakeEmbed();

    const summary = await migrateHeadingPaths({ db, FieldValue, embed, log: quiet });

    expect(summary).toMatchObject({ migrated: 0, alreadyDone: 1 });
    expect(calls).toHaveLength(0);
  });

  it("changes nothing in dry-run mode", async () => {
    const { db, ops } = fakeDb(DOCS, [{ docId: "withHeadings", text: "old" }]);
    const { embed, calls } = fakeEmbed();

    const summary = await migrateHeadingPaths({ db, FieldValue, embed, dryRun: true, log: quiet });

    expect(summary.migrated).toBe(2);
    expect(calls).toHaveLength(0);
    expect(ops).toEqual({ sets: 0, deletes: 0 });
  });

  it("skips documents with no text content", async () => {
    const { db } = fakeDb({ empty: { fileName: "e.txt", textContent: "   " } });
    const { embed, calls } = fakeEmbed();

    const summary = await migrateHeadingPaths({ db, FieldValue, embed, log: quiet });

    expect(summary).toMatchObject({ migrated: 0, skippedEmpty: 1 });
    expect(calls).toHaveLength(0);
  });

  it("keeps going after one document fails and retries it on the next run", async () => {
    const { db } = fakeDb(DOCS, [{ docId: "withHeadings", text: "old" }, { docId: "plain", text: "old" }]);
    const failing = async (texts: string[]) => {
      if (texts.some((t) => t.includes("Văn bản thuần"))) throw new Error("quota exceeded");
      return texts.map(() => [0.1]);
    };

    const first = await migrateHeadingPaths({ db, FieldValue, embed: failing, log: quiet });
    expect(first).toMatchObject({ migrated: 1, failed: 1 });

    const second = await migrateHeadingPaths({ db, FieldValue, embed: fakeEmbed().embed, log: quiet });
    expect(second).toMatchObject({ migrated: 1, alreadyDone: 1, failed: 0 });
  });
});
