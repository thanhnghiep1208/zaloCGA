"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { createChatSession, updateChatSession, StoredMessage } from "@/lib/chatHistory";
import Link from "next/link";
import { ReferencePreviewModal } from "@/components/ReferencePreviewModal";

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
  isStreaming?: boolean;
  feedback?: "up" | "down";
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

export default function ChatView() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasVisibleMessages = messages.some((m) => m.role === "user" || (m.role === "assistant" && !!m.content.trim()));
  const showConversationLayout = hasVisibleMessages || isLoading;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, isLoading]);

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
          timestamp: Date.now(),
        }));
      updateChatSession(sessionId, storedMsgs).catch(console.error);
    }, 1000);
  }, [sessionId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;
    
    const userQuery = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: userQuery };
    
    const assistantId = (Date.now() + 1).toString();
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
      } catch (e) {
        console.error("Failed to create chat session", e);
        setIsLoading(false);
        return;
      }
    }

    setMessages(prev => [...prev, userMsg, initialAssistantMsg]);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ query: userQuery }),
      });

      if (!response.ok || !response.body) {
        let detail = response.statusText;
        try {
          const errJson = await response.clone().json();
          if (errJson?.error) detail = errJson.error;
          if (errJson?.details) detail = `${detail}: ${errJson.details}`;
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
              timestamp: Date.now(),
            }));
          updateChatSession(currentSessionId, storedMsgs).catch(console.error);
        } else {
          saveSession(finalMessages);
        }
        return finalMessages;
      });

    } catch(e) {
      console.error(e);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantId ? { ...msg, content: "Sorry, I encountered an error connecting to the AI. Please verify API keys and network.", isStreaming: false } : msg
      ));
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleFeedback = async (messageId: string, value: "up" | "down") => {
    if (!user) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: value } : msg))
    );

    try {
      const idToken = await user.getIdToken();
      await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          eventName: "user_feedback",
          payload: {
            feedback: value === "up" ? "thumbs_up" : "thumbs_down",
            session_id: sessionId,
            message_id: messageId,
          },
        }),
      });
    } catch (e) {
      console.error("Failed to log feedback", e);
    }
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
                  <div
                    className={`px-5 py-3 rounded-[8px] inline-block max-w-[85%] text-[15px] leading-relaxed border ${
                      theme === "dark"
                        ? "bg-cream text-charcoal border-border"
                        : "bg-charcoal text-white border-charcoal"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
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
                                     {src.excerpt && <p className="text-xs text-muted leading-relaxed line-clamp-3 italic opacity-80">"{src.excerpt}"</p>}
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
                        onClick={() => copyToClipboard(msg.content)}
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
          <div className="relative flex items-end w-full max-w-4xl mx-auto bg-surface border border-border rounded-[16px] focus-within:ring-2 focus-within:ring-accent/35 transition-all">
             <textarea 
               value={input}
               onChange={e => setInput(e.target.value)}
               onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
               }}
               placeholder="Hỏi guideline hoặc mô tả microcopy (vị trí UI, hành động, giới hạn ký tự)…"
               className="w-full max-h-36 min-h-[60px] py-4 pl-5 pr-14 bg-transparent outline-none resize-none text-[15px] text-foreground overflow-y-auto scrollbar-none"
               rows={1}
               disabled={isLoading}
             />
             <button 
               onClick={handleSend}
               disabled={!input.trim() || isLoading}
              className="clay-hover-playful absolute right-2 bottom-2 p-3 bg-cream text-charcoal border border-border disabled:bg-surface disabled:text-muted disabled:border-border rounded-[8px] transition-opacity"
             >
               <svg className="w-4 h-4 translate-x-[-1px] translate-y-[1px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
             </button>
          </div>
          <p className="text-center text-[11px] text-muted mt-3 font-medium">
            Trả lời bám tài liệu nội bộ; với microcopy hãy đối chiếu trên UI thật trước khi ship.
          </p>
        </div>

      </div>
      <ReferencePreviewModal docId={previewDocId} onClose={() => setPreviewDocId(null)} />
    </ProtectedRoute>
  );
}
