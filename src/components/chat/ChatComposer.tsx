"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";
import type { LocalChatImage } from "@/types/chat";
import { shortImageTitle } from "@/lib/chat/utils";

type Props = {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  selectedImages: LocalChatImage[];
  isDropTarget: boolean;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  onSend: () => void;
  onPickAttachments: () => void;
  onAttachmentFilesSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemovePendingImage: (id: string) => void;
  onDragEnter: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
};

export function ChatComposer({
  input,
  setInput,
  isLoading,
  selectedImages,
  isDropTarget,
  attachmentInputRef,
  onSend,
  onPickAttachments,
  onAttachmentFilesSelected,
  onRemovePendingImage,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  return (
    <div className="pt-3 bg-background/95 backdrop-blur z-10 shrink-0 space-y-2">
      <p className="text-center text-[11px] text-muted max-w-4xl mx-auto px-2">
        Kéo thả hoặc chọn ảnh (tối đa 4). Ảnh xem trước và tên file nằm chung trong khung soạn bên dưới. Sau khi
        gửi, ảnh hiện dưới tin nhắn.
      </p>
      <div
        className={`relative w-full max-w-4xl mx-auto bg-surface border rounded-[16px] transition-all ${
          isDropTarget
            ? "border-accent ring-2 ring-accent/35 border-dashed"
            : "border-border focus-within:ring-2 focus-within:ring-accent/35"
        }`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onAttachmentFilesSelected}
        />

        {isDropTarget && (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[16px] bg-background/75 backdrop-blur-[2px]"
            aria-hidden
          >
            <p className="rounded-lg border border-accent/40 bg-surface px-4 py-2 text-sm font-semibold text-accent shadow-sm">
              Thả ảnh để đính kèm
            </p>
          </div>
        )}

        {selectedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-border/60 px-3 pb-3 pt-3">
            {selectedImages.map((img) => (
              <div
                key={img.id}
                className="flex max-w-full items-center gap-2 rounded-xl border border-border bg-muted/20 py-1.5 pl-1.5 pr-1.5 shadow-sm"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-muted/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob preview */}
                  <img
                    src={img.previewUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                    decoding="async"
                  />
                </div>
                <span
                  className="min-w-0 max-w-[180px] truncate text-[12px] font-medium text-foreground sm:max-w-[240px]"
                  title={img.file.name}
                >
                  {shortImageTitle(img.file.name, 36)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePendingImage(img.id)}
                  disabled={isLoading}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-border/90 hover:text-foreground disabled:opacity-40"
                  aria-label={`Gỡ ${img.file.name}`}
                  title="Gỡ ảnh"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Hỏi guideline hoặc mô tả microcopy (vị trí UI, hành động, giới hạn ký tự)…"
            className="scrollbar-none w-full max-h-36 min-h-[60px] resize-none overflow-y-auto bg-transparent py-4 pl-5 pr-24 text-[15px] text-foreground outline-none"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={onPickAttachments}
            disabled={isLoading}
            className="absolute bottom-2 right-14 rounded-[8px] border border-border bg-background p-3 text-foreground transition-opacity disabled:text-muted"
            title="Đính kèm ảnh để phân tích guideline"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828L18 9.828a4 4 0 10-5.657-5.657L5.757 10.757a6 6 0 108.486 8.486L20 13.5"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={(!input.trim() && selectedImages.length === 0) || isLoading}
            className="clay-hover-playful absolute bottom-2 right-2 rounded-[8px] border border-border bg-cream p-3 text-charcoal transition-opacity disabled:border-border disabled:bg-surface disabled:text-muted"
          >
            <svg
              className="h-4 w-4 translate-x-[-1px] translate-y-[1px]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>

      {selectedImages.length > 0 && (
        <p className="text-center text-[11px] text-muted">
          {selectedImages.length} ảnh sẽ được gửi để AI phân tích ngữ cảnh theo guideline (chỉ tư vấn text).
        </p>
      )}
      <p className="mt-3 text-center text-[11px] font-medium text-muted">
        Trả lời bám tài liệu nội bộ; với microcopy hãy đối chiếu trên UI thật trước khi ship.
      </p>
    </div>
  );
}
