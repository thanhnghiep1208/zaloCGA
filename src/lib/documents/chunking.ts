export type TextChunk = {
  text: string;
  chunkIndex: number;
  /** Markdown heading path active at this chunk's start position (e.g. "Snackbar > Behavior"), or null if the document has no heading structure. */
  headingPath: string | null;
};

// ~550 tokens for Vietnamese (4-5 chars/word × 2.5 chars/token)
const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 200;

function findSplitBoundary(text: string, targetPos: number): number {
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

type Heading = { index: number; level: number; title: string };

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/;

/** Markdown `#`/`##`/... headings found in `text`, in document order. */
function extractHeadings(text: string): Heading[] {
  const headings: Heading[] = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const match = HEADING_LINE.exec(line);
    if (match) {
      headings.push({ index: lineStart, level: match[1].length, title: match[2].trim() });
    }
    lineStart += line.length + 1; // +1 for the '\n' split away
  }
  return headings;
}

/**
 * Heading path active at `pos` — the nested chain of headings (by document
 * order, respecting level nesting) that precede this position. Returns null
 * when the document has no headings at or before `pos` (plain-text docs, or a
 * chunk that starts before any heading).
 */
function headingPathAt(headings: Heading[], pos: number): string | null {
  const stack: Heading[] = [];
  for (const h of headings) {
    if (h.index > pos) break;
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack.length > 0 ? stack.map((h) => h.title).join(" > ") : null;
}

export function chunkText(text: string): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const headings = extractHeadings(trimmed);

  if (trimmed.length <= CHUNK_TARGET_CHARS) {
    return [{ text: trimmed, chunkIndex: 0, headingPath: headingPathAt(headings, 0) }];
  }

  const chunks: TextChunk[] = [];
  let pos = 0;
  let idx = 0;

  while (pos < trimmed.length) {
    const targetEnd = Math.min(pos + CHUNK_TARGET_CHARS, trimmed.length);
    const splitAt =
      targetEnd >= trimmed.length
        ? targetEnd
        : findSplitBoundary(trimmed, targetEnd);

    const chunk = trimmed.slice(pos, splitAt).trim();
    if (chunk.length >= 50) {
      chunks.push({ text: chunk, chunkIndex: idx++, headingPath: headingPathAt(headings, pos) });
    }

    if (splitAt >= trimmed.length) break;
    pos = Math.max(pos + 1, splitAt - CHUNK_OVERLAP_CHARS);
  }

  return chunks;
}
