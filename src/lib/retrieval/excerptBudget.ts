import { countTermHits, extractQueryTerms } from "./queryTerms";

export type DocForRanking = {
  id: string;
  fileName: string;
  text: string;
};

type RankedDoc = DocForRanking & { score: number };

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Split long documents into scored windows; keep windows whose lexical overlap with the query is highest,
 * then reorder by original position for readable excerpts.
 */
export function buildBudgetedExcerpt(
  fullText: string,
  query: string,
  maxChars: number
): string {
  const trimmed = fullText.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;

  const terms = extractQueryTerms(query);
  const lower = normalizeForSearch(trimmed);
  if (terms.length === 0) {
    return trimmed.slice(0, maxChars) + (trimmed.length > maxChars ? "\n\n…" : "");
  }

  if (countTermHits(lower, terms) === 0) {
    return trimmed.slice(0, maxChars) + (trimmed.length > maxChars ? "\n\n…" : "");
  }

  const windowSize = Math.min(1200, Math.max(400, Math.floor(maxChars / 3)));
  const step = Math.floor(windowSize * 0.55);

  type Window = { start: number; score: number; text: string };
  const windows: Window[] = [];

  for (let start = 0; start < trimmed.length; start += step) {
    const end = Math.min(trimmed.length, start + windowSize);
    const slice = trimmed.slice(start, end);
    const sliceLower = lower.slice(start, end);
    const score = countTermHits(sliceLower, terms);
    windows.push({ start, score, text: slice });
    if (end >= trimmed.length) break;
  }

  windows.sort((a, b) => b.score - a.score || a.start - b.start);

  const picked: Window[] = [];
  let used = 0;
  const overlapBudget = 120;

  for (const w of windows) {
    if (w.score === 0 && picked.length > 0) break;
    const overlaps = picked.some(
      (p) => Math.abs(p.start - w.start) < overlapBudget && p.text === w.text
    );
    if (overlaps) continue;

    const sep = picked.length > 0 ? "\n\n…\n\n" : "";
    const projected = used + sep.length + w.text.length;
    if (projected > maxChars + 400 && picked.length > 0) break;
    picked.push(w);
    used = projected;
    if (used >= maxChars) break;
  }

  if (picked.length === 0) {
    return trimmed.slice(0, maxChars) + "\n\n…";
  }

  picked.sort((a, b) => a.start - b.start);

  let out = "";
  for (const w of picked) {
    if (out) out += "\n\n…\n\n";
    out += w.text;
    if (out.length >= maxChars) break;
  }

  if (out.length > maxChars) {
    out = out.slice(0, maxChars).trimEnd() + "\n\n…";
  }

  return out;
}

function scoreDocument(fileName: string, text: string, terms: string[]): number {
  if (terms.length === 0) return 1;
  const nameLower = normalizeForSearch(fileName);
  const textLower = normalizeForSearch(text);
  let score = countTermHits(textLower, terms) + countTermHits(nameLower, terms) * 3;
  if (score === 0) score = 0.01;
  return score;
}

/**
 * Rank corpus by simple lexical overlap; caller passes already-fetched docs (same Firestore read cost as before).
 */
export function rankDocumentsForQuery(
  docs: DocForRanking[],
  query: string,
  topK: number
): RankedDoc[] {
  const terms = extractQueryTerms(query);
  const ranked: RankedDoc[] = docs.map((d) => ({
    ...d,
    score: scoreDocument(d.fileName, d.text, terms),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(1, topK));
}
