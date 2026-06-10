import { dayKeyFromTimestamp } from "@/lib/reports/date-utils";
import type { AnalyticsEvent, EventSummary } from "@/lib/reports/types";

export function computeEventSummary(events: AnalyticsEvent[], loading: boolean): EventSummary {
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
  const viewedDocCount: Record<string, number> = {};

  let totalUploadSize = 0;
  let uploadCount = 0;
  let parseSuccessCount = 0;
  let parseFailedCount = 0;
  let attachmentCount = 0;
  let parseLatencyTotal = 0;
  let parseLatencyCount = 0;
  let totalRulesExtracted = 0;
  let responseCount = 0;
  let responseLatencyTotal = 0;
  let relevanceTotal = 0;
  let relevanceCount = 0;
  let thumbsUp = 0;
  let thumbsDown = 0;

  events.forEach((e) => {
    byName[e.eventName] = (byName[e.eventName] || 0) + 1;
    const payload = e.payload || {};
    const uid = String(payload.user_id || "");
    const day = dayKeyFromTimestamp(e.createdAt);

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

    if (e.eventName === "parse_failed") {
      parseFailedCount += 1;
    }

    if (e.eventName === "attachment_uploaded") {
      attachmentCount += 1;
    }

    if (e.eventName === "document_viewed") {
      const fileName = String(payload.file_name || payload.doc_id || "").trim();
      if (fileName) viewedDocCount[fileName] = (viewedDocCount[fileName] || 0) + 1;
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
  const topViewedDocs = Object.entries(viewedDocCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const parseAttempts = parseSuccessCount + parseFailedCount;
  const trueParseSuccessRate = parseAttempts > 0
    ? Math.round((parseSuccessCount / parseAttempts) * 100)
    : uploadCount
    ? Math.round((parseSuccessCount / uploadCount) * 100)
    : 0;

  return {
    loading,
    uploadCount,
    uploadedByType,
    avgUploadSizeKB: uploadCount ? Math.round(totalUploadSize / uploadCount / 1024) : 0,
    parseSuccessRate: trueParseSuccessRate,
    parseFailedCount,
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
    attachmentCount,
    documentViewedCount: Object.values(viewedDocCount).reduce((s, c) => s + c, 0),
    topViewedDocs,
  };
}
