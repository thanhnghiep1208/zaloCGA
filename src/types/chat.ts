import type { ChatAttachmentMeta } from "@/lib/chatHistory";

export const SESSION_IDLE_MS = 10 * 60 * 1000;

export type ChatSource = {
  docId?: string;
  fileName: string;
  excerpt?: string;
  reference?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  attachments?: ChatAttachmentMeta[];
  /** Shown while uploads run so the thumb row does not pop in late (layout stability). */
  attachmentPlaceholders?: { id: string; name: string }[];
  isStreaming?: boolean;
  feedback?: "up" | "down";
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type LocalChatImage = {
  id: string;
  file: File;
  previewUrl: string;
};
