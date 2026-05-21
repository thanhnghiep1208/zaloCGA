"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/types/chat";

type Props = {
  msg: ChatMessage;
  onPreviewDoc: (docId: string) => void;
  onFeedback: (messageId: string, value: "up" | "down") => void;
  onCopy: (text: string, messageId: string) => void;
};

export function ChatAssistantMessage({ msg, onPreviewDoc, onFeedback, onCopy }: Props) {
  const sourcesUsedMatch = msg.content.match(/\[SOURCES_USED:\s*(.*?)\]/);
  const usedFileNames = sourcesUsedMatch
    ? sourcesUsedMatch[1].split(",").map((s) => s.trim().toLowerCase())
    : [];

  const displayContent = msg.content.replace(/\[SOURCES_USED:\s*.*?\]/, "").trim();
  const visibleSources =
    msg.sources?.filter((s) => usedFileNames.includes(s.fileName.toLowerCase())) || [];

  return (
    <div className="clay-card px-6 py-6 rounded-[16px] w-full">
      <style
        dangerouslySetInnerHTML={{
          __html: `
      .ai-response-container p {
        margin-bottom: 16px !important;
        line-height: 1.5 !important;
        display: block !important;
        color: var(--foreground) !important;
      }
      .ai-response-container h1,
      .ai-response-container h2,
      .ai-response-container h3,
      .ai-response-container h4,
      .ai-response-container h5,
      .ai-response-container h6 {
        margin-top: 24px !important;
        margin-bottom: 12px !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
        display: block !important;
        color: var(--strong-color) !important;
      }
      .ai-response-container h3 {
        font-size: 1.25rem !important;
      }
      .ai-response-container ul, .ai-response-container ol {
        margin-bottom: 24px !important;
        padding-left: 20px !important;
        color: var(--foreground) !important;
      }
      .ai-response-container li {
        margin-bottom: 8px !important;
        color: var(--foreground) !important;
      }
      .ai-response-container strong {
        color: var(--strong-color) !important;
      }
      .ai-response-container em,
      .ai-response-container code,
      .ai-response-container span {
        color: var(--foreground) !important;
      }
      .ai-response-container a {
        color: var(--link) !important;
        text-decoration: underline !important;
      }
      .ai-response-container pre {
        background: var(--code-bg) !important;
        color: var(--foreground) !important;
        border: 1px solid var(--code-border) !important;
        border-radius: 8px !important;
      }
      .ai-response-container pre code {
        background: transparent !important;
        color: var(--foreground) !important;
      }
      .ai-response-container :not(pre) > code {
        background: var(--code-inline-bg) !important;
        color: var(--foreground) !important;
        border: 1px solid var(--code-border) !important;
        border-radius: 8px !important;
        padding: 1px 4px !important;
      }
      .ai-response-container hr {
        margin: 40px 0 !important;
        border: 0 !important;
        border-top: 1px solid var(--border) !important;
      }
      .ai-response-container table {
        width: 100% !important;
        border-collapse: collapse !important;
      }
      .ai-response-container th,
      .ai-response-container td {
        color: var(--foreground) !important;
        border: 1px solid var(--code-border) !important;
        padding: 8px 10px !important;
      }
      .ai-response-container th {
        color: var(--strong-color) !important;
        background: var(--code-inline-bg) !important;
        font-weight: 700 !important;
      }
    `,
        }}
      />
      <div className="ai-response-container prose prose-base max-w-none text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
      </div>

      {visibleSources.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <p className="text-sm font-bold text-foreground">Featured Sources</p>
            </div>
            <span className="text-[10px] font-medium text-muted uppercase tracking-widest bg-surface border border-border px-2 py-0.5 rounded-full">
              Scanned {msg.sources?.length || 0} files
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

      <div className="mt-4 flex items-center justify-end border-t border-border/40 pt-2">
        <button
          onClick={() => onFeedback(msg.id, "up")}
          className={`p-1.5 rounded-md transition-colors ${
            msg.feedback === "up"
              ? "text-green-600 bg-green-50"
              : "text-muted hover:text-foreground hover:bg-border/80"
          }`}
          title="Hữu ích"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 9V5a3 3 0 00-3-3l-1 4-3 4v10h11.28a2 2 0 001.98-1.72l1-7A2 2 0 0019.28 9H14zM7 22H4a2 2 0 01-2-2v-8a2 2 0 012-2h3"
            />
          </svg>
        </button>
        <button
          onClick={() => onFeedback(msg.id, "down")}
          className={`ml-1 p-1.5 rounded-md transition-colors ${
            msg.feedback === "down"
              ? "text-red-600 bg-red-50"
              : "text-muted hover:text-foreground hover:bg-border/80"
          }`}
          title="Chưa hữu ích"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 15v4a3 3 0 003 3l1-4 3-4V4H5.72a2 2 0 00-1.98 1.72l-1 7A2 2 0 004.72 15H10zM17 2h3a2 2 0 012 2v8a2 2 0 01-2 2h-3"
            />
          </svg>
        </button>
        <button
          onClick={() => void onCopy(msg.content, msg.id)}
          className="ml-1 text-muted hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-border/80 flex items-center gap-1.5 text-xs font-medium"
          title="Copy answer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy
        </button>
      </div>
    </div>
  );
}
