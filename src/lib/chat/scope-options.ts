// Facet scoping cho ô chat: loại thông báo × kiểu UI.
// Nguồn sự thật dùng chung cho UI (ChatScopePicker) và API (/api/chat).

export type MessageType =
  | "information"
  | "error"
  | "warning"
  | "success"
  | "confirmation"
  | "empty-state";

export type UiPattern =
  | "bottom-sheet"
  | "snackbar"
  | "modal"
  | "system-banner"
  | "tooltip"
  | "fullscreen"
  | "zinstant-card"
  | "card";

export interface ChatScope {
  messageType: MessageType | null;
  uiPattern: UiPattern | null;
}

export const EMPTY_SCOPE: ChatScope = { messageType: null, uiPattern: null };

export interface MessageTypeOption {
  value: MessageType;
  label: string; // hiển thị + đẩy vào query
  color: string; // CSS token, xem globals.css
}

export interface UiPatternOption {
  value: UiPattern;
  label: string;
}

export const MESSAGE_TYPE_OPTIONS: MessageTypeOption[] = [
  { value: "information", label: "Thông tin", color: "var(--scope-info)" },
  { value: "error", label: "Lỗi", color: "var(--scope-error)" },
  { value: "warning", label: "Cảnh báo", color: "var(--scope-warning)" },
  { value: "success", label: "Thành công", color: "var(--scope-success)" },
  { value: "confirmation", label: "Xác nhận", color: "var(--scope-confirm)" },
  { value: "empty-state", label: "Empty state", color: "var(--scope-empty)" },
];

export const UI_PATTERN_OPTIONS: UiPatternOption[] = [
  { value: "bottom-sheet", label: "Bottom sheet" },
  { value: "snackbar", label: "Snackbar" },
  { value: "modal", label: "Modal" },
  { value: "system-banner", label: "System banner" },
  { value: "tooltip", label: "Tooltip" },
  { value: "fullscreen", label: "Fullscreen" },
  { value: "zinstant-card", label: "ZInstant card" },
  { value: "card", label: "Card" },
];

const MSG_LABEL = new Map(MESSAGE_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const UI_LABEL = new Map(UI_PATTERN_OPTIONS.map((o) => [o.value, o.label]));

export function hasScope(scope: ChatScope | null | undefined): boolean {
  return !!scope && (scope.messageType !== null || scope.uiPattern !== null);
}

/** Nhãn đã chọn theo thứ tự [loại thông báo, kiểu UI]. */
export function scopeLabels(scope: ChatScope): string[] {
  const out: string[] = [];
  if (scope.messageType) out.push(MSG_LABEL.get(scope.messageType)!);
  if (scope.uiPattern) out.push(UI_LABEL.get(scope.uiPattern)!);
  return out;
}

/** Query cho retrieval: prefix nhãn scope để tăng vector + lexical overlap. */
export function buildScopedQuery(
  rawQuery: string,
  scope: ChatScope | null | undefined,
): string {
  if (!scope || !hasScope(scope)) return rawQuery;
  return `[${scopeLabels(scope).join(" · ")}] ${rawQuery}`.trim();
}

/** Câu hint chèn vào prompt để model khoanh vùng câu trả lời. */
export function scopeHintForPrompt(
  scope: ChatScope | null | undefined,
): string | null {
  if (!scope || !hasScope(scope)) return null;
  const bits: string[] = [];
  if (scope.messageType)
    bits.push(`loại thông báo = ${MSG_LABEL.get(scope.messageType)}`);
  if (scope.uiPattern) bits.push(`kiểu UI = ${UI_LABEL.get(scope.uiPattern)}`);
  return `Người dùng giới hạn phạm vi: ${bits.join(", ")}. Ưu tiên guideline/microcopy đúng phạm vi này; nếu tài liệu không phủ, nói rõ thay vì suy đoán.`;
}

/** API không tin client: chỉ nhận giá trị nằm trong whitelist. */
export function sanitizeScope(input: unknown): ChatScope {
  const msgSet = new Set<MessageType>(MESSAGE_TYPE_OPTIONS.map((o) => o.value));
  const uiSet = new Set<UiPattern>(UI_PATTERN_OPTIONS.map((o) => o.value));
  const raw = (input ?? {}) as Partial<ChatScope>;
  return {
    messageType:
      raw.messageType && msgSet.has(raw.messageType) ? raw.messageType : null,
    uiPattern: raw.uiPattern && uiSet.has(raw.uiPattern) ? raw.uiPattern : null,
  };
}
