import { describe, expect, it } from "vitest";
import {
  EnvConfigError,
  parseInternalAuthEmailDomain,
  resolveInternalAuthEmailDomain,
} from "@/lib/env/internal-auth-domain";

describe("parseInternalAuthEmailDomain", () => {
  it("uses default when unset", () => {
    expect(parseInternalAuthEmailDomain(undefined, "TEST")).toBe("accounts.internal");
  });

  it("normalizes case and whitespace", () => {
    expect(parseInternalAuthEmailDomain("  Accounts.Internal  ", "TEST")).toBe(
      "accounts.internal"
    );
  });

  it("rejects values that look like emails", () => {
    expect(() => parseInternalAuthEmailDomain("user@corp.com", "TEST")).toThrow(
      EnvConfigError
    );
  });
});

describe("resolveInternalAuthEmailDomain", () => {
  it("accepts when public and internal match", () => {
    expect(
      resolveInternalAuthEmailDomain({
        public: "accounts.internal",
        internal: "accounts.internal",
      })
    ).toBe("accounts.internal");
  });

  it("throws when both are set but differ", () => {
    expect(() =>
      resolveInternalAuthEmailDomain({
        public: "accounts.internal",
        internal: "other.internal",
      })
    ).toThrow(EnvConfigError);
  });

  it("allows only public on client-style resolution", () => {
    expect(
      resolveInternalAuthEmailDomain(
        { public: "corp.internal" },
        { requirePairMatch: false }
      )
    ).toBe("corp.internal");
  });

  it("allows only internal on server when public is unset", () => {
    expect(resolveInternalAuthEmailDomain({ internal: "corp.internal" })).toBe(
      "corp.internal"
    );
  });
});
