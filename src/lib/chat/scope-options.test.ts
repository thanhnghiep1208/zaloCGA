import { describe, expect, it } from "vitest";
import {
  EMPTY_SCOPE,
  buildScopedQuery,
  sanitizeScope,
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
