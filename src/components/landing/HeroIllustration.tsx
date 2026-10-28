import { BookOpenText, Check, Sparkle } from "@phosphor-icons/react/dist/ssr";

/** Placeholder text line; widths vary so the shapes read as copy, not as a table. */
function Line({ className }: { className: string }) {
  return <span className={`block h-2.5 rounded-full ${className}`} />;
}

/**
 * Abstract hero illustration, composed as one scene: a guideline page sits
 * behind a single conversation (question, approved answer, cited source).
 * Shapes only (no readable copy) and theme tokens throughout, so it stays
 * generic and works in light and dark.
 */
export function HeroIllustration() {
  return (
    // Padding (not a fixed aspect) frames the conversation, so the scene grows
    // with its content and nothing can spill out at narrow widths.
    <div
      aria-hidden
      className="relative mx-auto w-full max-w-[420px] select-none px-[9%] pt-[17%] pb-[9%] lg:max-w-[520px] lg:pr-[24%] lg:pl-[12%]"
    >
      <div className="absolute inset-0 rounded-[32px] border border-border bg-[radial-gradient(70%_70%_at_50%_40%,color-mix(in_oklab,var(--link)_20%,transparent),transparent_75%),var(--surface)]" />

      {/* Guideline page peeking out behind the conversation */}
      <div className="absolute top-[9%] right-[9%] w-[42%] rotate-6 rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow-sm)]">
        <span className="mb-3 grid size-8 place-items-center rounded-lg bg-link/10 text-link">
          <BookOpenText size={18} />
        </span>
        <div className="flex flex-col gap-2">
          <Line className="w-4/5 bg-foreground/15" />
          <Line className="w-full bg-foreground/10" />
          <Line className="w-3/5 bg-foreground/10" />
        </div>
      </div>

      {/* The conversation */}
      <div className="relative flex flex-col rounded-3xl border border-border bg-background p-5 shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-charcoal text-white">
            <Sparkle size={16} weight="fill" />
          </span>
          <div className="flex w-full flex-col gap-1.5">
            <Line className="w-2/5 bg-foreground/20" />
            <Line className="h-2 w-1/4 bg-foreground/10" />
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-5">
          {/* Question */}
          <div className="ml-auto w-[68%] rounded-2xl rounded-br-md bg-foreground/[0.06] p-3.5">
            <div className="flex flex-col gap-2">
              <Line className="w-full bg-foreground/15" />
              <Line className="w-3/5 bg-foreground/15" />
            </div>
          </div>

          {/* Approved answer with its cited guideline */}
          <div className="flex w-[82%] flex-col gap-2">
            <div className="relative rounded-2xl rounded-bl-md bg-charcoal p-4 shadow-[0_14px_32px_-12px_rgba(0,90,221,0.6)]">
              <div className="flex flex-col gap-2">
                <Line className="w-full bg-white/75" />
                <Line className="w-5/6 bg-white/50" />
                <Line className="w-1/2 bg-white/50" />
              </div>
              <span className="absolute -top-3 -right-3 grid size-9 place-items-center rounded-full border border-border bg-background text-link shadow-[var(--shadow-sm)]">
                <Check size={16} weight="bold" />
              </span>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5 text-link">
              <BookOpenText size={14} />
              <Line className="h-2 w-14 bg-foreground/15" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
