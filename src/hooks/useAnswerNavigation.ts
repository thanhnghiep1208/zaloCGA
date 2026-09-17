"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/chat";

/** Within this many px of the bottom still counts as "following the stream". */
const BOTTOM_THRESHOLD_PX = 64;
/** The answer's top must be this far above the viewport before offering the jump. */
const ANSWER_TOP_THRESHOLD_PX = 24;
/** Breathing room left above the answer once we land on it. */
const SCROLL_MARGIN_PX = 12;

function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * Scroll ownership for the chat transcript.
 *
 * Long answers used to leave the reader stranded at the bottom: the transcript
 * re-pinned to the end on every streamed token, so there was no way to sit at the
 * top of an answer. Following the stream is now conditional on the reader actually
 * being at the bottom, which is what makes "jump to the top of the answer" stick.
 */
export function useAnswerNavigation(messages: ChatMessage[], isLoading: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [canScrollToAnswerTop, setCanScrollToAnswerTop] = useState(false);

  /** Mirrors isPinnedToBottom so effects read it without re-subscribing each scroll tick. */
  const pinnedRef = useRef(true);

  const measure = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const pinned = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    pinnedRef.current = pinned;
    setIsPinnedToBottom(pinned);

    const answer = answerRef.current;
    if (!answer) {
      setCanScrollToAnswerTop(false);
      return;
    }
    const offsetFromTop =
      answer.getBoundingClientRect().top - container.getBoundingClientRect().top;
    setCanScrollToAnswerTop(offsetFromTop < -ANSWER_TOP_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.addEventListener("scroll", measure, { passive: true });
    return () => container.removeEventListener("scroll", measure);
  }, [measure]);

  // Streaming grows the answer without firing a scroll event — watch the element itself.
  useEffect(() => {
    const answer = answerRef.current;
    if (!answer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(answer);
    return () => observer.disconnect();
  }, [measure, messages.length]);

  const lastMessage = messages[messages.length - 1];
  const lastRole = lastMessage?.role;
  const lastId = lastMessage?.id;

  // Sending always re-pins: the reader expects to watch their own message land.
  useEffect(() => {
    if (lastRole !== "user") return;
    pinnedRef.current = true;
    setIsPinnedToBottom(true);
  }, [lastId, lastRole]);

  useEffect(() => {
    if (pinnedRef.current) bottomRef.current?.scrollIntoView({ behavior: "auto" });
    measure();
  }, [messages, isLoading, measure]);

  const scrollToAnswerTop = useCallback(() => {
    const container = scrollRef.current;
    const answer = answerRef.current;
    if (!container || !answer) return;

    const offsetFromTop =
      answer.getBoundingClientRect().top - container.getBoundingClientRect().top;
    // Release the stream-follow first, or the next token drags us straight back down.
    pinnedRef.current = false;
    setIsPinnedToBottom(false);
    container.scrollTo({
      top: container.scrollTop + offsetFromTop - SCROLL_MARGIN_PX,
      behavior: scrollBehavior(),
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    pinnedRef.current = true;
    setIsPinnedToBottom(true);
    container.scrollTo({ top: container.scrollHeight, behavior: scrollBehavior() });
  }, []);

  return {
    scrollRef,
    answerRef,
    bottomRef,
    isPinnedToBottom,
    canScrollToAnswerTop,
    scrollToAnswerTop,
    scrollToBottom,
  };
}
