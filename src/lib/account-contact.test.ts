import { describe, expect, it } from "vitest";
import { validateAccountContactBody } from "@/lib/account-contact";

describe("validateAccountContactBody", () => {
  it("accepts and trims a valid email and Zalo number", () => {
    expect(validateAccountContactBody({ email: " a.b@example.com ", zalo: " 0901234567 " })).toEqual({
      ok: true,
      data: { email: "a.b@example.com", zalo: "0901234567" },
    });
  });

  it("accepts empty values so either field can be hidden", () => {
    expect(validateAccountContactBody({ email: "", zalo: "" })).toEqual({
      ok: true,
      data: { email: "", zalo: "" },
    });
    expect(validateAccountContactBody({})).toEqual({ ok: true, data: { email: "", zalo: "" } });
  });

  it("accepts an international Zalo number with spaces", () => {
    expect(validateAccountContactBody({ zalo: "+84 901 234 567" }).ok).toBe(true);
  });

  it("rejects an email without a domain", () => {
    expect(validateAccountContactBody({ email: "someone" }).ok).toBe(false);
  });

  it("rejects a Zalo number with letters or too few digits", () => {
    expect(validateAccountContactBody({ zalo: "abc123" }).ok).toBe(false);
    expect(validateAccountContactBody({ zalo: "12345" }).ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(validateAccountContactBody(null).ok).toBe(false);
    expect(validateAccountContactBody("x").ok).toBe(false);
  });
});
