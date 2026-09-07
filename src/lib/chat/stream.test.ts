import { describe, expect, it } from "vitest";
import { createChatStreamParseState, feedChatStreamChunk } from "@/lib/chat/stream";

function sourcesLine(sources: unknown[]): string {
  return JSON.stringify({ t: "s", d: sources }) + "\n";
}

function textLine(text: string): string {
  return JSON.stringify({ t: "x", d: text }) + "\n";
}

function prototypeLine(spec: unknown): string {
  return JSON.stringify({ t: "p", d: spec }) + "\n";
}

const VALID_SPEC = { pattern: "snackbar", messageType: "error", body: "Kiểm tra kết nối." };

describe("feedChatStreamChunk", () => {
  it("parses a sources line and returns the sources array", () => {
    const state = createChatStreamParseState();
    const line = sourcesLine([{ fileName: "guide.pdf", excerpt: "x" }]);

    const result = feedChatStreamChunk(state, line);

    expect(result).toHaveLength(1);
    expect(result![0].fileName).toBe("guide.pdf");
    expect(state.hasParsedSources).toBe(true);
    expect(state.finalSources).toHaveLength(1);
  });

  it("returns null for text-only chunks (sources not yet seen)", () => {
    const state = createChatStreamParseState();
    feedChatStreamChunk(state, sourcesLine([]));
    const result = feedChatStreamChunk(state, textLine("Hello"));
    expect(result).toBeNull();
  });

  it("accumulates text deltas after sources are parsed", () => {
    const state = createChatStreamParseState();
    feedChatStreamChunk(state, sourcesLine([]));
    feedChatStreamChunk(state, textLine("Part one. "));
    feedChatStreamChunk(state, textLine("Part two."));
    expect(state.accumulatedText).toBe("Part one. Part two.");
  });

  it("handles sources and first text delta arriving in the same chunk", () => {
    const state = createChatStreamParseState();
    const combined = sourcesLine([{ fileName: "doc.pdf" }]) + textLine("Hello");

    const result = feedChatStreamChunk(state, combined);

    expect(result).toHaveLength(1);
    expect(state.accumulatedText).toBe("Hello");
  });

  it("buffers partial lines and completes them when newline arrives", () => {
    const state = createChatStreamParseState();
    const full = sourcesLine([]);
    // split mid-JSON
    feedChatStreamChunk(state, full.slice(0, 10));
    expect(state.hasParsedSources).toBe(false);
    feedChatStreamChunk(state, full.slice(10));
    expect(state.hasParsedSources).toBe(true);
  });

  it("ignores malformed (non-JSON) lines", () => {
    const state = createChatStreamParseState();
    feedChatStreamChunk(state, "not-json\n");
    expect(state.hasParsedSources).toBe(false);
    expect(state.accumulatedText).toBe("");
  });

  it("returns sources only on first sources line, null on subsequent chunks", () => {
    const state = createChatStreamParseState();
    const first = feedChatStreamChunk(state, sourcesLine([{ fileName: "a.pdf" }]));
    expect(first).not.toBeNull();
    const second = feedChatStreamChunk(state, textLine("more text"));
    expect(second).toBeNull();
  });
});

describe("feedChatStreamChunk — prototype line", () => {
  it("starts with no prototype", () => {
    expect(createChatStreamParseState().prototype).toBeNull();
  });

  it("stores a valid prototype spec", () => {
    const state = createChatStreamParseState();
    feedChatStreamChunk(state, sourcesLine([]));
    feedChatStreamChunk(state, textLine("Câu trả lời."));
    feedChatStreamChunk(state, prototypeLine(VALID_SPEC));
    expect(state.prototype).toEqual(VALID_SPEC);
    expect(state.accumulatedText).toBe("Câu trả lời.");
  });

  it("handles a prototype line split across two chunks", () => {
    const state = createChatStreamParseState();
    const line = prototypeLine(VALID_SPEC);
    feedChatStreamChunk(state, line.slice(0, 15));
    expect(state.prototype).toBeNull();
    feedChatStreamChunk(state, line.slice(15));
    expect(state.prototype).toEqual(VALID_SPEC);
  });

  it("ignores a malformed prototype payload without throwing", () => {
    const state = createChatStreamParseState();
    expect(() => feedChatStreamChunk(state, prototypeLine({ pattern: "carousel" }))).not.toThrow();
    expect(state.prototype).toBeNull();
  });

  it("does not treat a prototype line as sources", () => {
    const state = createChatStreamParseState();
    expect(feedChatStreamChunk(state, prototypeLine(VALID_SPEC))).toBeNull();
    expect(state.hasParsedSources).toBe(false);
  });
});
