import { describe, expect, it } from "vitest";
import {
  EMPTY_SCOPE,
  buildScopedQuery,
  sanitizeScope,
  sanitizeDocMessageType,
  sanitizeDocUiPattern,
  scopeLabels,
} from "@/lib/chat/scope-options";

describe("buildScopedQuery", () => {
  it("returns the raw query when scope is empty", () => {
    expect(buildScopedQuery("abc", EMPTY_SCOPE)).toBe("abc");
  });

  it("prefixes the scope labels when scope is set", () => {
    const query = buildScopedQuery("abc", {
      messageType: "error",
      uiPattern: "snackbar",
    });
    expect(query.startsWith("[Lỗi · Snackbar] ")).toBe(true);
  });
});

describe("sanitizeScope", () => {
  it("drops values not in the whitelist", () => {
    expect(
      sanitizeScope({ messageType: "xxx", uiPattern: "card" })
    ).toEqual({ messageType: null, uiPattern: "card" });
  });
});

describe("scopeLabels", () => {
  it("keeps [messageType, uiPattern] order", () => {
    expect(
      scopeLabels({ messageType: "error", uiPattern: "snackbar" })
    ).toEqual(["Lỗi", "Snackbar"]);
  });
});

describe("sanitizeDocMessageType / sanitizeDocUiPattern", () => {
  it("accepts whitelisted values", () => {
    expect(sanitizeDocMessageType("error")).toBe("error");
    expect(sanitizeDocUiPattern("snackbar")).toBe("snackbar");
  });

  it("rejects unknown values and non-strings", () => {
    expect(sanitizeDocMessageType("bogus")).toBeNull();
    expect(sanitizeDocMessageType(null)).toBeNull();
    expect(sanitizeDocUiPattern(undefined)).toBeNull();
  });

  it("accepts 'all' as a wildcard tag", () => {
    expect(sanitizeDocMessageType("all")).toBe("all");
    expect(sanitizeDocUiPattern("all")).toBe("all");
  });
});
