"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useState, useEffect, use } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteChatSession } from "@/lib/chatHistory";
import { ReferencePreviewModal } from "@/components/ReferencePreviewModal";
import { AssistantMessageBody } from "@/components/chat/AssistantMessageBody";
import { sanitizePrototypeSpec, type PrototypeSpec } from "@/lib/chat/prototype-spec";

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { docId?: string; fileName: string; excerpt?: string; reference?: string }[];
  attachments?: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    downloadURL: string;
    expiresAt: number;
  }[];
  prototype?: PrototypeSpec;
  timestamp: number;
};

type ChatSessionData = {
  userId: string;
  title: string;
  messages: StoredMessage[];
  updatedAt: { seconds: number };
};

export default function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [session, setSession] = useState<ChatSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    const loadSession = async () => {
      try {
        const docRef = doc(db, "chatSessions", id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists() || docSnap.data().userId !== user.uid) {
          setNotFound(true);
        } else {
          setSession(docSnap.data() as ChatSessionData);
        }
      } catch (e) {
        console.error("Failed to load session", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, [user, id]);

  const handleDelete = async () => {
    if (!confirm("Xóa cuộc hội thoại này?")) return;
    await deleteChatSession(id);
    router.push("/chat");
  };

  return (
    <ProtectedRoute>
      <div className="h-full flex flex-col pt-2 animate-in fade-in duration-500 max-h-[88vh] relative pb-2 w-full">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/80 sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="space-y-1 min-w-0 flex-1 mr-4">
            <p className="text-[10px] text-muted font-semibold uppercase tracking-widest">Lịch sử cuộc trò chuyện</p>
            <h1 className="text-xl font-light tracking-tight text-foreground truncate">
              {loading ? "Đang tải..." : session?.title || "Cuộc trò chuyện"}
            </h1>
            {session?.updatedAt && (
              <p className="text-xs text-muted">
                {new Date(session.updatedAt.seconds * 1000).toLocaleDateString("en-GB", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit"
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDelete}
              className="px-3 py-2 rounded-[8px] bg-red-50 border border-red-200 hover:bg-red-100 transition-colors text-sm font-medium text-red-600 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Xóa
            </button>
            <Link
              href="/chat"
              className="clay-hover-playful px-4 py-2 rounded-[8px] bg-cream text-charcoal border border-border transition-opacity text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Chat mới
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-4 scrollbar-thin">
          {loading ? (
            <div className="flex-1 flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : notFound ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60 mt-20">
              <svg className="w-12 h-12 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-foreground font-medium">Không tìm thấy cuộc trò chuyện này</p>
              <p className="text-sm text-muted">Có thể cuộc trò chuyện đã bị xóa hoặc đã quá 7 ngày.</p>
              <Link href="/chat" className="mt-2 text-accent text-sm font-semibold hover:underline">← Bắt đầu Chat mới</Link>
            </div>
          ) : (
            session?.messages.map(msg => (
              <div key={msg.id} className={`flex flex-col w-full ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.role === "user" ? (
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
                  <div className="bg-surface border border-border px-6 py-6 rounded-[16px] w-full">
                    <AssistantMessageBody
                      content={msg.content}
                      sources={msg.sources}
                      prototype={sanitizePrototypeSpec(msg.prototype)}
                      onPreviewDoc={(docId) => setPreviewDocId(docId)}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Read-only notice */}
        {!loading && !notFound && (
          <div className="pt-3 bg-background/90 backdrop-blur z-10 sticky bottom-0">
            <div className="w-full max-w-4xl mx-auto bg-surface border border-border rounded-[16px] px-5 py-3.5 flex items-center gap-3 text-muted">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <p className="text-sm font-medium">Đây là lịch sử chỉ đọc. <Link href="/chat" className="text-accent hover:underline font-semibold">Bắt đầu chat mới →</Link></p>
            </div>
          </div>
        )}
      </div>
      <ReferencePreviewModal docId={previewDocId} onClose={() => setPreviewDocId(null)} />
    </ProtectedRoute>
  );
}
