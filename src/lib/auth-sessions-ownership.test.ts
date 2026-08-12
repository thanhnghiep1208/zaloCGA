import { describe, expect, it, vi } from "vitest";

// auth-sessions.ts imports the Firebase client (@/lib/firebase), which throws
// at module load time unless NEXT_PUBLIC_FIREBASE_* env vars are set. Stub it
// out — this test only exercises the pure ownership predicate, no real
// Firestore/Firebase calls.
vi.mock("@/lib/firebase", () => ({ db: {} }));

const { sessionBelongsToOtherUser } = await import("@/lib/auth-sessions");

describe("sessionBelongsToOtherUser", () => {
  it("returns false when no session doc exists yet (first login on this device)", () => {
    expect(sessionBelongsToOtherUser(undefined, "user-a")).toBe(false);
  });

  it("returns false when the existing session doc belongs to the same user", () => {
    expect(sessionBelongsToOtherUser("user-a", "user-a")).toBe(false);
  });

  it("returns true when the existing session doc belongs to a different user", () => {
    expect(sessionBelongsToOtherUser("user-a", "user-b")).toBe(true);
  });
});
