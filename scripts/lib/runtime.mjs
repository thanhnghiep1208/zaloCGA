// Shared env loading + Firebase/Gemini setup for the retrieval scripts.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Handles single/double-quoted values that span lines (the service-account JSON).
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const content = readFileSync(filePath, "utf8");
  let i = 0;
  while (i < content.length) {
    const lineEnd = content.indexOf("\n", i);
    const line = lineEnd === -1 ? content.slice(i) : content.slice(i, lineEnd);
    const nextLine = lineEnd === -1 ? content.length : lineEnd + 1;
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || eq === -1) {
      i = nextLine;
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const afterEq = trimmed.slice(eq + 1);
    const quoteChar = afterEq[0] === "'" ? "'" : afterEq[0] === '"' ? '"' : null;
    if (!quoteChar) {
      out[key] = afterEq.trim();
      i = nextLine;
      continue;
    }
    const openPos = content.indexOf(quoteChar, content.indexOf("=", i) + 1);
    if (openPos === -1) {
      i = nextLine;
      continue;
    }
    let closePos = openPos + 1;
    while (closePos < content.length) {
      if (content[closePos] === quoteChar && content[closePos - 1] !== "\\") break;
      closePos++;
    }
    out[key] = content.slice(openPos + 1, closePos);
    i = closePos + 1;
  }
  return out;
}

export function loadEnv() {
  return {
    ...loadEnvFile(resolve(ROOT, ".env")),
    ...loadEnvFile(resolve(ROOT, ".env.local")),
    ...process.env,
  };
}

/** Explicit "0" must stay 0 — `Number(x) || fallback` would silently drop it. */
export function envNumber(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function initClients(env) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!geminiKey || !serviceAccount) {
    console.error("❌  GEMINI_API_KEY / FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local");
    process.exit(1);
  }
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const { GoogleGenAI } = await import("@google/genai");
  initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  return {
    db: getFirestore(),
    FieldValue,
    ai: new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: "v1beta" } }),
  };
}

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIM = 1536;

/** @param {"RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"} taskType */
export async function embedTexts(ai, texts, taskType, concurrency = 3) {
  const results = [];
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = await Promise.all(
      texts.slice(i, i + concurrency).map(async (text) => {
        const res = await ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: text,
          config: { taskType, outputDimensionality: EMBEDDING_DIM },
        });
        return res.embeddings?.[0]?.values ?? [];
      })
    );
    results.push(...batch);
  }
  return results;
}

export function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf8"));
}
