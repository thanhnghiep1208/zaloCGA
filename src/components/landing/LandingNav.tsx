"use client";

import { ChatCircleText, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "@/context/ThemeContext";
import { SITE_HEADER_TITLE } from "@/lib/branding";
import { StartChatLink } from "./StartChatLink";

export function LandingNav() {
  const { theme, toggleTheme } = useTheme();
  const toggleLabel = theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-charcoal text-white">
            <ChatCircleText size={18} weight="fill" />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
            <span className="sm:hidden">Guidelines</span>
            <span className="hidden sm:inline">{SITE_HEADER_TITLE}</span>
          </span>
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="grid size-9 place-items-center rounded-xl border border-border text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <StartChatLink size="sm" location="nav" />
        </div>
      </nav>
    </header>
  );
}
