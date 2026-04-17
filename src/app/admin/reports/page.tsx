"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

type AnalyticsEvent = {
  id: string;
  eventName: string;
  payload: Record<string, unknown>;
  createdAt?: Timestamp;
};

export default function AdminReportsPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user || role !== "admin") {
      setLoading(false);
      return;
    }

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
      (err) => {
        if (err.code !== "permission-denied") {
          console.error("Failed to load analytics events", err);
        }
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user, role, authLoading]);

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

    const dayOf = (ts?: Timestamp) =>
      ts ? new Date(ts.seconds * 1000).toISOString().slice(0, 10) : null;

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
  }, [events]);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Analytics Reports</h1>
          <p className="text-sm text-muted">
            Theo dõi Upload/Parsing, Query/Response, Performance và Retention từ telemetry events.
          </p>
        </div>

        {summary.loading ? (
          <div className="clay-card p-4 text-sm text-muted">
            Loading metrics...
          </div>
        ) : (
          <>
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
                  <p className="text-sm mt-1">Guideline: <span className="font-semibold">{summary.latencyGuideline} ms</span></p>
                  <p className="text-sm">Microcopy: <span className="font-semibold">{summary.latencyMicrocopy} ms</span></p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Usage funnel</p>
                  <p className="text-sm mt-1">Upload → Parse: <span className="font-semibold">{summary.uploadToParseSuccess}%</span></p>
                  <p className="text-sm">Parse → Query: <span className="font-semibold">{summary.parseToQuery}%</span></p>
                  <p className="text-sm">Query → Accepted: <span className="font-semibold">{summary.queryToAccepted}%</span></p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Retention</p>
                  <p className="text-sm mt-1">D1: <span className="font-semibold">{summary.retentionD1}%</span></p>
                  <p className="text-sm">D7: <span className="font-semibold">{summary.retentionD7}%</span></p>
                </div>
                <div className="clay-card p-4">
                  <p className="text-xs text-muted">Knowledge usage (top referenced sources)</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {summary.topReferencedSources.length === 0 ? (
                      <span className="text-xs text-muted">Chưa đủ dữ liệu</span>
                    ) : (
                      summary.topReferencedSources.map(([fileName, count]) => (
                        <span key={fileName} className="text-xs px-2 py-0.5 rounded-[4px] bg-white/5 border border-border">
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
