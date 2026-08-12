import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export const AUTH_SESSION_STORAGE_KEY = "ikc_auth_session_id";

/** Sessions with lastSeen within this window are shown as "active". */
export const AUTH_SESSION_ACTIVE_MS = 30 * 60 * 1000;

export type AuthSessionRecord = {
  id: string;
  userId: string;
  deviceLabel: string;
  userAgent: string;
  createdAt?: { seconds: number };
  lastSeenAt?: { seconds: number };
  revoked?: boolean;
  revokedAt?: { seconds: number };
};

export function getAuthSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
}

export function getOrCreateAuthSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, id);
  }
  return id;
}

export function clearAuthSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

/** Human-readable label from User-Agent (client-only). */
export function parseDeviceLabel(userAgent: string): string {
  const ua = userAgent || "Unknown browser";
  let browser = "Trình duyệt";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${browser} · ${os}`;
}

export function isAuthSessionActive(lastSeenSeconds: number | undefined): boolean {
  if (!lastSeenSeconds) return false;
  return Date.now() - lastSeenSeconds * 1000 < AUTH_SESSION_ACTIVE_MS;
}

// Stored session id belongs to a different account (e.g. switching users in
// the same browser tab without logging out first). Firestore rules only let
// the owner update a session doc, so reusing it would always fail with
// permission-denied — start a fresh session instead.
export function sessionBelongsToOtherUser(
  existingUserId: string | undefined,
  userId: string
): boolean {
  return existingUserId !== undefined && existingUserId !== userId;
}

export async function registerAuthSession(userId: string): Promise<string> {
  let sessionId = getOrCreateAuthSessionId();
  if (!sessionId) return "";

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  let ref = doc(db, "authSessions", sessionId);
  let existing = await getDoc(ref);

  if (sessionBelongsToOtherUser(existing.exists() ? existing.data()?.userId : undefined, userId)) {
    clearAuthSessionId();
    sessionId = getOrCreateAuthSessionId();
    ref = doc(db, "authSessions", sessionId);
    existing = await getDoc(ref);
  }

  if (existing.exists()) {
    // Document already exists (same browser tab after refresh) — only update lastSeenAt
    // to stay within Firestore update rules.
    await updateDoc(ref, { lastSeenAt: serverTimestamp() });
  } else {
    await setDoc(ref, {
      userId,
      userAgent: ua.slice(0, 500),
      deviceLabel: parseDeviceLabel(ua),
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      revoked: false,
    });
  }
  return sessionId;
}

export async function touchAuthSession(sessionId: string): Promise<void> {
  const ref = doc(db, "authSessions", sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data()?.revoked === true) return;
  await updateDoc(ref, { lastSeenAt: serverTimestamp() });
}

export async function removeAuthSessionOnLogout(sessionId: string | null): Promise<void> {
  if (sessionId) {
    try {
      await deleteDoc(doc(db, "authSessions", sessionId));
    } catch {
      // Best-effort cleanup
    }
  }
  clearAuthSessionId();
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, "authSessions", sessionId), {
    revoked: true,
    revokedAt: serverTimestamp(),
  });
}

export function subscribeAuthSessionsForUser(
  userId: string,
  onData: (sessions: AuthSessionRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "authSessions"),
    where("userId", "==", userId),
    orderBy("lastSeenAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: AuthSessionRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AuthSessionRecord, "id">),
      }));
      onData(rows);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeCurrentAuthSessionRevoked(
  sessionId: string,
  onRevoked: () => void
): Unsubscribe {
  return onSnapshot(doc(db, "authSessions", sessionId), (snap) => {
    if (snap.exists() && snap.data()?.revoked === true) {
      onRevoked();
    }
  });
}
