import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { ApiAuthError, requireContributorOrAdmin, requireUidFromRequest } from "@/lib/api-request-auth";
import { adminDb } from "@/lib/firebase-admin";
import { extractStorageImagesFromHtml, stripHtmlToPlainText } from "@/lib/documents/inlineSanitize";
import { buildInlineIndexPayload } from "@/lib/documents/indexing";
import { toFriendlyErrorMessage } from "@/lib/user-error";

type InlineCreateBody = {
  title?: string;
  category?: string;
  tags?: string[];
  contentHtml?: string;
  uploadedEmail?: string;
};

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    await requireContributorOrAdmin(uid);

    if (!adminDb) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = (await req.json()) as InlineCreateBody;
    const title = String(body.title || "").trim();
    const contentHtml = String(body.contentHtml || "").trim();
    const category = String(body.category || "").trim();
    const tags = cleanTags(body.tags);
    const uploadedEmail = typeof body.uploadedEmail === "string" ? body.uploadedEmail : null;

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
    const payload = {
      ...buildInlineIndexPayload({
        title,
        category,
        tags,
        contentHtml,
        contentPlain,
        images,
      }),
      uploadedBy: uid,
      uploadedEmail,
      uploadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const ref = await adminDb.collection("documents").add(payload);
    return NextResponse.json({ success: true, id: ref.id });
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { success: false, error: error.message, userMessage: toFriendlyErrorMessage(error.message) },
        { status: error.status }
      );
    }
    const err = error as { message?: string; stack?: string };
    console.error("Create inline doc error:", error);
    const details = err.message || "Failed to create inline document";
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

