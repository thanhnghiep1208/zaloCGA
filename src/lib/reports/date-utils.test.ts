import { describe, expect, it } from "vitest";
import {
  dayKeyFromTimestamp,
  dauDayCountForRange,
  eventInRange,
  formatDayLabel,
  getRangeStartMs,
  lastNDaysUtc,
  sessionInRange,
} from "@/lib/reports/date-utils";
import type { AnalyticsEvent, ChatSessionRow } from "@/lib/reports/types";

describe("lastNDaysUtc", () => {
  it("returns n ISO date strings ending today UTC", () => {
    const days = lastNDaysUtc(3);
    expect(days).toHaveLength(3);
    expect(days[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("dayKeyFromTimestamp", () => {
  it("formats firestore-like timestamp to YYYY-MM-DD", () => {
    const key = dayKeyFromTimestamp({
      seconds: 1_700_000_000,
      nanoseconds: 0,
      toDate: () => new Date(1_700_000_000_000),
      toMillis: () => 1_700_000_000_000,
      isEqual: () => false,
      toJSON: () => ({ seconds: 1_700_000_000, nanoseconds: 0 }),
    });
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns null when missing", () => {
    expect(dayKeyFromTimestamp(undefined)).toBeNull();
  });
});

describe("formatDayLabel", () => {
  it("returns a non-empty localized label", () => {
    expect(formatDayLabel("2026-05-20").length).toBeGreaterThan(0);
  });
});

const fixedNow = new Date("2026-05-21T15:00:00.000Z");

function ts(iso: string) {
  const ms = Date.parse(iso);
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: 0,
    toDate: () => new Date(ms),
    toMillis: () => ms,
    isEqual: () => false,
    toJSON: () => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }),
  };
}

describe("getRangeStartMs", () => {
  it("today starts at UTC midnight", () => {
    expect(getRangeStartMs("today", fixedNow)).toBe(Date.parse("2026-05-21T00:00:00.000Z"));
  });

  it("7d spans seven days", () => {
    const start = getRangeStartMs("7d", fixedNow);
    expect(fixedNow.getTime() - start).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("eventInRange", () => {
  it("includes events on or after range start", () => {
    const event: Pick<AnalyticsEvent, "createdAt"> = {
      createdAt: ts("2026-05-21T10:00:00Z"),
    };
    expect(eventInRange(event, "today", fixedNow)).toBe(true);
    expect(eventInRange({ createdAt: ts("2026-05-20T10:00:00Z") }, "today", fixedNow)).toBe(
      false
    );
  });
});

describe("sessionInRange", () => {
  it("uses updatedAt when present", () => {
    const session: ChatSessionRow = {
      id: "s1",
      userId: "u1",
      messages: [],
      updatedAt: ts("2026-05-21T08:00:00Z"),
    };
    expect(sessionInRange(session, "today", fixedNow)).toBe(true);
  });
});

describe("dauDayCountForRange", () => {
  it("maps ranges to day counts", () => {
    expect(dauDayCountForRange("today")).toBe(1);
    expect(dauDayCountForRange("7d")).toBe(7);
    expect(dauDayCountForRange("30d")).toBe(30);
  });
});
