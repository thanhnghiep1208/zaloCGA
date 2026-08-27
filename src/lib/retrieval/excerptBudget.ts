import { countTermHits, extractQueryTerms } from "./queryTerms";

export type DocForRanking = {
  id: string;
  fileName: string;
  text: string;
};

type RankedDoc<T extends DocForRanking = DocForRanking> = T & { score: number };

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function clampWindowToNaturalBoundary(
  text: string,
  start: number,
  end: number,
  lookaround: number = 120
): { start: number; end: number } {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(text.length, end);
  if (safeStart >= safeEnd) return { start: safeStart, end: safeEnd };

  const left = text.slice(Math.max(0, safeStart - lookaround), safeStart);
  const right = text.slice(safeEnd, Math.min(text.length, safeEnd + lookaround));

  const leftBoundary = Math.max(
    left.lastIndexOf("\n\n"),
    left.lastIndexOf(". "),
    left.lastIndexOf("! "),
    left.lastIndexOf("? ")
  );
  const rightBoundaryCandidates = [
    right.indexOf("\n\n"),
    right.indexOf(". "),
    right.indexOf("! "),
    right.indexOf("? "),
  ].filter((v) => v >= 0);
  const rightBoundary =
    rightBoundaryCandidates.length > 0 ? Math.min(...rightBoundaryCandidates) : -1;

  const adjustedStart =
    leftBoundary >= 0 ? safeStart - (left.length - leftBoundary) : safeStart;
  const adjustedEnd = rightBoundary >= 0 ? safeEnd + rightBoundary + 1 : safeEnd;

  return {
    start: Math.max(0, adjustedStart),
    end: Math.min(text.length, adjustedEnd),
  };
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

  const windowSize = Math.min(1400, Math.max(500, Math.floor(maxChars * 0.42)));
  const step = Math.max(220, Math.floor(windowSize * 0.5));

  type Window = { start: number; end: number; score: number; text: string };
  const windows: Window[] = [];

  for (let start = 0; start < trimmed.length; start += step) {
    const end = Math.min(trimmed.length, start + windowSize);
    const bounded = clampWindowToNaturalBoundary(trimmed, start, end);
    const slice = trimmed.slice(bounded.start, bounded.end);
    const sliceLower = lower.slice(bounded.start, bounded.end);
    const score = countTermHits(sliceLower, terms);
    windows.push({ start: bounded.start, end: bounded.end, score, text: slice });
    if (end >= trimmed.length) break;
  }

  windows.sort((a, b) => b.score - a.score || a.start - b.start);

  const picked: Window[] = [];
  let used = 0;

  for (const w of windows) {
    if (w.score === 0 && picked.length > 0) break;
    const overlaps = picked.some((p) => {
      const intersect = Math.max(0, Math.min(p.end, w.end) - Math.max(p.start, w.start));
      const minLen = Math.max(1, Math.min(p.end - p.start, w.end - w.start));
      return intersect / minLen > 0.6;
    });
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
export function rankDocumentsForQuery<T extends DocForRanking>(
  docs: T[],
  query: string,
  topK: number
): RankedDoc<T>[] {
  const terms = extractQueryTerms(query);
  const ranked: RankedDoc<T>[] = docs.map((d) => ({
    ...d,
    score: scoreDocument(d.fileName, d.text, terms),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(1, topK));
}
