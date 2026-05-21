#!/usr/bin/env node
/**
 * Pre-deploy check: fails if INTERNAL_AUTH_EMAIL_DOMAIN pair is mismatched.
 * Usage: node scripts/validate-env.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function normalize(raw) {
  const t = raw?.trim();
  return t ? t.toLowerCase() : undefined;
}

const root = resolve(import.meta.dirname, "..");
const env = {
  ...loadDotEnv(resolve(root, ".env")),
  ...loadDotEnv(resolve(root, ".env.local")),
  ...process.env,
};

const pub = normalize(env.NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN);
const internal = normalize(env.INTERNAL_AUTH_EMAIL_DOMAIN);

if (pub && internal && pub !== internal) {
  console.error(
    "[validate-env] Mismatch: NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN and INTERNAL_AUTH_EMAIL_DOMAIN must match.\n" +
      `  public=${pub}\n  internal=${internal}`
  );
  process.exit(1);
}

if (pub && pub.includes("@")) {
  console.error("[validate-env] NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN must be a domain only.");
  process.exit(1);
}

if (internal && internal.includes("@")) {
  console.error("[validate-env] INTERNAL_AUTH_EMAIL_DOMAIN must be a domain only.");
  process.exit(1);
}

console.log(
  "[validate-env] OK" +
    (pub || internal ? ` (domain=${pub ?? internal})` : " (using default accounts.internal)")
);
