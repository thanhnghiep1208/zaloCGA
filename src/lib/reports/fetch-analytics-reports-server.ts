import { adminDb } from "@/lib/firebase-admin";
import {
  ANALYTICS_EVENT_LIMIT,
  CHAT_SESSION_SAMPLE_LIMIT,
  type AnalyticsEvent,
  type ChatSessionRow,
  type FirestoreTimestampLike,
} from "@/lib/reports/types";

export type AnalyticsReportsPayload = {
  events: AnalyticsEvent[];
  chatSessions: ChatSessionRow[];
  usernameByUid: Record<string, string>;
};

function serializeTimestamp(
  value: unknown
): FirestoreTimestampLike | undefined {
  if (!value || typeof value !== "object") return undefined;
  const ts = value as { seconds?: number; nanoseconds?: number; toMillis?: () => number };
  if (typeof ts.seconds === "number") {
    return {
      seconds: ts.seconds,
      nanoseconds: typeof ts.nanoseconds === "number" ? ts.nanoseconds : 0,
    };
  }
  if (typeof ts.toMillis === "function") {
    const ms = ts.toMillis();
    return { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
  }
  return undefined;
}

/** Load analytics dashboard data via Admin SDK (bypasses client Firestore rules). */
export async function fetchAnalyticsReportsServer(): Promise<AnalyticsReportsPayload> {
  if (!adminDb) {
    throw new Error("Firebase Admin SDK not initialized");
  }

  const [eventsSnap, usersSnap, sessionsSnap] = await Promise.all([
    adminDb
      .collection("analyticsEvents")
      .orderBy("createdAt", "desc")
      .limit(ANALYTICS_EVENT_LIMIT)
      .get(),
    adminDb.collection("users").orderBy("createdAt", "desc").get(),
    adminDb
      .collection("chatSessions")
      .orderBy("updatedAt", "desc")
      .limit(CHAT_SESSION_SAMPLE_LIMIT)
      .get(),
  ]);

  const events: AnalyticsEvent[] = eventsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      eventName: String(data.eventName ?? ""),
      payload: (data.payload as Record<string, unknown>) ?? {},
      createdAt: serializeTimestamp(data.createdAt),
    };
  });

  const usernameByUid: Record<string, string> = {};
  usersSnap.docs.forEach((d) => {
    const data = d.data() as { uid?: string; username?: string };
    const uid = data.uid ?? d.id;
    const name = String(data.username || "").trim();
    if (uid && name) usernameByUid[uid] = name;
  });

  const chatSessions: ChatSessionRow[] = sessionsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: String(data.userId ?? ""),
      messages: Array.isArray(data.messages) ? data.messages : [],
      updatedAt: serializeTimestamp(data.updatedAt),
    };
  });

  return { events, chatSessions, usernameByUid };
}
