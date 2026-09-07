"use client";

// Chuẩn UI cho 8 kiểu pattern, dựng trên một màn hình Zalo giả lập hoàn chỉnh
// (status bar → header → luồng chat → thanh nhập liệu) để bản dựng đọc ra như
// ảnh UI thật chứ không phải wireframe.
//
// Model KHÔNG chọn màu/icon/bo góc/spacing — tất cả nằm ở file này và được
// review qua PR. Bản dựng hoàn toàn tĩnh: action giả render bằng <span>,
// không phải <button>.

import type { JSX, ReactNode } from "react";
import { MESSAGE_TYPE_OPTIONS, type MessageType, type UiPattern } from "@/lib/chat/scope-options";
import type { PrototypeAction, PrototypeSpec } from "@/lib/chat/prototype-spec";

const ACCENT = new Map<MessageType, string>(MESSAGE_TYPE_OPTIONS.map((o) => [o.value, o.color]));

/** Màu semantic đã có sẵn ở scope-options — đừng tạo bảng map thứ hai. */
export function accentFor(messageType: MessageType): string {
  return ACCENT.get(messageType) ?? "var(--scope-info)";
}

function tint(accent: string, percent: number): string {
  return `color-mix(in srgb, ${accent} ${percent}%, transparent)`;
}

/** Khung máy rộng 320, cao TỐI THIỂU 600 — giãn thêm nếu nội dung dài. */
export const SCREEN_W = 320;
export const SCREEN_MIN_H = 600;
/** Luồng chat co lại nhường chỗ cho overlay, nhưng không biến mất hẳn. */
const STREAM_MIN_H = 150;

// --- Icons ---

const ICON_PATHS: Record<MessageType, string> = {
  information: "M12 16v-5m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  error: "M15 9l-6 6m0-6l6 6m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  warning: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  confirmation: "M8.23 9a3.5 3.5 0 116.78 1c0 2-3 2.5-3 4M12 17h.01",
  "empty-state": "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0l-2.4 6A2 2 0 0115.72 20H8.28a2 2 0 01-1.88-1L4 13m16 0h-4.5l-1 2h-5l-1-2H4",
};

export function ProtoIcon({ messageType, className = "w-5 h-5" }: { messageType: MessageType; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PATHS[messageType]} />
    </svg>
  );
}

function Glyph({ d, className = "w-[18px] h-[18px]" }: { d: string; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
    </svg>
  );
}

const D_BACK = "M15 19l-7-7 7-7";
const D_PHONE =
  "M3 5a2 2 0 012-2h2.2a1 1 0 01.97.76l.9 3.6a1 1 0 01-.28.96l-1.6 1.6a14 14 0 006.9 6.9l1.6-1.6a1 1 0 01.96-.28l3.6.9a1 1 0 01.76.97V19a2 2 0 01-2 2A16 16 0 013 5z";
const D_VIDEO =
  "M15 10l4.55-2.28A1 1 0 0121 8.6v6.8a1 1 0 01-1.45.89L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z";
const D_MENU = "M4 6h16M4 12h16M4 18h16";
const D_SMILE = "M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
const D_IMAGE =
  "M4 16l4.6-4.6a2 2 0 012.8 0L16 16m-2-2l1.6-1.6a2 2 0 012.8 0L20 14M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z";
const D_MIC = "M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v3";

// --- Zalo screen chrome ---

function StatusBar() {
  return (
    <div
      className="flex items-center justify-between px-4 h-7 shrink-0 text-[11px] font-semibold"
      style={{ background: "var(--proto-brand)", color: "#ffffff" }}
    >
      <span>9:41</span>
      <div className="flex items-center gap-1" aria-hidden="true">
        <svg width="15" height="10" viewBox="0 0 15 10" fill="currentColor">
          <rect x="0" y="7" width="2.5" height="3" rx="0.6" opacity="0.9" />
          <rect x="3.6" y="5" width="2.5" height="5" rx="0.6" opacity="0.9" />
          <rect x="7.2" y="2.8" width="2.5" height="7.2" rx="0.6" opacity="0.9" />
          <rect x="10.8" y="0.5" width="2.5" height="9.5" rx="0.6" opacity="0.4" />
        </svg>
        <svg width="13" height="10" viewBox="0 0 13 10" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M1 3.4a8 8 0 0111 0M3.2 5.7a5 5 0 016.6 0" strokeLinecap="round" />
          <circle cx="6.5" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
          <rect x="0.5" y="0.5" width="16" height="9" rx="2.4" stroke="currentColor" strokeOpacity="0.5" />
          <rect x="2" y="2" width="11.5" height="6" rx="1.4" fill="currentColor" />
          <path d="M18 3.6v2.8a1.8 1.8 0 000-2.8z" fill="currentColor" fillOpacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

function ChatHeader() {
  return (
    <div
      className="flex items-center gap-2.5 px-3 h-14 shrink-0"
      style={{ background: "var(--proto-brand)", color: "#ffffff" }}
    >
      <Glyph d={D_BACK} className="w-[20px] h-[20px] opacity-95" />
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
        style={{ background: "rgba(255,255,255,0.25)" }}
      >
        M
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[14px] font-semibold truncate">Minh Anh</p>
        <p className="text-[10.5px] opacity-80 truncate">Truy cập 5 phút trước</p>
      </div>
      <Glyph d={D_PHONE} className="w-[18px] h-[18px] opacity-95" />
      <Glyph d={D_VIDEO} className="w-[18px] h-[18px] opacity-95" />
      <Glyph d={D_MENU} className="w-[18px] h-[18px] opacity-95" />
    </div>
  );
}

function BubbleIn({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[74%] px-3 py-2 text-[13px] leading-snug rounded-[14px] rounded-bl-[4px]"
        style={{
          background: "var(--proto-surface)",
          color: "var(--proto-text)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BubbleOut({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[74%] px-3 py-2 text-[13px] leading-snug rounded-[14px] rounded-br-[4px]"
        style={{
          background: "var(--proto-bubble-out)",
          color: "var(--proto-text)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function InputBar() {
  return (
    <div
      className="flex items-center gap-2.5 px-3 h-12 shrink-0"
      style={{
        background: "var(--proto-surface)",
        borderTop: "1px solid var(--proto-divider)",
        color: "var(--proto-text-muted)",
      }}
    >
      <Glyph d={D_SMILE} />
      <span className="flex-1 text-[13px]">Tin nhắn</span>
      <Glyph d={D_MIC} />
      <Glyph d={D_IMAGE} />
    </div>
  );
}

/** Luồng hội thoại nền — nội dung thật, không phải thanh xám skeleton. */
const STREAM_BUBBLES = (
  <>
    <BubbleIn>Bạn gửi giúp mình tấm ảnh lúc nãy nhé</BubbleIn>
    <BubbleOut>Ok chờ mình chút</BubbleOut>
    <BubbleIn>Mình cảm ơn nha</BubbleIn>
  </>
);

function StreamDay() {
  return (
    <p className="text-center text-[10.5px] py-0.5" style={{ color: "var(--proto-text-muted)" }}>
      Hôm nay
    </p>
  );
}

/**
 * Luồng hội thoại nền — nội dung thật, không phải thanh xám skeleton.
 *
 * Mặc định nằm TRONG luồng layout để card/ZInstant card dài làm khung giãn theo.
 * Khi bị sheet/modal che (`dim`) thì chuyển thành lớp trang trí absolute, nhường
 * quyền quyết định chiều cao cho overlay.
 */
function MessageStream({ inline, dim = false }: { inline?: ReactNode; dim?: boolean }) {
  if (dim) {
    return (
      <div className="relative flex-1 shrink" style={{ minHeight: STREAM_MIN_H }}>
        <div className="absolute inset-0 overflow-hidden px-3 py-3 flex flex-col gap-2" aria-hidden="true">
          <StreamDay />
          {STREAM_BUBBLES}
        </div>
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 shrink-0 px-3 py-3 flex flex-col gap-2"
      style={{ minHeight: STREAM_MIN_H }}
    >
      <StreamDay />
      {STREAM_BUBBLES}
      {inline}
    </div>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-center">
      <div
        // shrink-0: flex item mặc định co được, cột chat hẹp sẽ bóp khung xuống
        // dưới 320px làm chữ ngắt dòng liên tục và khung cao vọt lên.
        className="relative flex flex-col overflow-hidden rounded-[28px] shrink-0"
        style={{
          width: SCREEN_W,
          minHeight: SCREEN_MIN_H,
          background: "var(--proto-chat-bg)",
          border: "1px solid var(--proto-divider)",
          boxShadow: "0 10px 34px rgba(0,0,0,0.16)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Màn hình Zalo hoàn chỉnh. `overlay` phủ lên trên, `inline` chèn vào luồng chat,
 * `dim` bật scrim cho các pattern chặn tương tác (sheet/modal).
 */
function ZaloScreen({
  overlay,
  inline,
  banner,
  footer,
  dim = false,
}: {
  overlay?: ReactNode;
  inline?: ReactNode;
  banner?: ReactNode;
  /** Thay thanh nhập liệu ở đáy. Nằm trong luồng nên nội dung dài làm khung giãn theo. */
  footer?: ReactNode;
  dim?: boolean;
}) {
  return (
    <PhoneFrame>
      <StatusBar />
      <ChatHeader />
      {banner}
      <MessageStream inline={inline} dim={dim} />
      {/* footer nằm trong luồng nên overlay cao bao nhiêu khung cũng giãn theo, không bị cắt */}
      {footer ?? <InputBar />}
      {overlay}
    </PhoneFrame>
  );
}

// --- Primitives dùng trong các pattern ---

function ProtoTitle({ children, size = "base" }: { children: string; size?: "sm" | "base" | "lg" }) {
  const sizeClass = size === "lg" ? "text-[18px]" : size === "sm" ? "text-[13.5px]" : "text-[15.5px]";
  return (
    <p className={`${sizeClass} font-semibold leading-snug`} style={{ color: "var(--proto-text)" }}>
      {children}
    </p>
  );
}

function ProtoBody({ children, size = "base" }: { children: string; size?: "sm" | "base" }) {
  return (
    <p
      className={`${size === "sm" ? "text-[11.5px]" : "text-[13px]"} leading-relaxed`}
      style={{ color: "var(--proto-text-muted)" }}
    >
      {children}
    </p>
  );
}

function ProtoHelper({ children }: { children: string }) {
  return (
    <p className="text-[11px] leading-snug" style={{ color: "var(--proto-text-muted)" }}>
      {children}
    </p>
  );
}

/** Danh sách ý — giữ nguyên cấu trúc bản gốc thay vì nhồi hết vào body. */
function ProtoBullets({ items, accent }: { items: string[]; accent: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed" style={{ color: "var(--proto-text-muted)" }}>
          <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Action giả — luôn là <span>, không bao giờ là <button>. */
function ProtoAction({
  label,
  variant,
  accent,
  block = false,
}: {
  label: string;
  variant: PrototypeAction["kind"];
  accent: string;
  block?: boolean;
}) {
  const base = `inline-flex items-center justify-center text-[13.5px] font-semibold rounded-[10px] ${
    block ? "w-full px-4 py-2.5" : "px-4 py-2"
  }`;

  if (variant === "primary") {
    // --proto-surface sáng trên accent đậm (light) và tối trên accent nhạt (dark).
    return (
      <span className={base} style={{ background: accent, color: "var(--proto-surface)" }}>
        {label}
      </span>
    );
  }
  if (variant === "secondary") {
    return (
      <span
        className={base}
        style={{ background: "transparent", color: "var(--proto-text)", border: "1px solid var(--proto-divider)" }}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="text-[12.5px] font-bold uppercase tracking-wide" style={{ color: accent }}>
      {label}
    </span>
  );
}

/**
 * Render ĐỦ mọi nút trong actions[] — bản gốc có 3-4 nút thì hiện 3-4 nút.
 * Xếp dọc (block) giữ thứ tự bản gốc; xếp ngang thì primary về cuối theo chuẩn dialog.
 */
function ProtoActionRow({ spec, accent, block = false }: { spec: PrototypeSpec; accent: string; block?: boolean }) {
  const actions = spec.actions ?? [];
  if (actions.length === 0) return null;

  const ordered = block
    ? actions
    : [...actions].sort((a, b) => Number(a.kind === "primary") - Number(b.kind === "primary"));

  return (
    <div className={block ? "flex flex-col gap-2 pt-1" : "flex items-center justify-end flex-wrap gap-2 pt-1"}>
      {ordered.map((a, i) => (
        <ProtoAction key={i} label={a.label} variant={a.kind} accent={accent} block={block} />
      ))}
    </div>
  );
}

/** Nút đơn lẻ cho snackbar/banner/tooltip — lấy primary, không có thì lấy nút đầu. */
function leadAction(spec: PrototypeSpec): PrototypeAction | null {
  const actions = spec.actions ?? [];
  return actions.find((a) => a.kind === "primary") ?? actions[0] ?? null;
}

function AccentBadge({ messageType, accent, size = 40 }: { messageType: MessageType; accent: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: tint(accent, 14), color: accent }}
    >
      <ProtoIcon messageType={messageType} className={size >= 56 ? "w-7 h-7" : "w-5 h-5"} />
    </div>
  );
}

const SHEET_SHADOW = "0 -8px 30px rgba(0,0,0,0.22)";
const CARD_SHADOW = "0 12px 34px rgba(0,0,0,0.26)";

// --- 8 pattern bodies ---

type BodyProps = { spec: PrototypeSpec; accent: string };

function SnackbarBody({ spec, accent }: BodyProps) {
  const lead = leadAction(spec);
  return (
    <ZaloScreen
      overlay={
        // Snackbar nổi ngay trên thanh nhập liệu — đúng vị trí thật trong app.
        <div className="absolute left-3 right-3" style={{ bottom: 60 }}>
          <div
            className="flex items-center gap-2.5 px-3.5 py-3 rounded-[12px]"
            style={{ background: "var(--proto-overlay)", boxShadow: CARD_SHADOW }}
          >
            <span style={{ color: accent }}>
              <ProtoIcon messageType={spec.messageType} className="w-[18px] h-[18px]" />
            </span>
            <span className="flex-1 text-[12.5px] leading-snug" style={{ color: "var(--proto-on-overlay)" }}>
              {spec.title || spec.body}
            </span>
            {lead && (
              <span className="text-[12px] font-bold uppercase tracking-wide shrink-0" style={{ color: accent }}>
                {lead.label}
              </span>
            )}
          </div>
        </div>
      }
    />
  );
}

function BottomSheetBody({ spec, accent }: BodyProps) {
  return (
    <ZaloScreen
      dim
      footer={
        // footer nằm trong luồng: sheet dài bao nhiêu thì khung máy cao theo, không bị cắt
        <div
          className="rounded-t-[20px] px-5 pt-3 pb-6 space-y-3 shrink-0"
          style={{ background: "var(--proto-surface)", boxShadow: SHEET_SHADOW }}
        >
          <div className="mx-auto w-10 h-1 rounded-full" style={{ background: "var(--proto-divider)" }} />
          <AccentBadge messageType={spec.messageType} accent={accent} />
          {spec.title && <ProtoTitle size="lg">{spec.title}</ProtoTitle>}
          {spec.body && <ProtoBody>{spec.body}</ProtoBody>}
          {spec.bullets && <ProtoBullets items={spec.bullets} accent={accent} />}
          {spec.helperText && <ProtoHelper>{spec.helperText}</ProtoHelper>}
          <ProtoActionRow spec={spec} accent={accent} block />
        </div>
      }
    />
  );
}

function ModalBody({ spec, accent }: BodyProps) {
  return (
    <ZaloScreen
      dim
      footer={
        // Bọc trong luồng thay vì absolute -translate-y-1/2: modal cao thì khung giãn theo.
        <>
          <div className="px-7 py-5 shrink-0">
            <div
              className="rounded-[16px] p-5 space-y-3"
              style={{ background: "var(--proto-surface)", boxShadow: CARD_SHADOW }}
            >
              <AccentBadge messageType={spec.messageType} accent={accent} />
              {spec.title && <ProtoTitle>{spec.title}</ProtoTitle>}
              {spec.body && <ProtoBody>{spec.body}</ProtoBody>}
              {spec.bullets && <ProtoBullets items={spec.bullets} accent={accent} />}
              {spec.helperText && <ProtoHelper>{spec.helperText}</ProtoHelper>}
              <ProtoActionRow spec={spec} accent={accent} />
            </div>
          </div>
          <div className="flex-1 shrink" style={{ minHeight: 40, background: "rgba(0,0,0,0.45)" }} aria-hidden="true" />
        </>
      }
    />
  );
}

function SystemBannerBody({ spec, accent }: BodyProps) {
  return (
    <ZaloScreen
      banner={
        // Banner hệ thống chiếm chỗ thật trong layout, đẩy luồng chat xuống —
        // không absolute, nếu không nó đè chữ lên bong bóng tin nhắn.
        <div
          className="flex items-start gap-2.5 px-4 py-3 shrink-0"
          style={{ background: tint(accent, 16), borderBottom: `1px solid ${tint(accent, 45)}` }}
        >
          <span style={{ color: accent }}>
            <ProtoIcon messageType={spec.messageType} className="w-[18px] h-[18px]" />
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            {spec.title && <ProtoTitle size="sm">{spec.title}</ProtoTitle>}
            {spec.body && <ProtoBody size="sm">{spec.body}</ProtoBody>}
            {spec.bullets && <ProtoBullets items={spec.bullets} accent={accent} />}
            {spec.helperText && <ProtoHelper>{spec.helperText}</ProtoHelper>}
          </div>
          {(spec.actions ?? []).length > 0 && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              {(spec.actions ?? []).map((a, i) => (
                <ProtoAction key={i} label={a.label} variant="text" accent={accent} />
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}

function TooltipBody({ spec, accent }: BodyProps) {
  return (
    <ZaloScreen
      overlay={
        // Tooltip trỏ lên icon trong header — nơi tooltip thật sự xuất hiện.
        <div className="absolute" style={{ top: 92, right: 12, width: 208 }}>
          <div
            className="absolute right-6 -top-[5px] w-3 h-3 rotate-45"
            style={{ background: "var(--proto-overlay)" }}
            aria-hidden="true"
          />
          <div
            className="relative rounded-[10px] px-3.5 py-2.5 space-y-1"
            style={{ background: "var(--proto-overlay)", boxShadow: CARD_SHADOW }}
          >
            {spec.title && (
              <p className="text-[12.5px] font-semibold leading-snug" style={{ color: "var(--proto-on-overlay)" }}>
                {spec.title}
              </p>
            )}
            {spec.body && (
              <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--proto-on-overlay)", opacity: 0.78 }}>
                {spec.body}
              </p>
            )}
            {spec.bullets && (
              <ul className="space-y-1 pt-0.5">
                {spec.bullets.map((it, i) => (
                  <li
                    key={i}
                    className="flex gap-1.5 text-[11.5px] leading-relaxed"
                    style={{ color: "var(--proto-on-overlay)", opacity: 0.78 }}
                  >
                    <span className="mt-[6px] w-1 h-1 rounded-full shrink-0" style={{ background: accent }} />
                    <span className="min-w-0">{it}</span>
                  </li>
                ))}
              </ul>
            )}
            {spec.helperText && (
              <p className="text-[11px] leading-snug" style={{ color: "var(--proto-on-overlay)", opacity: 0.62 }}>
                {spec.helperText}
              </p>
            )}
            {(spec.actions ?? []).length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                {(spec.actions ?? []).map((a, i) => (
                  <span key={i} className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: accent }}>
                    {a.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

function FullscreenBody({ spec, accent }: BodyProps) {
  return (
    <PhoneFrame>
      <div className="absolute inset-0 flex flex-col" style={{ background: "var(--proto-surface)" }}>
        <StatusBar />
        {/* Fullscreen chiếm trọn màn: chỉ còn nút quay lại, không có header hội thoại. */}
        <div className="flex items-center h-12 px-3 shrink-0" style={{ color: "var(--proto-text-muted)" }}>
          <Glyph d={D_BACK} className="w-[20px] h-[20px]" />
        </div>
        {/* shrink-0 chứ không min-h-0: vùng này phải giữ đủ chiều cao cho nội dung,
            nếu co lại thì bullet cuối bị nút CTA đè lên (mất chữ). */}
        <div className="flex-1 shrink-0 flex flex-col items-center justify-center text-center px-8 py-4 gap-3">
          <AccentBadge messageType={spec.messageType} accent={accent} size={72} />
          {spec.title && <ProtoTitle size="lg">{spec.title}</ProtoTitle>}
          {spec.body && <ProtoBody>{spec.body}</ProtoBody>}
          {spec.bullets && (
            <div className="text-left w-full">
              <ProtoBullets items={spec.bullets} accent={accent} />
            </div>
          )}
          {spec.helperText && <ProtoHelper>{spec.helperText}</ProtoHelper>}
        </div>
        <div className="px-6 pb-8 shrink-0">
          <ProtoActionRow spec={spec} accent={accent} block />
        </div>
      </div>
    </PhoneFrame>
  );
}

/** Card & ZInstant card sống TRONG luồng chat, nên chèn vào stream thay vì phủ lên. */
function CardBody({ spec, accent }: BodyProps) {
  return (
    <ZaloScreen
      inline={
        <div className="flex justify-start">
          <div
            className="max-w-[86%] rounded-[14px] rounded-bl-[4px] overflow-hidden"
            style={{ background: "var(--proto-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
          >
            <div className="px-3.5 py-3 space-y-1.5" style={{ borderLeft: `3px solid ${accent}` }}>
              <div className="flex items-center gap-1.5" style={{ color: accent }}>
                <ProtoIcon messageType={spec.messageType} className="w-4 h-4" />
                {spec.title && <ProtoTitle size="sm">{spec.title}</ProtoTitle>}
              </div>
              {spec.body && <ProtoBody size="sm">{spec.body}</ProtoBody>}
              {spec.bullets && <ProtoBullets items={spec.bullets} accent={accent} />}
              {spec.helperText && <ProtoHelper>{spec.helperText}</ProtoHelper>}
              <ProtoActionRow spec={spec} accent={accent} />
            </div>
          </div>
        </div>
      }
    />
  );
}

function ZinstantCardBody({ spec, accent }: BodyProps) {
  return (
    <ZaloScreen
      inline={
        <div className="flex justify-start">
          <div
            className="w-[86%] rounded-[14px] rounded-bl-[4px] overflow-hidden"
            style={{ background: "var(--proto-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center gap-2 px-3.5 h-11" style={{ background: tint(accent, 16), color: accent }}>
              <ProtoIcon messageType={spec.messageType} className="w-[18px] h-[18px]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">ZInstant</span>
            </div>
            <div className="px-3.5 py-3 space-y-1.5">
              {spec.title && <ProtoTitle size="sm">{spec.title}</ProtoTitle>}
              {spec.body && <ProtoBody size="sm">{spec.body}</ProtoBody>}
              {spec.bullets && <ProtoBullets items={spec.bullets} accent={accent} />}
              {spec.helperText && <ProtoHelper>{spec.helperText}</ProtoHelper>}
            </div>
            <div className="px-3.5 py-2.5" style={{ borderTop: "1px solid var(--proto-divider)" }}>
              <ProtoActionRow spec={spec} accent={accent} block />
            </div>
          </div>
        </div>
      }
    />
  );
}

/** Record<UiPattern, …> nên thêm pattern thứ 9 mà quên dựng component sẽ fail ở tsc. */
const PATTERN_BODIES: Record<UiPattern, (props: BodyProps) => JSX.Element> = {
  snackbar: SnackbarBody,
  "bottom-sheet": BottomSheetBody,
  modal: ModalBody,
  "system-banner": SystemBannerBody,
  tooltip: TooltipBody,
  fullscreen: FullscreenBody,
  card: CardBody,
  "zinstant-card": ZinstantCardBody,
};

/**
 * Snackbar theo chuẩn là toast MỘT DÒNG: nó không thể chở bullet, helper text hay
 * nhiều nút. Thay vì (a) bịa ra một "snackbar" nhiều dòng sai chuẩn, hoặc (b) âm
 * thầm ăn mất nội dung, ta khai báo năng lực ở đây để preview cảnh báo rõ ràng
 * phần nào không dựng được — người dùng tự quyết định đổi pattern.
 */
const SINGLE_LINE_PATTERNS = new Set<UiPattern>(["snackbar"]);

/** Liệt kê phần nội dung mà pattern đang chọn không hiển thị được. */
export function describeUnrenderedContent(spec: PrototypeSpec): string[] {
  if (!SINGLE_LINE_PATTERNS.has(spec.pattern)) return [];

  const missing: string[] = [];
  if (spec.title && spec.body) missing.push("phần mô tả (snackbar chỉ hiện một dòng)");
  if (spec.bullets?.length) missing.push(`${spec.bullets.length} ý trong danh sách`);
  if (spec.helperText) missing.push("dòng ghi chú");
  const extraActions = (spec.actions ?? []).length - 1;
  if (extraActions > 0) missing.push(`${extraActions} nút phụ`);
  return missing;
}

export function PatternBody({ spec }: { spec: PrototypeSpec }) {
  const Body = PATTERN_BODIES[spec.pattern];
  return <Body spec={spec} accent={accentFor(spec.messageType)} />;
}
