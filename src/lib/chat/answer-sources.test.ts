import { describe, it, expect } from "vitest";
import { selectVisibleSources, stripSourcesMarker } from "@/components/chat/AssistantMessageBody";
import type { ChatSource } from "@/types/chat";

const A: ChatSource = { fileName: "guideline-a.pdf" };
const B: ChatSource = { fileName: "guideline-b.pdf" };

describe("selectVisibleSources", () => {
  it("returns nothing when there are no sources", () => {
    expect(selectVisibleSources("[SOURCES_USED: a.pdf]", [])).toEqual([]);
    expect(selectVisibleSources("[SOURCES_USED: a.pdf]", undefined)).toEqual([]);
  });

  it("shows every source when the marker is absent (older stored messages)", () => {
    expect(selectVisibleSources("Câu trả lời không có marker.", [A, B])).toEqual([A, B]);
  });

  it("keeps only the files the marker names", () => {
    expect(selectVisibleSources("x [SOURCES_USED: guideline-b.pdf]", [A, B])).toEqual([B]);
  });

  it("matches file names case-insensitively and ignores surrounding spaces", () => {
    expect(selectVisibleSources("x [SOURCES_USED:   GUIDELINE-A.PDF ,  guideline-b.pdf ]", [A, B])).toEqual([A, B]);
  });

  it("ignores names in the marker that are not in the retrieved set", () => {
    expect(selectVisibleSources("x [SOURCES_USED: guideline-a.pdf, khong-ton-tai.pdf]", [A, B])).toEqual([A]);
  });

  it("hides all sources when the model reports it used none", () => {
    // Marker rỗng khác với KHÔNG có marker: model chủ động nói "tôi không dùng
    // nguồn nào", nên tôn trọng điều đó thay vì rơi về hiện tất cả.
    expect(selectVisibleSources("x [SOURCES_USED: ]", [A, B])).toEqual([]);
  });

  it("falls back to every source when the marker is split across lines", () => {
    // `.*?` không khớp newline nên regex không match — rơi về hiện tất cả,
    // an toàn hơn là ẩn hết nguồn.
    expect(selectVisibleSources("x [SOURCES_USED: guideline-a.pdf,\nguideline-b.pdf]", [A, B])).toEqual([A, B]);
  });
});

describe("stripSourcesMarker", () => {
  it("removes the marker and trims", () => {
    expect(stripSourcesMarker("Nội dung.\n\n[SOURCES_USED: a.pdf]")).toBe("Nội dung.");
  });

  it("leaves content without a marker unchanged", () => {
    expect(stripSourcesMarker("Chỉ là nội dung.")).toBe("Chỉ là nội dung.");
  });

  it("removes every marker when the model emits more than one", () => {
    const out = stripSourcesMarker("A [SOURCES_USED: a.pdf] B [SOURCES_USED: b.pdf]");
    expect(out).not.toContain("SOURCES_USED");
  });
});
