/** Stable unique ids for React keys and Firestore message rows (avoid Date.now collisions). */
export function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Short label for attachment chip (full name in title tooltip). */
export function shortImageTitle(name: string, max = 22): string {
  const n = name.trim();
  if (n.length <= max) return n;
  const ext = n.includes(".") ? n.slice(n.lastIndexOf(".")) : "";
  const base = ext ? n.slice(0, n.length - ext.length) : n;
  const budget = max - 1 - ext.length;
  if (budget < 6) return `${n.slice(0, max - 1)}…`;
  return `${base.slice(0, Math.ceil(budget / 2))}…${base.slice(-Math.floor(budget / 2))}${ext}`;
}
