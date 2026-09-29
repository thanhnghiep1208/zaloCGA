/** Primary Gemini Flash model — https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash */
export const GEMINI_FLASH_MODEL = "gemini-3.8-flash";

/** Used when the primary model is unavailable or rate-limited. */
export const GEMINI_CHAT_MODEL_FALLBACKS = [
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
] as const;

export const DEFAULT_GEMINI_CHAT_MODELS: string[] = [
  GEMINI_FLASH_MODEL,
  ...GEMINI_CHAT_MODEL_FALLBACKS,
];

/** Chat model chain in fallback order — `GEMINI_CHAT_MODELS` (comma-separated) or the default. */
export function configuredChatModels(): string[] {
  const raw = process.env.GEMINI_CHAT_MODELS;
  if (!raw) return DEFAULT_GEMINI_CHAT_MODELS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
