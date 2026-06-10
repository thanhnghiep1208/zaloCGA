import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireContributorOrAdmin, requireUidFromRequest } from "@/lib/api-request-auth";
import { adminStorage, adminStorageBucketName } from "@/lib/firebase-admin";
import { nextJsonFriendlyApiError } from "@/lib/server-json-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

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
    await requireContributorOrAdmin(uid);

    if (!adminStorage) {
      return NextResponse.json({ error: "Storage service unavailable" }, { status: 500 });
    }
    if (!adminStorageBucketName) {
      return NextResponse.json({ error: "Storage bucket is not configured" }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const docIdRaw = form.get("docId");
    const docId = typeof docIdRaw === "string" && docIdRaw.trim() ? docIdRaw.trim() : "draft";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported image type. Use PNG, JPEG, WEBP, or GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large. Max size is 10MB." }, { status: 400 });
    }

    const bucket = adminStorage.bucket(adminStorageBucketName);
    const safeName = sanitizeFileName(file.name);
    const objectPath = `documents/images/${docId}/${Date.now()}_${safeName}`;
    const object = bucket.file(objectPath);
    const token = randomUUID();
    const data = Buffer.from(await file.arrayBuffer());

    await object.save(data, {
      resumable: false,
      metadata: {
        contentType: file.type,
        metadata: {
          firebaseStorageDownloadTokens: token,
          uploadedBy: uid,
        },
      },
    });

    const downloadURL = buildFirebaseDownloadUrl(bucket.name, objectPath, token);

    return NextResponse.json({
      success: true,
      path: objectPath,
      downloadURL,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  } catch (error: unknown) {
    return nextJsonFriendlyApiError(error, {
      logLabel: "Inline image upload error:",
      fallbackDetail: "Failed to upload image",
    });
  }
}

