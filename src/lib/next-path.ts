// `next` is attacker-controllable (anyone can craft /login?next=...): only
// accept an internal, single-slash path so it can never send a signed-in
// user off-site (open redirect).
export function sanitizeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/chat";
  }
  return value;
}
