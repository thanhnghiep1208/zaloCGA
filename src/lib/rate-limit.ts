import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { ApiAuthError } from "@/lib/api-request-auth";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Firestore-based sliding-window rate limiter.
 * Each user gets a counter document per 1-minute window per route key.
 *
 * Configure a Firestore TTL policy on the `expireAt` field of the
 * `rate_limits` collection so old docs are cleaned up automatically.
 */
export async function checkRateLimit(
  uid: string,
  routeKey: string,
  limitPerMinute: number
): Promise<void> {
  if (!adminDb) return; // if Admin SDK not available, allow through

  const windowKey = Math.floor(Date.now() / 60_000);
  const ref = adminDb.collection("rate_limits").doc(`${uid}_${routeKey}_${windowKey}`);

  const allowed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count: number = snap.exists ? (snap.data()?.count as number ?? 0) : 0;
    if (count >= limitPerMinute) return false;
    // expireAt = end of next window so TTL deletes the doc after it's no longer relevant
    const expireAt = Timestamp.fromMillis((windowKey + 2) * 60_000);
    tx.set(ref, { count: FieldValue.increment(1), expireAt }, { merge: true });
    return true;
  });

  if (!allowed) {
    throw new ApiAuthError(
      `Rate limit exceeded: max ${limitPerMinute} requests per minute.`,
      429
    );
  }
}

/** Thin wrapper for the chat endpoint — preserves backward compatibility. */
export async function checkChatRateLimit(uid: string): Promise<void> {
  return checkRateLimit(uid, "chat", envInt("CHAT_RATE_LIMIT_PER_MINUTE", 20));
}
