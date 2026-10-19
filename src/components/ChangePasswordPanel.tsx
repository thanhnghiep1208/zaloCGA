"use client";

import type { User } from "firebase/auth";
import { FormEvent, useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-username";
import {
  changeOwnPassword,
  changePasswordErrorMessage,
  validateChangePasswordInput,
} from "@/lib/change-password";

type Status = { kind: "error" | "success"; message: string } | null;

export function ChangePasswordPanel({ user, onClose }: { user: User; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateChangePasswordInput({ currentPassword, newPassword, confirmPassword });
    if (invalid) {
      setStatus({ kind: "error", message: invalid });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await changeOwnPassword(user, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus({ kind: "success", message: "Đã đổi mật khẩu." });
    } catch (err) {
      console.error("[account] change password failed", err);
      setStatus({ kind: "error", message: changePasswordErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="clay-card p-6 space-y-4 border border-accent/30">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Đổi mật khẩu của bạn</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-1.5 text-sm"
          >
            Đóng
          </button>
        </div>
        <p className="text-sm text-muted">
          Nhập mật khẩu hiện tại để xác nhận. Mật khẩu mới tối thiểu {MIN_PASSWORD_LENGTH} ký tự.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <PasswordField
          id="current-password"
          label="Mật khẩu hiện tại"
          value={currentPassword}
          onChange={setCurrentPassword}
          disabled={saving}
          autoComplete="current-password"
        />
        <PasswordField
          id="new-password"
          label="Mật khẩu mới"
          value={newPassword}
          onChange={setNewPassword}
          disabled={saving}
        />
        <PasswordField
          id="confirm-password"
          label="Xác nhận mật khẩu mới"
          value={confirmPassword}
          onChange={setConfirmPassword}
          disabled={saving}
        />
        {status && (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={
              status.kind === "error"
                ? "text-sm text-red-600 dark:text-red-400"
                : "text-sm text-green-700 dark:text-green-400"
            }
          >
            {status.message}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-charcoal text-cream px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Đổi mật khẩu"}
        </button>
      </form>
    </div>
  );
}
