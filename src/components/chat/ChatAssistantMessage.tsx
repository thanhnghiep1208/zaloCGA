"use client";

import { AssistantMessageBody } from "./AssistantMessageBody";
import type { ChatMessage } from "@/types/chat";

type Props = {
  msg: ChatMessage;
  onPreviewDoc: (docId: string) => void;
  onFeedback: (messageId: string, value: "up" | "down") => void;
  onCopy: (text: string, messageId: string) => void;
};

/* Tertiary actions: ghost by default so they never outshout the answer.
   Colour appears only on the option the user actually picked. */
const ACTION_BASE =
  "inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[8px] border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link";
const ACTION_IDLE = "border-transparent text-muted hover:bg-border/50 hover:text-foreground";

/* Written out in full — Tailwind only sees class names that appear literally in source. */
const ACTION_UP_ON = `${ACTION_BASE} border-[var(--scope-success)] text-[var(--scope-success)]`;
const ACTION_DOWN_ON = `${ACTION_BASE} border-[var(--scope-error)] text-[var(--scope-error)]`;
const ACTION_OFF = `${ACTION_BASE} ${ACTION_IDLE}`;

export function ChatAssistantMessage({ msg, onPreviewDoc, onFeedback, onCopy }: Props) {

  return (
    <div className="clay-card px-5 py-6 sm:px-7 rounded-[16px] w-full">
      <AssistantMessageBody
        content={msg.content}
        sources={msg.sources}
        prototype={msg.prototype}
        onPreviewDoc={onPreviewDoc}
      />

      <div className="mt-6 flex items-center gap-1 border-t border-border/40 pt-2">
        <button
          type="button"
          onClick={() => onFeedback(msg.id, "up")}
          className={msg.feedback === "up" ? ACTION_UP_ON : ACTION_OFF}
          aria-pressed={msg.feedback === "up"}
          title="Câu trả lời hữu ích"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
          type="button"
          onClick={() => onFeedback(msg.id, "down")}
          className={msg.feedback === "down" ? ACTION_DOWN_ON : ACTION_OFF}
          aria-pressed={msg.feedback === "down"}
          title="Câu trả lời chưa hữu ích"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 15v4a3 3 0 003 3l1-4 3-4V4H5.72a2 2 0 00-1.98 1.72l-1 7A2 2 0 004.72 15H10zM17 2h3a2 2 0 012 2v8a2 2 0 01-2 2h-3"
            />
          </svg>
          Chưa hữu ích
        </button>
        <button
          type="button"
          onClick={() => void onCopy(msg.content, msg.id)}
          className={`${ACTION_OFF} ml-auto`}
          title="Copy câu trả lời"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
