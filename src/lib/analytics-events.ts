import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export type LoggedEventName =
  | "file_uploaded"
  | "parse_success"
  | "parse_failed"
  | "query_sent"
  | "response_delivered"
  | "user_feedback"
  | "session_started"
  | "session_ended"
  | "response_copied"
  | "document_viewed"
  | "attachment_uploaded";

/** Events the client may POST to /api/events (server adds user_id). */
export type ClientLoggedEventName = Extract<
  LoggedEventName,
  | "file_uploaded"
  | "user_feedback"
  | "session_started"
  | "session_ended"
  | "response_copied"
  | "document_viewed"
>;

export const CLIENT_ANALYTICS_EVENTS: ClientLoggedEventName[] = [
  "file_uploaded",
  "user_feedback",
  "session_started",
  "session_ended",
  "response_copied",
  "document_viewed",
];

export async function logAnalyticsEvent(
  eventName: LoggedEventName,
  payload: Record<string, unknown>
): Promise<void> {
  if (!adminDb) {
    console.error("[analytics-events] adminDb not initialized");
    return;
  }

  await adminDb.collection("analyticsEvents").add({
    eventName,
    payload,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export function inferQueryType(queryText: string): "guideline" | "microcopy" {
  const q = queryText.toLowerCase();
  const microcopyHints = [
    "microcopy",
    "toast",
    "empty state",
    "placeholder",
    "tooltip",
    "button",
    "nút",
    "label",
    "modal",
    "dialog",
    "sheet",
    "error message",
    "thông báo lỗi",
    "kí tự",
    "ký tự",
    "ui",
  ];

  return microcopyHints.some((hint) => q.includes(hint)) ? "microcopy" : "guideline";
}

export function estimateRelevanceScore(queryText: string, responseText: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);

  const qTokens = new Set(tokenize(queryText));
  const rTokens = new Set(tokenize(responseText));
  if (qTokens.size === 0 || rTokens.size === 0) return 0.4;

  let overlap = 0;
  qTokens.forEach((t) => {
    if (rTokens.has(t)) overlap += 1;
  });

  const score = overlap / qTokens.size;
  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}
