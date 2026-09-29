import { GoogleGenAI } from "@google/genai";
import { GEMINI_CHAT_MODEL_FALLBACKS } from "@/lib/gemini-models";
import { withTimeout } from "@/lib/with-timeout";
import type { RetrievedSnippet } from "./interfaces";

/**
 * LLM-based relevance check + rerank — replaces the numeric-threshold approach
 * for "not found" detection (PRD M4, FR#21/22). A calibration pass (see
 * scripts/calibrate-not-found-threshold.mjs, docs in eval/BASELINE.md) found no
 * vector-distance or lexical-score cutoff that separates on-topic from
 * off-topic queries on this corpus — the ranges fully overlap. An LLM judging
 * actual relevance is the only approach the data supports.
 */

const RELEVANCE_MODEL = GEMINI_CHAT_MODEL_FALLBACKS[GEMINI_CHAT_MODEL_FALLBACKS.length - 1];
const RELEVANCE_TIMEOUT_MS = 4000;
// Snippets are already budgeted to MAX_CHARS_PER_SNIPPET (2600, see
// FirebaseRetrievalProvider.ts) by buildBudgetedExcerpt(), which already picks
// the windows most relevant to the query. Truncating further here (an earlier
// version cut to 400 chars) throws that work away and cuts off the actual
// answer for any chunk/merged-run longer than ~400 chars — verified directly:
// e.g. Card.pdf's states info sits at character 1056 of its chunk. Match that
// budget instead of re-truncating.
const EXCERPT_PREVIEW_CHARS = 2600;

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error("GEMINI_API_KEY is missing on server runtime.");
    _ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1beta" } });
  }
  return _ai;
}

function buildPrompt(query: string, snippets: RetrievedSnippet[]): string {
  const list = snippets
    .map((s, i) => `[${i}] Tài liệu: ${s.fileName}\n${(s.excerpt ?? "").slice(0, EXCERPT_PREVIEW_CHARS)}`)
    .join("\n\n");

  return `Bạn nhận một câu hỏi và danh sách đoạn trích ứng viên từ kho tài liệu nội bộ (có thể không liên quan gì đến câu hỏi). Nhiệm vụ: xác định đoạn nào THỰC SỰ giúp trả lời câu hỏi, sắp xếp theo mức độ liên quan giảm dần.

Câu hỏi: "${query}"

Danh sách ứng viên:
${list}

Trả lời DUY NHẤT một JSON object, không markdown, không giải thích thêm:
{"relevant_indices": [0-based index, đã sắp theo độ liên quan giảm dần]}

- Chỉ giữ lại index của đoạn THỰC SỰ giúp trả lời câu hỏi — bỏ hẳn đoạn không liên quan, kể cả khi nó nhắc tới từ khoá trùng tình cờ.
- Nếu KHÔNG đoạn nào giúp trả lời được câu hỏi (câu hỏi ngoài phạm vi kho tài liệu), trả về mảng rỗng: {"relevant_indices": []}.`;
}

function parseIndices(raw: string, maxLen: number): number[] | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned) as { relevant_indices?: unknown };
    if (!Array.isArray(parsed.relevant_indices)) return null;
    const indices = parsed.relevant_indices.filter(
      (i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < maxLen
    );
    return Array.from(new Set(indices));
  } catch {
    return null;
  }
}

/**
 * Judge which candidate snippets are actually relevant to the query, reordered
 * by relevance. Returns the ORIGINAL, unfiltered list on any error/timeout —
 * fails open, so an LLM hiccup degrades to "M3 behavior" rather than wrongly
 * telling the user nothing was found.
 */
export async function checkRelevance(
  query: string,
  snippets: RetrievedSnippet[],
  timeoutMs: number = RELEVANCE_TIMEOUT_MS
): Promise<RetrievedSnippet[]> {
  if (snippets.length === 0) return snippets;

  try {
    const ai = getAi();
    const response = await withTimeout(
      ai.models.generateContent({
        model: RELEVANCE_MODEL,
        contents: [{ role: "user", parts: [{ text: buildPrompt(query, snippets) }] }],
        config: { responseMimeType: "application/json", temperature: 0 },
      }),
      timeoutMs
    );
    const text = response.text;
    if (!text) return snippets;
    const indices = parseIndices(text, snippets.length);
    if (indices === null) return snippets;
    return indices.map((i) => snippets[i]);
  } catch (e) {
    console.warn(
      `[RelevanceCheck] Falling back to unfiltered snippets: ${e instanceof Error ? e.message : e}`
    );
    return snippets;
  }
}
