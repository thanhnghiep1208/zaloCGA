/** Username rules for admin-provisioned accounts (mapped to synthetic Firebase emails). */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

const DEFAULT_INTERNAL_AUTH_EMAIL_DOMAIN = "accounts.internal";

export function getInternalAuthEmailDomain(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN ||
        process.env.INTERNAL_AUTH_EMAIL_DOMAIN
      : undefined;
  const domain = (fromEnv ?? DEFAULT_INTERNAL_AUTH_EMAIL_DOMAIN).trim().toLowerCase();
  if (!domain || domain.includes("@")) {
    throw new Error(
      "Invalid INTERNAL_AUTH_EMAIL_DOMAIN: use a domain only (e.g. accounts.internal)"
    );
  }
  return domain;
}

/** Lowercase, trimmed username for storage and login. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  const n = normalizeUsername(username);
  return (
    n.length >= USERNAME_MIN_LENGTH &&
    n.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(n)
  );
}

/** Maps username to Firebase Auth email (Email/Password provider). */
export function usernameToAuthEmail(username: string): string {
  const n = normalizeUsername(username);
  if (!isValidUsername(n)) {
    throw new Error("Invalid username format");
  }
  return `${n}@${getInternalAuthEmailDomain()}`;
}

export function authEmailToUsername(email: string | null | undefined): string | null {
  if (!email) return null;
  const domain = `@${getInternalAuthEmailDomain()}`;
  const lower = email.trim().toLowerCase();
  if (!lower.endsWith(domain)) return null;
  const local = lower.slice(0, -domain.length);
  return local.length > 0 ? local : null;
}

export const MIN_PASSWORD_LENGTH = 8;

export function isValidProvisionedPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
