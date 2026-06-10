"use client";

import {
  ChangeEvent,
  DragEvent,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import {
  ChatAttachmentMeta,
  createChatSession,
  updateChatSession,
  StoredMessage,
} from "@/lib/chatHistory";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { postClientAnalyticsEvent } from "@/lib/client-analytics-event";
import { toFriendlyErrorMessage } from "@/lib/user-error";
import { newClientMessageId } from "@/lib/chat/utils";
import { uploadChatAttachments } from "@/lib/chat/upload-attachments";
import {
  createChatStreamParseState,
  feedChatStreamChunk,
} from "@/lib/chat/stream";
import type {
  ChatMessage,
  ChatSource,
  ConversationTurn,
  LocalChatImage,
} from "@/types/chat";
import { SESSION_IDLE_MS } from "@/types/chat";

function toStoredMessages(msgs: ChatMessage[]): StoredMessage[] {
  return msgs
    .filter((m) => !m.isStreaming && m.content)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<LocalChatImage[]>([]);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedImagesRef = useRef<LocalChatImage[]>([]);
  const dragDepthRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const sessionQueryCountRef = useRef(0);
  const sessionEndedSentRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasVisibleMessages = messages.some(
    (m) => m.role === "user" || (m.role === "assistant" && !!m.content.trim())
  );
  const showConversationLayout = hasVisibleMessages || isLoading;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, isLoading]);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const endSessionAnalytics = useCallback(async () => {
    if (!user) return;
    const sid = sessionIdRef.current;
    if (!sid || sessionEndedSentRef.current || sessionStartedAtRef.current == null) return;
    sessionEndedSentRef.current = true;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    const duration_ms = Date.now() - sessionStartedAtRef.current;
    await postClientAnalyticsEvent(user, "session_ended", {
      session_id: sid,
      duration_ms,
      query_count: sessionQueryCountRef.current,
    });
  }, [user]);

  const resetSessionIdleTimer = useCallback(() => {
    if (!sessionIdRef.current || sessionEndedSentRef.current) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      void endSessionAnalytics();
    }, SESSION_IDLE_MS);
  }, [endSessionAnalytics]);

  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      void endSessionAnalytics();
    };
  }, [endSessionAnalytics]);

const buildConversationContext = (): ConversationTurn[] => {
    return messages
      .filter((m) => !m.isStreaming && !!m.content.trim())
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
  };

  const clearPendingImages = useCallback(() => {
    setSelectedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  const appendImageFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    setSelectedImages((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= 4) break;
        next.push({
          id: newClientMessageId(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      return next;
    });
  }, []);

  const removePendingImage = useCallback((id: string) => {
    setSelectedImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const handleComposerDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDropTarget(true);
  };

  const handleComposerDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleComposerDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDropTarget(false);
    }
  };

  const handleComposerDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDropTarget(false);
    if (isLoading) return;
    const { files } = e.dataTransfer;
    if (files?.length) appendImageFiles(files);
  };

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    void (async () => {
      await endSessionAnalytics();
      setMessages([]);
      setInput("");
      setIsLoading(false);
      setSessionId(null);
      sessionIdRef.current = null;
      sessionStartedAtRef.current = null;
      sessionQueryCountRef.current = 0;
      sessionEndedSentRef.current = false;
      clearPendingImages();
      router.replace("/chat");
    })();
  }, [searchParams, router, clearPendingImages, endSessionAnalytics]);

  const handleSend = async () => {
    if ((!input.trim() && selectedImages.length === 0) || isLoading || !user) return;

    const userQuery = input.trim();
    const pendingThumbs =
      selectedImages.length > 0
        ? selectedImages.map((i) => ({ id: i.id, name: i.file.name }))
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
    setIsLoading(true);

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        const firstStoredMessage: StoredMessage = {
          id: userMsg.id,
          role: "user",
          content: userMsg.content,
          timestamp: Date.now(),
        };
        currentSessionId = await createChatSession(user.uid, [firstStoredMessage]);
        setSessionId(currentSessionId);
        sessionIdRef.current = currentSessionId;
        sessionStartedAtRef.current = Date.now();
        sessionQueryCountRef.current = 0;
        sessionEndedSentRef.current = false;
        void postClientAnalyticsEvent(user, "session_started", {
          session_id: currentSessionId,
        });
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

    sessionQueryCountRef.current += 1;
    resetSessionIdleTimer();

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);

    try {
      const authHeader = await firebaseBearerAuthHeader(user);
      const filesForUpload = selectedImages.map((i) => i.file);
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
      let renderedLength = 0;

      const renderNextChunk = (step = 10) => {
        const { accumulatedText } = streamState;
        if (renderedLength >= accumulatedText.length) return false;
        renderedLength = Math.min(renderedLength + step, accumulatedText.length);
        const nextText = accumulatedText.slice(0, renderedLength);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, content: nextText } : msg))
        );
        return true;
      };

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

        if (streamState.hasParsedSources) {
          const moved = renderNextChunk(4);
          if (moved) {
            await new Promise((resolve) => setTimeout(resolve, 24));
          }
        }
      }

      while (renderNextChunk(8)) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }

      const { accumulatedText, finalSources } = streamState;

      // Capture final messages via a local variable so the Firestore save
      // happens outside the state updater (React calls updaters synchronously,
      // so savedMessages is populated before the if-block below runs).
      let savedMessages: ChatMessage[] = [];
      setMessages((prev) => {
        savedMessages = prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: accumulatedText, sources: finalSources, isStreaming: false }
            : msg
        );
        return savedMessages;
      });

      if (currentSessionId && savedMessages.length > 0) {
        updateChatSession(currentSessionId, toStoredMessages(savedMessages)).catch(
          console.error
        );
      }
      clearPendingImages();
      resetSessionIdleTimer();
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

  const onPickAttachments = () => {
    attachmentInputRef.current?.click();
  };

  const onAttachmentFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    e.target.value = "";
    if (files.length === 0) return;
    appendImageFiles(files);
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      const sid = sessionIdRef.current;
      if (user && sid) {
        void postClientAnalyticsEvent(user, "response_copied", {
          session_id: sid,
          message_id: messageId,
        });
      }
      resetSessionIdleTimer();
    } catch (e) {
      console.error("Failed to copy response", e);
    }
  };

  const handleFeedback = async (messageId: string, value: "up" | "down") => {
    if (!user) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: value } : msg))
    );

    const sid = sessionIdRef.current;
    void postClientAnalyticsEvent(user, "user_feedback", {
      feedback: value === "up" ? "thumbs_up" : "thumbs_down",
      session_id: sid ?? undefined,
      message_id: messageId,
    });
    resetSessionIdleTimer();
  };

  return {
    user: user as User | null,
    messages,
    input,
    setInput,
    isLoading,
    sessionId,
    previewDocId,
    setPreviewDocId,
    selectedImages,
    isDropTarget,
    hasVisibleMessages,
    showConversationLayout,
    attachmentInputRef,
    bottomRef,
    handleSend,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
    onPickAttachments,
    onAttachmentFilesSelected,
    copyToClipboard,
    handleFeedback,
    removePendingImage,
  };
}
