import { describe, it, expect } from "vitest";
import { describeUnrenderedContent } from "@/components/chat/prototype/patterns";
import { prototypeImageFileName } from "@/lib/chat/prototype-image";
import { sanitizePrototypeSpec, type PrototypeSpec } from "@/lib/chat/prototype-spec";
import { UI_PATTERN_OPTIONS } from "@/lib/chat/scope-options";

function spec(over: Record<string, unknown>): PrototypeSpec {
  return sanitizePrototypeSpec({ pattern: "snackbar", messageType: "error", title: "Lỗi", ...over })!;
}

describe("describeUnrenderedContent", () => {
  it("reports nothing for the patterns that render the whole spec", () => {
    const rich = {
      title: "T",
      body: "B",
      bullets: ["x", "y"],
      helperText: "H",
      actions: [
        { label: "Một", kind: "primary" },
        { label: "Hai", kind: "secondary" },
        { label: "Ba", kind: "text" },
      ],
    };
    for (const { value } of UI_PATTERN_OPTIONS.filter((o) => o.value !== "snackbar")) {
      expect(describeUnrenderedContent(spec({ ...rich, pattern: value }))).toEqual([]);
    }
  });

  it("reports nothing for a snackbar that only carries one line", () => {
    expect(describeUnrenderedContent(spec({ title: "Không gửi được ảnh" }))).toEqual([]);
  });

  it("does not warn about a body when the snackbar has no title to displace it", () => {
    // Snackbar render `title || body`, nên chỉ có body thì body VẪN hiện — không mất gì.
    expect(describeUnrenderedContent(spec({ title: undefined, body: "Chỉ có body" }))).toEqual([]);
  });

  it("warns that the description cannot fit alongside the title", () => {
    expect(describeUnrenderedContent(spec({ title: "T", body: "B" }))).toEqual([
      "phần mô tả (snackbar chỉ hiện một dòng)",
    ]);
  });

  it("counts the bullets it cannot draw", () => {
    expect(describeUnrenderedContent(spec({ bullets: ["a", "b", "c"] }))).toContain("3 ý trong danh sách");
  });

  it("warns about the helper line", () => {
    expect(describeUnrenderedContent(spec({ helperText: "H" }))).toContain("dòng ghi chú");
  });

  it("counts only the actions beyond the one it keeps", () => {
    const three = [
      { label: "Một", kind: "primary" },
      { label: "Hai", kind: "secondary" },
      { label: "Ba", kind: "text" },
    ];
    expect(describeUnrenderedContent(spec({ actions: three }))).toContain("2 nút phụ");
    expect(describeUnrenderedContent(spec({ actions: three.slice(0, 1) })).join()).not.toContain("nút phụ");
  });

  it("never reports a negative or zero action count when there are no actions", () => {
    const out = describeUnrenderedContent(spec({ actions: undefined })).join(" ");
    expect(out).not.toContain("-1");
    expect(out).not.toContain("0 nút");
    expect(out).not.toContain("nút phụ");
  });

  it("lists every unrenderable part at once", () => {
    const out = describeUnrenderedContent(
      spec({
        title: "T",
        body: "B",
        bullets: ["a", "b"],
        helperText: "H",
        actions: [
          { label: "Một", kind: "primary" },
          { label: "Hai", kind: "secondary" },
        ],
      })
    );
    expect(out).toHaveLength(4);
  });
});

describe("prototypeImageFileName", () => {
  it("names the file after the pattern and message type so a ticket shows what it is", () => {
    const s = spec({ pattern: "bottom-sheet", messageType: "warning" });
    expect(prototypeImageFileName(s, "jpg")).toBe("zalo-bottom-sheet-warning.jpg");
    expect(prototypeImageFileName(s, "png")).toBe("zalo-bottom-sheet-warning.png");
  });

  it("produces a filesystem-safe name for every pattern", () => {
    for (const { value } of UI_PATTERN_OPTIONS) {
      const name = prototypeImageFileName(spec({ pattern: value }), "jpg");
      expect(name).toMatch(/^[a-z0-9.-]+\.jpg$/);
    }
  });
});
