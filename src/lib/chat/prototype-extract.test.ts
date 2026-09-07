import { describe, it, expect } from "vitest";
import { extractPrototypeSpec, hasPrototypeFence, stripPrototypeBlock } from "./prototype-extract";

const block = (json: string) => "```zalo-prototype\n" + json + "\n```";
const VALID = '{"pattern":"snackbar","messageType":"error","body":"Kiểm tra kết nối mạng."}';

describe("extractPrototypeSpec", () => {
  it("returns null when there is no block", () => {
    expect(extractPrototypeSpec("### Recommended final version\nThử lại nhé.")).toBeNull();
  });

  it("extracts a valid block", () => {
    expect(extractPrototypeSpec(`Câu trả lời.\n\n${block(VALID)}\n\n[SOURCES_USED: a.pdf]`)).toEqual({
      pattern: "snackbar",
      messageType: "error",
      body: "Kiểm tra kết nối mạng.",
    });
  });

  it("returns null on malformed JSON", () => {
    expect(extractPrototypeSpec(block('{"pattern":"snackbar",}'))).toBeNull();
    expect(extractPrototypeSpec(block("not json at all"))).toBeNull();
  });

  it("returns null when the JSON parses but fails validation", () => {
    expect(extractPrototypeSpec(block('{"pattern":"carousel","messageType":"error","body":"x"}'))).toBeNull();
  });

  it("takes the last block when the model emits two", () => {
    const first = '{"pattern":"modal","messageType":"warning","body":"đầu"}';
    expect(extractPrototypeSpec(`${block(first)}\ngiữa\n${block(VALID)}`)?.body).toBe("Kiểm tra kết nối mạng.");
  });

  it("finds a block placed after the sources marker", () => {
    expect(extractPrototypeSpec(`[SOURCES_USED: a.pdf]\n${block(VALID)}`)).not.toBeNull();
  });

  it("ignores an unterminated block", () => {
    expect(extractPrototypeSpec("```zalo-prototype\n" + VALID)).toBeNull();
  });
});

describe("hasPrototypeFence", () => {
  it("reports a fence even when the spec is unusable", () => {
    expect(hasPrototypeFence(block("{broken"))).toBe(true);
    expect(hasPrototypeFence("không có gì")).toBe(false);
  });
});

describe("stripPrototypeBlock", () => {
  it("removes a complete block but keeps the surrounding answer", () => {
    const text = `### Recommended final version\nThử lại nhé.\n\n${block(VALID)}\n\n[SOURCES_USED: a.pdf]`;
    const out = stripPrototypeBlock(text);
    expect(out).toContain("Thử lại nhé.");
    expect(out).toContain("[SOURCES_USED: a.pdf]");
    expect(out).not.toContain("zalo-prototype");
    expect(out).not.toContain("snackbar");
  });

  it("removes an unterminated fence mid-stream", () => {
    const out = stripPrototypeBlock('Câu trả lời.\n\n```zalo-prototype\n{"pattern":"snac');
    expect(out).toBe("Câu trả lời.");
  });

  it("removes a partial fence prefix mid-stream", () => {
    expect(stripPrototypeBlock("Câu trả lời.\n\n```zal")).toBe("Câu trả lời.");
    expect(stripPrototypeBlock("Câu trả lời.\n\n```z")).toBe("Câu trả lời.");
    expect(stripPrototypeBlock("Câu trả lời.\n\n```zalo-prototyp")).toBe("Câu trả lời.");
  });

  it("leaves a bare or ordinary code fence alone", () => {
    expect(stripPrototypeBlock("Ví dụ:\n\n```")).toBe("Ví dụ:\n\n```");
    expect(stripPrototypeBlock("Ví dụ:\n\n```json\n{}\n```")).toBe("Ví dụ:\n\n```json\n{}\n```");
  });

  it("leaves text without any block unchanged", () => {
    expect(stripPrototypeBlock("Chỉ là văn bản `inline code` thôi.")).toBe("Chỉ là văn bản `inline code` thôi.");
  });
});
