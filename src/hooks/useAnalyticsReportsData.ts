"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import { toFriendlyErrorMessage } from "@/lib/user-error";
import type { AnalyticsEvent, ChatSessionRow } from "@/lib/reports/types";

export const REPORTS_AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;

type ReportsApiResponse = {
  success: boolean;
  events?: AnalyticsEvent[];
  chatSessions?: ChatSessionRow[];
  usernameByUid?: Record<string, string>;
  error?: string;
  userMessage?: string;
};

export function useAnalyticsReportsData(
  user: User | null,
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

  const fetchReportsData = useCallback(
    async (isManualOrScheduled = false) => {
      if (!user || (role !== "admin" && role !== "contributor")) return;

      const fetchId = ++fetchIdRef.current;
      if (isManualOrScheduled) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const authHeader = await firebaseBearerAuthHeader(user);
        const res = await fetch("/api/admin/reports", {
          headers: { ...authHeader },
        });
        const data = (await res.json()) as ReportsApiResponse;

        if (fetchId !== fetchIdRef.current) return;

        if (!res.ok || !data.success) {
          throw new Error(
            data.userMessage || data.error || "Không tải được dữ liệu báo cáo."
          );
        }

        setEvents(data.events ?? []);
        setUsernameByUid(new Map(Object.entries(data.usernameByUid ?? {})));
        setChatSessions(data.chatSessions ?? []);
        setLastRefreshedAt(new Date());
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        console.error("Failed to load analytics reports", err);
        setError(toFriendlyErrorMessage(err));
      } finally {
        if (fetchId !== fetchIdRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, role]
  );

  const refresh = useCallback(() => {
    void fetchReportsData(true);
  }, [fetchReportsData]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (role !== "admin" && role !== "contributor")) {
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
  }, [user, role, authLoading, fetchReportsData]);

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
