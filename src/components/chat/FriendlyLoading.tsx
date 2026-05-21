"use client";

import { useEffect, useState } from "react";
import { LOADING_MESSAGES } from "@/lib/chat/constants";

export function FriendlyLoading() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return <>{LOADING_MESSAGES[msgIndex]}</>;
}
