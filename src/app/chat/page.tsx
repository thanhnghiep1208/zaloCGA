"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ChangeEvent, DragEvent, useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
  ChatAttachmentMeta,
  createChatSession,
  updateChatSession,
  StoredMessage,
} from "@/lib/chatHistory";
import Link from "next/link";
import { ReferencePreviewModal } from "@/components/ReferencePreviewModal";
import { useRouter, useSearchParams } from "next/navigation";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { postClientAnalyticsEvent } from "@/lib/client-analytics-event";
import { toFriendlyErrorMessage } from "@/lib/user-error";

const SESSION_IDLE_MS = 10 * 60 * 1000;

type Source = {
  docId?: string;
  fileName: string;
  excerpt?: string;
  reference?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  attachments?: ChatAttachmentMeta[];
  /** Shown while uploads run so the thumb row does not pop in late (layout stability). */
  attachmentPlaceholders?: { id: string; name: string }[];
  isStreaming?: boolean;
  feedback?: "up" | "down";
};

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

/** Stable unique ids for React keys and Firestore message rows (avoid Date.now collisions). */
function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Short label for attachment chip (full name in title tooltip). */
function shortImageTitle(name: string, max = 22): string {
  const n = name.trim();
  if (n.length <= max) return n;
  const ext = n.includes(".") ? n.slice(n.lastIndexOf(".")) : "";
  const base = ext ? n.slice(0, n.length - ext.length) : n;
  const budget = max - 1 - ext.length;
  if (budget < 6) return `${n.slice(0, max - 1)}…`;
  return `${base.slice(0, Math.ceil(budget / 2))}…${base.slice(-Math.floor(budget / 2))}${ext}`;
}

type LocalChatImage = {
  id: string;
  file: File;
  previewUrl: string;
};

const LOADING_MESSAGES = [
  "Đang tìm trong kho kiến thức...",
  "Đang đối chiếu guideline & ngữ cảnh...",
  "Đợi mình một xíu nhé...",
  "Đang tổng hợp câu trả lời phù hợp...",
  "Sắp xong rồi đây!",
];

const FriendlyLoading = () => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return <>{LOADING_MESSAGES[msgIndex]}</>;
};

function UserAttachmentSkeleton({ name }: { name: string }) {
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

function UserAttachmentThumb({ att }: { att: ChatAttachmentMeta }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <a
      href={att.downloadURL}
      target="_blank"
      rel="noreferrer"
      className="block w-[72px] shrink-0 rounded-lg outline-none ring-offset-background transition-shadow hover:ring-2 hover:ring-accent/25 focus-visible:ring-2 focus-visible:ring-accent/40"
      title={att.name}
    >
      <div className="relative h-[72px] w-[72px] overflow-hidden rounded-lg border border-border bg-muted/35 shadow-sm">
        {!loaded && (
          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-muted/45 motion-safe:animate-pulse"
            aria-hidden
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- Firebase download URL */}
        <img
          src={att.downloadURL}
          alt=""
          width={72}
          height={72}
          decoding="async"
          loading="lazy"
          sizes="72px"
          className={`relative z-[2] h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </div>
      <p className="mt-0.5 min-h-[14px] max-w-[72px] truncate text-center text-[10px] leading-[14px] text-muted">
        {shortImageTitle(att.name)}
      </p>
    </a>
  );
}

export default function ChatView() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<LocalChatImage[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedImagesRef = useRef<LocalChatImage[]>([]);
  const dragDepthRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const sessionQueryCountRef = useRef(0);
  const sessionEndedSentRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const hasVisibleMessages = messages.some((m) => m.role === "user" || (m.role === "assistant" && !!m.content.trim()));
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

  // Debounced save to Firestore after AI finishes responding
  const saveSession = useCallback((msgs: Message[]) => {
    if (!sessionId || msgs.length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const storedMsgs: StoredMessage[] = msgs
        .filter(m => !m.isStreaming && m.content)
        .map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources,
          ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
          timestamp: Date.now(),
        }));
      updateChatSession(sessionId, storedMsgs).catch(console.error);
    }, 1000);
  }, [sessionId]);

  const buildConversationContext = (): ConversationTurn[] => {
    // Keep only recent meaningful turns to preserve context without oversized payloads.
    return messages
      .filter((m) => !m.isStreaming && !!m.content.trim())
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
  };

  const uploadChatAttachments = async (
    files: File[],
    currentSessionId: string,
    authHeader: { Authorization: string }
  ): Promise<ChatAttachmentMeta[]> => {
    if (files.length === 0) return [];
    const uploaded = await Promise.all(
      files.map(async (file) => {
        const form = new FormData();
        form.append("file", file);
        form.append("sessionId", currentSessionId);
        const res = await fetch("/api/chat/attachments", {
          method: "POST",
          headers: { ...authHeader },
          body: form,
        });
        const data = (await res.json()) as {
          success?: boolean;
          error?: string;
          attachment?: ChatAttachmentMeta;
        };
        if (!res.ok || !data.attachment) {
          throw new Error(data.error || "Failed to upload attachment");
        }
        return data.attachment;
      })
    );
    return uploaded;
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
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
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
    const userMsg: Message = {
      id: newClientMessageId(),
      role: "user",
      content: userQuery,
      ...(pendingThumbs ? { attachmentPlaceholders: pendingThumbs } : {}),
    };

    const assistantId = newClientMessageId();
    const initialAssistantMsg: Message = { 
      id: assistantId, 
      role: "assistant", 
      content: "", 
      isStreaming: true,
      sources: []
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

    setMessages(prev => [...prev, userMsg, initialAssistantMsg]);

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
      let accumulatedText = "";
      let streamBuffer = "";
      let hasParsedSources = false;
      let finalSources: Source[] = [];
      let renderedLength = 0;

      const renderNextChunk = (step = 10) => {
        if (renderedLength >= accumulatedText.length) return false;
        renderedLength = Math.min(renderedLength + step, accumulatedText.length);
        const nextText = accumulatedText.slice(0, renderedLength);
        setMessages(prev => prev.map(msg =>
          msg.id === assistantId ? { ...msg, content: nextText } : msg
        ));
        return true;
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        streamBuffer += chunk;

        if (!hasParsedSources) {
          const splitIndex = streamBuffer.indexOf("===CHUNK_SPLIT===\n\n");
          if (splitIndex !== -1) {
            const sourcesPart = streamBuffer.slice(0, splitIndex);
            const textPart = streamBuffer.slice(splitIndex + 17);
            
            try {
               const sourcesJson = JSON.parse(sourcesPart);
               if (sourcesJson.type === "sources") {
                  finalSources = sourcesJson.data;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantId ? { ...msg, sources: sourcesJson.data } : msg
                  ));
               }
            } catch(e) { console.error("Failed to parse sources", e); }
            
            hasParsedSources = true;
            accumulatedText += textPart;
          }
        } else {
          accumulatedText += chunk;
        }

        if (hasParsedSources) {
          const moved = renderNextChunk(4);
          if (moved) {
            await new Promise((resolve) => setTimeout(resolve, 24));
          }
        }
      }

      while (renderNextChunk(8)) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }

      // Save session after streaming completes
      setMessages(prev => {
        const finalMessages = prev.map(msg =>
          msg.id === assistantId
            ? { ...msg, content: accumulatedText, sources: finalSources, isStreaming: false }
            : msg
        );
        if (currentSessionId) {
          const storedMsgs: StoredMessage[] = finalMessages
            .filter(m => !m.isStreaming && m.content)
            .map(m => ({
              id: m.id,
              role: m.role,
              content: m.content,
              sources: m.sources,
              attachments: m.attachments,
              timestamp: Date.now(),
            }));
          updateChatSession(currentSessionId, storedMsgs).catch(console.error);
        } else {
          saveSession(finalMessages);
        }
        return finalMessages;
      });
      clearPendingImages();
      resetSessionIdleTimer();

    } catch(e) {
      console.error(e);
      const friendly = toFriendlyErrorMessage(e);
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantId) {
          return { ...msg, content: friendly, isStreaming: false };
        }
        if (msg.id === userMsg.id) {
          return { ...msg, attachmentPlaceholders: undefined };
        }
        return msg;
      }));
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

  return (
    <ProtectedRoute>
      <div className="h-[calc(100dvh-8.5rem)] min-h-[560px] flex flex-col pt-2 animate-in fade-in duration-500 w-full">
        <div
          className={`flex-1 min-h-0 py-4 pr-3 space-y-8 scrollbar-thin ${
            showConversationLayout ? "overflow-y-auto" : "overflow-y-hidden"
          }`}
        >
          {!showConversationLayout && (
            <div className="h-full min-h-[420px] flex items-center justify-center opacity-80">
              <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto px-4">
               <div className="w-20 h-20 bg-surface border border-border rounded-[8px] flex items-center justify-center rotate-3 shadow-sm">
                 <svg className="w-10 h-10 text-accent/80" fill="none" strokeWidth={1.5} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.38.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" /></svg>
               </div>
               <div className="space-y-2 text-foreground">
                 <h3 className="text-xl font-medium tracking-tight">Bắt đầu một câu hỏi</h3>
                 <p className="text-sm text-muted leading-relaxed">
                   Ví dụ tra cứu: quy tắc CTA, thuật ngữ, tone & voice. Ví dụ microcopy: toast lỗi upload, nhãn nút, empty state — kèm ngữ cảnh và giới hạn ký tự nếu có.
                 </p>
               </div>
              </div>
            </div>
          )}

          {messages
            .filter(msg => !(msg.role === "assistant" && msg.isStreaming && !msg.content.trim()))
            .map(msg => (
              <div key={msg.id} className={`flex flex-col w-full ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'user' ? (
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
                          {msg.content.trim() ||
                            (msg.attachments?.length ? "Ảnh đính kèm" : "")}
                        </p>
                      </div>
                    )}
                    {(msg.attachments?.length || msg.attachmentPlaceholders?.length) ? (
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
                  <div className="clay-card px-6 py-6 rounded-[16px] w-full">
                    <style dangerouslySetInnerHTML={{ __html: `
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
                    `}} />
                    {(() => {
                      const sourcesUsedMatch = msg.content.match(/\[SOURCES_USED:\s*(.*?)\]/);
                      const usedFileNames = sourcesUsedMatch 
                        ? sourcesUsedMatch[1].split(',').map(s => s.trim().toLowerCase()) 
                        : [];
                      
                      const displayContent = msg.content.replace(/\[SOURCES_USED:\s*.*?\]/, '').trim();
                      const visibleSources = msg.sources?.filter(s => 
                        usedFileNames.includes(s.fileName.toLowerCase())
                      ) || [];

                      return (
                        <>
                          <div className="ai-response-container prose prose-base max-w-none text-foreground">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {displayContent}
                            </ReactMarkdown>
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
                                   <div key={i} className="bg-background border border-border/80 p-4 rounded-[16px] flex flex-col gap-2 transition-colors hover:border-parchment group">
                                     <div className="flex items-center gap-2 truncate">
                                       <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                       <span className="text-sm font-semibold truncate group-hover:text-accent transition-colors">{src.fileName}</span>
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
                                         onClick={() => setPreviewDocId(src.docId ?? null)}
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
                    })()}

                    <div className="mt-4 flex items-center justify-end border-t border-border/40 pt-2">
                      <button
                        onClick={() => handleFeedback(msg.id, "up")}
                        className={`p-1.5 rounded-md transition-colors ${
                          msg.feedback === "up"
                            ? "text-green-600 bg-green-50"
                            : "text-muted hover:text-foreground hover:bg-border/80"
                        }`}
                        title="Hữu ích"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-1 4-3 4v10h11.28a2 2 0 001.98-1.72l1-7A2 2 0 0019.28 9H14zM7 22H4a2 2 0 01-2-2v-8a2 2 0 012-2h3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleFeedback(msg.id, "down")}
                        className={`ml-1 p-1.5 rounded-md transition-colors ${
                          msg.feedback === "down"
                            ? "text-red-600 bg-red-50"
                            : "text-muted hover:text-foreground hover:bg-border/80"
                        }`}
                        title="Chưa hữu ích"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 15v4a3 3 0 003 3l1-4 3-4V4H5.72a2 2 0 00-1.98 1.72l-1 7A2 2 0 004.72 15H10zM17 2h3a2 2 0 012 2v8a2 2 0 01-2 2h-3" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => void copyToClipboard(msg.content, msg.id)}
                        className="ml-1 text-muted hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-border/80 flex items-center gap-1.5 text-xs font-medium"
                        title="Copy answer"
                      >
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                         Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          
          {isLoading && (
             <div className="flex flex-col mr-auto items-start max-w-[85%] w-full animate-in fade-in pb-2">
               <div className="clay-card px-6 py-5 rounded-[16px] flex flex-col gap-3 w-fit min-w-[240px]">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-[bounce_1s_infinite_0ms]"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-[bounce_1s_infinite_200ms]"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-[bounce_1s_infinite_400ms]"></div>
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
        </div>

        <div className="pt-3 bg-background/95 backdrop-blur z-10 shrink-0 space-y-2">
          <p className="text-center text-[11px] text-muted max-w-4xl mx-auto px-2">
            Kéo thả hoặc chọn ảnh (tối đa 4). Ảnh xem trước và tên file nằm chung trong khung soạn bên dưới. Sau khi gửi, ảnh hiện dưới tin nhắn.
          </p>
          <div
            className={`relative w-full max-w-4xl mx-auto bg-surface border rounded-[16px] transition-all ${
              isDropTarget
                ? "border-accent ring-2 ring-accent/35 border-dashed"
                : "border-border focus-within:ring-2 focus-within:ring-accent/35"
            }`}
            onDragEnter={handleComposerDragEnter}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
          >
            <input
              ref={attachmentInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onAttachmentFilesSelected}
            />

            {isDropTarget && (
              <div
                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[16px] bg-background/75 backdrop-blur-[2px]"
                aria-hidden
              >
                <p className="rounded-lg border border-accent/40 bg-surface px-4 py-2 text-sm font-semibold text-accent shadow-sm">
                  Thả ảnh để đính kèm
                </p>
              </div>
            )}

            {selectedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-border/60 px-3 pb-3 pt-3">
                {selectedImages.map((img) => (
                  <div
                    key={img.id}
                    className="flex max-w-full items-center gap-2 rounded-xl border border-border bg-muted/20 py-1.5 pl-1.5 pr-1.5 shadow-sm"
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-muted/40">
                      {/* eslint-disable-next-line @next/next/no-img-element -- blob preview */}
                      <img
                        src={img.previewUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                        decoding="async"
                      />
                    </div>
                    <span
                      className="min-w-0 max-w-[180px] truncate text-[12px] font-medium text-foreground sm:max-w-[240px]"
                      title={img.file.name}
                    >
                      {shortImageTitle(img.file.name, 36)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingImage(img.id)}
                      disabled={isLoading}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-border/90 hover:text-foreground disabled:opacity-40"
                      aria-label={`Gỡ ${img.file.name}`}
                      title="Gỡ ảnh"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative flex items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Hỏi guideline hoặc mô tả microcopy (vị trí UI, hành động, giới hạn ký tự)…"
                className="scrollbar-none w-full max-h-36 min-h-[60px] resize-none overflow-y-auto bg-transparent py-4 pl-5 pr-24 text-[15px] text-foreground outline-none"
                rows={1}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={onPickAttachments}
                disabled={isLoading}
                className="absolute bottom-2 right-14 rounded-[8px] border border-border bg-background p-3 text-foreground transition-opacity disabled:text-muted"
                title="Đính kèm ảnh để phân tích guideline"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828L18 9.828a4 4 0 10-5.657-5.657L5.757 10.757a6 6 0 108.486 8.486L20 13.5"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={(!input.trim() && selectedImages.length === 0) || isLoading}
                className="clay-hover-playful absolute bottom-2 right-2 rounded-[8px] border border-border bg-cream p-3 text-charcoal transition-opacity disabled:border-border disabled:bg-surface disabled:text-muted"
              >
                <svg
                  className="h-4 w-4 translate-x-[-1px] translate-y-[1px]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>

          {selectedImages.length > 0 && (
            <p className="text-center text-[11px] text-muted">
              {selectedImages.length} ảnh sẽ được gửi để AI phân tích ngữ cảnh theo guideline (chỉ tư vấn text).
            </p>
          )}
          <p className="mt-3 text-center text-[11px] font-medium text-muted">
            Trả lời bám tài liệu nội bộ; với microcopy hãy đối chiếu trên UI thật trước khi ship.
          </p>
        </div>

      </div>
      <ReferencePreviewModal docId={previewDocId} onClose={() => setPreviewDocId(null)} />
    </ProtectedRoute>
  );
}
