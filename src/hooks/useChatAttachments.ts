"use client";

import { ChangeEvent, DragEvent, useState, useRef, useEffect, useCallback } from "react";
import { newClientMessageId } from "@/lib/chat/utils";
import type { LocalChatImage } from "@/types/chat";

export interface ChatAttachmentsHandle {
  selectedImages: LocalChatImage[];
  isDropTarget: boolean;
  attachmentInputRef: React.RefObject<HTMLInputElement | null>;
  selectedImagesRef: React.MutableRefObject<LocalChatImage[]>;
  appendImageFiles: (fileList: FileList | File[]) => void;
  clearPendingImages: () => void;
  removePendingImage: (id: string) => void;
  onPickAttachments: () => void;
  onAttachmentFilesSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  handleComposerDragEnter: (e: DragEvent<HTMLDivElement>) => void;
  handleComposerDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleComposerDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  handleComposerDrop: (e: DragEvent<HTMLDivElement>, isLoading: boolean) => void;
}

export function useChatAttachments(): ChatAttachmentsHandle {
  const [selectedImages, setSelectedImages] = useState<LocalChatImage[]>([]);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const selectedImagesRef = useRef<LocalChatImage[]>([]);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  const appendImageFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    setSelectedImages((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= 4) break;
        next.push({
          id: newClientMessageId(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      return next;
    });
  }, []);

  const clearPendingImages = useCallback(() => {
    setSelectedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  const removePendingImage = useCallback((id: string) => {
    setSelectedImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const onPickAttachments = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const onAttachmentFilesSelected = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (files.length === 0) return;
    appendImageFiles(files);
  }, [appendImageFiles]);

  const handleComposerDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDropTarget(true);
  }, []);

  const handleComposerDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleComposerDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDropTarget(false);
    }
  }, []);

  const handleComposerDrop = useCallback((e: DragEvent<HTMLDivElement>, isLoading: boolean) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDropTarget(false);
    if (isLoading) return;
    const { files } = e.dataTransfer;
    if (files?.length) appendImageFiles(files);
  }, [appendImageFiles]);

  return {
    selectedImages,
    isDropTarget,
    attachmentInputRef,
    selectedImagesRef,
    appendImageFiles,
    clearPendingImages,
    removePendingImage,
    onPickAttachments,
    onAttachmentFilesSelected,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
  };
}
