"use client";

import { useEffect, useMemo } from "react";
import {
  computeUserAnalyticsDetail,
  type AnalyticsEventLike,
} from "@/lib/user-analytics-detail";

type UserAnalyticsDetailModalProps = {
  uid: string | null;
  username: string;
  events: AnalyticsEventLike[];
  onClose: () => void;
};

export function UserAnalyticsDetailModal({
  uid,
  username,
  events,
  onClose,
}: UserAnalyticsDetailModalProps) {
  const detail = useMemo(
    () => (uid ? computeUserAnalyticsDetail(uid, events) : null),
    [uid, events]
  );

  useEffect(() => {
    if (!uid) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uid, onClose]);

  if (!uid || !detail) return null;

  const maxActivityQueries = Math.max(
    1,
    ...detail.activityDays.map((d) => d.queryCount)
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng chi tiết user"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-analytics-detail-title"
        className="relative z-[91] w-full max-w-3xl max-h-[90vh] clay-card rounded-[16px] overflow-hidden flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border bg-surface shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-muted font-medium">Chi tiết user</p>
            <h3 id="user-analytics-detail-title" className="text-lg font-medium text-foreground truncate">
              {username}
            </h3>
            <p className="text-xs text-muted mt-1 font-mono truncate">{uid}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="clay-hover-playful px-3 py-1.5 rounded-[8px] border border-border text-sm text-foreground font-medium shrink-0"
          >
            Đóng
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-[8px] border border-border/60 p-3">
              <p className="text-xs text-muted">Queries</p>
              <p className="text-xl font-light tabular-nums">{detail.queryCount}</p>
            </div>
            <div className="rounded-[8px] border border-border/60 p-3">
              <p className="text-xs text-muted">👍 / feedback</p>
              <p className="text-xl font-light tabular-nums">
                {detail.feedbackPositiveRate != null ? `${detail.feedbackPositiveRate}%` : "—"}
              </p>
              <p className="text-[10px] text-muted mt-0.5">
                {detail.thumbsUp} 👍 · {detail.thumbsDown} 👎
              </p>
            </div>
            <div className="rounded-[8px] border border-border/60 p-3">
              <p className="text-xs text-muted">Feedback / response</p>
              <p className="text-xl font-light tabular-nums">
                {detail.feedbackOnResponseRate != null ? `${detail.feedbackOnResponseRate}%` : "—"}
              </p>
              <p className="text-[10px] text-muted mt-0.5">{detail.responseCount} responses</p>
            </div>
            <div className="rounded-[8px] border border-border/60 p-3">
              <p className="text-xs text-muted">Nguồn tham chiếu</p>
              <p className="text-xl font-light tabular-nums">{detail.topSources.length}</p>
              <p className="text-[10px] text-muted mt-0.5">tài liệu khác nhau</p>
            </div>
          </div>

          <section>
            <h4 className="text-sm font-medium text-foreground mb-2">
              Timeline hoạt động (30 ngày)
            </h4>
            <p className="text-xs text-muted mb-3">
              Cột = số query; nền nhạt = có hoạt động chat (query, feedback, session, …).
            </p>
            <div className="flex items-end gap-0.5 h-24 overflow-x-auto pb-1">
              {detail.activityDays.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-1 min-w-[22px] flex-1 max-w-[28px]"
                  title={`${day.date}: ${day.queryCount} query${day.active && day.queryCount === 0 ? " (hoạt động khác)" : ""}`}
                >
                  <span className="text-[9px] tabular-nums text-muted h-3">
                    {day.queryCount > 0 ? day.queryCount : ""}
                  </span>
                  <div
                    className={`w-full rounded-t-[3px] min-h-[4px] ${
                      day.queryCount > 0
                        ? "bg-accent/80"
                        : day.active
                          ? "bg-accent/25"
                          : "bg-border/40"
                    }`}
                    style={{
                      height: day.queryCount
                        ? `${Math.max(12, (day.queryCount / maxActivityQueries) * 100)}%`
                        : day.active
                          ? "12%"
                          : "4%",
                    }}
                  />
                  <span className="text-[8px] text-muted truncate w-full text-center leading-tight">
                    {day.label.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-medium text-foreground mb-2">Query đã hỏi</h4>
            {detail.queries.length === 0 ? (
              <p className="text-sm text-muted">Chưa có query_sent trong mẫu event.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {detail.queries.map((q) => (
                  <li
                    key={q.id}
                    className="rounded-[8px] border border-border/60 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wide text-muted">
                        {q.type}
                      </span>
                      <span className="text-[10px] text-muted">{q.atLabel}</span>
                    </div>
                    <p className="text-foreground leading-snug">{q.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-sm font-medium text-foreground mb-2">
              Tài liệu hay được tham chiếu
            </h4>
            {detail.topSources.length === 0 ? (
              <p className="text-sm text-muted">
                Chưa có referenced_sources trong response_delivered.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {detail.topSources.map((s) => (
                  <li
                    key={s.fileName}
                    className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0"
                  >
                    <span className="truncate text-foreground">{s.fileName}</span>
                    <span className="tabular-nums text-muted shrink-0">{s.count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
