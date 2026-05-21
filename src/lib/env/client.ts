import { resolveInternalAuthEmailDomain } from "@/lib/env/internal-auth-domain";

let cachedClientDomain: string | undefined;

/** Client-safe domain (NEXT_PUBLIC_* only; no server-only env). */
export function getClientInternalAuthEmailDomain(): string {
  if (cachedClientDomain === undefined) {
    cachedClientDomain = resolveInternalAuthEmailDomain(
      { public: process.env.NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN },
      { requirePairMatch: false }
    );
  }
  return cachedClientDomain;
}
