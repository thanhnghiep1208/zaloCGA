import { describe, expect, it } from "vitest";
import { applyScopeBoost, scopeMatchScore } from "./FirebaseRetrievalProvider";
import type { RetrievedSnippet } from "./interfaces";
import type { ChatScope } from "@/lib/chat/scope-options";

function snip(overrides: Partial<RetrievedSnippet> = {}): RetrievedSnippet {
  return { fileName: "doc.pdf", ...overrides };
}

describe("scopeMatchScore", () => {
  const scope: ChatScope = { messageType: "error", uiPattern: "snackbar" };

  it("scores 2 when both selected facets match", () => {
    expect(scopeMatchScore(snip({ messageType: "error", uiPattern: "snackbar" }), scope)).toBe(2);
  });

  it("scores 1 when only one selected facet matches", () => {
    expect(scopeMatchScore(snip({ messageType: "error", uiPattern: "modal" }), scope)).toBe(1);
  });

  it("scores 0 for untagged docs", () => {
    expect(scopeMatchScore(snip(), scope)).toBe(0);
  });

  it("scores 0 for docs tagged with conflicting values", () => {
    expect(scopeMatchScore(snip({ messageType: "warning", uiPattern: "modal" }), scope)).toBe(0);
  });

  it("only considers facets the user actually selected", () => {
    const partialScope: ChatScope = { messageType: "error", uiPattern: null };
    expect(scopeMatchScore(snip({ messageType: "error", uiPattern: "modal" }), partialScope)).toBe(1);
  });

  it("treats a doc tagged 'all' on a facet as matching any selected value for that facet", () => {
    expect(scopeMatchScore(snip({ messageType: "all", uiPattern: "all" }), scope)).toBe(2);
    expect(scopeMatchScore(snip({ messageType: "all", uiPattern: "modal" }), scope)).toBe(1);
  });
});

describe("applyScopeBoost", () => {
  const scope: ChatScope = { messageType: "error", uiPattern: "snackbar" };

  it("returns the input unchanged when no scope is active", () => {
    const snippets = [snip({ docId: "a" }), snip({ docId: "b" })];
    expect(applyScopeBoost(snippets, null)).toBe(snippets);
    expect(applyScopeBoost(snippets, { messageType: null, uiPattern: null })).toBe(snippets);
  });

  it("moves scope-matching docs to the front without dropping others", () => {
    const snippets = [
      snip({ docId: "unmatched", messageType: "warning" }),
      snip({ docId: "untagged" }),
      snip({ docId: "matched", messageType: "error", uiPattern: "snackbar" }),
      snip({ docId: "partial", messageType: "error" }),
    ];
    const boosted = applyScopeBoost(snippets, scope);
    expect(boosted.map((s) => s.docId)).toEqual(["matched", "partial", "unmatched", "untagged"]);
  });

  it("keeps original relative order within a score tier (stable sort)", () => {
    const snippets = [
      snip({ docId: "untagged-1" }),
      snip({ docId: "untagged-2" }),
      snip({ docId: "conflict", messageType: "warning" }),
    ];
    const boosted = applyScopeBoost(snippets, scope);
    expect(boosted.map((s) => s.docId)).toEqual(["untagged-1", "untagged-2", "conflict"]);
  });

  it("is a no-op ordering-wise when no snippet has matching tags", () => {
    const snippets = [snip({ docId: "a" }), snip({ docId: "b" }), snip({ docId: "c" })];
    expect(applyScopeBoost(snippets, scope).map((s) => s.docId)).toEqual(["a", "b", "c"]);
  });
});
