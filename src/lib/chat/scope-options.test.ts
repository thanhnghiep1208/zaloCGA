import { describe, expect, it } from "vitest";
import {
  EMPTY_SCOPE,
  buildScopedQuery,
  sanitizeScope,
  sanitizeDocMessageType,
  sanitizeDocUiPattern,
  scopeHintForPrompt,
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

describe("scopeHintForPrompt", () => {
  it("returns null when no facet is selected", () => {
    expect(scopeHintForPrompt(EMPTY_SCOPE)).toBeNull();
    expect(scopeHintForPrompt(null)).toBeNull();
  });

  it("pins the machine values so the model does not re-guess the user's choice", () => {
    const hint = scopeHintForPrompt({ messageType: "error", uiPattern: "snackbar" })!;
    expect(hint).toContain("Lỗi");
    expect(hint).toContain("Snackbar");
    expect(hint).toContain('"pattern" PHẢI bằng "snackbar"');
    expect(hint).toContain('"messageType" PHẢI bằng "error"');
  });

  it("pins only the facet that was actually selected", () => {
    const hint = scopeHintForPrompt({ messageType: null, uiPattern: "modal" })!;
    expect(hint).toContain('"pattern" PHẢI bằng "modal"');
    expect(hint).not.toContain('"messageType" PHẢI');
  });
});
