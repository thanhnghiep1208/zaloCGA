import type { ChatSource } from "@/types/chat";
import { CHAT_STREAM_CHUNK_SPLIT } from "@/lib/chat/constants";

export type ChatStreamSourcesPayload = {
  type: "sources";
  data: ChatSource[];
};

export type ChatStreamParseState = {
  buffer: string;
  hasParsedSources: boolean;
  accumulatedText: string;
  finalSources: ChatSource[];
};

export function createChatStreamParseState(): ChatStreamParseState {
  return {
    buffer: "",
    hasParsedSources: false,
    accumulatedText: "",
    finalSources: [],
  };
}

/**
 * Feed one decoded chunk into the stream parser. Returns sources when the split marker is first seen.
 */
export function feedChatStreamChunk(
  state: ChatStreamParseState,
  chunk: string
): ChatSource[] | null {
  state.buffer += chunk;

  if (state.hasParsedSources) {
    state.accumulatedText += chunk;
    return null;
  }

  const splitIndex = state.buffer.indexOf(CHAT_STREAM_CHUNK_SPLIT);
  if (splitIndex === -1) return null;

  const sourcesPart = state.buffer.slice(0, splitIndex);
  const textPart = state.buffer.slice(splitIndex + CHAT_STREAM_CHUNK_SPLIT.length);
  state.hasParsedSources = true;
  state.accumulatedText += textPart;

  try {
    const sourcesJson = JSON.parse(sourcesPart) as ChatStreamSourcesPayload;
    if (sourcesJson.type === "sources" && Array.isArray(sourcesJson.data)) {
      state.finalSources = sourcesJson.data;
      return sourcesJson.data;
    }
  } catch {
    /* ignore malformed sources prefix */
  }
  return null;
}
