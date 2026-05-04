/** Minimal stopwords for cheap lexical scoring (VI + EN). */
const STOP = new Set([
  "và", "của", "cho", "với", "là", "có", "được", "trong", "một", "các", "như", "này", "đó",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on",
  "for", "and", "or", "not", "no", "yes", "as", "at", "by", "it", "its", "if", "then", "else",
]);

function normalizeToken(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Terms used for overlap scoring between query and document text.
 */
export function extractQueryTerms(query: string): string[] {
  const raw = query
    .split(/[\s,.;:!?()[\]{}'"\/\\]+/u)
    .map((s) => normalizeToken(s.trim()))
    .filter((t) => t.length >= 2 && !STOP.has(t));

  return Array.from(new Set(raw));
}

export function countTermHits(haystackLower: string, terms: string[]): number {
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
