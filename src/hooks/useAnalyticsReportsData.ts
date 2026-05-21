"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ANALYTICS_EVENT_LIMIT,
  CHAT_SESSION_SAMPLE_LIMIT,
  type AnalyticsEvent,
  type ChatSessionRow,
} from "@/lib/reports/types";

export const REPORTS_AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;

export function useAnalyticsReportsData(
  userId: string | undefined,
  role: string | null | undefined,
  authLoading: boolean
) {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);
  const [usernameByUid, setUsernameByUid] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchReportsData = useCallback(async (isManualOrScheduled = false) => {
    if (!userId || (role !== "admin" && role !== "contributor")) return;

    const fetchId = ++fetchIdRef.current;
    if (isManualOrScheduled) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const eventsQ = query(
        collection(db, "analyticsEvents"),
        orderBy("createdAt", "desc"),
        limit(ANALYTICS_EVENT_LIMIT)
      );
      const usersQ = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const sessionsQ = query(
        collection(db, "chatSessions"),
        orderBy("updatedAt", "desc"),
        limit(CHAT_SESSION_SAMPLE_LIMIT)
      );

      const [eventsSnap, usersSnap, sessionsSnap] = await Promise.all([
        getDocs(eventsQ),
        getDocs(usersQ),
        getDocs(sessionsQ),
      ]);

      if (fetchId !== fetchIdRef.current) return;

      setEvents(
        eventsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AnalyticsEvent, "id">),
        }))
      );

      const map = new Map<string, string>();
      usersSnap.docs.forEach((d) => {
        const data = d.data() as { uid?: string; username?: string };
        const uid = data.uid ?? d.id;
        const name = String(data.username || "").trim();
        if (uid && name) map.set(uid, name);
      });
      setUsernameByUid(map);

      setChatSessions(
        sessionsSnap.docs.map((d) => {
          const data = d.data() as Omit<ChatSessionRow, "id">;
          return { id: d.id, ...data };
        })
      );

      setLastRefreshedAt(new Date());
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      console.error("Failed to load analytics reports", err);
      setError("Không tải được dữ liệu báo cáo. Thử bấm Cập nhật lại.");
    } finally {
      if (fetchId !== fetchIdRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, role]);

  const refresh = useCallback(() => {
    void fetchReportsData(true);
  }, [fetchReportsData]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId || (role !== "admin" && role !== "contributor")) {
      setLoading(false);
      return;
    }

    void fetchReportsData(false);

    const intervalId = window.setInterval(() => {
      void fetchReportsData(true);
    }, REPORTS_AUTO_REFRESH_MS);

    return () => {
      fetchIdRef.current += 1;
      window.clearInterval(intervalId);
    };
  }, [userId, role, authLoading, fetchReportsData]);

  return {
    events,
    chatSessions,
    usernameByUid,
    loading,
    refreshing,
    lastRefreshedAt,
    error,
    refresh,
  };
}
