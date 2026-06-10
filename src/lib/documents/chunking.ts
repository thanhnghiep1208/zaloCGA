export type TextChunk = {
  text: string;
  chunkIndex: number;
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

export function chunkText(text: string): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= CHUNK_TARGET_CHARS) {
    return [{ text: trimmed, chunkIndex: 0 }];
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
      chunks.push({ text: chunk, chunkIndex: idx++ });
    }

    if (splitAt >= trimmed.length) break;
    pos = Math.max(pos + 1, splitAt - CHUNK_OVERLAP_CHARS);
  }

  return chunks;
}
