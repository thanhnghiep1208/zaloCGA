import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUidFromRequest } from "@/lib/api-request-auth";
import { adminStorage, adminStorageBucketName } from "@/lib/firebase-admin";
import { nextJsonFriendlyApiError } from "@/lib/server-json-response";
import { logAnalyticsEvent } from "@/lib/analytics-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function sanitizeFileName(name: string): string {
  return (name || "image")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function buildFirebaseDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
}

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    if (!adminStorage || !adminStorageBucketName) {
      return NextResponse.json({ error: "Storage service unavailable" }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const sessionIdRaw = form.get("sessionId");
    const sessionId =
      typeof sessionIdRaw === "string" && sessionIdRaw.trim() ? sessionIdRaw.trim() : "draft";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Attachment must be an image." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large. Max size is 10MB." }, { status: 400 });
    }

    const bucket = adminStorage.bucket(adminStorageBucketName);
    const safeName = sanitizeFileName(file.name);
    const objectPath = `chat-attachments/${uid}/${sessionId}/${Date.now()}_${safeName}`;
    const object = bucket.file(objectPath);
    const token = randomUUID();
    const now = Date.now();
    const expiresAt = now + ATTACHMENT_TTL_MS;
    const data = Buffer.from(await file.arrayBuffer());

    await object.save(data, {
      resumable: false,
      metadata: {
        contentType: file.type,
        metadata: {
          firebaseStorageDownloadTokens: token,
          uploadedBy: uid,
          sessionId,
          expiresAt: String(expiresAt),
        },
      },
    });

    void logAnalyticsEvent("attachment_uploaded", {
      user_id: uid,
      session_id: sessionId,
      file_type: file.type,
      size: file.size,
    });

    return NextResponse.json({
      success: true,
      attachment: {
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storagePath: objectPath,
        downloadURL: buildFirebaseDownloadUrl(bucket.name, objectPath, token),
        expiresAt,
      },
    });
  } catch (error: unknown) {
    return nextJsonFriendlyApiError(error, {
      logLabel: "Chat attachment upload error:",
      fallbackDetail: "Failed to upload chat attachment",
    });
  }
}

