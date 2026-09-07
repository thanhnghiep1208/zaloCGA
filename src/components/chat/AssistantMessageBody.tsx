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

type Props = {
  content: string;
  sources?: ChatSource[];
  prototype?: PrototypeSpec | null;
  onPreviewDoc: (docId: string) => void;
};

/** Answer body shared by the live chat message and the read-only history page. */
export function AssistantMessageBody({ content, sources, prototype, onPreviewDoc }: Props) {
  const visibleSources = selectVisibleSources(content, sources);
  // Strip ở đây phủ cả streaming lẫn replay lịch sử bằng một chỗ duy nhất.
  const displayContent = stripPrototypeBlock(stripSourcesMarker(content));

  return (
    <>
      <div className="ai-response-container prose prose-base max-w-none text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
      </div>

      {prototype && <PrototypePreview spec={prototype} />}

      {visibleSources.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <p className="text-sm font-bold text-foreground">Featured Sources</p>
            </div>
            <span className="text-[10px] font-medium text-muted uppercase tracking-widest bg-surface border border-border px-2 py-0.5 rounded-full">
              Scanned {sources?.length || 0} files
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleSources.map((src, i) => (
              <div
                key={i}
                className="bg-background border border-border/80 p-4 rounded-[16px] flex flex-col gap-2 transition-colors hover:border-parchment group"
              >
                <div className="flex items-center gap-2 truncate">
                  <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="text-sm font-semibold truncate group-hover:text-accent transition-colors">
                    {src.fileName}
                  </span>
                </div>
                {src.excerpt && (
                  <p className="text-xs text-muted leading-relaxed line-clamp-3 italic opacity-80">
                    <span className="not-italic">&ldquo;</span>
                    {src.excerpt}
                    <span className="not-italic">&rdquo;</span>
                  </p>
                )}
                {src.docId ? (
                  <button
                    type="button"
                    onClick={() => onPreviewDoc(src.docId ?? "")}
                    className="text-xs text-link hover:underline font-medium text-left"
                  >
                    Mở nội dung tham khảo
                  </button>
                ) : src.reference ? (
                  src.reference.startsWith("/") ? (
                    <Link href={src.reference} className="text-xs text-link hover:underline font-medium">
                      Mở nội dung tham khảo
                    </Link>
                  ) : (
                    <a
                      href={src.reference}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-link hover:underline font-medium"
                    >
                      Mở nội dung tham khảo
                    </a>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
