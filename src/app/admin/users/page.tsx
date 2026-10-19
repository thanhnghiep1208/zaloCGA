"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-username";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { AuthSessionsPanel } from "@/components/AuthSessionsPanel";
import { ChangePasswordPanel } from "@/components/ChangePasswordPanel";
import { PasswordField } from "@/components/PasswordField";
import { FormEvent, useEffect, useState } from "react";

type FirestoreTimestampLike = { seconds: number; nanoseconds?: number };

type AdminUserRow = {
  id: string;
  profileUid: string;
  uid?: string;
  username?: string;
  email?: string | null;
  displayName?: string | null;
  role?: string;
  disabled?: boolean;
  createdAt?: FirestoreTimestampLike;
};

type CreateRole = "user" | "contributor" | "admin";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser, role, loading: authLoading } = useAuth();
  const { theme } = useTheme();

  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<CreateRole>("user");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const [resetUid, setResetUid] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [changeOwnPasswordOpen, setChangeOwnPasswordOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sessionsUserId, setSessionsUserId] = useState<string | null>(null);
  const [sessionsUsername, setSessionsUsername] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || role !== "admin") {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const usersData: AdminUserRow[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AdminUserRow, "id" | "profileUid">),
          profileUid: (d.data() as { uid?: string }).uid ?? d.id,
        }));
        setUsers(usersData);
        setLoading(false);
      },
      (error) => {
        if (error.code === "permission-denied") {
          console.warn("User listener: Permission denied (expected during sign-out)");
        } else {
          console.error("Permission denied reading users collection:", error);
          alert("Access error: You may not have administrative permissions to view this list.");
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [currentUser, role, authLoading]);

  const handleRoleChange = async (profileUid: string, newRole: string) => {
    try {
      await setDoc(
        doc(db, "users", profileUid),
        { role: newRole, uid: profileUid },
        { merge: true }
      );
    } catch (e) {
      console.error("Failed to update user role", e);
      alert("Could not update role.");
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");

    try {
      const authHeader = await firebaseBearerAuthHeader(currentUser);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          username: createUsername,
          password: createPassword,
          role: createRole,
          displayName: createDisplayName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; username?: string };
      if (!res.ok) {
        setCreateError(data.error ?? "Could not create user");
        return;
      }
      setCreateSuccess(
        `Đã tạo tài khoản "${data.username ?? createUsername}". Gửi mật khẩu cho user qua kênh nội bộ.`
      );
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("user");
      setCreateDisplayName("");
    } catch (err) {
      console.error(err);
      setCreateError("Could not create user");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleDisabled = async (profileUid: string, disabled: boolean) => {
    if (!currentUser) return;
    try {
      const authHeader = await firebaseBearerAuthHeader(currentUser);
      const res = await fetch(`/api/admin/users/${profileUid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ disabled }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Could not update user");
      }
    } catch (e) {
      console.error(e);
      alert("Could not update user");
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser || !resetUid) return;
    setResetting(true);
    try {
      const authHeader = await firebaseBearerAuthHeader(currentUser);
      const res = await fetch(`/api/admin/users/${resetUid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Could not reset password");
        return;
      }
      setResetUid(null);
      setResetPassword("");
      alert("Đã đặt lại mật khẩu.");
    } catch (err) {
      console.error(err);
      alert("Could not reset password");
    } finally {
      setResetting(false);
    }
  };

  /** Own account → change-password form (needs current password); others → admin reset. */
  const openPasswordForm = (otherProfileUid: string | null) => {
    setChangeOwnPasswordOpen(otherProfileUid === null);
    setResetUid(otherProfileUid);
    setResetPassword("");
  };

  const handleDelete = async (profileUid: string) => {
    if (profileUid === currentUser?.uid) {
      alert("You cannot delete your own active administrator account.");
      return;
    }
    if (!confirm("Xóa tài khoản này? User sẽ không đăng nhập được nữa.")) return;
    if (!currentUser) return;

    try {
      const authHeader = await firebaseBearerAuthHeader(currentUser);
      const res = await fetch(`/api/admin/users/${profileUid}`, {
        method: "DELETE",
        headers: { ...authHeader },
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Could not delete user");
      }
    } catch (e) {
      console.error("Failed to delete user", e);
      alert("Could not delete user");
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
        <div className="space-y-1">
          <h1 className="text-2xl font-light tracking-tight">Manage Users</h1>
          <p className="text-muted text-sm">
            Tạo tài khoản username/password và quản lý quyền truy cập nội bộ.
          </p>
        </div>

        <div className="clay-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Tạo tài khoản mới</h2>
          <form onSubmit={handleCreateUser} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="new-username" className="text-sm font-medium">
                Tên đăng nhập
              </label>
              <input
                id="new-username"
                required
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                disabled={creating}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="ten.dang.nhap"
              />
            </div>
            <PasswordField
              id="new-password"
              label={`Mật khẩu tạm (tối thiểu ${MIN_PASSWORD_LENGTH} ký tự)`}
              value={createPassword}
              onChange={setCreatePassword}
              disabled={creating}
            />
            <div className="space-y-1.5">
              <label htmlFor="new-role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="new-role"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as CreateRole)}
                disabled={creating}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="user">User</option>
                <option value="contributor">Contributor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-display" className="text-sm font-medium">
                Tên hiển thị (tuỳ chọn)
              </label>
              <input
                id="new-display"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
                disabled={creating}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-charcoal text-cream px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {creating ? "Đang tạo…" : "Tạo tài khoản"}
              </button>
              {createError && (
                <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
              )}
              {createSuccess && (
                <p className="text-sm text-green-700 dark:text-green-400">{createSuccess}</p>
              )}
            </div>
          </form>
        </div>

        {sessionsUserId && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                Phiên đăng nhập — {sessionsUsername || sessionsUserId}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSessionsUserId(null);
                  setSessionsUsername("");
                }}
                className="rounded-xl border border-border px-3 py-1.5 text-sm"
              >
                Đóng
              </button>
            </div>
            <AuthSessionsPanel
              userId={sessionsUserId}
              adminView
              title="Thiết bị / phiên đang ghi nhận"
              description="Admin có thể đăng xuất từ xa từng phiên. Khoá tài khoản hoặc reset mật khẩu sẽ thu hồi tất cả phiên."
            />
          </div>
        )}

        {changeOwnPasswordOpen && currentUser && (
          <ChangePasswordPanel user={currentUser} onClose={() => setChangeOwnPasswordOpen(false)} />
        )}

        {resetUid && (
          <div className="clay-card p-6 space-y-3 border border-accent/30">
            <h2 className="text-lg font-semibold">Đặt lại mật khẩu</h2>
            <form onSubmit={handleResetPassword} className="flex flex-wrap gap-3 items-end">
              <PasswordField
                id="reset-password"
                label={`Mật khẩu mới (≥ ${MIN_PASSWORD_LENGTH} ký tự)`}
                value={resetPassword}
                onChange={setResetPassword}
                disabled={resetting}
              />
              <button
                type="submit"
                disabled={resetting || resetPassword.length < MIN_PASSWORD_LENGTH}
                className="rounded-xl bg-charcoal text-cream px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetUid(null);
                  setResetPassword("");
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm"
              >
                Huỷ
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
          </div>
        ) : users.length === 0 ? (
          <div className="pt-8 text-center text-muted">No users found.</div>
        ) : (
          <div className="clay-card overflow-hidden flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface border-b border-border text-muted">
                  <tr>
                    <th className="font-medium p-4">Username</th>
                    <th className="font-medium p-4">Email (nội bộ)</th>
                    <th className="font-medium p-4">Role</th>
                    <th className="font-medium p-4">Joined</th>
                    <th className="font-medium p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr
                      key={u.profileUid}
                      className={`${theme === "dark" ? "hover:bg-accent/8" : "hover:bg-cream/40"} transition-colors`}
                    >
                      <td className="p-4 font-medium text-foreground">
                        {u.username ?? "—"}
                      </td>
                      <td className="p-4 text-muted text-xs">{u.email ?? "—"}</td>
                      <td className="p-4">
                        <select
                          id={`user-role-${u.profileUid}`}
                          name={`role-${u.profileUid}`}
                          value={u.role || "user"}
                          onChange={(e) => handleRoleChange(u.profileUid, e.target.value)}
                          disabled={u.uid === currentUser?.uid}
                          className="text-xs font-semibold rounded-[8px] px-2.5 py-1.5 outline-none border border-border bg-background cursor-pointer disabled:opacity-50"
                        >
                          <option value="user">User</option>
                          <option value="contributor">Contributor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="p-4 text-muted text-xs">
                        {u.createdAt
                          ? new Date(u.createdAt.seconds * 1000).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td className="p-4 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSessionsUserId(u.profileUid);
                            setSessionsUsername(u.username ?? u.profileUid);
                          }}
                          className="text-muted hover:text-foreground font-medium px-2 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors"
                        >
                          Phiên
                        </button>
                        <button
                          type="button"
                          onClick={() => openPasswordForm(u.uid === currentUser?.uid ? null : u.profileUid)}
                          className="text-muted hover:text-foreground font-medium px-2 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors disabled:opacity-30"
                        >
                          Reset MK
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleDisabled(u.profileUid, !u.disabled)
                          }
                          disabled={u.uid === currentUser?.uid}
                          className="text-muted hover:text-foreground font-medium px-2 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors disabled:opacity-30"
                        >
                          {u.disabled ? "Bật" : "Khoá"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(u.profileUid)}
                          disabled={u.uid === currentUser?.uid}
                          className="text-muted hover:text-foreground font-medium px-2 py-1.5 rounded-[8px] hover:bg-accent/12 transition-colors disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
