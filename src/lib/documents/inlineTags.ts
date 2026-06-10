/** Normalize tag list from JSON body (inline create/update). */
export function cleanInlineTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}
