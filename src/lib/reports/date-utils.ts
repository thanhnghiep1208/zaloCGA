import type { Timestamp } from "firebase/firestore";
import type { AnalyticsEvent, ChatSessionRow } from "@/lib/reports/types";

export type ReportsTimeRange = "today" | "7d" | "30d";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC midnight for the calendar day containing `date`. */
export function utcMidnightMs(date: Date): number {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function getRangeStartMs(range: ReportsTimeRange, now: Date = new Date()): number {
  const end = now.getTime();
  if (range === "today") {
    return utcMidnightMs(now);
  }
  const days = range === "7d" ? 7 : 30;
  return end - days * MS_PER_DAY;
}

export function timestampToMs(ts?: Timestamp): number | null {
  if (!ts) return null;
  return ts.seconds * 1000;
}

export function eventInRange(
  event: Pick<AnalyticsEvent, "createdAt">,
  range: ReportsTimeRange,
  now?: Date
): boolean {
  const ms = timestampToMs(event.createdAt);
  if (ms == null) return false;
  return ms >= getRangeStartMs(range, now);
}

export function sessionInRange(
  session: ChatSessionRow,
  range: ReportsTimeRange,
  now?: Date
): boolean {
  const updatedMs = timestampToMs(session.updatedAt);
  if (updatedMs != null) {
    return updatedMs >= getRangeStartMs(range, now);
  }
  const start = getRangeStartMs(range, now);
  const msgTimes = (session.messages || [])
    .map((m) => Number(m.timestamp || 0))
    .filter((t) => t > 0);
  if (msgTimes.length === 0) return false;
  return Math.max(...msgTimes) >= start;
}

export function dauDayCountForRange(range: ReportsTimeRange): number {
  if (range === "today") return 1;
  if (range === "7d") return 7;
  return 30;
}

export function reportsTimeRangeLabel(range: ReportsTimeRange): string {
  if (range === "today") return "Hôm nay";
  if (range === "7d") return "7 ngày";
  return "30 ngày";
}

export function dayKeyFromTimestamp(ts?: Timestamp): string | null {
  return ts ? new Date(ts.seconds * 1000).toISOString().slice(0, 10) : null;
}

export function lastNDaysUtc(n: number): string[] {
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

export function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  return d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
}
