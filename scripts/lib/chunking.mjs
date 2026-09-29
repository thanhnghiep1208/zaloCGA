// Mirror of src/lib/documents/chunking.ts for standalone .mjs scripts, which
// can't import the app's TS modules without a bundler. Kept in lock-step by
// src/lib/retrieval/eval/mirror-drift.test.ts — change both or that test fails.

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 200;

function findSplitBoundary(text, targetPos) {
  const window = text.slice(targetPos, Math.min(text.length, targetPos + 300));
  const para = window.indexOf("\n\n");
  if (para >= 0 && para < 200) return targetPos + para + 2;
  const nl = window.indexOf("\n");
  if (nl >= 0 && nl < 150) return targetPos + nl + 1;
  for (const sep of [". ", "! ", "? "]) {
    const idx = window.indexOf(sep);
    if (idx >= 0 && idx < 150) return targetPos + idx + sep.length;
  }
  const space = window.indexOf(" ");
  return targetPos + (space >= 0 ? space + 1 : Math.min(100, window.length));
}

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/;

function extractHeadings(text) {
  const headings = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const match = HEADING_LINE.exec(line);
    if (match) headings.push({ index: lineStart, level: match[1].length, title: match[2].trim() });
    lineStart += line.length + 1;
  }
  return headings;
}

function headingPathAt(headings, pos) {
  const stack = [];
  for (const h of headings) {
    if (h.index > pos) break;
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack.length > 0 ? stack.map((h) => h.title).join(" > ") : null;
}

/** @param {string} text @returns {{ text: string, chunkIndex: number, headingPath: string | null }[]} */
export function chunkText(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const headings = extractHeadings(trimmed);
  if (trimmed.length <= CHUNK_TARGET_CHARS) {
    return [{ text: trimmed, chunkIndex: 0, headingPath: headingPathAt(headings, 0) }];
  }
  const chunks = [];
  let pos = 0;
  let idx = 0;
  while (pos < trimmed.length) {
    const targetEnd = Math.min(pos + CHUNK_TARGET_CHARS, trimmed.length);
    const splitAt = targetEnd >= trimmed.length ? targetEnd : findSplitBoundary(trimmed, targetEnd);
    const chunk = trimmed.slice(pos, splitAt).trim();
    if (chunk.length >= 50) {
      chunks.push({ text: chunk, chunkIndex: idx++, headingPath: headingPathAt(headings, pos) });
    }
    if (splitAt >= trimmed.length) break;
    pos = Math.max(pos + 1, splitAt - CHUNK_OVERLAP_CHARS);
  }
  return chunks;
}

/** Embedding input for a chunk — mirrors writeDocumentChunks() in embeddings.ts. */
export function embedInputFor(chunk) {
  return chunk.headingPath ? `[${chunk.headingPath}] ${chunk.text}` : chunk.text;
}
