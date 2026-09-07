"use client";

import { AssistantMessageBody } from "./AssistantMessageBody";
import type { ChatMessage } from "@/types/chat";

type Props = {
  msg: ChatMessage;
  onPreviewDoc: (docId: string) => void;
  onFeedback: (messageId: string, value: "up" | "down") => void;
  onCopy: (text: string, messageId: string) => void;
};

export function ChatAssistantMessage({ msg, onPreviewDoc, onFeedback, onCopy }: Props) {
  return (
    <div className="clay-card px-6 py-6 rounded-[16px] w-full">
      <AssistantMessageBody
        content={msg.content}
        sources={msg.sources}
        prototype={msg.prototype}
        onPreviewDoc={onPreviewDoc}
      />

      <div className="mt-5 flex items-center gap-2 border-t border-border/40 pt-3">
        <span className="text-xs text-muted shrink-0">Đánh giá:</span>
        <button
          onClick={() => onFeedback(msg.id, "up")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-sm font-medium border transition-colors ${
            msg.feedback === "up"
              ? "text-green-700 bg-green-100 border-green-500"
              : "text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700 hover:border-green-400"
          }`}
          title="Hữu ích"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 9V5a3 3 0 00-3-3l-1 4-3 4v10h11.28a2 2 0 001.98-1.72l1-7A2 2 0 0019.28 9H14zM7 22H4a2 2 0 01-2-2v-8a2 2 0 012-2h3"
            />
          </svg>
          Hữu ích
        </button>
        <button
          onClick={() => onFeedback(msg.id, "down")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-sm font-medium border transition-colors ${
            msg.feedback === "down"
              ? "text-red-700 bg-red-100 border-red-500"
              : "text-red-500 border-red-300 hover:bg-red-50 hover:text-red-600 hover:border-red-400"
          }`}
          title="Chưa hữu ích"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 15v4a3 3 0 003 3l1-4 3-4V4H5.72a2 2 0 00-1.98 1.72l-1 7A2 2 0 004.72 15H10zM17 2h3a2 2 0 012 2v8a2 2 0 01-2 2h-3"
            />
          </svg>
          Chưa hữu ích
        </button>
        <div className="flex-1" />
        <button
          onClick={() => void onCopy(msg.content, msg.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-sm font-medium border border-border text-foreground hover:bg-border/60 transition-colors"
          title="Copy câu trả lời"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
