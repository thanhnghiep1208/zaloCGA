import { describe, expect, it } from "vitest";
import { createChatStreamParseState, feedChatStreamChunk } from "@/lib/chat/stream";

describe("feedChatStreamChunk", () => {
  it("parses sources prefix then accumulates text", () => {
    const state = createChatStreamParseState();
    const sourcesJson = JSON.stringify({
      type: "sources",
      data: [{ fileName: "guide.pdf", excerpt: "x" }],
    });
    const split = "===CHUNK_SPLIT===\n\n";

    const first = feedChatStreamChunk(state, sourcesJson.slice(0, 20));
    expect(first).toBeNull();
    expect(state.hasParsedSources).toBe(false);

    const second = feedChatStreamChunk(state, sourcesJson.slice(20) + split + "Hello");
    expect(second).toHaveLength(1);
    expect(second![0].fileName).toBe("guide.pdf");
    expect(state.accumulatedText).toBe("Hello");

    feedChatStreamChunk(state, " world");
    expect(state.accumulatedText).toBe("Hello world");
    expect(state.finalSources).toHaveLength(1);
  });

  it("accumulates text only after sources are parsed", () => {
    const state = createChatStreamParseState();
    feedChatStreamChunk(state, '{"type":"sources","data":[]}===CHUNK_SPLIT===\n\n');
    feedChatStreamChunk(state, "Part one. ");
    feedChatStreamChunk(state, "Part two.");
    expect(state.accumulatedText).toBe("Part one. Part two.");
  });
});
