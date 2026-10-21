import LoginClient from "./LoginClient";
import { getAccountContact } from "@/lib/account-contact-server";

// Login is session-dependent (redirect target, auth state) and must never be
// served stale from the CDN — a year-long default static cache here would mean
// UI fixes to this page don't reach users until the cache happens to expire.
// (Route segment config only takes effect from a Server Component, hence this
// thin wrapper around the actual client-rendered login form.)
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  return <LoginClient contact={await getAccountContact()} />;
}
