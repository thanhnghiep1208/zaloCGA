import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { ApiAuthError, requireContributorOrAdmin, requireUidFromRequest } from "@/lib/api-request-auth";
import { adminDb, adminStorage, adminStorageBucketName } from "@/lib/firebase-admin";
import { extractStorageImagesFromHtml, stripHtmlToPlainText } from "@/lib/documents/inlineSanitize";
import { buildInlineIndexPayload } from "@/lib/documents/indexing";
import { toFriendlyErrorMessage } from "@/lib/user-error";

type InlineUpdateBody = {
  title?: string;
  category?: string;
  tags?: string[];
  contentHtml?: string;
};

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

export async function PUT(
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
    const current = snap.data() as { type?: string } | undefined;
    if (current?.type !== "inline_doc") {
      return NextResponse.json({ error: "Document is not inline_doc" }, { status: 400 });
    }

    const body = (await req.json()) as InlineUpdateBody;
    const title = String(body.title || "").trim();
    const contentHtml = String(body.contentHtml || "").trim();
    const category = String(body.category || "").trim();
    const tags = cleanTags(body.tags);

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!contentHtml) {
      return NextResponse.json({ error: "contentHtml is required" }, { status: 400 });
    }

    const contentPlain = stripHtmlToPlainText(contentHtml);
    if (!contentPlain) {
      return NextResponse.json({ error: "Content is empty after sanitize" }, { status: 400 });
    }

    const images = extractStorageImagesFromHtml(contentHtml);

    await ref.update({
      ...buildInlineIndexPayload({
        title,
        category,
        tags,
        contentHtml,
        contentPlain,
        images,
      }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { success: false, error: error.message, userMessage: toFriendlyErrorMessage(error.message) },
        { status: error.status }
      );
    }
    const err = error as { message?: string; stack?: string };
    console.error("Update inline doc error:", error);
    const details = err.message || "Failed to update inline document";
    return NextResponse.json(
      {
        success: false,
        error: details,
        userMessage: toFriendlyErrorMessage(details),
        ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
      },
      { status: 500 }
    );
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

    return NextResponse.json({ success: true, id, deletedBy: uid });
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { success: false, error: error.message, userMessage: toFriendlyErrorMessage(error.message) },
        { status: error.status }
      );
    }
    const err = error as { message?: string; stack?: string };
    console.error("Delete inline doc error:", error);
    const details = err.message || "Failed to delete inline document";
    return NextResponse.json(
      {
        success: false,
        error: details,
        userMessage: toFriendlyErrorMessage(details),
        ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
      },
      { status: 500 }
    );
  }
}

