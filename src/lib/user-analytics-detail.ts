import type { FirestoreTimestampLike } from "@/lib/reports/types";

export type AnalyticsEventLike = {
  id: string;
  eventName: string;
  payload: Record<string, unknown>;
  createdAt?: FirestoreTimestampLike;
};

export type UserQueryRow = {
  id: string;
  text: string;
  type: string;
  atLabel: string;
  atMs: number;
};

export type UserSourceRow = {
  fileName: string;
  count: number;
};

export type UserActivityDay = {
  date: string;
  label: string;
  queryCount: number;
  active: boolean;
};

export type UserAnalyticsDetail = {
  queryCount: number;
  responseCount: number;
  thumbsUp: number;
  thumbsDown: number;
  feedbackTotal: number;
  feedbackPositiveRate: number | null;
  feedbackOnResponseRate: number | null;
  queries: UserQueryRow[];
  topSources: UserSourceRow[];
  activityDays: UserActivityDay[];
};

const ACTIVITY_EVENT_NAMES = new Set([
  "query_sent",
  "response_delivered",
  "user_feedback",
  "session_started",
  "session_ended",
  "response_copied",
]);

function dayKeyFromTimestamp(ts?: FirestoreTimestampLike): string | null {
  return ts ? new Date(ts.seconds * 1000).toISOString().slice(0, 10) : null;
}

function lastNDaysUtc(n: number): string[] {
  const days: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  return d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatEventTime(ts?: FirestoreTimestampLike): { atLabel: string; atMs: number } {
  if (!ts) return { atLabel: "—", atMs: 0 };
  const at = new Date(ts.seconds * 1000);
  return {
    atMs: at.getTime(),
    atLabel: at.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export function computeUserAnalyticsDetail(
  uid: string,
  events: AnalyticsEventLike[],
  timelineDays = 30
): UserAnalyticsDetail {
  const userEvents = events.filter((e) => String(e.payload?.user_id || "") === uid);

  let thumbsUp = 0;
  let thumbsDown = 0;
  let responseCount = 0;
  const queries: UserQueryRow[] = [];
  const sourceCount: Record<string, number> = {};
  const queryCountByDay = new Map<string, number>();
  const activeDays = new Set<string>();

  const timelineDayKeys = lastNDaysUtc(timelineDays);
  timelineDayKeys.forEach((d) => queryCountByDay.set(d, 0));

  userEvents.forEach((e) => {
    const payload = e.payload || {};
    const day = dayKeyFromTimestamp(e.createdAt);

    if (day && ACTIVITY_EVENT_NAMES.has(e.eventName)) {
      activeDays.add(day);
    }

    if (e.eventName === "query_sent") {
      if (day) {
        queryCountByDay.set(day, (queryCountByDay.get(day) || 0) + 1);
      }
      const { atLabel, atMs } = formatEventTime(e.createdAt);
      const text = String(payload.query_text || "").trim() || "(không có nội dung)";
      queries.push({
        id: e.id,
        text,
        type: String(payload.type || "unknown"),
        atLabel,
        atMs,
      });
    }

    if (e.eventName === "response_delivered") {
      responseCount += 1;
      const referenced = Array.isArray(payload.referenced_sources)
        ? payload.referenced_sources
        : [];
      referenced.forEach((name) => {
        const fileName = String(name || "").trim();
        if (!fileName) return;
        sourceCount[fileName] = (sourceCount[fileName] || 0) + 1;
      });
    }

    if (e.eventName === "user_feedback") {
      if (payload.feedback === "thumbs_up") thumbsUp += 1;
      if (payload.feedback === "thumbs_down") thumbsDown += 1;
    }
  });

  queries.sort((a, b) => b.atMs - a.atMs);

  const topSources: UserSourceRow[] = Object.entries(sourceCount)
    .map(([fileName, count]) => ({ fileName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const activityDays: UserActivityDay[] = timelineDayKeys.map((date) => ({
    date,
    label: formatDayLabel(date),
    queryCount: queryCountByDay.get(date) || 0,
    active: activeDays.has(date),
  }));

  const feedbackTotal = thumbsUp + thumbsDown;
  const queryCount = queries.length;

  return {
    queryCount,
    responseCount,
    thumbsUp,
    thumbsDown,
    feedbackTotal,
    feedbackPositiveRate: feedbackTotal
      ? Math.round((thumbsUp / feedbackTotal) * 100)
      : null,
    feedbackOnResponseRate: responseCount
      ? Math.round((feedbackTotal / responseCount) * 100)
      : null,
    queries,
    topSources,
    activityDays,
  };
}
