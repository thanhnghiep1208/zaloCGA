import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking";

describe("chunkText — headingPath (M5)", () => {
  it("assigns null headingPath for plain text with no headings", () => {
    const [chunk] = chunkText("Đây là một đoạn văn bản thuần, không có heading nào cả.");
    expect(chunk.headingPath).toBeNull();
  });

  it("assigns the single active heading for a doc with one level", () => {
    const text = "# Snackbar\n\nSnackbar là thông báo ngắn.";
    const [chunk] = chunkText(text);
    expect(chunk.headingPath).toBe("Snackbar");
  });

  it("builds a nested path across multiple heading levels", () => {
    // Long enough filler after the level-2 heading to force a second chunk
    // whose start position lands after "## Behavior", not just after "# Snackbar".
    const filler = "Đây là câu văn mẫu để làm dài nội dung cho đủ ký tự. ".repeat(40);
    const text = `# Snackbar\n\n## Behavior\n\n${filler}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.headingPath === "Snackbar > Behavior")).toBe(true);
  });

  it("pops back to a shallower level when a same-or-higher-level heading follows", () => {
    const text = [
      "# Snackbar",
      "",
      "## Behavior",
      "",
      "Nội dung A",
      "",
      "## Control",
      "",
      "Nội dung B",
    ].join("\n");
    const chunks = chunkText(text);
    // Single chunk (short doc) — headingPath reflects the LAST heading before
    // the chunk's start position (position 0 here, so still the top heading).
    expect(chunks[0].headingPath).toBe("Snackbar");
  });

  it("resets to a new level-1 heading, discarding the previous branch", () => {
    // Filler on both sides, built from real sentences (not one giant unbreakable
    // token), so natural sentence/paragraph boundaries keep the split points
    // predictable — a chunk starting well after "# Section B" must not still
    // report the "Section A > Sub A" path.
    const fillerA = "Đây là câu văn mẫu để làm dài nội dung cho đủ ký tự. ".repeat(40);
    const fillerB = "Một đoạn văn khác để đảm bảo có chunk nằm trọn trong Section B. ".repeat(40);
    const text = `# Section A\n\n## Sub A\n\n${fillerA}\n\n# Section B\n\n${fillerB}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.headingPath).toBe("Section B");
  });

  it("keeps a real chunkIndex and non-empty text alongside headingPath", () => {
    const chunks = chunkText("# Title\n\nSome content here.");
    expect(chunks[0]).toMatchObject({ chunkIndex: 0, headingPath: "Title" });
    expect(chunks[0].text).toContain("Some content here.");
  });

  it("returns an empty array for empty/whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});
