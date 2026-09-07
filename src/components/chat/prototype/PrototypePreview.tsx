"use client";

import { useEffect, useRef, useState } from "react";
import {
  MESSAGE_TYPE_OPTIONS,
  UI_PATTERN_OPTIONS,
  type MessageType,
  type UiPattern,
} from "@/lib/chat/scope-options";
import { prototypeMicrocopy, type PrototypeSpec } from "@/lib/chat/prototype-spec";
import { canCopyImage, copyPrototypeImage, downloadPrototypeJpg } from "@/lib/chat/prototype-image";
import { PatternBody, accentFor, describeUnrenderedContent } from "./patterns";

const MSG_LABEL = new Map<MessageType, string>(MESSAGE_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const UI_LABEL = new Map<UiPattern, string>(UI_PATTERN_OPTIONS.map((o) => [o.value, o.label]));

function ScopeChip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
      style={
        color
          ? {
              color,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            }
          : { color: "var(--muted)", background: "var(--surface)", borderColor: "var(--border)" }
      }
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

function ToolbarButton({
  onClick,
  label,
  d,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  d: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-xs font-medium border border-border text-foreground hover:bg-border/60 transition-colors disabled:opacity-50"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
      </svg>
      {label}
    </button>
  );
}

const D_DOWNLOAD = "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3";
const D_IMAGE = "M4 16l4.6-4.6a2 2 0 012.8 0L16 16m-2-2l1.6-1.6a2 2 0 012.8 0L20 14M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z";
const D_COPY = "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z";

type Status = null | "copied-text" | "copied-image" | "error";

/**
 * Bản dựng minh hoạ cho câu trả lời: màn hình Zalo dựng bằng component chuẩn
 * của hệ thống, đổ nội dung mà model đề xuất. Không phải ảnh chụp màn hình và
 * cũng không phải ảnh do model vẽ.
 */
export function PrototypePreview({ spec }: { spec: PrototypeSpec }) {
  const shotRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [imageCopyable, setImageCopyable] = useState(false);
  const accent = accentFor(spec.messageType);
  const unrendered = describeUnrenderedContent(spec);

  // Chỉ biết được sau khi mount — tránh lệch markup giữa server và client.
  useEffect(() => setImageCopyable(canCopyImage()), []);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2000);
    return () => clearTimeout(t);
  }, [status]);

  const run = async (fn: () => Promise<void>, ok: Status) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setStatus(ok);
    } catch (e) {
      console.error("[Prototype] Export failed", e);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <figure
      data-testid="prototype-preview"
      className="mt-6 rounded-[16px] border border-border overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-start gap-2 px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Bản dựng minh hoạ</span>
          <ScopeChip label={MSG_LABEL.get(spec.messageType) ?? spec.messageType} color={accent} />
          <ScopeChip label={UI_LABEL.get(spec.pattern) ?? spec.pattern} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ToolbarButton
            onClick={() =>
              void run(() => downloadPrototypeJpg(shotRef.current!, spec), "copied-image")
            }
            label="Tải JPG"
            d={D_DOWNLOAD}
            disabled={busy}
          />
          {imageCopyable && (
            <ToolbarButton
              onClick={() => void run(() => copyPrototypeImage(shotRef.current!), "copied-image")}
              label="Copy ảnh"
              d={D_IMAGE}
              disabled={busy}
            />
          )}
          <ToolbarButton
            onClick={() =>
              void run(() => navigator.clipboard.writeText(prototypeMicrocopy(spec)), "copied-text")
            }
            label="Copy chữ"
            d={D_COPY}
            disabled={busy}
          />
        </div>
      </div>

      {unrendered.length > 0 && (
        // Nội dung không vừa pattern thì nói thẳng, thay vì âm thầm bỏ bớt.
        <div
          className="flex items-start gap-2 px-4 py-2.5 text-[11.5px] leading-relaxed border-b border-border/60"
          style={{ background: "color-mix(in srgb, var(--scope-warning) 10%, transparent)" }}
        >
          <svg
            className="w-4 h-4 shrink-0 mt-[1px]"
            style={{ color: "var(--scope-warning)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <span className="text-foreground/80">
            <strong className="font-semibold">
              {UI_LABEL.get(spec.pattern) ?? spec.pattern} không chở hết nội dung này
            </strong>{" "}
            — chưa dựng được: {unrendered.join(", ")}. Nội dung đầy đủ vẫn nằm trong câu trả lời và ở nút
            “Copy chữ”; cân nhắc đổi sang bottom sheet hoặc modal.
          </span>
        </div>
      )}

      {/* Vùng được chụp thành ảnh — chỉ khung máy, không kèm chip/nút. */}
      {/* overflow-x-auto: khung máy giữ đúng 320px, cột hẹp thì cuộn ngang chứ không bóp méo */}
      <div ref={shotRef} className="px-5 py-6 overflow-x-auto" style={{ background: "var(--surface)" }}>
        <PatternBody spec={spec} />
      </div>

      <figcaption className="px-4 pb-3 flex items-center gap-2 text-[11px] leading-relaxed text-muted">
        <span className="flex-1">
          Dựng lại theo guideline bằng component chuẩn của hệ thống — không phải ảnh chụp màn hình.
        </span>
        {status === "copied-text" && <span className="shrink-0 font-semibold">Đã copy chữ</span>}
        {status === "copied-image" && <span className="shrink-0 font-semibold">Đã xong</span>}
        {status === "error" && <span className="shrink-0 font-semibold text-red-500">Xuất ảnh thất bại</span>}
      </figcaption>
    </figure>
  );
}
