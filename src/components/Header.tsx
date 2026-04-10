"use client";

import { useAuth } from "@/context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SITE_HEADER_TITLE } from "@/lib/branding";

interface HeaderProps {
  onOpenMenu?: () => void;
}

export function Header({ onOpenMenu }: HeaderProps) {
  const { user, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isChatPage, setIsChatPage] = useState(false);

  useEffect(() => {
    setIsChatPage(pathname?.startsWith("/chat") ?? false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      // Redirect to login first so the component unmounts and detaches listeners
      router.replace("/login");
      // Use a small delay to ensure navigation starts before the session is cleared
      await new Promise(resolve => setTimeout(resolve, 100));
      await signOut(auth);
    } catch (e) {
      console.error("Failed to signout", e);
    }
  };

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur flex items-center px-4 md:px-6 sticky top-0 z-50 min-h-16 py-2">
      <div className="flex-1 flex items-center gap-3">
        <button
          onClick={onOpenMenu}
          className="p-2 -ml-2 hover:bg-border/50 rounded-lg text-muted md:hidden"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="min-w-0">
          <span className="font-bold text-lg text-foreground tracking-tight">{SITE_HEADER_TITLE}</span>
          <p className={`text-muted text-xs font-medium leading-tight ${isChatPage ? "block" : "hidden"}`}>
            Hỏi guideline hoặc mô tả microcopy UI — trợ lý tự chọn cách trả lời phù hợp.
          </p>
        </div>
        {role === "admin" && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent/10 text-accent tracking-[0.1em] uppercase border border-accent/20">Admin</span>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-foreground font-bold leading-tight truncate max-w-[150px]">
            {user?.displayName || (user?.email?.split('@')[0])}
          </span>
          <span className="text-[10px] text-muted font-medium opacity-60 leading-tight">
            {user?.email}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="bg-surface border border-border px-3 py-1.5 rounded-lg text-foreground hover:bg-border/50 font-semibold transition-all text-xs"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
