import { NextResponse } from "next/server";
import { adminStorage, adminStorageBucketName } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "chat-attachments/";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function requireCronAuth(req: Request, secret: string): boolean {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7).trim() === secret) return true;
  const header = req.headers.get("x-cron-secret");
  if (header?.trim() === secret) return true;
  return false;
}

function isExpired(
  now: number,
  customMeta: Record<string, string> | undefined,
  timeCreated: string | undefined,
  ttlMs: number
): boolean {
  const raw = customMeta?.expiresAt;
  if (raw != null && String(raw).trim() !== "") {
    const t = parseInt(String(raw), 10);
    if (Number.isFinite(t)) return t <= now;
  }
  if (timeCreated) {
    const created = new Date(timeCreated).getTime();
    if (Number.isFinite(created)) return now - created >= ttlMs;
  }
  return false;
}

/**
 * Deletes expired chat attachment objects from GCS.
 *
 * Schedule (recommended): Cloud Scheduler → HTTPS POST this URL hourly/daily
 * with header `Authorization: Bearer <CHAT_ATTACHMENTS_CRON_SECRET>`.
 *
 * Set `CHAT_ATTACHMENTS_CRON_SECRET` in App Hosting env. Without it, this route returns 503.
 */
export async function POST(req: Request) {
  const secret = process.env.CHAT_ATTACHMENTS_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CHAT_ATTACHMENTS_CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  if (!requireCronAuth(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!adminStorage || !adminStorageBucketName) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 500 });
  }

  const maxDeletes = envInt("CHAT_ATTACHMENTS_CLEANUP_MAX_DELETES", 500);
  const maxPages = envInt("CHAT_ATTACHMENTS_CLEANUP_MAX_PAGES", 50);
  const pageSize = envInt("CHAT_ATTACHMENTS_CLEANUP_PAGE_SIZE", 100);
  const ttlMs = envInt("CHAT_ATTACHMENTS_TTL_MS", DEFAULT_TTL_MS);

  const bucket = adminStorage.bucket(adminStorageBucketName);
  const now = Date.now();

  let scanned = 0;
  let deleted = 0;
  let pageToken: string | undefined;
  let pages = 0;

  try {
    while (deleted < maxDeletes && pages < maxPages) {
      const [files, nextQuery] = await bucket.getFiles({
        prefix: PREFIX,
        maxResults: pageSize,
        autoPaginate: false,
        ...(pageToken ? { pageToken } : {}),
      });

      pages += 1;
      scanned += files.length;

      for (const file of files) {
        if (deleted >= maxDeletes) break;

        const meta = file.metadata;
        const custom = meta.metadata as Record<string, string> | undefined;

        if (!isExpired(now, custom, meta.timeCreated, ttlMs)) continue;

        await file.delete({ ignoreNotFound: true });
        deleted += 1;
      }

      pageToken =
        nextQuery && typeof nextQuery === "object" && "pageToken" in nextQuery
          ? (nextQuery as { pageToken?: string }).pageToken
          : undefined;

      if (!pageToken || files.length === 0) break;
    }

    return NextResponse.json({
      ok: true,
      scanned,
      deleted,
      pages,
      maxDeletes,
      prefix: PREFIX,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cleanup-chat-attachments]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
