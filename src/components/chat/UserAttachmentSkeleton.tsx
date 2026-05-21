"use client";

import { shortImageTitle } from "@/lib/chat/utils";

export function UserAttachmentSkeleton({ name }: { name: string }) {
  return (
    <div className="block w-[72px] shrink-0" aria-busy="true" aria-label={name}>
      <div className="relative h-[72px] w-[72px] overflow-hidden rounded-lg border border-border bg-muted/35">
        <div
          className="absolute inset-0 bg-gradient-to-br from-muted/60 via-muted/25 to-muted/60 motion-safe:animate-pulse"
          aria-hidden
        />
        <div className="absolute inset-0 flex items-center justify-center text-muted/50" aria-hidden>
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      </div>
      <p className="mt-0.5 min-h-[14px] max-w-[72px] truncate text-center text-[10px] leading-[14px] text-muted">
        {shortImageTitle(name)}
      </p>
    </div>
  );
}
