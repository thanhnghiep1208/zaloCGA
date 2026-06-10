"use client";

import { useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { UserAnalyticsDetailModal } from "@/components/UserAnalyticsDetailModal";
import { useAuth } from "@/context/AuthContext";
import { useAnalyticsReportsData } from "@/hooks/useAnalyticsReportsData";
import {
  dauDayCountForRange,
  eventInRange,
  sessionInRange,
  type ReportsTimeRange,
} from "@/lib/reports/date-utils";
import { computeEventSummary } from "@/lib/reports/compute-event-summary";
import { computeUserBehavior } from "@/lib/reports/compute-user-behavior";
import {
  ANALYTICS_EVENT_LIMIT,
  CHAT_SESSION_SAMPLE_LIMIT,
  RE_QUERY_GAP_MS,
} from "@/lib/reports/types";

export default function AdminReportsPage() {
  const [selectedUser, setSelectedUser] = useState<{ uid: string; username: string } | null>(
    null
  );
  const [timeRange, setTimeRange] = useState<ReportsTimeRange>("7d");
  const { user, role, loading: authLoading } = useAuth();
  const {
    events,
    chatSessions,
    usernameByUid,
    loading,
    refreshing,
    lastRefreshedAt,
    error,
    refresh,
  } = useAnalyticsReportsData(user, role, authLoading);

  const filteredEvents = useMemo(
    () => events.filter((e) => eventInRange(e, timeRange)),
    [events, timeRange]
  );

  const filteredSessions = useMemo(
    () => chatSessions.filter((s) => sessionInRange(s, timeRange)),
    [chatSessions, timeRange]
  );

  const userBehavior = useMemo(
    () =>
      computeUserBehavior(
        filteredEvents,
        usernameByUid,
        filteredSessions,
        RE_QUERY_GAP_MS,
        dauDayCountForRange(timeRange)
      ),
    [filteredEvents, usernameByUid, filteredSessions, timeRange]
  );

  const summary = useMemo(
    () => computeEventSummary(filteredEvents, loading),
    [filteredEvents, loading]
  );

  const dauChartLabel =
    timeRange === "today" ? "DAU (hôm nay)" : `DAU (${dauDayCountForRange(timeRange)} ngày)`;

  const maxDau = Math.max(1, ...userBehavior.dauByDay.map((d) => d.count));

  return (
    <ProtectedRoute allowedRoles={["admin", "contributor"]}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Analytics Reports</h1>
          <p className="text-sm text-muted">
            Theo dõi Upload/Parsing, Query/Response, Performance, Retention và User Behavior.
          </p>
        </div>

        <ReportsToolbar
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          onRefresh={refresh}
          refreshing={refreshing}
          lastRefreshedAt={lastRefreshedAt}
        />

        {error ? (
          <div className="clay-card p-4 text-sm text-muted border border-border">
            <p className="text-foreground font-medium">{error}</p>
          </div>
        ) : null}

        <details className="clay-card p-4 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            Hướng dẫn & nguồn dữ liệu
          </summary>
          <div className="mt-3 space-y-3 text-muted">
            <p>
              Chỉ tài khoản <strong className="text-foreground">admin</strong> xem được trang này. Telemetry:{" "}
              <code className="text-xs">analyticsEvents</code> (tối đa {ANALYTICS_EVENT_LIMIT} event mới nhất).
              User Behavior thêm mẫu <code className="text-xs">chatSessions</code> ({CHAT_SESSION_SAMPLE_LIMIT}{" "}
              session gần nhất) để tính query/session và re-query. Bộ lọc thời gian áp trên mẫu đã tải (UTC); dữ liệu
              tải lại mỗi 6 giờ hoặc khi bấm <strong className="text-foreground">Cập nhật</strong>.
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
                <li>
                  <code className="text-xs">parse_failed</code> — ingest thất bại (/api/ingest)
                </li>
                <li>
                  <code className="text-xs">attachment_uploaded</code> — ảnh đính kèm vào chat (/api/chat/attachments)
                </li>
                <li>
                  <code className="text-xs">document_viewed</code> — user mở xem tài liệu tham khảo
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
              Tài liệu: <code className="text-xs">docs/ANALYTICS_REPORTS.md</code>
            </p>
          </div>
        </details>

        {summary.loading ? (
          <div className="clay-card p-4 text-sm text-muted">
            Loading metrics...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="clay-card p-4 text-sm text-muted space-y-2">
            <p className="font-medium text-foreground">Chưa có dữ liệu trong khoảng đã chọn</p>
            <p>
              Thử đổi bộ lọc thời gian hoặc bấm Cập nhật. Dashboard cần hoạt động thật: upload + ingest, chat
              /chat, phản hồi 👍/👎.
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
                  <p className="text-xs text-muted mb-2">{dauChartLabel} — unique user từ query_sent</p>
                  <div className="flex items-end gap-2 h-20">
                    {userBehavior.dauByDay.map((day) => (
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
                <p className="text-sm font-medium text-foreground mb-1">Top users</p>
                <p className="text-xs text-muted mb-3">Nhấn một dòng để xem chi tiết hoạt động.</p>
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
                        <tr
                          key={row.uid}
                          className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-accent/8 transition-colors"
                          onClick={() =>
                            setSelectedUser({ uid: row.uid, username: row.username })
                          }
                        >
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
                  <p className="text-xs text-muted">Parse errors</p>
                  <p className="text-2xl font-light">{summary.parseFailedCount}</p>
                  <p className="text-xs text-muted mt-1">ai_extraction + docx_parse failures</p>
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
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Attachment uploads</p>
                  <p className="text-2xl font-light">{summary.attachmentCount}</p>
                  <p className="text-xs text-muted mt-1">ảnh đính kèm vào chat</p>
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
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">
                    Document views ({summary.documentViewedCount} total)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {summary.topViewedDocs.length === 0 ? (
                      <span className="text-xs text-muted">Chưa có lượt xem tài liệu</span>
                    ) : (
                      summary.topViewedDocs.map(([fileName, count]) => (
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

        <UserAnalyticsDetailModal
          uid={selectedUser?.uid ?? null}
          username={selectedUser?.username ?? ""}
          events={filteredEvents}
          onClose={() => setSelectedUser(null)}
        />
      </div>
    </ProtectedRoute>
  );
}
