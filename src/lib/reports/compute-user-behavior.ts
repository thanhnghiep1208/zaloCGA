import { dayKeyFromTimestamp, formatDayLabel, lastNDaysUtc } from "@/lib/reports/date-utils";
import type { AnalyticsEvent, ChatSessionRow, UserBehaviorSummary } from "@/lib/reports/types";
import { RE_QUERY_GAP_MS } from "@/lib/reports/types";

export { RE_QUERY_GAP_MS };

export function computeUserBehavior(
  events: AnalyticsEvent[],
  usernameByUid: Map<string, string>,
  sessions: ChatSessionRow[],
  reQueryGapMs: number = RE_QUERY_GAP_MS,
  dauDays: number = 7
): UserBehaviorSummary {
  const userStats = new Map<
    string,
    { queryCount: number; relevanceSum: number; relevanceN: number; feedbackTotal: number }
  >();

  const ensureUser = (uid: string) => {
    if (!userStats.has(uid)) {
      userStats.set(uid, { queryCount: 0, relevanceSum: 0, relevanceN: 0, feedbackTotal: 0 });
    }
    return userStats.get(uid)!;
  };

  const dauSets = new Map<string, Set<string>>();
  const dauDayList = lastNDaysUtc(Math.max(1, Math.min(30, dauDays)));
  dauDayList.forEach((day) => dauSets.set(day, new Set()));

  events.forEach((e) => {
    const payload = e.payload || {};
    const uid = String(payload.user_id || "");
    if (!uid) return;

    if (e.eventName === "query_sent") {
      const stats = ensureUser(uid);
      stats.queryCount += 1;
      const day = dayKeyFromTimestamp(e.createdAt);
      if (day && dauSets.has(day)) {
        dauSets.get(day)!.add(uid);
      }
    }

    if (e.eventName === "response_delivered") {
      const score = Number(payload.relevance_score ?? NaN);
      if (!Number.isNaN(score) && score >= 0) {
        const stats = ensureUser(uid);
        stats.relevanceSum += score;
        stats.relevanceN += 1;
      }
    }

    if (e.eventName === "user_feedback") {
      const stats = ensureUser(uid);
      stats.feedbackTotal += 1;
    }
  });

  const sessionEndedRows: { query_count: number; duration_ms: number }[] = [];
  let responseCopiedCount = 0;

  events.forEach((e) => {
    const payload = e.payload || {};
    if (e.eventName === "session_ended") {
      const qc = Number(payload.query_count ?? NaN);
      const dm = Number(payload.duration_ms ?? NaN);
      if (!Number.isNaN(qc) && qc >= 0 && !Number.isNaN(dm) && dm >= 0) {
        sessionEndedRows.push({ query_count: qc, duration_ms: dm });
      }
    }
    if (e.eventName === "response_copied") {
      responseCopiedCount += 1;
    }
  });

  const topUsers = [...userStats.entries()]
    .map(([uid, s]) => ({
      uid,
      username: usernameByUid.get(uid) || uid.slice(0, 8) + "…",
      queryCount: s.queryCount,
      avgRelevance: s.relevanceN ? Number((s.relevanceSum / s.relevanceN).toFixed(2)) : 0,
      feedbackTotal: s.feedbackTotal,
    }))
    .sort((a, b) => b.queryCount - a.queryCount || b.feedbackTotal - a.feedbackTotal)
    .slice(0, 10);

  const dauByDay = dauDayList.map((date) => ({
    date,
    label: formatDayLabel(date),
    count: dauSets.get(date)?.size ?? 0,
  }));

  let totalUserQueriesInSessions = 0;
  let reQueryCount = 0;

  sessions.forEach((session) => {
    const userMsgs = (session.messages || [])
      .filter((m) => m.role === "user")
      .map((m) => Number(m.timestamp || 0))
      .filter((t) => t > 0)
      .sort((a, b) => a - b);

    totalUserQueriesInSessions += userMsgs.length;

    for (let i = 1; i < userMsgs.length; i++) {
      if (userMsgs[i] - userMsgs[i - 1] <= reQueryGapMs) {
        reQueryCount += 1;
      }
    }
  });

  let sessionsSampled = sessions.length;
  let avgQueriesPerSession = sessionsSampled
    ? Number((totalUserQueriesInSessions / sessionsSampled).toFixed(1))
    : 0;
  let avgSessionDurationMin: number | null = null;
  let sessionMetricsSource: "telemetry" | "chatSessions" = "chatSessions";

  if (sessionEndedRows.length > 0) {
    const totalQ = sessionEndedRows.reduce((s, r) => s + r.query_count, 0);
    const totalD = sessionEndedRows.reduce((s, r) => s + r.duration_ms, 0);
    sessionsSampled = sessionEndedRows.length;
    avgQueriesPerSession = Number((totalQ / sessionEndedRows.length).toFixed(1));
    avgSessionDurationMin = Math.round(totalD / sessionEndedRows.length / 60_000);
    sessionMetricsSource = "telemetry";
  }

  const reQueryRate = totalUserQueriesInSessions
    ? Math.round((reQueryCount / totalUserQueriesInSessions) * 100)
    : 0;

  return {
    topUsers,
    dauByDay,
    avgQueriesPerSession,
    avgSessionDurationMin,
    reQueryRate,
    sessionsSampled,
    totalUserQueriesInSessions,
    responseCopiedCount,
    sessionMetricsSource,
  };
}
