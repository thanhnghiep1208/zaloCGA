"use client";

import { DragEvent, useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { updateChatSession, StoredMessage } from "@/lib/chatHistory";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { postClientAnalyticsEvent } from "@/lib/client-analytics-event";
import { toFriendlyErrorMessage } from "@/lib/user-error";
import { newClientMessageId } from "@/lib/chat/utils";
import { uploadChatAttachments } from "@/lib/chat/upload-attachments";
import {
  createChatStreamParseState,
  feedChatStreamChunk,
} from "@/lib/chat/stream";
import type { ChatMessage, ConversationTurn } from "@/types/chat";
import { useChatSession } from "@/hooks/useChatSession";
import { useChatAttachments } from "@/hooks/useChatAttachments";

function toStoredMessages(msgs: ChatMessage[]): StoredMessage[] {
  return msgs
    .filter((m) => !m.isStreaming && m.content)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ...(m.sources !== undefined ? { sources: m.sources } : {}),
      ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
      timestamp: Date.now(),
    }));
}

export function useChatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const embeddingRef = useRef<number[] | null>(null);
  const embedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const embedAbortRef = useRef<AbortController | null>(null);

  const session = useChatSession(user);
  const attachments = useChatAttachments();

  const hasVisibleMessages = messages.some(
    (m) => m.role === "user" || (m.role === "assistant" && !!m.content.trim())
  );
  const showConversationLayout = hasVisibleMessages || isLoading;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, isLoading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (embedDebounceRef.current) clearTimeout(embedDebounceRef.current);
      embedAbortRef.current?.abort();
    };
  }, []);

  // Handle ?new=1 — reset chat state and redirect
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    void (async () => {
      await session.endSessionAnalytics();
      setMessages([]);
      setInput("");
      setIsLoading(false);
      session.resetSession();
      attachments.clearPendingImages();
      router.replace("/chat");
    })();
  }, [searchParams, router, session, attachments]);

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      embeddingRef.current = null;
      embedAbortRef.current?.abort();
      if (embedDebounceRef.current) clearTimeout(embedDebounceRef.current);

      const trimmed = value.trim();
      if (!user || trimmed.length < 10) return;

      embedDebounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        embedAbortRef.current = controller;
        try {
          const authHeader = await firebaseBearerAuthHeader(user);
          const res = await fetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ query: trimmed }),
            signal: controller.signal,
          });
          if (res.ok) {
            const data: unknown = await res.json();
            if (
              data &&
              typeof data === "object" &&
              "embedding" in data &&
              Array.isArray((data as { embedding: unknown }).embedding)
            ) {
              embeddingRef.current = (data as { embedding: number[] }).embedding;
            }
          }
        } catch {
          /* silently fail — server will compute embedding on Send */
        }
      }, 500);
    },
    [user]
  );

  const buildConversationContext = (): ConversationTurn[] => {
    return messages
      .filter((m) => !m.isStreaming && !!m.content.trim())
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.selectedImages.length === 0) || isLoading || !user) return;

    const userQuery = input.trim();
    const pendingThumbs =
      attachments.selectedImages.length > 0
        ? attachments.selectedImages.map((i) => ({ id: i.id, name: i.file.name }))
        : undefined;
    const userMsg: ChatMessage = {
      id: newClientMessageId(),
      role: "user",
      content: userQuery,
      ...(pendingThumbs ? { attachmentPlaceholders: pendingThumbs } : {}),
    };

    const assistantId = newClientMessageId();
    const initialAssistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      sources: [],
    };

    setInput("");
    embedAbortRef.current?.abort();
    if (embedDebounceRef.current) clearTimeout(embedDebounceRef.current);
    const precomputedEmbedding = embeddingRef.current;
    embeddingRef.current = null;
    setIsLoading(true);

    let currentSessionId = session.sessionId;
    if (!currentSessionId) {
      try {
        const firstStoredMessage: StoredMessage = {
          id: userMsg.id,
          role: "user",
          content: userMsg.content,
          timestamp: Date.now(),
        };
        currentSessionId = await session.startSession(user, firstStoredMessage);
      } catch (e) {
        console.error("Failed to create chat session", e);
        setIsLoading(false);
        return;
      }
    }
    if (!currentSessionId) {
      setIsLoading(false);
      return;
    }

    session.sessionQueryCountRef.current += 1;
    session.resetSessionIdleTimer();

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);

    try {
      const authHeader = await firebaseBearerAuthHeader(user);
      const filesForUpload = attachments.selectedImages.map((i) => i.file);
      const uploadedAttachments = await uploadChatAttachments(
        filesForUpload,
        currentSessionId,
        authHeader
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsg.id
            ? { ...m, attachments: uploadedAttachments, attachmentPlaceholders: undefined }
            : m
        )
      );

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          query: userQuery,
          conversation: buildConversationContext(),
          sessionId: currentSessionId,
          attachments: uploadedAttachments,
          ...(precomputedEmbedding ? { embedding: precomputedEmbedding } : {}),
        }),
      });

      if (!response.ok || !response.body) {
        let detail = response.statusText;
        try {
          const errJson = await response.clone().json();
          if (errJson?.error) detail = errJson.error;
          if (errJson?.details) detail = `${detail}: ${errJson.details}`;
          if (errJson?.userMessage) detail = errJson.userMessage;
        } catch {
          /* ignore */
        }
        throw new Error(detail || "Failed to fetch response");
      }

      setIsLoading(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const streamState = createChatStreamParseState();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const newSources = feedChatStreamChunk(streamState, chunk);
        if (newSources) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, sources: newSources } : msg
            )
          );
        }

        if (streamState.hasParsedSources && streamState.accumulatedText.length > 0) {
          const currentText = streamState.accumulatedText;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: currentText } : msg))
          );
        }
      }

      const { accumulatedText, finalSources } = streamState;

      // messagesRef.current is always up-to-date (synced via useEffect after every render).
      // By the time the streaming loop finishes (with its await calls), React has committed
      // all prior setMessages updates and the effect has run — so the ref is current.
      const finalMessages = messagesRef.current.map((msg) =>
        msg.id === assistantId
          ? { ...msg, content: accumulatedText, sources: finalSources, isStreaming: false }
          : msg
      );
      setMessages(finalMessages);

      if (currentSessionId && finalMessages.length > 0) {
        updateChatSession(currentSessionId, toStoredMessages(finalMessages)).catch((e) => {
          console.error("[ChatHistory] Failed to save session messages:", e, {
            sessionId: currentSessionId,
            messageCount: finalMessages.length,
          });
        });
      }
      attachments.clearPendingImages();
      session.resetSessionIdleTimer();
    } catch (e) {
      console.error(e);
      const friendly = toFriendlyErrorMessage(e);
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === assistantId) {
            return { ...msg, content: friendly, isStreaming: false };
          }
          if (msg.id === userMsg.id) {
            return { ...msg, attachmentPlaceholders: undefined };
          }
          return msg;
        })
      );
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      const sid = session.sessionIdRef.current;
      if (user && sid) {
        void postClientAnalyticsEvent(user, "response_copied", {
          session_id: sid,
          message_id: messageId,
        });
      }
      session.resetSessionIdleTimer();
    } catch (e) {
      console.error("Failed to copy response", e);
    }
  };

  const handleFeedback = async (messageId: string, value: "up" | "down") => {
    if (!user) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: value } : msg))
    );
    const sid = session.sessionIdRef.current;
    void postClientAnalyticsEvent(user, "user_feedback", {
      feedback: value === "up" ? "thumbs_up" : "thumbs_down",
      session_id: sid ?? undefined,
      message_id: messageId,
    });
    session.resetSessionIdleTimer();
  };

  // Bind isLoading into the drop handler so the signature matches the component's DragEvent prop
  const handleComposerDrop = (e: DragEvent<HTMLDivElement>) =>
    attachments.handleComposerDrop(e, isLoading);

  return {
    user: user as User | null,
    messages,
    input,
    setInput: handleInputChange,
    isLoading,
    sessionId: session.sessionId,
    previewDocId,
    setPreviewDocId,
    selectedImages: attachments.selectedImages,
    isDropTarget: attachments.isDropTarget,
    hasVisibleMessages,
    showConversationLayout,
    attachmentInputRef: attachments.attachmentInputRef,
    bottomRef,
    handleSend,
    handleComposerDragEnter: attachments.handleComposerDragEnter,
    handleComposerDragOver: attachments.handleComposerDragOver,
    handleComposerDragLeave: attachments.handleComposerDragLeave,
    handleComposerDrop,
    onPickAttachments: attachments.onPickAttachments,
    onAttachmentFilesSelected: attachments.onAttachmentFilesSelected,
    copyToClipboard,
    handleFeedback,
    removePendingImage: attachments.removePendingImage,
  };
}
