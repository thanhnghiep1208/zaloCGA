import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireContributorOrAdmin, requireUidFromRequest } from "@/lib/api-request-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeContent } from "@/lib/documents/sanitizeHtml";
import { adminDb } from "@/lib/firebase-admin";
import { extractStorageImagesFromHtml, stripHtmlToPlainText } from "@/lib/documents/inlineSanitize";
import { buildInlineIndexPayload } from "@/lib/documents/indexing";
import { cleanInlineTags } from "@/lib/documents/inlineTags";
import { nextJsonFriendlyApiError } from "@/lib/server-json-response";
import { writeDocumentChunks } from "@/lib/documents/embeddings";
import { sanitizeDocMessageType, sanitizeDocUiPattern } from "@/lib/chat/scope-options";

type InlineCreateBody = {
  title?: string;
  category?: string;
  tags?: string[];
  contentHtml?: string;
  uploadedEmail?: string;
  messageType?: string | null;
  uiPattern?: string | null;
};

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    await requireContributorOrAdmin(uid);
    await checkRateLimit(uid, "inline-doc", 20);

    if (!adminDb) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = (await req.json()) as InlineCreateBody;
    const title = String(body.title || "").trim();
    const contentHtml = String(body.contentHtml || "").trim();
    const category = String(body.category || "").trim();
    const tags = cleanInlineTags(body.tags);
    const uploadedEmail = typeof body.uploadedEmail === "string" ? body.uploadedEmail : null;
    const messageType = sanitizeDocMessageType(body.messageType);
    const uiPattern = sanitizeDocUiPattern(body.uiPattern);

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!contentHtml) {
      return NextResponse.json({ error: "contentHtml is required" }, { status: 400 });
    }

    // VULN-002: sanitize before storing to prevent XSS when content is later served.
    const safeHtml = sanitizeContent(contentHtml);
    const contentPlain = stripHtmlToPlainText(safeHtml);
    if (!contentPlain) {
      return NextResponse.json({ error: "Content is empty after sanitize" }, { status: 400 });
    }

    const images = extractStorageImagesFromHtml(safeHtml);
    const payload = {
      ...buildInlineIndexPayload({
        title,
        category,
        tags,
        contentHtml: safeHtml,
        contentPlain,
        images,
        messageType,
        uiPattern,
      }),
      uploadedBy: uid,
      uploadedEmail,
      uploadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const ref = await adminDb.collection("documents").add(payload);

    void writeDocumentChunks(ref.id, title, contentPlain).catch((e) =>
      console.error("[inline-create] Embedding failed:", e)
    );

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error: unknown) {
    return nextJsonFriendlyApiError(error, {
      logLabel: "Create inline doc error:",
      fallbackDetail: "Failed to create inline document",
    });
  }
}

