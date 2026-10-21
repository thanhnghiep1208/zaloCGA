"use client";

import type { User } from "firebase/auth";
import { FormEvent, useEffect, useState } from "react";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import type { AccountContact } from "@/lib/account-contact";

type Status = { kind: "error" | "success"; message: string } | null;

const CONTACT_API = "/api/admin/settings/contact";

async function requestContact(user: User, init?: RequestInit): Promise<AccountContact> {
  const authHeader = await firebaseBearerAuthHeader(user);
  const res = await fetch(CONTACT_API, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader },
  });
  const data = (await res.json()) as AccountContact & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Không lưu được thông tin liên hệ.");
  return data;
}

/** Admin form for the account-request contact shown on /login. */
export function AccountContactPanel({ user }: { user: User }) {
  const [email, setEmail] = useState("");
  const [zalo, setZalo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let cancelled = false;
    requestContact(user)
      .then((contact) => {
        if (cancelled) return;
        setEmail(contact.email);
        setZalo(contact.zalo);
      })
      .catch((err: Error) => !cancelled && setStatus({ kind: "error", message: err.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const saved = await requestContact(user, {
        method: "PUT",
        body: JSON.stringify({ email, zalo }),
      });
      setEmail(saved.email);
      setZalo(saved.zalo);
      setStatus({ kind: "success", message: "Đã lưu. Trang đăng nhập hiển thị ngay." });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving;

  return (
    <div className="clay-card p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Liên hệ cấp tài khoản</h2>
        <p className="text-sm text-muted">
          Hiển thị ở trang đăng nhập. Để trống ô nào thì ẩn ô đó; để trống cả hai thì ẩn cả dòng.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="contact-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="ten@congty.com"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="contact-zalo" className="text-sm font-medium">
            Số Zalo
          </label>
          <input
            id="contact-zalo"
            type="tel"
            value={zalo}
            onChange={(e) => setZalo(e.target.value)}
            disabled={disabled}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="09xxxxxxxx"
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={disabled}
            className="rounded-xl bg-charcoal text-cream px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu liên hệ"}
          </button>
          {status && (
            <p
              className={
                status.kind === "error"
                  ? "text-sm text-red-600 dark:text-red-400"
                  : "text-sm text-green-700 dark:text-green-400"
              }
            >
              {status.message}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
