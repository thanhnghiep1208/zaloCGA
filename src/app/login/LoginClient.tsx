"use client";

import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/gtag";
import {
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/lib/auth-username";
import { useAuth } from "@/context/AuthContext";

function toFriendlyLoginError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return "Tên đăng nhập hoặc mật khẩu không đúng.";
  }
  if (code === "auth/user-disabled") {
    return "Tài khoản đã bị vô hiệu hóa. Liên hệ admin.";
  }
  if (code === "auth/too-many-requests") {
    return "Đăng nhập quá nhiều lần. Vui lòng thử lại sau.";
  }
  if (err instanceof Error) return err.message;
  return "Đăng nhập thất bại. Vui lòng thử lại.";
}

export default function LoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Stays disabled (via SSR-matching initial render) until React has hydrated
  // and attached the form's onSubmit handler. Without this, a click that
  // lands before hydration finishes falls through to the browser's native
  // form submit — which leaks the plaintext password into the URL as GET
  // query params instead of calling signInWithEmailAndPassword.
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, authError } = useAuth();

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      const next = searchParams.get("next") || "/chat";
      router.replace(next);
    }
  }, [user, authLoading, router, searchParams]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const normalized = normalizeUsername(username);
    if (!isValidUsername(normalized)) {
      setError(
        "Tên đăng nhập không hợp lệ (3–32 ký tự: chữ thường, số, . _ -)."
      );
      setLoading(false);
      return;
    }

    try {
      const email = usernameToAuthEmail(normalized);
      await signInWithEmailAndPassword(auth, email, password);
      // Authorization (users/{uid} doc + role) is decided solely by AuthContext;
      // its `authError`/`user` state drives the error banner and redirect below.
      trackEvent("login", { method: "password" });
    } catch (err: unknown) {
      setError(toFriendlyLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex-1 flex items-center justify-center p-6 min-h-screen overflow-hidden animate-in fade-in duration-500">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_-5%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_50%),radial-gradient(70%_50%_at_100%_100%,color-mix(in_oklab,var(--link)_12%,transparent),transparent_55%)]"
      />
      <div className="relative clay-card p-8 md:p-10 w-full max-w-[28rem] space-y-8 rounded-2xl shadow-[var(--shadow-md)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
        <div className="text-center space-y-4 pb-2">
          <div className="w-16 h-16 bg-accent/25 border border-border rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[var(--shadow-xs)]">
            <svg
              className="w-8 h-8 text-accent"
              fill="none"
              strokeWidth={1.5}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
              />
            </svg>
          </div>
          <h1 className="text-3xl md:text-[2rem] font-semibold text-foreground tracking-[-0.04em]">
            Internal Portal
          </h1>
          <p className="text-muted text-[15px] max-w-sm mx-auto leading-relaxed">
            Đăng nhập bằng tài khoản do admin cấp để truy cập Zalo Content Guidelines.
          </p>
        </div>

        {(error || authError) && (
          <div className="bg-red-50 text-red-600 text-[13px] p-3 rounded-lg border border-red-100 text-center font-medium dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50">
            {error || authError}
          </div>
        )}

        <form onSubmit={handleSignIn} method="post" className="pt-2 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-foreground">
              Tên đăng nhập
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="ten.dang.nhap"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Mật khẩu
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !hydrated}
            aria-label="Đăng nhập"
            className="clay-hover-playful w-full bg-charcoal text-cream border border-border py-3.5 rounded-xl font-semibold transition-opacity disabled:opacity-50 flex items-center justify-center gap-3 shadow-[var(--shadow-xs)]"
          >
            {loading ? (
              <div className="flex gap-1.5 items-center">
                <div
                  className="w-2 h-2 rounded-full bg-foreground/60 animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-foreground/60 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-foreground/60 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            ) : (
              <span className="text-[15px]">Đăng nhập</span>
            )}
          </button>
        </form>

        <p className="text-center text-[13px] text-muted leading-relaxed pt-4 border-t border-border/60">
          Để được cấp tài khoản vui lòng liên hệ:{" "}
          <a
            href="mailto:Nghiepnt@vng.com.vn"
            className="text-link font-medium hover:underline"
          >
            Nghiepnt@vng.com.vn
          </a>
          {" — "}
          Zalo:{" "}
          <a href="tel:0933312887" className="text-link font-medium hover:underline">
            0933312887
          </a>
        </p>
      </div>
    </main>
  );
}
