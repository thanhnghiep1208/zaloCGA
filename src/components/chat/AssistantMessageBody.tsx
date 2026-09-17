"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatSource } from "@/types/chat";
import { stripPrototypeBlock } from "@/lib/chat/prototype-extract";
import type { PrototypeSpec } from "@/lib/chat/prototype-spec";
import { PrototypePreview } from "./prototype/PrototypePreview";

const SOURCES_USED_RE = /\[SOURCES_USED:\s*(.*?)\]/;
/** Bản global để xoá HẾT marker: model đôi khi xuất hai lần, cái thứ hai từng lọt ra UI. */
const SOURCES_USED_RE_ALL = /\[SOURCES_USED:\s*.*?\]/g;

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link rounded-[4px]";

/**
 * Sources the model said it actually used, per the trailing [SOURCES_USED: ...] marker.
 * Messages written before the marker existed have none — show everything rather than nothing.
 */
export function selectVisibleSources(
  content: string,
  sources: ChatSource[] | undefined
): ChatSource[] {
  if (!sources?.length) return [];
  const match = content.match(SOURCES_USED_RE);
  if (!match) return sources;

  const usedFileNames = match[1].split(",").map((s) => s.trim().toLowerCase());
  return sources.filter((s) => usedFileNames.includes(s.fileName.toLowerCase()));
}

export function stripSourcesMarker(content: string): string {
  return content.replace(SOURCES_USED_RE_ALL, "").trim();
}

const OPEN_SOURCE_LABEL = "Mở nội dung tham khảo";

/** One "open this source" affordance — internal doc, app route, or external URL. */
function SourceLink({ src, onPreviewDoc }: { src: ChatSource; onPreviewDoc: (id: string) => void }) {
  const className = `mt-2 inline-block text-[13px] font-medium text-link hover:underline cursor-pointer ${FOCUS_RING}`;

  if (src.docId) {
    return (
      <button type="button" onClick={() => onPreviewDoc(src.docId ?? "")} className={`${className} text-left`}>
        {OPEN_SOURCE_LABEL}
      </button>
    );
  }
  if (!src.reference) return null;
  if (src.reference.startsWith("/")) {
    return (
      <Link href={src.reference} className={className}>
        {OPEN_SOURCE_LABEL}
      </Link>
    );
  }
  return (
    <a href={src.reference} target="_blank" rel="noreferrer" className={className}>
      {OPEN_SOURCE_LABEL}
    </a>
  );
}

type Props = {
  content: string;
  sources?: ChatSource[];
  prototype?: PrototypeSpec | null;
  onPreviewDoc: (docId: string) => void;
};

/** Answer body shared by the live chat message and the read-only history page. */
export function AssistantMessageBody({ content, sources, prototype, onPreviewDoc }: Props) {
  const visibleSources = selectVisibleSources(content, sources);
  const scannedCount = sources?.length ?? 0;
  // Strip ở đây phủ cả streaming lẫn replay lịch sử bằng một chỗ duy nhất.
  const displayContent = stripPrototypeBlock(stripSourcesMarker(content));

  return (
    <>
      <div className="ai-response-container prose prose-base max-w-none text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
      </div>

      {prototype && <PrototypePreview spec={prototype} />}

      {visibleSources.length > 0 && (
        /* Citations are supporting evidence, not the answer — quiet by default,
           and collapsible so a long thread stays skimmable. */
        <details open className="group mt-7 border-t border-border/60 pt-4">
          <summary
            className={`flex cursor-pointer list-none items-center gap-2 text-sm text-muted transition-colors hover:text-foreground ${FOCUS_RING} [&::-webkit-details-marker]:hidden`}
          >
            <svg
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium text-foreground">Nguồn tham khảo</span>
            <span>({visibleSources.length})</span>
            {scannedCount > visibleSources.length && (
              <span className="ml-auto text-xs">Đã quét {scannedCount} tệp</span>
            )}
          </summary>

          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleSources.map((src, i) => (
              <li
                key={i}
                className="rounded-[12px] border border-border/70 bg-background/50 p-3.5 transition-colors hover:border-parchment"
              >
                <div className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {src.fileName}
                  </span>
                </div>
                {src.excerpt && (
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
                    {src.excerpt}
                  </p>
                )}
                <SourceLink src={src} onPreviewDoc={onPreviewDoc} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
