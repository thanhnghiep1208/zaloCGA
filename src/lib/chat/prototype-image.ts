// Xuất bản dựng ra file ảnh ngay trên trình duyệt (không đụng tới server).
//
// html-to-image clone node rồi copy computed style vào inline, nên var() và
// color-mix() đã được resolve sẵn — không cần bơm CSS variable thủ công.

import type { PrototypeSpec } from "./prototype-spec";

/** Xuất ở 2x cho ảnh nét khi dán vào Figma/ticket trên màn retina. */
const PIXEL_RATIO = 2;
const JPEG_QUALITY = 0.95;

export function prototypeImageFileName(spec: PrototypeSpec, ext: "jpg" | "png"): string {
  return `zalo-${spec.pattern}-${spec.messageType}.${ext}`;
}

/**
 * JPEG không có alpha nên bắt buộc truyền nền đục, nếu không vùng trong suốt
 * sẽ ra đen. Lấy nền thật của khung máy để ảnh khớp với cái đang thấy.
 */
function resolveBackground(node: HTMLElement): string {
  const bg = getComputedStyle(node).backgroundColor;
  const isTransparent = !bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)";
  return isTransparent ? "#ffffff" : bg;
}

export async function downloadPrototypeJpg(node: HTMLElement, spec: PrototypeSpec): Promise<void> {
  const { toJpeg } = await import("html-to-image");
  const dataUrl = await toJpeg(node, {
    pixelRatio: PIXEL_RATIO,
    quality: JPEG_QUALITY,
    backgroundColor: resolveBackground(node),
    cacheBust: true,
  });

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = prototypeImageFileName(spec, "jpg");
  a.click();
}

/**
 * Clipboard API chỉ bắt buộc hỗ trợ image/png — Chrome từ chối image/jpeg trong
 * ClipboardItem — nên nút "Copy ảnh" dán ra PNG, khác với nút tải về (JPG).
 */
export async function copyPrototypeImage(node: HTMLElement): Promise<void> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    pixelRatio: PIXEL_RATIO,
    backgroundColor: resolveBackground(node),
    cacheBust: true,
  });
  if (!blob) throw new Error("Không dựng được ảnh từ bản dựng");

  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Trình duyệt cũ / ngữ cảnh không secure sẽ không có API này — ẩn nút thay vì để bấm lỗi. */
export function canCopyImage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof ClipboardItem !== "undefined" &&
    !!navigator.clipboard?.write
  );
}
