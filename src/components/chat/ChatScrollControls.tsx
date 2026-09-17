"use client";

type Props = {
  canScrollToAnswerTop: boolean;
  isPinnedToBottom: boolean;
  onScrollToAnswerTop: () => void;
  onScrollToBottom: () => void;
};

const CONTROL_BASE =
  "pointer-events-auto inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link";

/**
 * Floating transcript controls. Each button appears only while it has somewhere to
 * go, so the pair stays out of the way on short answers.
 */
export function ChatScrollControls({
  canScrollToAnswerTop,
  isPinnedToBottom,
  onScrollToAnswerTop,
  onScrollToBottom,
}: Props) {
  if (!canScrollToAnswerTop && isPinnedToBottom) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 right-6 z-20 flex items-center gap-2">
      {canScrollToAnswerTop && (
        <button type="button" onClick={onScrollToAnswerTop} className={CONTROL_BASE}>
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          Đầu câu trả lời
        </button>
      )}

      {!isPinnedToBottom && (
        <button
          type="button"
          onClick={onScrollToBottom}
          className={`${CONTROL_BASE} w-11 justify-center px-0`}
          aria-label="Xuống cuối cuộc trò chuyện"
          title="Xuống cuối"
        >
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
