"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ProtectedRoute } from "@/components/ProtectedRoute";

type AnalyticsEvent = {
  id: string;
  eventName: string;
  payload: Record<string, unknown>;
  createdAt?: Timestamp;
};

export default function AdminReportsPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "analyticsEvents"),
      orderBy("createdAt", "desc"),
      limit(300)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AnalyticsEvent, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const summary = useMemo(() => {
    const byName: Record<string, number> = {};
    let parseLatencyTotal = 0;
    let parseLatencyCount = 0;
    let responseLatencyTotal = 0;
    let responseLatencyCount = 0;
    let thumbsUp = 0;
    let thumbsDown = 0;

    events.forEach((e) => {
      byName[e.eventName] = (byName[e.eventName] || 0) + 1;
      if (e.eventName === "parse_success") {
        const latency = Number(e.payload.latency_ms || 0);
        if (!Number.isNaN(latency) && latency > 0) {
          parseLatencyTotal += latency;
          parseLatencyCount += 1;
        }
      }
      if (e.eventName === "response_delivered") {
        const latency = Number(e.payload.latency_ms || 0);
        if (!Number.isNaN(latency) && latency > 0) {
          responseLatencyTotal += latency;
          responseLatencyCount += 1;
        }
      }
      if (e.eventName === "user_feedback") {
        if (e.payload.feedback === "thumbs_up") thumbsUp += 1;
        if (e.payload.feedback === "thumbs_down") thumbsDown += 1;
      }
    });

    return {
      byName,
      avgParseLatency: parseLatencyCount ? Math.round(parseLatencyTotal / parseLatencyCount) : 0,
      avgResponseLatency: responseLatencyCount
        ? Math.round(responseLatencyTotal / responseLatencyCount)
        : 0,
      thumbsUp,
      thumbsDown,
    };
  }, [events]);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics Reports</h1>
          <p className="text-sm text-muted">Theo dõi events upload, parse, query, response và feedback.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 border border-border rounded-xl bg-surface">
            <p className="text-xs text-muted">file_uploaded</p>
            <p className="text-2xl font-semibold">{summary.byName.file_uploaded || 0}</p>
          </div>
          <div className="p-4 border border-border rounded-xl bg-surface">
            <p className="text-xs text-muted">parse_success</p>
            <p className="text-2xl font-semibold">{summary.byName.parse_success || 0}</p>
            <p className="text-xs text-muted mt-1">avg latency {summary.avgParseLatency} ms</p>
          </div>
          <div className="p-4 border border-border rounded-xl bg-surface">
            <p className="text-xs text-muted">query_sent</p>
            <p className="text-2xl font-semibold">{summary.byName.query_sent || 0}</p>
          </div>
          <div className="p-4 border border-border rounded-xl bg-surface">
            <p className="text-xs text-muted">response_delivered</p>
            <p className="text-2xl font-semibold">{summary.byName.response_delivered || 0}</p>
            <p className="text-xs text-muted mt-1">avg latency {summary.avgResponseLatency} ms</p>
          </div>
        </div>

        <div className="p-4 border border-border rounded-xl bg-surface">
          <p className="text-sm font-medium">User feedback</p>
          <p className="text-xs text-muted mt-1">
            👍 {summary.thumbsUp} / 👎 {summary.thumbsDown}
          </p>
        </div>

        <div className="border border-border rounded-xl bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-medium">Recent events</div>
          {loading ? (
            <div className="p-4 text-sm text-muted">Loading...</div>
          ) : events.length === 0 ? (
            <div className="p-4 text-sm text-muted">No event data yet.</div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-2">Event</th>
                    <th className="px-4 py-2">Payload</th>
                    <th className="px-4 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-border/60 align-top">
                      <td className="px-4 py-2 font-medium">{event.eventName}</td>
                      <td className="px-4 py-2 font-mono text-xs whitespace-pre-wrap break-all">
                        {JSON.stringify(event.payload)}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted whitespace-nowrap">
                        {event.createdAt
                          ? new Date(event.createdAt.seconds * 1000).toLocaleString("vi-VN")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
