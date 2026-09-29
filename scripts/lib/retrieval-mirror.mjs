// JS mirror of the app's retrieval logic for standalone .mjs scripts, which
// can't import the TS modules without a bundler. Every export here has a TS
// twin; src/lib/retrieval/eval/mirror-drift.test.ts feeds both the same inputs
// and fails on any divergence — change both sides together.
//
//   extractQueryTerms, countTermHits  → src/lib/retrieval/queryTerms.ts
//   buildBudgetedExcerpt,
//   rankDocumentsForQuery              → src/lib/retrieval/excerptBudget.ts
//   dedupeByContentHash,
//   mergeAdjacentChunksByDoc           → src/lib/retrieval/chunkMerge.ts
//   computeRRFScore, fuseSnippetsByDoc → src/lib/retrieval/rrf.ts
//   buildRelevancePrompt,
//   applyRelevanceResponse             → src/lib/retrieval/llm-relevance-check.ts
//   recallAtK, reciprocalRank          → src/lib/retrieval/eval/metrics.ts

// ─── queryTerms.ts ──────────────────────────────────────────────────────────

const STOP = new Set([
  "và", "của", "cho", "với", "là", "có", "được", "trong", "một", "các", "như", "này", "đó",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on",
  "for", "and", "or", "not", "no", "yes", "as", "at", "by", "it", "its", "if", "then", "else",
]);

function normalizeToken(t) {
  return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function extractQueryTerms(query) {
  const raw = query
    .split(/[\s,.;:!?()[\]{}'"\/\\]+/u)
    .map((s) => s.trim().toLowerCase().normalize("NFC"))
    .filter((t) => !STOP.has(t))
    .map(normalizeToken)
    .filter((t) => t.length >= 2);
  return Array.from(new Set(raw));
}

export function countTermHits(haystackLower, terms) {
  if (terms.length === 0) return 0;
  let hits = 0;
  for (const t of terms) {
    if (!t) continue;
    let idx = 0;
    while (idx < haystackLower.length) {
      const found = haystackLower.indexOf(t, idx);
      if (found === -1) break;
      hits += 1;
      idx = found + t.length;
    }
  }
  return hits;
}

// ─── excerptBudget.ts ───────────────────────────────────────────────────────

function normalizeForSearch(text) {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function clampWindowToNaturalBoundary(text, start, end, lookaround = 120) {
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
  const rightBoundary = rightBoundaryCandidates.length > 0 ? Math.min(...rightBoundaryCandidates) : -1;

  const adjustedStart = leftBoundary >= 0 ? safeStart - (left.length - leftBoundary) : safeStart;
  const adjustedEnd = rightBoundary >= 0 ? safeEnd + rightBoundary + 1 : safeEnd;

  return { start: Math.max(0, adjustedStart), end: Math.min(text.length, adjustedEnd) };
}

export function buildBudgetedExcerpt(fullText, query, maxChars) {
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
  const windows = [];

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

  const picked = [];
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

  if (picked.length === 0) return trimmed.slice(0, maxChars) + "\n\n…";

  picked.sort((a, b) => a.start - b.start);

  let out = "";
  for (const w of picked) {
    if (out) out += "\n\n…\n\n";
    out += w.text;
    if (out.length >= maxChars) break;
  }
  if (out.length > maxChars) out = out.slice(0, maxChars).trimEnd() + "\n\n…";
  return out;
}

function scoreDocument(fileName, text, terms) {
  if (terms.length === 0) return 1;
  const nameLower = normalizeToken(fileName);
  const textLower = normalizeToken(text);
  let score = countTermHits(textLower, terms) + countTermHits(nameLower, terms) * 3;
  if (score === 0) score = 0.01;
  return score;
}

export function rankDocumentsForQuery(docs, query, topK) {
  const terms = extractQueryTerms(query);
  const ranked = docs.map((d) => ({ ...d, score: scoreDocument(d.fileName, d.text, terms) }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(1, topK));
}

// ─── chunkMerge.ts ──────────────────────────────────────────────────────────

function contentSignature(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function dedupeByContentHash(chunks) {
  const seen = new Set();
  const out = [];
  for (const c of chunks) {
    const sig = contentSignature(c.text);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(c);
  }
  return out;
}

export function mergeAdjacentChunksByDoc(chunks, maxPerDoc) {
  const byDoc = new Map();
  for (const c of chunks) {
    const group = byDoc.get(c.docId);
    if (group) group.push(c);
    else byDoc.set(c.docId, [c]);
  }

  const runsByDoc = [];
  for (const [docId, group] of byDoc) {
    const sorted = [...group].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const runs = [];
    let current = [];
    for (const c of sorted) {
      const prev = current[current.length - 1];
      if (!prev || c.chunkIndex - prev.chunkIndex <= 1) {
        current.push(c);
      } else {
        runs.push(current);
        current = [c];
      }
    }
    if (current.length > 0) runs.push(current);

    const scoredRuns = runs.map((run) => ({
      docId,
      fileName: run[0].fileName,
      text: run.map((r) => r.text).join("\n\n"),
      bestDistance: Math.min(...run.map((r) => r.distance)),
    }));
    scoredRuns.sort((a, b) => a.bestDistance - b.bestDistance);
    runsByDoc.push(scoredRuns.slice(0, Math.max(1, maxPerDoc)));
  }

  const result = [];
  const maxRounds = Math.max(0, ...runsByDoc.map((r) => r.length));
  for (let round = 0; round < maxRounds; round++) {
    const roundEntries = runsByDoc
      .map((runs) => runs[round])
      .filter((r) => r !== undefined)
      .sort((a, b) => a.bestDistance - b.bestDistance);
    result.push(...roundEntries);
  }
  return result;
}

// ─── rrf.ts ─────────────────────────────────────────────────────────────────

export function computeRRFScore(rankVector, rankLexical, weights) {
  const vectorTerm = rankVector !== undefined ? weights.vector / (weights.k + rankVector + 1) : 0;
  const lexicalTerm = rankLexical !== undefined ? weights.lexical / (weights.k + rankLexical + 1) : 0;
  return vectorTerm + lexicalTerm;
}

function rankByDocId(items) {
  const ranks = new Map();
  items.forEach((item, index) => {
    if (!item.docId || ranks.has(item.docId)) return;
    ranks.set(item.docId, index);
  });
  return ranks;
}

export function fuseSnippetsByDoc(vectorItems, lexicalItems, maxTotal, weights) {
  const vectorRanks = rankByDocId(vectorItems);
  const lexicalRanks = rankByDocId(lexicalItems);

  const docIdsInFirstSeenOrder = [];
  const seen = new Set();
  for (const item of [...vectorItems, ...lexicalItems]) {
    if (!item.docId || seen.has(item.docId)) continue;
    seen.add(item.docId);
    docIdsInFirstSeenOrder.push(item.docId);
  }

  const scored = docIdsInFirstSeenOrder.map((docId, firstSeenIndex) => ({
    docId,
    firstSeenIndex,
    score: computeRRFScore(vectorRanks.get(docId), lexicalRanks.get(docId), weights),
  }));
  scored.sort((a, b) => b.score - a.score || a.firstSeenIndex - b.firstSeenIndex);
  const docOrder = scored.map((s) => s.docId);

  const vectorByDoc = new Map();
  for (const item of vectorItems) {
    if (!item.docId) continue;
    const group = vectorByDoc.get(item.docId);
    if (group) group.push(item);
    else vectorByDoc.set(item.docId, [item]);
  }
  const lexicalByDoc = new Map();
  for (const item of lexicalItems) {
    if (item.docId && !lexicalByDoc.has(item.docId)) lexicalByDoc.set(item.docId, item);
  }
  const availableByDoc = new Map();
  for (const docId of docOrder) {
    availableByDoc.set(docId, vectorByDoc.get(docId) ?? (lexicalByDoc.has(docId) ? [lexicalByDoc.get(docId)] : []));
  }

  const result = [];
  const maxDepth = Math.max(0, ...[...availableByDoc.values()].map((v) => v.length));
  for (let depth = 0; depth < maxDepth && result.length < maxTotal; depth++) {
    for (const docId of docOrder) {
      if (result.length >= maxTotal) break;
      const items = availableByDoc.get(docId);
      if (items && items[depth]) result.push(items[depth]);
    }
  }
  return result.slice(0, maxTotal);
}

// ─── llm-relevance-check.ts ─────────────────────────────────────────────────

const EXCERPT_PREVIEW_CHARS = 2600;

/** GEMINI_CHAT_MODEL_FALLBACKS' last (cheapest) entry, as picked in llm-relevance-check.ts. */
export const RELEVANCE_MODEL = "gemini-2.5-flash";

/** @param {string} query @param {{ fileName: string, excerpt?: string }[]} snippets */
export function buildRelevancePrompt(query, snippets) {
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

function parseIndices(raw, maxLen) {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.relevant_indices)) return null;
    const indices = parsed.relevant_indices.filter(
      (i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < maxLen
    );
    return Array.from(new Set(indices));
  } catch {
    return null;
  }
}

/** What checkRelevance() returns for a given raw model response (fails open on anything unparseable). */
export function applyRelevanceResponse(snippets, rawText) {
  if (!rawText) return snippets;
  const indices = parseIndices(rawText, snippets.length);
  if (indices === null) return snippets;
  return indices.map((i) => snippets[i]);
}

// ─── eval/metrics.ts ────────────────────────────────────────────────────────

export function recallAtK(resultDocIds, expectedDocId, k) {
  return resultDocIds.slice(0, k).includes(expectedDocId) ? 1 : 0;
}

export function reciprocalRank(resultDocIds, expectedDocId) {
  const idx = resultDocIds.indexOf(expectedDocId);
  return idx === -1 ? 0 : 1 / (idx + 1);
}
