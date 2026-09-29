import {
  GEMINI_PRICES_USD_PER_1M,
  GEMINI_PRICING_CHECKED_AT,
  GEMINI_PRICING_SOURCE_URL,
} from "@/lib/gemini-pricing";
import type { LlmStep } from "@/lib/llm-usage";
import type { LlmCostSummary, TokenCost } from "@/lib/reports/compute-llm-cost";

const MAX_SESSION_ROWS = 50;

const STEP_LABELS: Record<LlmStep, string> = {
  chat: "Trả lời (chat)",
  rewrite: "Viết lại câu hỏi",
  relevance: "Kiểm tra liên quan",
};

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  return value.toLocaleString("vi-VN");
}

function formatTime(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleString("vi-VN");
}

function AverageCard({ label, value }: { label: string; value: TokenCost | null }) {
  return (
    <div className="clay-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-light">{value ? formatUsd(value.costUsd) : "—"}</p>
      <p className="text-xs text-muted mt-1">
        {value
          ? `in ${formatTokens(value.inputTokens)} • out ${formatTokens(value.outputTokens)} token`
          : "chưa có dữ liệu token"}
      </p>
    </div>
  );
}

export function LlmCostSection({
  summary,
  chatModels,
}: {
  summary: LlmCostSummary;
  chatModels: string[];
}) {
  const currentModel = summary.currentModel ?? chatModels[0] ?? "—";

  return (
    <section className="space-y-4">
      <h2 className="text-[22px] font-light">Model & chi phí Gemini</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="clay-card p-4">
          <p className="text-xs text-muted">Model đang sử dụng</p>
          <p className="text-lg font-medium break-all">{currentModel}</p>
          <p className="text-xs text-muted mt-1">
            {summary.currentModel ? "model trả lời lượt chat gần nhất" : "model đầu chuỗi cấu hình"}
          </p>
          {summary.modelTurns.length > 0 ? (
            <p className="text-xs text-muted mt-1">
              {summary.modelTurns.map((m) => `${m.model} (${m.turns})`).join(" • ")}
            </p>
          ) : null}
          {chatModels.length > 1 ? (
            <p className="text-xs text-muted mt-1 break-all">Fallback: {chatModels.slice(1).join(" → ")}</p>
          ) : null}
        </div>
        <div className="clay-card p-4">
          <p className="text-xs text-muted">Tổng chi phí (ước tính)</p>
          <p className="text-2xl font-light">{formatUsd(summary.totals.costUsd)}</p>
          <p className="text-xs text-muted mt-1">
            {summary.trackedTurns} lượt • {summary.sessions.length} session
          </p>
        </div>
        <div className="clay-card p-4">
          <p className="text-xs text-muted">Token input / output</p>
          <p className="text-sm mt-1">
            Input: <span className="font-semibold tabular-nums">{formatTokens(summary.totals.inputTokens)}</span>
          </p>
          <p className="text-sm">
            Output: <span className="font-semibold tabular-nums">{formatTokens(summary.totals.outputTokens)}</span>
          </p>
          <p className="text-xs text-muted mt-1">output gồm cả thinking token</p>
        </div>
        <AverageCard label="Trung bình / session" value={summary.avgPerSession} />
        <AverageCard label="Trung bình / lượt chat" value={summary.avgPerTurn} />
      </div>

      <div className="clay-card p-4 overflow-x-auto">
        <p className="text-sm font-medium text-foreground mb-3">Theo bước xử lý</p>
        {summary.byStep.length === 0 ? (
          <p className="text-sm text-muted">Chưa có lượt chat nào ghi token trong khoảng đã chọn.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="pb-2 pr-4 font-medium">Bước</th>
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium text-right">Lần gọi</th>
                <th className="pb-2 pr-4 font-medium text-right">Input</th>
                <th className="pb-2 pr-4 font-medium text-right">Output</th>
                <th className="pb-2 font-medium text-right">Chi phí</th>
              </tr>
            </thead>
            <tbody>
              {summary.byStep.map((row) => (
                <tr key={`${row.step}|${row.model}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4">{STEP_LABELS[row.step] ?? row.step}</td>
                  <td className="py-2 pr-4">{row.model}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.calls}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatTokens(row.inputTokens)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatTokens(row.outputTokens)}</td>
                  <td className="py-2 text-right tabular-nums">{formatUsd(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="clay-card p-4 overflow-x-auto">
        <p className="text-sm font-medium text-foreground mb-1">Chi phí theo session</p>
        <p className="text-xs text-muted mb-3">
          Sắp theo chi phí giảm dần
          {summary.sessions.length > MAX_SESSION_ROWS ? ` — hiện ${MAX_SESSION_ROWS}/${summary.sessions.length}` : ""}.
        </p>
        {summary.sessions.length === 0 ? (
          <p className="text-sm text-muted">Chưa có session nào ghi token trong khoảng đã chọn.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="pb-2 pr-4 font-medium">Session</th>
                <th className="pb-2 pr-4 font-medium">User</th>
                <th className="pb-2 pr-4 font-medium text-right">Lượt</th>
                <th className="pb-2 pr-4 font-medium text-right">Input</th>
                <th className="pb-2 pr-4 font-medium text-right">Output</th>
                <th className="pb-2 pr-4 font-medium text-right">Chi phí</th>
                <th className="pb-2 font-medium text-right">Lần cuối</th>
              </tr>
            </thead>
            <tbody>
              {summary.sessions.slice(0, MAX_SESSION_ROWS).map((row) => (
                <tr key={row.sessionId} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs" title={row.sessionId}>
                    {row.sessionId.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4">{row.username}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.turns}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatTokens(row.inputTokens)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatTokens(row.outputTokens)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatUsd(row.costUsd)}</td>
                  <td className="py-2 text-right text-xs text-muted">{formatTime(row.lastAtMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-muted space-y-1">
        <p>
          Giá Standard paid tier theo{" "}
          <a href={GEMINI_PRICING_SOURCE_URL} target="_blank" rel="noreferrer" className="underline">
            Gemini API pricing
          </a>{" "}
          (kiểm tra {GEMINI_PRICING_CHECKED_AT}), USD / 1M token:{" "}
          {Object.entries(GEMINI_PRICES_USD_PER_1M)
            .map(([model, p]) => `${model} ${p.input}/${p.output}`)
            .join(" • ")}
          . Giá input của gemini-3.8-flash / 3.7-flash là giá ưu đãi đến 31/12/2026.
        </p>
        <p>
          Chỉ tính các lần gọi trong /api/chat (trả lời, viết lại câu hỏi, kiểm tra liên quan). Chưa tính embedding
          query (gemini-embedding-2, $0.20/1M — vài chục token/lượt) và ingest tài liệu.
        </p>
        {summary.untrackedTurns > 0 ? (
          <p>{summary.untrackedTurns} lượt chat ghi trước khi có theo dõi token — không tính vào chi phí.</p>
        ) : null}
        {summary.unpricedModels.length > 0 ? (
          <p>Chưa có giá cho: {summary.unpricedModels.join(", ")} — token vẫn được đếm, chi phí không tính.</p>
        ) : null}
      </div>
    </section>
  );
}
