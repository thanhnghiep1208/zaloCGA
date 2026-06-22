"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";
import { createChatSession, StoredMessage } from "@/lib/chatHistory";
import { postClientAnalyticsEvent } from "@/lib/client-analytics-event";
import { SESSION_IDLE_MS } from "@/types/chat";

export interface ChatSessionHandle {
  sessionId: string | null;
  sessionIdRef: React.MutableRefObject<string | null>;
  sessionStartedAtRef: React.MutableRefObject<number | null>;
  sessionQueryCountRef: React.MutableRefObject<number>;
  sessionEndedSentRef: React.MutableRefObject<boolean>;
  endSessionAnalytics: () => Promise<void>;
  resetSessionIdleTimer: () => void;
  /** Creates a new Firestore session with the given first message. Returns the session id. */
  startSession: (user: User, firstMessage: StoredMessage) => Promise<string>;
  /** Resets all session state (for "new chat"). */
  resetSession: () => void;
}

export function useChatSession(user: User | null): ChatSessionHandle {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const sessionQueryCountRef = useRef(0);
  const sessionEndedSentRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // End session on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      void endSessionAnalytics();
    };
  }, [endSessionAnalytics]);

  const startSession = useCallback(async (u: User, firstMessage: StoredMessage): Promise<string> => {
    const newSessionId = await createChatSession(u.uid, [firstMessage]);
    setSessionId(newSessionId);
    sessionIdRef.current = newSessionId;
    sessionStartedAtRef.current = Date.now();
    sessionQueryCountRef.current = 0;
    sessionEndedSentRef.current = false;
    void postClientAnalyticsEvent(u, "session_started", { session_id: newSessionId });
    return newSessionId;
  }, []);

  const resetSession = useCallback(() => {
    setSessionId(null);
    sessionIdRef.current = null;
    sessionStartedAtRef.current = null;
    sessionQueryCountRef.current = 0;
    sessionEndedSentRef.current = false;
  }, []);

  return {
    sessionId,
    sessionIdRef,
    sessionStartedAtRef,
    sessionQueryCountRef,
    sessionEndedSentRef,
    endSessionAnalytics,
    resetSessionIdleTimer,
    startSession,
    resetSession,
  };
}
