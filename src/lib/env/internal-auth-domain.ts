/** Default synthetic email domain for username → Firebase Auth email mapping. */
export const DEFAULT_INTERNAL_AUTH_EMAIL_DOMAIN = "accounts.internal";

export class EnvConfigError extends Error {
  readonly name = "EnvConfigError";
}

function normalizeDomainInput(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

/** Validates a single domain string (no `@`, non-empty after trim). */
export function parseInternalAuthEmailDomain(
  raw: string | undefined,
  sourceLabel: string
): string {
  const domain = normalizeDomainInput(raw) ?? DEFAULT_INTERNAL_AUTH_EMAIL_DOMAIN;
  if (!domain || domain.includes("@")) {
    throw new EnvConfigError(
      `Invalid ${sourceLabel}: use a domain only (e.g. accounts.internal), not an email address`
    );
  }
  return domain;
}

export type InternalAuthDomainPair = {
  public?: string;
  internal?: string;
};

/**
 * Resolves the internal auth email domain from NEXT_PUBLIC_* and server-only vars.
 * When both are set, they must match exactly (after trim + lowercase).
 */
export function resolveInternalAuthEmailDomain(
  pair: InternalAuthDomainPair,
  options?: { requirePairMatch?: boolean }
): string {
  const requirePairMatch = options?.requirePairMatch ?? true;
  const pub = normalizeDomainInput(pair.public);
  const internal = normalizeDomainInput(pair.internal);

  if (requirePairMatch && pub && internal && pub !== internal) {
    throw new EnvConfigError(
      "INTERNAL_AUTH_EMAIL_DOMAIN and NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN must be the same value. " +
        `Got server="${internal}" vs public="${pub}". Set both to one domain (e.g. accounts.internal).`
    );
  }

  const chosen = pub ?? internal;
  return parseInternalAuthEmailDomain(
    chosen,
    pub
      ? "NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN"
      : internal
        ? "INTERNAL_AUTH_EMAIL_DOMAIN"
        : "INTERNAL_AUTH_EMAIL_DOMAIN"
  );
}
