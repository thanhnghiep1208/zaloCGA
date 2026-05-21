"use client";

import { useTheme } from "@/context/ThemeContext";
import type { ChatMessage } from "@/types/chat";
import { ChatAssistantMessage } from "@/components/chat/ChatAssistantMessage";
import { FriendlyLoading } from "@/components/chat/FriendlyLoading";
import { UserAttachmentSkeleton } from "@/components/chat/UserAttachmentSkeleton";
import { UserAttachmentThumb } from "@/components/chat/UserAttachmentThumb";

type Props = {
  messages: ChatMessage[];
  isLoading: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onPreviewDoc: (docId: string) => void;
  onFeedback: (messageId: string, value: "up" | "down") => void;
  onCopy: (text: string, messageId: string) => void;
};

export function ChatMessageList({
  messages,
  isLoading,
  bottomRef,
  onPreviewDoc,
  onFeedback,
  onCopy,
}: Props) {
  const { theme } = useTheme();

  return (
    <>
      {messages
        .filter((msg) => !(msg.role === "assistant" && msg.isStreaming && !msg.content.trim()))
        .map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col w-full ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {msg.role === "user" ? (
              <div className="flex max-w-[85%] flex-col items-end gap-2 [contain:layout]">
                {(msg.content.trim() ||
                  (!msg.attachments?.length && !msg.attachmentPlaceholders?.length)) && (
                  <div
                    className={`px-5 py-3 rounded-[8px] text-[15px] leading-relaxed border ${
                      theme === "dark"
                        ? "bg-cream text-charcoal border-border"
                        : "bg-charcoal text-white border-charcoal"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      {msg.content.trim() || (msg.attachments?.length ? "Ảnh đính kèm" : "")}
                    </p>
                  </div>
                )}
                {msg.attachments?.length || msg.attachmentPlaceholders?.length ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {msg.attachments?.map((att, idx) => (
                      <UserAttachmentThumb key={`${att.storagePath}-${idx}`} att={att} />
                    ))}
                    {!msg.attachments?.length &&
                      msg.attachmentPlaceholders?.map((p) => (
                        <UserAttachmentSkeleton key={p.id} name={p.name} />
                      ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <ChatAssistantMessage
                msg={msg}
                onPreviewDoc={onPreviewDoc}
                onFeedback={onFeedback}
                onCopy={onCopy}
              />
            )}
          </div>
        ))}

      {isLoading && (
        <div className="flex flex-col mr-auto items-start max-w-[85%] w-full animate-in fade-in pb-2">
          <div className="clay-card px-6 py-5 rounded-[16px] flex flex-col gap-3 w-fit min-w-[240px]">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-[bounce_1s_infinite_0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-[bounce_1s_infinite_200ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-[bounce_1s_infinite_400ms]" />
              </div>
              <span className="text-sm text-foreground font-bold tracking-tight">AI Assistant</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-foreground font-medium animate-pulse">
                <FriendlyLoading />
              </p>
              <p className="text-[10px] text-muted font-medium uppercase tracking-widest opacity-60">
                Đang xử lý…
              </p>
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} className="h-px" />
    </>
  );
}
