import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "@/lib/next-path";

describe("sanitizeNextPath", () => {
  it("returns the value when it is an internal single-slash path", () => {
    expect(sanitizeNextPath("/chat")).toBe("/chat");
    expect(sanitizeNextPath("/admin/library")).toBe("/admin/library");
  });

  it("falls back to /chat when null", () => {
    expect(sanitizeNextPath(null)).toBe("/chat");
  });

  it("falls back to /chat when empty string", () => {
    expect(sanitizeNextPath("")).toBe("/chat");
  });

  it("falls back to /chat for a protocol-relative URL (//evil.com)", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/chat");
  });

  it("falls back to /chat for an absolute external URL", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/chat");
  });

  it("falls back to /chat for a value embedding a scheme anywhere, even past a query string", () => {
    expect(sanitizeNextPath("/redirect?to=https://evil.com")).toBe("/chat");
    expect(sanitizeNextPath("javascript://evil.com")).toBe("/chat");
  });

  it("keeps a same-origin path with unusual characters that carries no scheme", () => {
    expect(sanitizeNextPath("/\t/evil.com")).toBe("/\t/evil.com");
  });

  it("falls back to /chat for a value not starting with a slash", () => {
    expect(sanitizeNextPath("chat")).toBe("/chat");
  });
});
