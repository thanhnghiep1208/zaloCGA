import { describe, expect, it } from "vitest";
import { computeUserBehavior } from "@/lib/reports/compute-user-behavior";
import type { AnalyticsEvent, ChatSessionRow } from "@/lib/reports/types";

describe("computeUserBehavior", () => {
  it("aggregates query counts and DAU from events", () => {
    const day = "2026-05-20";
    const ts = (iso: string) => {
      const ms = Date.parse(iso);
      return {
        seconds: Math.floor(ms / 1000),
        nanoseconds: 0,
        toDate: () => new Date(ms),
        toMillis: () => ms,
        isEqual: () => false,
        toJSON: () => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }),
      };
    };
    const events: AnalyticsEvent[] = [
      {
        id: "1",
        eventName: "query_sent",
        payload: { user_id: "u1" },
        createdAt: ts(`${day}T10:00:00Z`),
      },
      {
        id: "2",
        eventName: "query_sent",
        payload: { user_id: "u1" },
        createdAt: ts(`${day}T11:00:00Z`),
      },
      {
        id: "3",
        eventName: "response_delivered",
        payload: { user_id: "u1", relevance_score: 0.8 },
        createdAt: ts(`${day}T11:01:00Z`),
      },
    ];
    const usernames = new Map([["u1", "alice"]]);
    const sessions: ChatSessionRow[] = [];

    const result = computeUserBehavior(events, usernames, sessions);
    expect(result.topUsers[0].username).toBe("alice");
    expect(result.topUsers[0].queryCount).toBe(2);
    expect(result.topUsers[0].avgRelevance).toBe(0.8);
  });

  it("computes re-query rate from chat session timestamps", () => {
    const t0 = Date.now();
    const sessions: ChatSessionRow[] = [
      {
        id: "s1",
        userId: "u1",
        messages: [
          { role: "user", timestamp: t0 },
          { role: "assistant", timestamp: t0 + 1000 },
          { role: "user", timestamp: t0 + 30_000 },
        ],
      },
    ];
    const result = computeUserBehavior([], new Map(), sessions);
    expect(result.totalUserQueriesInSessions).toBe(2);
    expect(result.reQueryRate).toBe(50);
  });
});
