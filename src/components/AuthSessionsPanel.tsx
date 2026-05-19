"use client";

import {
  AUTH_SESSION_ACTIVE_MS,
  getAuthSessionId,
  isAuthSessionActive,
  revokeAuthSession,
  subscribeAuthSessionsForUser,
  type AuthSessionRecord,
} from "@/lib/auth-sessions";
import { useEffect, useMemo, useState } from "react";

function formatRelativeTime(seconds: number | undefined): string {
  if (!seconds) return "—";
  const diff = Date.now() - seconds * 1000;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 7) return `${days} ngày trước`;
  return new Date(seconds * 1000).toLocaleString("vi-VN");
}

type AuthSessionsPanelProps = {
  userId: string;
  title?: string;
  description?: string;
  /** When true, show username context for admin */
  adminView?: boolean;
};

export function AuthSessionsPanel({
  userId,
  title = "Phiên đăng nhập đang hoạt động",
  description = "Mỗi trình duyệt hoặc máy tạo một phiên riêng. Bạn có thể đăng xuất từ xa các phiên khác.",
  adminView = false,
}: AuthSessionsPanelProps) {
  const [sessions, setSessions] = useState<AuthSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const currentSessionId = getAuthSessionId();

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError("");

    const unsub = subscribeAuthSessionsForUser(
      userId,
      (rows) => {
        setSessions(rows);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Không tải được danh sách phiên. Kiểm tra quyền hoặc deploy Firestore rules/index.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [userId]);

  const visible = useMemo(() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return sessions.filter((s) => {
      if (!s.revoked) return true;
      const seen = s.lastSeenAt?.seconds ?? s.revokedAt?.seconds;
      return seen ? seen * 1000 >= cutoff : false;
    });
  }, [sessions]);

  const activeCount = visible.filter(
    (s) => !s.revoked && isAuthSessionActive(s.lastSeenAt?.seconds)
  ).length;

  const handleRevoke = async (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    if (!confirm("Đăng xuất phiên này trên thiết bị đó?")) return;
    setRevokingId(sessionId);
    try {
      await revokeAuthSession(sessionId);
    } catch (e) {
      console.error(e);
      alert("Không thể đăng xuất phiên. Thử lại sau.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="clay-card p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
        {adminView && (
          <p className="text-xs text-muted font-mono">userId: {userId}</p>
        )}
        <p className="text-xs text-muted">
          Hoạt động = có tương tác trong {AUTH_SESSION_ACTIVE_MS / 60000} phút gần nhất.
          {activeCount > 0 ? ` Hiện có ${activeCount} phiên đang hoạt động.` : ""}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-accent" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted py-4">
          Chưa có phiên nào được ghi nhận. Phiên sẽ xuất hiện sau khi user đăng nhập lại.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {visible.map((s) => {
            const isCurrent = s.id === currentSessionId;
            const active =
              !s.revoked && isAuthSessionActive(s.lastSeenAt?.seconds);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-surface/50"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground text-sm">
                      {s.deviceLabel || "Thiết bị không xác định"}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25">
                        Thiết bị này
                      </span>
                    )}
                    {active && !s.revoked && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/25">
                        Đang hoạt động
                      </span>
                    )}
                    {s.revoked && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-border text-muted">
                        Đã đăng xuất
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Lần cuối: {formatRelativeTime(s.lastSeenAt?.seconds)}
                    {s.createdAt?.seconds
                      ? ` · Tạo: ${new Date(s.createdAt.seconds * 1000).toLocaleDateString("vi-VN")}`
                      : ""}
                  </p>
                </div>
                {!s.revoked && !isCurrent && (
                  <button
                    type="button"
                    disabled={revokingId === s.id}
                    onClick={() => handleRevoke(s.id)}
                    className="text-xs font-semibold rounded-lg border border-border px-3 py-1.5 hover:bg-accent/10 disabled:opacity-50"
                  >
                    {revokingId === s.id ? "Đang xử lý…" : "Đăng xuất phiên"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
