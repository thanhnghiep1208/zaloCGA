import { describe, expect, it } from "vitest";
import { computeLlmCost } from "@/lib/reports/compute-llm-cost";
import type { AnalyticsEvent } from "@/lib/reports/types";

const ts = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 });

let nextId = 0;
function delivered(
  sessionId: string | undefined,
  at: string,
  usage: unknown,
  extra: Record<string, unknown> = {}
): AnalyticsEvent {
  return {
    id: String(++nextId),
    eventName: "response_delivered",
    payload: { user_id: "u1", session_id: sessionId, llm_usage: usage, ...extra },
    createdAt: ts(at),
  };
}

const chat = (input: number, output: number, model = "gemini-3.8-flash") => ({
  step: "chat",
  model,
  input_tokens: input,
  output_tokens: output,
});
const relevance = (input: number, output: number) => ({
  step: "relevance",
  model: "gemini-2.5-flash",
  input_tokens: input,
  output_tokens: output,
});

const usernames = new Map([["u1", "alice"]]);

describe("computeLlmCost", () => {
  it("sums tokens and prices every step at its own model's rate", () => {
    const summary = computeLlmCost(
      [delivered("s1", "2026-09-01T10:00:00Z", [chat(1_000_000, 0), relevance(1_000_000, 0)])],
      usernames
    );
    expect(summary.totals.inputTokens).toBe(2_000_000);
    // 0.75 (gemini-3.8-flash) + 0.30 (gemini-2.5-flash)
    expect(summary.totals.costUsd).toBeCloseTo(1.05, 10);
  });

  it("groups turns into sessions, most expensive first, with the session's user", () => {
    const summary = computeLlmCost(
      [
        delivered("cheap", "2026-09-01T10:00:00Z", [chat(1000, 100)]),
        delivered("pricey", "2026-09-01T11:00:00Z", [chat(100_000, 5000)]),
        delivered("pricey", "2026-09-01T11:05:00Z", [chat(100_000, 5000)]),
      ],
      usernames
    );
    expect(summary.sessions.map((s) => [s.sessionId, s.turns])).toEqual([
      ["pricey", 2],
      ["cheap", 1],
    ]);
    expect(summary.sessions[0]).toMatchObject({ username: "alice", inputTokens: 200_000, outputTokens: 10_000 });
    expect(summary.sessions[0].lastAtMs).toBe(Date.parse("2026-09-01T11:05:00Z"));
  });

  it("averages per session and per turn", () => {
    const summary = computeLlmCost(
      [
        delivered("a", "2026-09-01T10:00:00Z", [chat(1000, 100)]),
        delivered("a", "2026-09-01T10:01:00Z", [chat(3000, 300)]),
        delivered("b", "2026-09-01T10:02:00Z", [chat(2000, 200)]),
      ],
      usernames
    );
    expect(summary.avgPerSession?.inputTokens).toBe(3000);
    expect(summary.avgPerTurn?.inputTokens).toBe(2000);
    expect(summary.avgPerTurn?.outputTokens).toBe(200);
  });

  it("breaks tokens down by step and model", () => {
    const summary = computeLlmCost(
      [
        delivered("a", "2026-09-01T10:00:00Z", [relevance(500, 5), chat(1000, 100)]),
        delivered("a", "2026-09-01T10:01:00Z", [relevance(500, 5), chat(1000, 100, "gemini-3.7-flash")]),
      ],
      usernames
    );
    expect(summary.byStep.map((r) => [r.step, r.model, r.calls, r.inputTokens])).toEqual(
      expect.arrayContaining([
        ["relevance", "gemini-2.5-flash", 2, 1000],
        ["chat", "gemini-3.8-flash", 1, 1000],
        ["chat", "gemini-3.7-flash", 1, 1000],
      ])
    );
  });

  it("reports the model of the latest turn as current, and turn counts per chat model", () => {
    const summary = computeLlmCost(
      [
        delivered("a", "2026-09-01T10:00:00Z", [chat(1, 1, "gemini-3.7-flash")], { model: "gemini-3.7-flash" }),
        delivered("a", "2026-09-02T10:00:00Z", [chat(1, 1)], { model: "gemini-3.8-flash" }),
        delivered("a", "2026-09-01T12:00:00Z", [chat(1, 1)], { model: "gemini-3.8-flash" }),
      ],
      usernames
    );
    expect(summary.currentModel).toBe("gemini-3.8-flash");
    expect(summary.modelTurns).toEqual([
      { model: "gemini-3.8-flash", turns: 2 },
      { model: "gemini-3.7-flash", turns: 1 },
    ]);
  });

  it("counts turns logged before token tracking existed instead of pricing them as zero", () => {
    const summary = computeLlmCost(
      [
        delivered("a", "2026-09-01T10:00:00Z", undefined),
        delivered("a", "2026-09-01T10:01:00Z", [chat(1000, 100)]),
      ],
      usernames
    );
    expect(summary.untrackedTurns).toBe(1);
    expect(summary.trackedTurns).toBe(1);
    expect(summary.sessions[0].turns).toBe(1);
  });

  it("leaves models with no known price out of the cost and lists them", () => {
    const summary = computeLlmCost(
      [delivered("a", "2026-09-01T10:00:00Z", [chat(1000, 100, "gemini-9-ultra")])],
      usernames
    );
    expect(summary.totals.inputTokens).toBe(1000);
    expect(summary.totals.costUsd).toBe(0);
    expect(summary.unpricedModels).toEqual(["gemini-9-ultra"]);
  });

  it("ignores malformed usage entries and other event types", () => {
    const summary = computeLlmCost(
      [
        delivered("a", "2026-09-01T10:00:00Z", [{ step: "chat" }, "junk", chat(1000, 100)]),
        { id: "x", eventName: "query_sent", payload: { llm_usage: [chat(9, 9)] }, createdAt: ts("2026-09-01T10:00:00Z") },
      ],
      usernames
    );
    expect(summary.totals.inputTokens).toBe(1000);
    expect(summary.trackedTurns).toBe(1);
  });

  it("returns null averages when nothing was tracked", () => {
    const summary = computeLlmCost([], usernames);
    expect(summary.avgPerSession).toBeNull();
    expect(summary.avgPerTurn).toBeNull();
    expect(summary.currentModel).toBeNull();
  });
});
