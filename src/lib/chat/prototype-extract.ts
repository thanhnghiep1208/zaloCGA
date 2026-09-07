// Trích khối ```zalo-prototype``` ra khỏi text của model.
//
// Tách riêng khỏi route.ts để logic test được dưới vitest `environment: "node"`,
// và để route chỉ còn vài dòng glue.

import { sanitizePrototypeSpec, type PrototypeSpec } from "./prototype-spec";

const FENCE_TAG = "```zalo-prototype";

/** Khối đóng đủ. Cờ `g` để lấy match cuối nếu model lỡ xuất nhiều khối. */
const CLOSED_FENCE = /```zalo-prototype[^\n]*\n([\s\S]*?)```/g;

/** Fence đã mở nhưng chưa đóng — text sau nó là JSON đang stream dở. */
const OPEN_FENCE_TAIL = /```zalo-prototype[\s\S]*$/;

/** Spec hợp lệ cuối cùng trong text, hoặc null. */
export function extractPrototypeSpec(fullText: string): PrototypeSpec | null {
  let spec: PrototypeSpec | null = null;

  for (const match of fullText.matchAll(CLOSED_FENCE)) {
    try {
      const candidate = sanitizePrototypeSpec(JSON.parse(match[1].trim()));
      if (candidate) spec = candidate;
    } catch {
      /* JSON hỏng — bỏ qua; callsite đo tỉ lệ này qua hasPrototypeFence */
    }
  }

  return spec;
}

/** True nếu model có xuất fence (dù spec hợp lệ hay không) — dùng để đo tỉ lệ tuân thủ. */
export function hasPrototypeFence(fullText: string): boolean {
  return fullText.includes(FENCE_TAG);
}

/**
 * Cắt phần đuôi đang là prefix dở của chuỗi mở fence (```z, ```zalo-pro, …).
 * Cần thiết vì giữa lúc stream, mấy ký tự đầu của fence sẽ nhấp nháy trong markdown.
 * Một chuỗi ``` trần được giữ nguyên — đó có thể là code fence thường đang mở dở.
 */
function stripPartialFenceTail(text: string): string {
  const idx = text.lastIndexOf("```");
  if (idx === -1) return text;

  const tail = text.slice(idx);
  return tail.length > 3 && FENCE_TAG.startsWith(tail) ? text.slice(0, idx) : text;
}

/**
 * Bỏ khối prototype khỏi text hiển thị. Phải chịu được cả khối đóng đủ,
 * fence mở chưa đóng, và prefix dở ở cuối chunk stream.
 */
export function stripPrototypeBlock(text: string): string {
  const withoutClosed = text.replace(CLOSED_FENCE, "").replace(OPEN_FENCE_TAIL, "");
  return stripPartialFenceTail(withoutClosed).trim();
}
