#!/usr/bin/env node
/**
 * Set a new password for an internal account (e.g. an admin who cannot use
 * /admin/users on their own row, and has no real mailbox for Firebase's reset email).
 *
 *   node scripts/set-password.mjs <username>
 *
 * Prompts for the new password (hidden). Reads FIREBASE_SERVICE_ACCOUNT_KEY and
 * INTERNAL_AUTH_EMAIL_DOMAIN (default accounts.internal) from .env.local. Revokes all existing sessions afterwards.
 */

import { createInterface } from "node:readline";
import { loadEnv } from "./lib/runtime.mjs";

const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_INTERNAL_AUTH_EMAIL_DOMAIN = "accounts.internal";

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error("Usage: node scripts/set-password.mjs <username>");
  process.exit(1);
}

const env = loadEnv();
const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
const domain = (
  env.INTERNAL_AUTH_EMAIL_DOMAIN?.trim() ||
  env.NEXT_PUBLIC_INTERNAL_AUTH_EMAIL_DOMAIN?.trim() ||
  DEFAULT_INTERNAL_AUTH_EMAIL_DOMAIN
).toLowerCase();
if (!serviceAccount) {
  console.error("❌  FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local");
  process.exit(1);
}

const { initializeApp, cert } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
initializeApp({ credential: cert(JSON.parse(serviceAccount)) });

const email = `${username}@${domain}`;
const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`❌  No auth user with email ${email}`);
  process.exit(1);
}

const password = await promptHidden(`New password for ${email}: `);
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`❌  Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  process.exit(1);
}
const confirm = await promptHidden("Confirm new password: ");
if (confirm !== password) {
  console.error("❌  Passwords do not match");
  process.exit(1);
}

await getAuth().updateUser(user.uid, { password });

// Same remote sign-out as PATCH /api/admin/users/[uid] after a password reset.
const db = getFirestore();
const sessions = await db.collection("authSessions").where("userId", "==", user.uid).get();
if (!sessions.empty) {
  const batch = db.batch();
  for (const doc of sessions.docs) {
    batch.update(doc.ref, { revoked: true, revokedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}

console.log(`✅  Password updated for ${email} (${sessions.size} session(s) revoked)`);
