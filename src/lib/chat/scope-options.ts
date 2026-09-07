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

/** Giá trị gắn tag tài liệu: có thể chọn 1 facet cụ thể, hoặc "all" để khớp mọi giá trị của facet đó. */
export type DocMessageType = MessageType | "all";
export type DocUiPattern = UiPattern | "all";

export const DOC_MESSAGE_TYPE_OPTIONS: { value: DocMessageType; label: string }[] = [
  { value: "all", label: "Tất cả loại thông báo" },
  ...MESSAGE_TYPE_OPTIONS,
];

export const DOC_UI_PATTERN_OPTIONS: { value: DocUiPattern; label: string }[] = [
  { value: "all", label: "Tất cả kiểu UI" },
  ...UI_PATTERN_OPTIONS,
];

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

  const hint = `Người dùng giới hạn phạm vi: ${bits.join(", ")}. Ưu tiên guideline/microcopy đúng phạm vi này; nếu tài liệu không phủ, nói rõ thay vì suy đoán.`;

  // Người dùng đã tự chọn kiểu UI thì đừng để model đoán lại — ghim giá trị máy.
  const pinned: string[] = [];
  if (scope.uiPattern) pinned.push(`"pattern" PHẢI bằng "${scope.uiPattern}"`);
  if (scope.messageType) pinned.push(`"messageType" PHẢI bằng "${scope.messageType}"`);

  return `${hint} Khi xuất khối zalo-prototype, ${pinned.join(" và ")}.`;
}

const MESSAGE_TYPE_SET = new Set<MessageType>(MESSAGE_TYPE_OPTIONS.map((o) => o.value));
const UI_PATTERN_SET = new Set<UiPattern>(UI_PATTERN_OPTIONS.map((o) => o.value));

/** API không tin client: chỉ nhận giá trị nằm trong whitelist. */
export function sanitizeScope(input: unknown): ChatScope {
  const raw = (input ?? {}) as Partial<ChatScope>;
  return {
    messageType:
      raw.messageType && MESSAGE_TYPE_SET.has(raw.messageType) ? raw.messageType : null,
    uiPattern: raw.uiPattern && UI_PATTERN_SET.has(raw.uiPattern) ? raw.uiPattern : null,
  };
}

/** Dùng khi gắn tag tài liệu (admin upload/library) — trả null nếu không hợp lệ/không chọn. */
export function sanitizeDocMessageType(input: unknown): DocMessageType | null {
  if (input === "all") return "all";
  return typeof input === "string" && MESSAGE_TYPE_SET.has(input as MessageType)
    ? (input as MessageType)
    : null;
}

export function sanitizeDocUiPattern(input: unknown): DocUiPattern | null {
  if (input === "all") return "all";
  return typeof input === "string" && UI_PATTERN_SET.has(input as UiPattern)
    ? (input as UiPattern)
    : null;
}
