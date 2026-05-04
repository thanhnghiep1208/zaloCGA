"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteChatSession, cleanupOldSessions } from "@/lib/chatHistory";
import Link from "next/link";
import { useTheme } from "@/context/ThemeContext";

interface SidebarProps {
  onClose?: () => void;
  className?: string;
}

type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: Timestamp;
  messages: { role: string }[];
};

function getRelativeTime(ts: Timestamp): string {
  const now = Date.now();
  const diff = now - ts.seconds * 1000;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days === 1) return "Hôm qua";
  return new Date(ts.seconds * 1000).toLocaleDateString("en-GB");
}

export function Sidebar({ onClose, className = "" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, user } = useAuth();
  const { theme } = useTheme();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);

  const links = [
    { 
      label: "New Chat", 
      href: "/chat?new=1",
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
    },
    ...((role === "admin" || role === "contributor") ? [
      { 
        label: "Library", 
        href: "/admin/library",
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
      },
      { 
        label: "Upload Documents", 
        href: "/admin/upload",
        icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
      },
      ...(role === "admin" ? [
        { 
          label: "Manage Users", 
          href: "/admin/users",
          icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        },
        {
          label: "Analytics Reports",
          href: "/admin/reports",
          icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M8 14l3-3 2 2 4-5" /></svg>
        },
      ] : [])
    ] : [])
  ];

  // Load chat sessions for current user (last 7 days only)
  useEffect(() => {
    if (!user) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.getTime();

    // Run cleanup in background
    cleanupOldSessions(user.uid).catch(console.error);

    const q = query(
      collection(db, "chatSessions"),
      where("userId", "==", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as ChatSessionSummary))
        // Filter client-side: only sessions with messages AND within 7 days
        .filter(s =>
          s.messages && s.messages.length > 0 &&
          s.updatedAt && s.updatedAt.seconds * 1000 >= cutoff
        );
      setSessions(data);
    }, (err) => {
      if (err.code !== "permission-denied") console.error(err);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteChatSession(sessionId);
    // If we're currently viewing this session, redirect to /chat
    if (pathname === `/chat/${sessionId}`) {
      router.push("/chat");
    }
  };

  return (
    <aside className={`w-64 border-r border-border bg-surface min-h-screen flex flex-col p-4 space-y-2 ${className}`}>
      <h2 className="clay-label mb-4 px-3 mt-4 opacity-80">General</h2>
      {links.map((link) => {
        const normalizedHref = link.href.split("?")[0];
        const isActive =
          pathname === normalizedHref ||
          (normalizedHref !== "/chat" && pathname.startsWith(normalizedHref));
        return (
          <Link 
            key={link.href} 
            href={link.href}
            onClick={() => onClose?.()}
            className={`group clay-hover-playful flex items-center gap-3 px-4 py-2.5 rounded-[8px] transition-all text-sm font-medium border ${
              isActive
                ? theme === "dark"
                  ? "bg-cream text-charcoal border-border"
                  : "bg-charcoal text-white border-charcoal"
                : theme === "dark"
                  ? "text-foreground border-border bg-surface hover:bg-accent/10 hover:border-accent/40"
                  : "text-foreground border-border bg-surface hover:bg-accent/10 hover:text-link hover:border-parchment"
            }`}
          >
            <span
              className={
                isActive
                  ? theme === "dark"
                    ? "text-charcoal"
                    : "text-white"
                  : theme === "dark"
                    ? "text-muted group-hover:text-foreground"
                    : "text-muted group-hover:text-link"
              }
            >
              {link.icon}
            </span>
            {link.label}
          </Link>
        );
      })}

      {/* Chat History Section */}
      {sessions.length > 0 && (
        <div className="pt-4">
          <h2 className="clay-label mb-3 px-3 opacity-80">
            Lịch sử gần đây
          </h2>
          <div className="space-y-0.5 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
            {sessions.map((session) => {
              const isActive = pathname === `/chat/${session.id}`;
              return (
                <Link
                  key={session.id}
                  href={`/chat/${session.id}`}
                  onClick={() => onClose?.()}
                  className={`flex items-start justify-between gap-2 px-3 py-2.5 rounded-[8px] transition-all group border ${
                    isActive
                      ? "bg-accent/15 border-accent/35"
                      : theme === "dark"
                        ? "border-border bg-surface hover:bg-accent/8"
                        : "border-border bg-surface hover:bg-cream/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate leading-snug ${isActive ? "text-accent" : "text-foreground"}`}>
                      {session.title}
                    </p>
                    {session.updatedAt && (
                      <p className="text-[10px] text-muted mt-0.5">
                        {getRelativeTime(session.updatedAt)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-all text-muted"
                    title="Xóa cuộc trò chuyện"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
