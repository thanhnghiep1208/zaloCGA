import { estimateCostUsd } from "@/lib/gemini-pricing";
import type { LlmStep, LlmUsage } from "@/lib/llm-usage";
import { timestampToMs } from "@/lib/reports/date-utils";
import type { AnalyticsEvent } from "@/lib/reports/types";

export type TokenCost = {
  inputTokens: number;
  outputTokens: number;
  /** USD, priced models only — see `unpricedModels`. */
  costUsd: number;
};

export type LlmCostSessionRow = TokenCost & {
  sessionId: string;
  username: string;
  turns: number;
  lastAtMs: number | null;
};

export type LlmCostStepRow = TokenCost & {
  step: LlmStep;
  model: string;
  calls: number;
};

export type LlmCostSummary = {
  /** response_delivered events that carry `llm_usage`. */
  trackedTurns: number;
  /** response_delivered events logged before token tracking existed. */
  untrackedTurns: number;
  /** Chat model of the most recent tracked turn. */
  currentModel: string | null;
  modelTurns: { model: string; turns: number }[];
  totals: TokenCost;
  byStep: LlmCostStepRow[];
  sessions: LlmCostSessionRow[];
  avgPerSession: TokenCost | null;
  avgPerTurn: TokenCost | null;
  unpricedModels: string[];
};

const UNKNOWN_SESSION = "—";

function emptyCost(): TokenCost {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function isUsage(value: unknown): value is LlmUsage {
  const u = value as Partial<LlmUsage> | null;
  return (
    !!u &&
    typeof u.step === "string" &&
    typeof u.model === "string" &&
    typeof u.input_tokens === "number" &&
    typeof u.output_tokens === "number"
  );
}

/** Adds one call's tokens to `target`; returns false when the model has no price. */
function addUsage(target: TokenCost, usage: LlmUsage): boolean {
  target.inputTokens += usage.input_tokens;
  target.outputTokens += usage.output_tokens;
  const cost = estimateCostUsd(usage.model, usage.input_tokens, usage.output_tokens);
  if (cost === null) return false;
  target.costUsd += cost;
  return true;
}

function average(total: TokenCost, count: number): TokenCost | null {
  if (count === 0) return null;
  return {
    inputTokens: Math.round(total.inputTokens / count),
    outputTokens: Math.round(total.outputTokens / count),
    costUsd: total.costUsd / count,
  };
}

/** Token usage and estimated Gemini cost from `response_delivered.llm_usage`. */
export function computeLlmCost(
  events: AnalyticsEvent[],
  usernameByUid: Map<string, string>
): LlmCostSummary {
  const totals = emptyCost();
  const sessions = new Map<string, LlmCostSessionRow>();
  const steps = new Map<string, LlmCostStepRow>();
  const modelTurns = new Map<string, number>();
  const unpriced = new Set<string>();
  let trackedTurns = 0;
  let untrackedTurns = 0;
  let latest: { atMs: number; model: string } | null = null;

  for (const event of events) {
    if (event.eventName !== "response_delivered") continue;
    const raw = event.payload.llm_usage;
    if (!Array.isArray(raw)) {
      untrackedTurns += 1;
      continue;
    }
    trackedTurns += 1;

    const atMs = timestampToMs(event.createdAt);
    const sessionId = String(event.payload.session_id || UNKNOWN_SESSION);
    const uid = String(event.payload.user_id || "");
    const session = sessions.get(sessionId) ?? {
      sessionId,
      username: usernameByUid.get(uid) ?? (uid || "—"),
      turns: 0,
      lastAtMs: null,
      ...emptyCost(),
    };
    session.turns += 1;
    if (atMs !== null && (session.lastAtMs === null || atMs > session.lastAtMs)) {
      session.lastAtMs = atMs;
    }
    sessions.set(sessionId, session);

    const chatModel = typeof event.payload.model === "string" ? event.payload.model : null;
    if (chatModel) {
      modelTurns.set(chatModel, (modelTurns.get(chatModel) ?? 0) + 1);
      if (atMs !== null && (!latest || atMs > latest.atMs)) latest = { atMs, model: chatModel };
    }

    for (const usage of raw.filter(isUsage)) {
      const stepKey = `${usage.step}|${usage.model}`;
      const step = steps.get(stepKey) ?? { step: usage.step, model: usage.model, calls: 0, ...emptyCost() };
      step.calls += 1;
      steps.set(stepKey, step);

      addUsage(totals, usage);
      addUsage(session, usage);
      if (!addUsage(step, usage)) unpriced.add(usage.model);
    }
  }

  const sessionRows = [...sessions.values()].sort((a, b) => b.costUsd - a.costUsd);

  return {
    trackedTurns,
    untrackedTurns,
    currentModel: latest?.model ?? null,
    modelTurns: [...modelTurns.entries()]
      .map(([model, turns]) => ({ model, turns }))
      .sort((a, b) => b.turns - a.turns),
    totals,
    byStep: [...steps.values()].sort((a, b) => b.costUsd - a.costUsd),
    sessions: sessionRows,
    avgPerSession: average(totals, sessionRows.length),
    avgPerTurn: average(totals, trackedTurns),
    unpricedModels: [...unpriced],
  };
}
