"use client";

import { useEffect, useRef, useState } from "react";
import {
  MESSAGE_TYPE_OPTIONS,
  UI_PATTERN_OPTIONS,
  type ChatScope,
  type MessageType,
  type UiPattern,
} from "@/lib/chat/scope-options";

type Facet = "msg" | "ui";

interface ChatScopePickerProps {
  scope: ChatScope;
  onChange: (scope: ChatScope) => void;
  className?: string;
}

export function ChatScopePicker({ scope, onChange, className }: ChatScopePickerProps) {
  const [open, setOpen] = useState<Facet | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const msgOpt = MESSAGE_TYPE_OPTIONS.find((o) => o.value === scope.messageType);
  const uiOpt = UI_PATTERN_OPTIONS.find((o) => o.value === scope.uiPattern);
  const dirty = !!(scope.messageType || scope.uiPattern);

  const setMsg = (v: MessageType | null) => {
    onChange({ ...scope, messageType: v });
    setOpen(null);
  };
  const setUi = (v: UiPattern | null) => {
    onChange({ ...scope, uiPattern: v });
    setOpen(null);
  };

  return (
    <div ref={rootRef} className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {/* Facet 1: loại thông báo */}
      <div className="relative">
        {msgOpt ? (
          <Chip
            label={msgOpt.label}
            dotColor={msgOpt.color}
            onOpen={() => setOpen(open === "msg" ? null : "msg")}
            onClear={() => setMsg(null)}
          />
        ) : (
          <Trigger
            label="Loại thông báo"
            active={open === "msg"}
            onClick={() => setOpen(open === "msg" ? null : "msg")}
          />
        )}
        {open === "msg" && (
          <Popover ariaLabel="Loại thông báo">
            {MESSAGE_TYPE_OPTIONS.map((o) => (
              <Option
                key={o.value}
                selected={scope.messageType === o.value}
                onClick={() => setMsg(o.value)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: o.color }}
                  aria-hidden
                />
                {o.label}
              </Option>
            ))}
          </Popover>
        )}
      </div>

      {/* Facet 2: kiểu UI */}
      <div className="relative">
        {uiOpt ? (
          <Chip
            label={uiOpt.label}
            accent
            onOpen={() => setOpen(open === "ui" ? null : "ui")}
            onClear={() => setUi(null)}
          />
        ) : (
          <Trigger
            label="Kiểu UI"
            active={open === "ui"}
            onClick={() => setOpen(open === "ui" ? null : "ui")}
          />
        )}
        {open === "ui" && (
          <Popover ariaLabel="Kiểu UI">
            {UI_PATTERN_OPTIONS.map((o) => (
              <Option
                key={o.value}
                selected={scope.uiPattern === o.value}
                onClick={() => setUi(o.value)}
              >
                {o.label}
              </Option>
            ))}
          </Popover>
        )}
      </div>

      {dirty && (
        <button
          type="button"
          onClick={() => onChange({ messageType: null, uiPattern: null })}
          className="px-1.5 py-1 text-xs text-muted hover:text-foreground"
        >
          Xoá scope
        </button>
      )}
    </div>
  );
}

function Trigger({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="listbox"
      aria-expanded={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[13px]
        ${
          active
            ? "border-[var(--accent)] text-foreground"
            : "border-border bg-surface text-muted hover:text-foreground"
        }`}
    >
      {label}
      <span aria-hidden>▾</span>
    </button>
  );
}

function Chip({
  label,
  dotColor,
  accent,
  onOpen,
  onClear,
}: {
  label: string;
  dotColor?: string;
  accent?: boolean;
  onOpen: () => void;
  onClear: () => void;
}) {
  // Chip nền tint (color-mix để đảm bảo contrast), chữ = màu đậm cùng họ.
  const style = dotColor
    ? {
        background: `color-mix(in srgb, ${dotColor} 14%, transparent)`,
        color: dotColor,
        borderColor: `color-mix(in srgb, ${dotColor} 32%, transparent)`,
      }
    : undefined;
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-xl border pl-2.5 pr-1 text-[13px] font-medium
        ${accent ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]" : ""}`}
      style={style}
    >
      {dotColor && (
        <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} aria-hidden />
      )}
      <button type="button" onClick={onOpen} className="outline-none">
        {label}
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Bỏ ${label}`}
        className="grid h-5 w-5 place-items-center rounded-md opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </span>
  );
}

function Popover({ ariaLabel, children }: { ariaLabel: string; children: React.ReactNode }) {
  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className="clay-card absolute bottom-full z-20 mb-2 min-w-[200px] p-1.5 shadow-md"
    >
      {children}
    </div>
  );
}

function Option({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]
        ${
          selected
            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
            : "text-foreground hover:bg-foreground/5"
        }`}
    >
      {children}
    </div>
  );
}
