import type { DocMessageType, DocUiPattern } from "@/lib/chat/scope-options";

type IndexableInlineInput = {
  title: string;
  contentHtml: string;
  contentPlain: string;
  category?: string | null;
  tags?: string[];
  images?: { path: string; downloadURL: string }[];
  messageType?: DocMessageType | null;
  uiPattern?: DocUiPattern | null;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Unified index payload for inline documents.
 * Keeps compatibility with current retrieval by always filling textContent.
 */
export function buildInlineIndexPayload(input: IndexableInlineInput) {
  const title = normalizeWhitespace(input.title);
  const contentHtml = input.contentHtml.trim();
  const contentPlain = normalizeWhitespace(input.contentPlain);
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 20)
    : [];
  const category = input.category?.trim() || null;
  const images = Array.isArray(input.images) ? input.images : [];

  return {
    type: "inline_doc" as const,
    status: "indexed" as const,
    title,
    fileName: title, // compatibility for existing UI/retrieval
    contentHtml,
    contentPlain,
    textContent: contentPlain, // compatibility bridge for /api/chat retrieval
    tags,
    category,
    images,
    messageType: input.messageType ?? null,
    uiPattern: input.uiPattern ?? null,
  };
}

/**
 * Existing upload flow payload normalization (no behavior change).
 * Added to consistently mark file-based docs for mixed-corpus retrieval.
 */
export function buildUploadedFileBasePayload(input: {
  fileName: string;
  fileUrl: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  tags?: string[];
  description?: string;
  messageType?: DocMessageType | null;
  uiPattern?: DocUiPattern | null;
}) {
  return {
    type: "uploaded_file" as const,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    storagePath: input.storagePath,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: "processing" as const,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => t.trim()).filter(Boolean) : [],
    description: input.description || "",
    messageType: input.messageType ?? null,
    uiPattern: input.uiPattern ?? null,
  };
}

