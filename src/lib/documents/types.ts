/**
 * Shared Firestore schema types for `documents` collection.
 *
 * Phase 1 scope:
 * - Keep current uploaded-file behavior intact.
 * - Add a typed contract for future inline editor documents.
 */

export type DocumentType = "uploaded_file" | "inline_doc";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "indexed"
  | "failed"
  | "inactive";

export type FirestoreTimestampLike =
  | { seconds: number; nanoseconds?: number }
  | null
  | undefined;

export type DocumentImageRef = {
  /** Storage object path (e.g. documents/images/<docId>/<name>.png) */
  path: string;
  /** Public/download URL used in contentHtml img src */
  downloadURL: string;
  /** Optional alt text authored by editor */
  alt?: string;
  /** Optional width/height metadata for later rendering */
  width?: number;
  height?: number;
};

type DocumentBase = {
  id?: string;
  type: DocumentType;
  status: DocumentStatus;

  title?: string;
  tags?: string[];
  category?: string | null;
  description?: string;

  uploadedBy?: string | null;
  updatedBy?: string | null;
  uploadedEmail?: string | null;
  uploadedAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
};

/**
 * Existing document shape created by the upload flow (PDF/DOCX/TXT/CSV).
 * NOTE: no behavior change; this mirrors current live fields and adds `type`.
 */
export type UploadedFileDocument = DocumentBase & {
  type: "uploaded_file";
  fileName: string;
  fileUrl: string;
  storagePath: string;
  mimeType: string;
  sizeBytes?: number;

  /**
   * Text extracted by ingest pipeline; currently used by retrieval.
   * Keep field name unchanged for compatibility.
   */
  textContent?: string;
};

/**
 * New inline editor document shape.
 */
export type InlineDocument = DocumentBase & {
  type: "inline_doc";

  /** Display title in admin/library lists and references. */
  title: string;
  /** Compatibility for places currently reading documents.fileName. */
  fileName?: string;
  /** Optional slug for future routing/search UX. */
  slug?: string;

  /** Rich text HTML from editor. Never store base64 images. */
  contentHtml: string;
  /** Plain text (stripped HTML) used for retrieval/search/indexing. */
  contentPlain: string;
  /** Image assets uploaded to Storage and referenced inside contentHtml. */
  images?: DocumentImageRef[];

  /**
   * Compatibility bridge for current retrieval code.
   * During Phase 4/5, set textContent = contentPlain so existing chat retrieval
   * can continue working without structural changes.
   */
  textContent?: string;
};

export type KnowledgeDocument = UploadedFileDocument | InlineDocument;

export function isInlineDocument(doc: KnowledgeDocument): doc is InlineDocument {
  return doc.type === "inline_doc";
}

export function isUploadedFileDocument(
  doc: KnowledgeDocument
): doc is UploadedFileDocument {
  return doc.type === "uploaded_file";
}

