import { describe, it, expect } from "vitest";
import {
  PROTOTYPE_MESSAGE_TYPES,
  PROTOTYPE_PROMPT_SECTION,
  PROTOTYPE_UI_PATTERNS,
  LIMITS,
  prototypeMicrocopy,
  sanitizePrototypeSpec,
} from "./prototype-spec";
import { MESSAGE_TYPE_OPTIONS, UI_PATTERN_OPTIONS } from "./scope-options";

describe("sanitizePrototypeSpec", () => {
  it("accepts a minimal valid spec", () => {
    expect(sanitizePrototypeSpec({ pattern: "snackbar", messageType: "error", body: "Thử lại." })).toEqual({
      pattern: "snackbar",
      messageType: "error",
      body: "Thử lại.",
    });
  });

  it("rejects an unknown pattern or messageType", () => {
    expect(sanitizePrototypeSpec({ pattern: "carousel", messageType: "error", body: "x" })).toBeNull();
    expect(sanitizePrototypeSpec({ pattern: "modal", messageType: "danger", body: "x" })).toBeNull();
  });

  it("rejects a spec with no textual content at all", () => {
    expect(sanitizePrototypeSpec({ pattern: "modal", messageType: "warning", actions: [{ label: "OK" }] })).toBeNull();
  });

  it("accepts bullets as the only content", () => {
    const spec = sanitizePrototypeSpec({ pattern: "modal", messageType: "warning", bullets: ["Một ý"] });
    expect(spec?.bullets).toEqual(["Một ý"]);
  });

  it("rejects non-object input", () => {
    expect(sanitizePrototypeSpec(null)).toBeNull();
    expect(sanitizePrototypeSpec("snackbar")).toBeNull();
    expect(sanitizePrototypeSpec(undefined)).toBeNull();
  });

  it("keeps realistic long-form content intact — truncating would lose information", () => {
    // 500 ký tự body + 6 bullet là mức một thông báo thật vẫn có thể đạt tới.
    const body = "Ảnh chưa được gửi vì kết nối mạng bị ngắt giữa lúc tải lên. ".repeat(8).trim();
    const bullets = Array.from({ length: 6 }, (_, i) => `Bước kiểm tra thứ ${i + 1} khá dài dòng nhưng vẫn hợp lệ`);
    const spec = sanitizePrototypeSpec({ pattern: "bottom-sheet", messageType: "error", body, bullets });

    expect(body.length).toBeGreaterThan(400);
    expect(spec?.body).toBe(body);
    expect(spec?.body).not.toContain("…");
    expect(spec?.bullets).toEqual(bullets);
  });

  it("caps only beyond the abuse threshold, never at microcopy lengths", () => {
    const spec = sanitizePrototypeSpec({
      pattern: "modal",
      messageType: "confirmation",
      title: "a".repeat(LIMITS.title + 40),
      body: "b".repeat(LIMITS.body + 400),
    });
    expect(spec?.title).toHaveLength(LIMITS.title + 1); // + dấu …
    expect(spec?.body).toHaveLength(LIMITS.body + 1);
  });

  it("leaves text exactly at the limit untouched", () => {
    const title = "a".repeat(LIMITS.title);
    expect(sanitizePrototypeSpec({ pattern: "card", messageType: "information", title })?.title).toBe(title);
  });

  it("strips unknown keys rather than rejecting", () => {
    const spec = sanitizePrototypeSpec({
      pattern: "tooltip",
      messageType: "information",
      title: "Mẹo",
      icon: "warning-triangle",
      accentColor: "#ff0000",
    });
    expect(spec).toEqual({ pattern: "tooltip", messageType: "information", title: "Mẹo" });
  });

  it("carries more than two actions — a 3-button dialog must not lose a button", () => {
    const spec = sanitizePrototypeSpec({
      pattern: "bottom-sheet",
      messageType: "error",
      title: "Không gửi được ảnh",
      actions: [
        { label: "Thử lại", kind: "primary" },
        { label: "Chọn ảnh khác", kind: "secondary" },
        { label: "Để sau", kind: "text" },
      ],
    });
    expect(spec?.actions).toHaveLength(3);
    expect(spec?.actions?.map((a) => a.label)).toEqual(["Thử lại", "Chọn ảnh khác", "Để sau"]);
  });

  it("defaults a missing action kind instead of dropping the action", () => {
    const spec = sanitizePrototypeSpec({
      pattern: "card",
      messageType: "information",
      title: "T",
      actions: [{ label: "Xem" }],
    });
    expect(spec?.actions).toEqual([{ label: "Xem", kind: "secondary" }]);
  });

  it("folds the legacy primaryAction/secondaryAction fields so stored specs still render", () => {
    const spec = sanitizePrototypeSpec({
      pattern: "snackbar",
      messageType: "error",
      title: "Lỗi",
      primaryAction: "Thử lại",
      secondaryAction: "Huỷ",
    });
    expect(spec?.actions).toEqual([
      { label: "Thử lại", kind: "primary" },
      { label: "Huỷ", kind: "secondary" },
    ]);
    expect(spec).not.toHaveProperty("primaryAction");
  });

  it("rejects empty-string content that would render as a blank box", () => {
    expect(sanitizePrototypeSpec({ pattern: "snackbar", messageType: "success", title: "   " })).toBeNull();
  });
});

describe("prototypeMicrocopy", () => {
  it("includes every line, bullet and action — nothing silently dropped", () => {
    const spec = sanitizePrototypeSpec({
      pattern: "bottom-sheet",
      messageType: "confirmation",
      title: "Xoá ảnh này?",
      body: "Ảnh sẽ bị xoá khỏi cuộc trò chuyện.",
      bullets: ["Không thể hoàn tác", "Người nhận vẫn giữ bản đã tải"],
      helperText: "Bản sao trong máy không bị ảnh hưởng.",
      actions: [
        { label: "Xoá", kind: "primary" },
        { label: "Huỷ", kind: "secondary" },
      ],
    })!;
    expect(prototypeMicrocopy(spec)).toBe(
      [
        "Xoá ảnh này?",
        "Ảnh sẽ bị xoá khỏi cuộc trò chuyện.",
        "• Không thể hoàn tác",
        "• Người nhận vẫn giữ bản đã tải",
        "Bản sao trong máy không bị ảnh hưởng.",
        "Xoá  ·  Huỷ",
      ].join("\n")
    );
  });

  it("skips missing fields", () => {
    const spec = sanitizePrototypeSpec({ pattern: "snackbar", messageType: "success", body: "Đã lưu." })!;
    expect(prototypeMicrocopy(spec)).toBe("Đã lưu.");
  });
});

describe("prompt/schema drift guard", () => {
  it("derives its enums from the scope facet options", () => {
    expect(PROTOTYPE_UI_PATTERNS).toEqual(UI_PATTERN_OPTIONS.map((o) => o.value));
    expect(PROTOTYPE_MESSAGE_TYPES).toEqual(MESSAGE_TYPE_OPTIONS.map((o) => o.value));
  });

  it("lists every allowed value in the prompt section", () => {
    for (const value of [...PROTOTYPE_UI_PATTERNS, ...PROTOTYPE_MESSAGE_TYPES]) {
      expect(PROTOTYPE_PROMPT_SECTION).toContain(value);
    }
  });

  it("tells the model not to drop any of the user's original information", () => {
    expect(PROTOTYPE_PROMPT_SECTION).toContain("KHÔNG ĐƯỢC LÀM MẤT THÔNG TIN");
    expect(PROTOTYPE_PROMPT_SECTION).toContain("bullets");
    expect(PROTOTYPE_PROMPT_SECTION).toContain("actions");
    expect(PROTOTYPE_PROMPT_SECTION).toContain(String(LIMITS.body));
  });

  it("shows an example that the schema actually accepts", () => {
    const example = PROTOTYPE_PROMPT_SECTION.match(/```zalo-prototype\n([\s\S]*?)\n```/)?.[1];
    expect(example).toBeTruthy();
    expect(sanitizePrototypeSpec(JSON.parse(example!))).not.toBeNull();
  });
});
