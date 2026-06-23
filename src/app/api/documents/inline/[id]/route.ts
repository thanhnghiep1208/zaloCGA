import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireContributorOrAdmin, requireUidFromRequest } from "@/lib/api-request-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeContent } from "@/lib/documents/sanitizeHtml";
import { adminDb, adminStorage, adminStorageBucketName } from "@/lib/firebase-admin";
import { extractStorageImagesFromHtml, stripHtmlToPlainText } from "@/lib/documents/inlineSanitize";
import { buildInlineIndexPayload } from "@/lib/documents/indexing";
import { cleanInlineTags } from "@/lib/documents/inlineTags";
import { nextJsonFriendlyApiError } from "@/lib/server-json-response";
import { writeDocumentChunks, deleteDocumentChunks } from "@/lib/documents/embeddings";

type InlineUpdateBody = {
  title?: string;
  category?: string;
  tags?: string[];
  contentHtml?: string;
};

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await requireUidFromRequest(req);
    await requireContributorOrAdmin(uid);
    await checkRateLimit(uid, "inline-doc", 20);

    if (!adminDb) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { id } = await params;
    const ref = adminDb.collection("documents").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const current = snap.data() as { type?: string } | undefined;
    if (current?.type !== "inline_doc") {
      return NextResponse.json({ error: "Document is not inline_doc" }, { status: 400 });
    }

    const body = (await req.json()) as InlineUpdateBody;
    const title = String(body.title || "").trim();
    const contentHtml = String(body.contentHtml || "").trim();
    const category = String(body.category || "").trim();
    const tags = cleanInlineTags(body.tags);

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

    await ref.update({
      ...buildInlineIndexPayload({
        title,
        category,
        tags,
        contentHtml: safeHtml,
        contentPlain,
        images,
      }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });

    void writeDocumentChunks(id, title, contentPlain).catch((e) =>
      console.error("[inline-update] Embedding failed:", e)
    );

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    return nextJsonFriendlyApiError(error, {
      logLabel: "Update inline doc error:",
      fallbackDetail: "Failed to update inline document",
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await requireUidFromRequest(req);
    await requireContributorOrAdmin(uid);

    if (!adminDb) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { id } = await params;
    const ref = adminDb.collection("documents").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const data = snap.data() as
      | { type?: string; images?: { path?: string }[] }
      | undefined;
    if (data?.type !== "inline_doc") {
      return NextResponse.json({ error: "Document is not inline_doc" }, { status: 400 });
    }

    if (adminStorage && adminStorageBucketName && Array.isArray(data.images)) {
      const bucket = adminStorage.bucket(adminStorageBucketName);
      await Promise.all(
        data.images
          .map((img) => (typeof img?.path === "string" ? img.path : ""))
          .filter(Boolean)
          .map(async (path) => {
            try {
              await bucket.file(path).delete({ ignoreNotFound: true });
            } catch (err) {
              console.warn(`[inline-delete] Failed to delete image ${path}`, err);
            }
          })
      );
    }

    await ref.delete();
    void deleteDocumentChunks(id).catch((e) =>
      console.error("[inline-delete] Chunk cleanup failed:", e)
    );

    return NextResponse.json({ success: true, id, deletedBy: uid });
  } catch (error: unknown) {
    return nextJsonFriendlyApiError(error, {
      logLabel: "Delete inline doc error:",
      fallbackDetail: "Failed to delete inline document",
    });
  }
}

