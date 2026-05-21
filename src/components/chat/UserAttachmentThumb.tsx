"use client";

import { useState } from "react";
import type { ChatAttachmentMeta } from "@/lib/chatHistory";
import { shortImageTitle } from "@/lib/chat/utils";

export function UserAttachmentThumb({ att }: { att: ChatAttachmentMeta }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <a
      href={att.downloadURL}
      target="_blank"
      rel="noreferrer"
      className="block w-[72px] shrink-0 rounded-lg outline-none ring-offset-background transition-shadow hover:ring-2 hover:ring-accent/25 focus-visible:ring-2 focus-visible:ring-accent/40"
      title={att.name}
    >
      <div className="relative h-[72px] w-[72px] overflow-hidden rounded-lg border border-border bg-muted/35 shadow-sm">
        {!loaded && (
          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-muted/45 motion-safe:animate-pulse"
            aria-hidden
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- Firebase download URL */}
        <img
          src={att.downloadURL}
          alt=""
          width={72}
          height={72}
          decoding="async"
          loading="lazy"
          sizes="72px"
          className={`relative z-[2] h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </div>
      <p className="mt-0.5 min-h-[14px] max-w-[72px] truncate text-center text-[10px] leading-[14px] text-muted">
        {shortImageTitle(att.name)}
      </p>
    </a>
  );
}
