import { GoogleGenAI } from "@google/genai";
import { GEMINI_CHAT_MODEL_FALLBACKS } from "@/lib/gemini-models";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Cheapest model to spend on rewrite — the last entry in the fallback chain
 * (oldest/stablest Flash tier), so we don't burn the primary model's quota
 * on a step that only needs to reformulate a short query. See PRD M2 (FR#11).
 */
const REWRITE_MODEL =
  GEMINI_CHAT_MODEL_FALLBACKS[GEMINI_CHAT_MODEL_FALLBACKS.length - 1];

const REWRITE_TIMEOUT_MS = 4000;

export type QueryRewriteIntent = "guideline" | "microcopy";

export type QueryRewriteResult = {
  rewriteQuery: string;
  intent: QueryRewriteIntent | null;
  /** false when the LLM call was skipped/failed/timed out and `rewriteQuery` is just the original query — callers should fall back to their own context-building instead of trusting it as a real rewrite. */
  ok: boolean;
};

type ConversationTurn = { role: "user" | "assistant"; content: string };

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error("GEMINI_API_KEY is missing on server runtime.");
    _ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1beta" } });
  }
  return _ai;
}

function buildPrompt(query: string, history: ConversationTurn[]): string {
  const historyText = history
    .slice(-4)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  return `Bạn nhận một đoạn hội thoại và câu hỏi mới nhất của user. Nhiệm vụ: viết lại câu hỏi mới nhất thành một câu ĐỘC LẬP, đầy đủ ngữ cảnh (không cần đọc lịch sử vẫn hiểu), để dùng cho tìm kiếm tài liệu nội bộ. Đồng thời phân loại ý định câu hỏi.

Lịch sử hội thoại gần nhất:
${historyText || "(không có)"}

Câu hỏi mới nhất: "${query}"

Trả lời DUY NHẤT một JSON object, không markdown, không giải thích thêm, đúng format:
{"rewrite_query": "<câu hỏi độc lập, đầy đủ ngữ cảnh>", "intent": "guideline" | "microcopy"}

- "guideline": câu hỏi tra cứu quy tắc/thuật ngữ/glossary chung.
- "microcopy": câu hỏi cần soạn/chỉnh chữ cho một UI cụ thể (nút, toast, dialog, v.v.).
- Nếu câu hỏi mới nhất đã đầy đủ ngữ cảnh (không phụ thuộc lịch sử), giữ nguyên gần như câu gốc trong "rewrite_query".`;
}

function parseRewriteResponse(raw: string): Omit<QueryRewriteResult, "ok"> | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned) as { rewrite_query?: unknown; intent?: unknown };
    const rewriteQuery =
      typeof parsed.rewrite_query === "string" && parsed.rewrite_query.trim()
        ? parsed.rewrite_query.trim()
        : null;
    if (!rewriteQuery) return null;
    const intent = parsed.intent === "guideline" || parsed.intent === "microcopy" ? parsed.intent : null;
    return { rewriteQuery, intent };
  } catch {
    return null;
  }
}

/**
 * Rewrite a follow-up query into a context-independent one for retrieval, and
 * classify its intent — only worth calling once there is conversation history.
 * Always falls back to the original query on any failure/timeout (never throws);
 * check `ok` to tell a real rewrite apart from a fallback.
 */
export async function rewriteQuery(
  query: string,
  history: ConversationTurn[],
  timeoutMs: number = REWRITE_TIMEOUT_MS
): Promise<QueryRewriteResult> {
  const fallback: QueryRewriteResult = { rewriteQuery: query, intent: null, ok: false };
  if (history.length === 0) return fallback;

  try {
    const ai = getAi();
    const response = await withTimeout(
      ai.models.generateContent({
        model: REWRITE_MODEL,
        contents: [{ role: "user", parts: [{ text: buildPrompt(query, history) }] }],
        config: { responseMimeType: "application/json", temperature: 0 },
      }),
      timeoutMs
    );
    const text = response.text;
    if (!text) return fallback;
    const parsed = parseRewriteResponse(text);
    return parsed ? { ...parsed, ok: true } : fallback;
  } catch (e) {
    console.warn(
      `[QueryRewrite] Falling back to original query: ${e instanceof Error ? e.message : e}`
    );
    return fallback;
  }
}

/** Picks the query to search with and the analytics query type from a rewrite result. */
export function resolveRetrievalQuery(
  rewritten: QueryRewriteResult,
  naiveRetrievalQuery: string,
  fallbackIntent: QueryRewriteIntent
): { retrievalQuery: string; queryType: QueryRewriteIntent } {
  if (!rewritten.ok) return { retrievalQuery: naiveRetrievalQuery, queryType: fallbackIntent };
  return {
    retrievalQuery: rewritten.rewriteQuery,
    queryType: rewritten.intent ?? fallbackIntent,
  };
}
