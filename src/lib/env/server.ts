import { resolveInternalAuthEmailDomain } from "@/lib/env/internal-auth-domain";

let cachedServerDomain: string | undefined;

/** Server domain with NEXT_PUBLIC_* / INTERNAL_* consistency check. */
export function getServerInternalAuthEmailDomain(): string {
  if (cachedServerDomain === undefined) {
    cachedServerDomain = resolveInternalAuthEmailDomain({
      public: process.env.NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN,
      internal: process.env.INTERNAL_AUTH_EMAIL_DOMAIN,
    });
  }
  return cachedServerDomain;
}

/** Run once at Node startup (instrumentation / server bootstrap). */
export function validateServerEnv(): void {
  getServerInternalAuthEmailDomain();
}
