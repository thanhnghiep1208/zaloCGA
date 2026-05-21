import type { AnalyticsEventLike } from "@/lib/user-analytics-detail";

export const ANALYTICS_EVENT_LIMIT = 500;
export const CHAT_SESSION_SAMPLE_LIMIT = 300;
export const RE_QUERY_GAP_MS = 2 * 60 * 1000;

/** Firestore timestamp fields as plain data (client SDK, Admin SDK, or JSON API). */
export type FirestoreTimestampLike = {
  seconds: number;
  nanoseconds?: number;
};

export type AnalyticsEvent = AnalyticsEventLike;

export type ChatSessionRow = {
  id: string;
  userId: string;
  messages: { role: string; timestamp?: number }[];
  updatedAt?: FirestoreTimestampLike;
};

export type TopUserRow = {
  uid: string;
  username: string;
  queryCount: number;
  avgRelevance: number;
  feedbackTotal: number;
};

export type DauDayRow = {
  date: string;
  label: string;
  count: number;
};

export type UserBehaviorSummary = {
  topUsers: TopUserRow[];
  dauByDay: DauDayRow[];
  avgQueriesPerSession: number;
  avgSessionDurationMin: number | null;
  reQueryRate: number;
  sessionsSampled: number;
  totalUserQueriesInSessions: number;
  responseCopiedCount: number;
  sessionMetricsSource: "telemetry" | "chatSessions";
};

export type EventSummary = {
  loading: boolean;
  uploadCount: number;
  uploadedByType: { pdf: number; word: number; other: number };
  avgUploadSizeKB: number;
  parseSuccessRate: number;
  avgParseLatency: number;
  totalRulesExtracted: number;
  avgRulesPerParsedFile: number;
  queryByType: { guideline: number; microcopy: number; unknown: number };
  invocationCount: number;
  responseCount: number;
  avgResponseLatency: number;
  avgRelevanceScore: number;
  feedbackRate: number;
  thumbsUp: number;
  thumbsDown: number;
  acceptanceRate: number;
  retentionD1: number;
  retentionD7: number;
  latencyGuideline: number;
  latencyMicrocopy: number;
  uploadToParseSuccess: number;
  parseToQuery: number;
  queryToAccepted: number;
  topReferencedSources: [string, number][];
};
