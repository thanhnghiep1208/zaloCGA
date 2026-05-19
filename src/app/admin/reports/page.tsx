"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

const ANALYTICS_EVENT_LIMIT = 500;
const CHAT_SESSION_SAMPLE_LIMIT = 300;
const RE_QUERY_GAP_MS = 2 * 60 * 1000;

type AnalyticsEvent = {
  id: string;
  eventName: string;
  payload: Record<string, unknown>;
  createdAt?: Timestamp;
};

type ChatSessionRow = {
  id: string;
  userId: string;
  messages: { role: string; timestamp?: number }[];
};

type TopUserRow = {
  uid: string;
  username: string;
  queryCount: number;
  avgRelevance: number;
  feedbackTotal: number;
};

type DauDayRow = {
  date: string;
  label: string;
  count: number;
};

type UserBehaviorSummary = {
  topUsers: TopUserRow[];
  dauLast7Days: DauDayRow[];
  avgQueriesPerSession: number;
  avgSessionDurationMin: number | null;
  reQueryRate: number;
  sessionsSampled: number;
  totalUserQueriesInSessions: number;
  responseCopiedCount: number;
  sessionMetricsSource: "telemetry" | "chatSessions";
};

function dayKeyFromTimestamp(ts?: Timestamp): string | null {
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

function computeUserBehavior(
  events: AnalyticsEvent[],
  usernameByUid: Map<string, string>,
  sessions: ChatSessionRow[]
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
  lastNDaysUtc(7).forEach((day) => dauSets.set(day, new Set()));

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

  const topUsers: TopUserRow[] = [...userStats.entries()]
    .map(([uid, s]) => ({
      uid,
      username: usernameByUid.get(uid) || uid.slice(0, 8) + "…",
      queryCount: s.queryCount,
      avgRelevance: s.relevanceN ? Number((s.relevanceSum / s.relevanceN).toFixed(2)) : 0,
      feedbackTotal: s.feedbackTotal,
    }))
    .sort((a, b) => b.queryCount - a.queryCount || b.feedbackTotal - a.feedbackTotal)
    .slice(0, 10);

  const dauLast7Days: DauDayRow[] = lastNDaysUtc(7).map((date) => ({
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
      if (userMsgs[i] - userMsgs[i - 1] <= RE_QUERY_GAP_MS) {
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
    dauLast7Days,
    avgQueriesPerSession,
    avgSessionDurationMin,
    reQueryRate,
    sessionsSampled,
    totalUserQueriesInSessions,
    responseCopiedCount,
    sessionMetricsSource,
  };
}

export default function AdminReportsPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);
  const [usernameByUid, setUsernameByUid] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const { user, role, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user || role !== "admin") {
      setLoading(false);
      return;
    }

    let eventsReady = false;
    let usersReady = false;
    let sessionsReady = false;

    const maybeDone = () => {
      if (eventsReady && usersReady && sessionsReady) setLoading(false);
    };

    const eventsQ = query(
      collection(db, "analyticsEvents"),
      orderBy("createdAt", "desc"),
      limit(ANALYTICS_EVENT_LIMIT)
    );
    const unsubEvents = onSnapshot(
      eventsQ,
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AnalyticsEvent, "id">) })));
        eventsReady = true;
        maybeDone();
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.error("Failed to load analytics events", err);
        }
        eventsReady = true;
        maybeDone();
      }
    );

    const usersQ = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubUsers = onSnapshot(
      usersQ,
      (snap) => {
        const map = new Map<string, string>();
        snap.docs.forEach((d) => {
          const data = d.data() as { uid?: string; username?: string };
          const uid = data.uid ?? d.id;
          const name = String(data.username || "").trim();
          if (uid && name) map.set(uid, name);
        });
        setUsernameByUid(map);
        usersReady = true;
        maybeDone();
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.error("Failed to load users for analytics", err);
        }
        usersReady = true;
        maybeDone();
      }
    );

    const sessionsQ = query(
      collection(db, "chatSessions"),
      orderBy("updatedAt", "desc"),
      limit(CHAT_SESSION_SAMPLE_LIMIT)
    );
    const unsubSessions = onSnapshot(
      sessionsQ,
      (snap) => {
        setChatSessions(
          snap.docs.map((d) => {
            const data = d.data() as Omit<ChatSessionRow, "id">;
            return { id: d.id, ...data };
          })
        );
        sessionsReady = true;
        maybeDone();
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.error("Failed to load chat sessions for analytics", err);
        }
        sessionsReady = true;
        maybeDone();
      }
    );

    return () => {
      unsubEvents();
      unsubUsers();
      unsubSessions();
    };
  }, [user, role, authLoading]);

  const userBehavior = useMemo(
    () => computeUserBehavior(events, usernameByUid, chatSessions),
    [events, usernameByUid, chatSessions]
  );

  const summary = useMemo(() => {
    const byName: Record<string, number> = {};
    const uploadedByType = { pdf: 0, word: 0, other: 0 };
    const queryByType = { guideline: 0, microcopy: 0, unknown: 0 };
    const latencyByType = {
      guideline: { total: 0, count: 0 },
      microcopy: { total: 0, count: 0 },
      unknown: { total: 0, count: 0 },
    };
    const userFirstSeenDay = new Map<string, string>();
    const userSeenByDay = new Map<string, Set<string>>();
    const referencedSourceCount: Record<string, number> = {};

    let totalUploadSize = 0;
    let uploadCount = 0;
    let parseSuccessCount = 0;
    let parseLatencyTotal = 0;
    let parseLatencyCount = 0;
    let totalRulesExtracted = 0;
    let responseCount = 0;
    let responseLatencyTotal = 0;
    let relevanceTotal = 0;
    let relevanceCount = 0;
    let thumbsUp = 0;
    let thumbsDown = 0;

    const dayOf = dayKeyFromTimestamp;

    events.forEach((e) => {
      byName[e.eventName] = (byName[e.eventName] || 0) + 1;
      const payload = e.payload || {};
      const uid = String(payload.user_id || "");
      const day = dayOf(e.createdAt);

      if (uid && day) {
        if (!userFirstSeenDay.has(uid)) userFirstSeenDay.set(uid, day);
        if (!userSeenByDay.has(uid)) userSeenByDay.set(uid, new Set());
        userSeenByDay.get(uid)!.add(day);
      }

      if (e.eventName === "file_uploaded") {
        uploadCount += 1;
        totalUploadSize += Number(payload.size || 0);
        const fileType = String(payload.file_type || "").toLowerCase();
        if (fileType.includes("pdf")) uploadedByType.pdf += 1;
        else if (fileType.includes("word") || fileType.includes("docx")) uploadedByType.word += 1;
        else uploadedByType.other += 1;
      }

      if (e.eventName === "parse_success") {
        parseSuccessCount += 1;
        const latency = Number(payload.latency_ms || 0);
        const ruleCount = Number(payload.rule_count_extracted || 0);
        if (!Number.isNaN(latency) && latency > 0) {
          parseLatencyTotal += latency;
          parseLatencyCount += 1;
        }
        if (!Number.isNaN(ruleCount) && ruleCount > 0) {
          totalRulesExtracted += ruleCount;
        }
      }

      if (e.eventName === "query_sent") {
        const qType = String(payload.type || "unknown").toLowerCase();
        if (qType === "guideline") queryByType.guideline += 1;
        else if (qType === "microcopy") queryByType.microcopy += 1;
        else queryByType.unknown += 1;
      }

      if (e.eventName === "response_delivered") {
        responseCount += 1;
        const latency = Number(payload.latency_ms || 0);
        if (!Number.isNaN(latency) && latency > 0) {
          responseLatencyTotal += latency;
        }

        const score = Number(payload.relevance_score || 0);
        if (!Number.isNaN(score) && score >= 0) {
          relevanceTotal += score;
          relevanceCount += 1;
        }

        const rType = String(payload.response_type || "unknown").toLowerCase();
        const key = rType === "guideline" || rType === "microcopy" ? rType : "unknown";
        if (!Number.isNaN(latency) && latency > 0) {
          latencyByType[key].total += latency;
          latencyByType[key].count += 1;
        }

        const referenced = Array.isArray(payload.referenced_sources)
          ? payload.referenced_sources
          : [];
        referenced.forEach((name) => {
          const fileName = String(name || "").trim();
          if (!fileName) return;
          referencedSourceCount[fileName] = (referencedSourceCount[fileName] || 0) + 1;
        });
      }

      if (e.eventName === "user_feedback") {
        if (payload.feedback === "thumbs_up") thumbsUp += 1;
        if (payload.feedback === "thumbs_down") thumbsDown += 1;
      }
    });

    let retainedD1 = 0;
    let retainedD7 = 0;
    userFirstSeenDay.forEach((firstDay, uid) => {
      const seen = userSeenByDay.get(uid);
      if (!seen) return;
      const day1 = new Date(`${firstDay}T00:00:00.000Z`);
      day1.setUTCDate(day1.getUTCDate() + 1);
      const d1 = day1.toISOString().slice(0, 10);
      const day7 = new Date(`${firstDay}T00:00:00.000Z`);
      day7.setUTCDate(day7.getUTCDate() + 7);
      const d7 = day7.toISOString().slice(0, 10);
      if (seen.has(d1)) retainedD1 += 1;
      if (seen.has(d7)) retainedD7 += 1;
    });

    const baseUsers = userFirstSeenDay.size || 1;
    const feedbackTotal = thumbsUp + thumbsDown;
    const topReferencedSources = Object.entries(referencedSourceCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return {
      loading,
      uploadCount,
      uploadedByType,
      avgUploadSizeKB: uploadCount ? Math.round(totalUploadSize / uploadCount / 1024) : 0,
      parseSuccessRate: uploadCount ? Math.round((parseSuccessCount / uploadCount) * 100) : 0,
      avgParseLatency: parseLatencyCount ? Math.round(parseLatencyTotal / parseLatencyCount) : 0,
      totalRulesExtracted,
      avgRulesPerParsedFile: parseSuccessCount
        ? Number((totalRulesExtracted / parseSuccessCount).toFixed(1))
        : 0,
      queryByType,
      invocationCount: byName.query_sent || 0,
      responseCount,
      avgResponseLatency: responseCount ? Math.round(responseLatencyTotal / responseCount) : 0,
      avgRelevanceScore: relevanceCount ? Number((relevanceTotal / relevanceCount).toFixed(2)) : 0,
      feedbackRate: responseCount ? Math.round((feedbackTotal / responseCount) * 100) : 0,
      thumbsUp,
      thumbsDown,
      acceptanceRate: feedbackTotal ? Math.round((thumbsUp / feedbackTotal) * 100) : 0,
      retentionD1: Math.round((retainedD1 / baseUsers) * 100),
      retentionD7: Math.round((retainedD7 / baseUsers) * 100),
      latencyGuideline:
        latencyByType.guideline.count > 0
          ? Math.round(latencyByType.guideline.total / latencyByType.guideline.count)
          : 0,
      latencyMicrocopy:
        latencyByType.microcopy.count > 0
          ? Math.round(latencyByType.microcopy.total / latencyByType.microcopy.count)
          : 0,
      uploadToParseSuccess: uploadCount ? Math.round((parseSuccessCount / uploadCount) * 100) : 0,
      parseToQuery: parseSuccessCount
        ? Math.round(((byName.query_sent || 0) / parseSuccessCount) * 100)
        : 0,
      queryToAccepted: byName.query_sent
        ? Math.round((thumbsUp / (byName.query_sent || 1)) * 100)
        : 0,
      topReferencedSources,
    };
  }, [events, loading]);

  const maxDau = Math.max(1, ...userBehavior.dauLast7Days.map((d) => d.count));

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Analytics Reports</h1>
          <p className="text-sm text-muted">
            Theo dõi Upload/Parsing, Query/Response, Performance, Retention và User Behavior.
          </p>
        </div>

        <details className="clay-card p-4 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            Hướng dẫn & nguồn dữ liệu
          </summary>
          <div className="mt-3 space-y-3 text-muted">
            <p>
              Chỉ tài khoản <strong className="text-foreground">admin</strong> xem được trang này. Telemetry:{" "}
              <code className="text-xs">analyticsEvents</code> (tối đa {ANALYTICS_EVENT_LIMIT} event mới nhất).
              User Behavior thêm mẫu <code className="text-xs">chatSessions</code> ({CHAT_SESSION_SAMPLE_LIMIT}{" "}
              session gần nhất) để tính query/session và re-query.
            </p>
            <div>
              <p className="font-medium text-foreground mb-1">Các loại event</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <code className="text-xs">file_uploaded</code> — upload tại /admin/upload
                </li>
                <li>
                  <code className="text-xs">parse_success</code> — ingest thành công (/api/ingest)
                </li>
                <li>
                  <code className="text-xs">query_sent</code>,{" "}
                  <code className="text-xs">response_delivered</code> — mỗi lượt chat (/api/chat)
                </li>
                <li>
                  <code className="text-xs">user_feedback</code> — 👍/👎 trên /chat
                </li>
                <li>
                  <code className="text-xs">session_started</code>,{" "}
                  <code className="text-xs">session_ended</code> — phiên /chat (bắt đầu ở tin đầu; kết thúc
                  khi rời trang hoặc idle 10 phút)
                </li>
                <li>
                  <code className="text-xs">response_copied</code> — user copy câu trả lời
                </li>
              </ul>
            </div>
            <p>
              <strong className="text-foreground">Avg queries / session</strong> và{" "}
              <strong className="text-foreground">thời lượng phiên</strong> ưu tiên{" "}
              <code className="text-xs">session_ended</code> trong mẫu event; nếu chưa có thì fallback{" "}
              <code className="text-xs">chatSessions</code>.
            </p>
            <p>
              <strong className="text-foreground">Re-query rate</strong> dùng tin nhắn user trong{" "}
              <code className="text-xs">chatSessions</code> (hai lượt cách nhau ≤ 2 phút), vì{" "}
              <code className="text-xs">query_sent</code> chưa có <code className="text-xs">session_id</code>.
            </p>
            <p>
              Tài liệu: <code className="text-xs">docs/PROJECT_OVERVIEW.md</code> mục 8.6.
            </p>
          </div>
        </details>

        {summary.loading ? (
          <div className="clay-card p-4 text-sm text-muted">
            Loading metrics...
          </div>
        ) : events.length === 0 ? (
          <div className="clay-card p-4 text-sm text-muted space-y-2">
            <p className="font-medium text-foreground">Chưa có dữ liệu telemetry</p>
            <p>
              Dashboard sẽ có số liệu sau khi có hoạt động thật: upload + ingest tài liệu, chat qua /chat, và
              (tuỳ chọn) phản hồi 👍/👎.
            </p>
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="text-[22px] font-light">User Behavior</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Avg queries / session</p>
                  <p className="text-2xl font-light">{userBehavior.avgQueriesPerSession}</p>
                  <p className="text-xs text-muted mt-1">
                    {userBehavior.sessionsSampled}{" "}
                    {userBehavior.sessionMetricsSource === "telemetry"
                      ? "session_ended"
                      : "chatSessions"}{" "}
                    (mẫu)
                  </p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Avg session duration</p>
                  <p className="text-2xl font-light">
                    {userBehavior.avgSessionDurationMin != null
                      ? `${userBehavior.avgSessionDurationMin} min`
                      : "—"}
                  </p>
                  <p className="text-xs text-muted mt-1">từ session_ended</p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Response copies</p>
                  <p className="text-2xl font-light">{userBehavior.responseCopiedCount}</p>
                  <p className="text-xs text-muted mt-1">implicit positive signal</p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Re-query rate</p>
                  <p className="text-2xl font-light">{userBehavior.reQueryRate}%</p>
                  <p className="text-xs text-muted mt-1">
                    user msg thứ 2+ trong 2 phút / tổng {userBehavior.totalUserQueriesInSessions} query
                  </p>
                </div>
                <div className="clay-card p-4 md:col-span-2">
                  <p className="text-xs text-muted mb-2">DAU (7 ngày) — unique user từ query_sent</p>
                  <div className="flex items-end gap-2 h-20">
                    {userBehavior.dauLast7Days.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <span className="text-xs font-medium">{day.count}</span>
                        <div
                          className="w-full rounded-t-[4px] bg-accent/80 min-h-[4px]"
                          style={{ height: `${Math.max(8, (day.count / maxDau) * 100)}%` }}
                          title={`${day.date}: ${day.count} users`}
                        />
                        <span className="text-[10px] text-muted truncate w-full text-center">{day.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="clay-card p-4 overflow-x-auto">
                <p className="text-sm font-medium text-foreground mb-3">Top users</p>
                {userBehavior.topUsers.length === 0 ? (
                  <p className="text-sm text-muted">Chưa có query_sent trong mẫu event.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted border-b border-border">
                        <th className="pb-2 pr-4 font-medium">Username</th>
                        <th className="pb-2 pr-4 font-medium text-right">Queries</th>
                        <th className="pb-2 pr-4 font-medium text-right">Avg relevance</th>
                        <th className="pb-2 font-medium text-right">Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userBehavior.topUsers.map((row) => (
                        <tr key={row.uid} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-4">{row.username}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.queryCount}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{row.avgRelevance}</td>
                          <td className="py-2 text-right tabular-nums">{row.feedbackTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-[22px] font-light">Metrics Upload & Parsing</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Số lượng file upload</p>
                  <p className="text-2xl font-light">{summary.uploadCount}</p>
                  <p className="text-xs text-muted mt-1">
                    PDF {summary.uploadedByType.pdf} • Word {summary.uploadedByType.word}
                  </p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Kích thước trung bình</p>
                  <p className="text-2xl font-light">{summary.avgUploadSizeKB} KB</p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Tỷ lệ parse thành công</p>
                  <p className="text-2xl font-light">{summary.parseSuccessRate}%</p>
                  <p className="text-xs text-muted mt-1">avg latency {summary.avgParseLatency} ms</p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Coverage rules</p>
                  <p className="text-2xl font-light">{summary.totalRulesExtracted}</p>
                  <p className="text-xs text-muted mt-1">
                    avg {summary.avgRulesPerParsedFile} rules / parsed file
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-[22px] font-light">Metrics Query & Response</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Invocation count</p>
                  <p className="text-2xl font-light">{summary.invocationCount}</p>
                  <p className="text-xs text-muted mt-1">
                    guideline {summary.queryByType.guideline} • microcopy {summary.queryByType.microcopy}
                  </p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Success rate (proxy)</p>
                  <p className="text-2xl font-light">{summary.acceptanceRate}%</p>
                  <p className="text-xs text-muted mt-1">dựa trên thumbs up / total feedback</p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Response quality</p>
                  <p className="text-2xl font-light">{summary.avgRelevanceScore}</p>
                  <p className="text-xs text-muted mt-1">
                    feedback rate {summary.feedbackRate}% (👍 {summary.thumbsUp} / 👎 {summary.thumbsDown})
                  </p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Avg response latency</p>
                  <p className="text-2xl font-light">{summary.avgResponseLatency} ms</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-[22px] font-light">Metrics Hiệu suất & Retention</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Latency by complexity</p>
                  <p className="text-sm mt-1">
                    Guideline: <span className="font-semibold">{summary.latencyGuideline} ms</span>
                  </p>
                  <p className="text-sm">
                    Microcopy: <span className="font-semibold">{summary.latencyMicrocopy} ms</span>
                  </p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Usage funnel</p>
                  <p className="text-sm mt-1">
                    Upload → Parse: <span className="font-semibold">{summary.uploadToParseSuccess}%</span>
                  </p>
                  <p className="text-sm">
                    Parse → Query: <span className="font-semibold">{summary.parseToQuery}%</span>
                  </p>
                  <p className="text-sm">
                    Query → Accepted: <span className="font-semibold">{summary.queryToAccepted}%</span>
                  </p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Retention</p>
                  <p className="text-sm mt-1">
                    D1: <span className="font-semibold">{summary.retentionD1}%</span>
                  </p>
                  <p className="text-sm">
                    D7: <span className="font-semibold">{summary.retentionD7}%</span>
                  </p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Knowledge usage (top referenced sources)</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {summary.topReferencedSources.length === 0 ? (
                      <span className="text-xs text-muted">Chưa đủ dữ liệu</span>
                    ) : (
                      summary.topReferencedSources.map(([fileName, count]) => (
                        <span
                          key={fileName}
                          className="text-xs px-2 py-0.5 rounded-[4px] bg-white/5 border border-border"
                        >
                          {fileName} ({count})
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
