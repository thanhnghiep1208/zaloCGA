import type { ChatSource } from "@/types/chat";
import { sanitizePrototypeSpec, type PrototypeSpec } from "./prototype-spec";

export type ChatStreamParseState = {
  /** Bytes received but not yet parsed (incomplete last line). */
  lineBuffer: string;
  hasParsedSources: boolean;
  accumulatedText: string;
  finalSources: ChatSource[];
  /** Visual prototype spec, if the model emitted a usable one. Arrives after the text. */
  prototype: PrototypeSpec | null;
};

export function createChatStreamParseState(): ChatStreamParseState {
  return {
    lineBuffer: "",
    hasParsedSources: false,
    accumulatedText: "",
    finalSources: [],
    prototype: null,
  };
}

/**
 * Feed one decoded chunk into the NDJSON stream parser.
 *
 * Each server line is a JSON object:
 *   {"t":"s","d":[...ChatSource[]]}  — sources (always first line)
 *   {"t":"x","d":"text delta"}       — text chunk
 *   {"t":"p","d":PrototypeSpec}      — optional visual prototype (always last)
 *
 * Returns the sources array the first time it is parsed; null otherwise.
 */
export function feedChatStreamChunk(
  state: ChatStreamParseState,
  chunk: string
): ChatSource[] | null {
  state.lineBuffer += chunk;
  let sourcesFound: ChatSource[] | null = null;

  while (true) {
    const nlIdx = state.lineBuffer.indexOf("\n");
    if (nlIdx === -1) break;

    const line = state.lineBuffer.slice(0, nlIdx).trim();
    state.lineBuffer = state.lineBuffer.slice(nlIdx + 1);
    if (!line) continue;

    try {
      const msg = JSON.parse(line) as { t: string; d: unknown };
      if (msg.t === "s" && Array.isArray(msg.d)) {
        state.finalSources = msg.d as ChatSource[];
        state.hasParsedSources = true;
        sourcesFound = state.finalSources;
      } else if (msg.t === "x" && typeof msg.d === "string") {
        state.accumulatedText += msg.d;
      } else if (msg.t === "p") {
        // Server đã validate, nhưng validate lại vẫn rẻ và chặn spec hỏng lọt vào render.
        state.prototype = sanitizePrototypeSpec(msg.d);
      }
    } catch {
      /* ignore malformed lines */
    }
  }

  return sourcesFound;
}
