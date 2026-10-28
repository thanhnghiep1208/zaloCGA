"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { trackEvent } from "@/lib/gtag";

const SIZE_CLASS = {
  sm: "h-9 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

/** The page's single "start" CTA; every placement reuses this label and event. */
export function StartChatLink({
  size = "lg",
  location,
}: {
  size?: keyof typeof SIZE_CLASS;
  location: string;
}) {
  return (
    <Link
      href="/chat"
      onClick={() => trackEvent("start_chat_click", { location })}
      className={`group inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-charcoal font-semibold text-white shadow-[0_8px_24px_-8px_rgba(0,90,221,0.55)] transition-[transform,background-color] duration-200 hover:bg-[#004fc2] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link ${SIZE_CLASS[size]}`}
    >
      Bắt đầu ngay
      <ArrowRight
        size={size === "sm" ? 14 : 16}
        weight="bold"
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}
