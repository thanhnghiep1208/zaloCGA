import { describe, expect, it } from "vitest";
import { changePasswordErrorMessage, validateChangePasswordInput } from "./change-password";

const valid = { currentPassword: "old-pass-1", newPassword: "new-pass-1", confirmPassword: "new-pass-1" };

describe("validateChangePasswordInput", () => {
  it("accepts valid input", () => {
    expect(validateChangePasswordInput(valid)).toBeNull();
  });

  it("requires the current password", () => {
    expect(validateChangePasswordInput({ ...valid, currentPassword: "" })).toMatch(/hiện tại/);
  });

  it("rejects short new passwords", () => {
    expect(
      validateChangePasswordInput({ ...valid, newPassword: "short", confirmPassword: "short" })
    ).toMatch(/ít nhất/);
  });

  it("rejects mismatched confirmation", () => {
    expect(validateChangePasswordInput({ ...valid, confirmPassword: "other-pass" })).toMatch(/không khớp/);
  });

  it("rejects reusing the current password", () => {
    expect(
      validateChangePasswordInput({ ...valid, newPassword: "old-pass-1", confirmPassword: "old-pass-1" })
    ).toMatch(/khác/);
  });
});

describe("changePasswordErrorMessage", () => {
  it("maps wrong-password codes", () => {
    expect(changePasswordErrorMessage({ code: "auth/invalid-credential" })).toMatch(/không đúng/);
    expect(changePasswordErrorMessage({ code: "auth/wrong-password" })).toMatch(/không đúng/);
  });

  it("falls back to a generic message", () => {
    expect(changePasswordErrorMessage(new Error("boom"))).toMatch(/Không thể đổi/);
  });
});
