"use client";

import { useAuth } from "@/context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePathname, useRouter } from "next/navigation";
import { SITE_HEADER_TITLE } from "@/lib/branding";
import { useTheme } from "@/context/ThemeContext";

interface HeaderProps {
  onOpenMenu?: () => void;
}

export function Header({ onOpenMenu }: HeaderProps) {
  const { user, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const isChatPage = pathname?.startsWith("/chat") ?? false;

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
    <header className="border-b border-border bg-surface/95 text-foreground backdrop-blur flex items-center px-4 md:px-6 sticky top-0 z-50 min-h-16 py-2">
      <div className="flex-1 flex items-center gap-3">
        <button
          onClick={onOpenMenu}
          className="p-2 -ml-2 hover:bg-border/50 rounded-lg text-muted md:hidden"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="min-w-0">
          <span className="font-light text-lg text-foreground tracking-[-0.22px]">{SITE_HEADER_TITLE}</span>
          <p className={`text-muted text-xs font-normal leading-tight ${isChatPage ? "block" : "hidden"}`}>
            Hỏi guideline hoặc mô tả microcopy UI — trợ lý tự chọn cách trả lời phù hợp.
          </p>
        </div>
        {role === "admin" && (
          <span
            className={`px-2 py-0.5 rounded-[4px] text-[10px] font-normal border ${
              theme === "dark"
                ? "bg-white/10 text-white border-white/20"
                : "bg-[#f6f9fc] text-[#273951] border-border"
            }`}
          >
            Admin
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <button
          onClick={toggleTheme}
          className="clay-hover-playful bg-surface border border-border p-1.5 rounded-[4px] text-foreground"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2.2M12 18.8V21M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M3 12h2.2M18.8 12H21M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12.8A8.8 8.8 0 1111.2 3a7 7 0 109.8 9.8z" />
            </svg>
          )}
        </button>
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-foreground font-normal leading-tight truncate max-w-[150px]">
            {user?.displayName || (user?.email?.split('@')[0])}
          </span>
          <span className="text-[10px] text-muted font-normal leading-tight">
            {user?.email}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="clay-hover-playful bg-[#533afd] border border-transparent px-3 py-1.5 clay-pill text-white hover:bg-[#4434d4] font-normal transition-all text-xs"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
