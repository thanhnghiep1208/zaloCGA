import { adminAuth, adminDb } from "@/lib/firebase-admin";

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

/** Require a valid Firebase ID token; returns authenticated uid. */
export async function requireUidFromRequest(req: Request): Promise<string> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new ApiAuthError("Unauthorized", 401);
  }
  const token = header.slice(7).trim();
  if (!token) throw new ApiAuthError("Unauthorized", 401);

  if (!adminAuth) {
    console.error("[api-auth] adminAuth not initialized");
    throw new ApiAuthError("Server configuration error", 500);
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    throw new ApiAuthError("Invalid or expired token", 401);
  }
}

/** Require Firestore role admin (users/{uid}). */
export async function requireAdmin(uid: string): Promise<void> {
  if (!adminDb) {
    console.error("[api-auth] adminDb not initialized");
    throw new ApiAuthError("Server configuration error", 500);
  }

  const snap = await adminDb.collection("users").doc(uid).get();
  const role = snap.exists ? snap.get("role") : null;
  if (role !== "admin") {
    throw new ApiAuthError("Forbidden", 403);
  }
}

/** Require Firestore role admin or contributor (users/{uid}). */
export async function requireContributorOrAdmin(uid: string): Promise<void> {
  if (!adminDb) {
    console.error("[api-auth] adminDb not initialized");
    throw new ApiAuthError("Server configuration error", 500);
  }

  const snap = await adminDb.collection("users").doc(uid).get();
  const role = snap.exists ? snap.get("role") : "user";
  if (role !== "admin" && role !== "contributor") {
    throw new ApiAuthError("Forbidden", 403);
  }
}

/**
 * Only allow Firebase Storage object URLs for this project bucket (mitigates SSRF).
 * Matches URLs from getDownloadURL().
 */
export function assertFirebaseStorageDownloadUrl(fileUrl: string): void {
  const expectedBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!expectedBucket) {
    throw new ApiAuthError("Server configuration error", 500);
  }

  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    throw new ApiAuthError("Invalid file URL", 400);
  }

  if (url.protocol !== "https:") {
    throw new ApiAuthError("File URL must use HTTPS", 400);
  }

  if (url.hostname === "firebasestorage.googleapis.com") {
    const m = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\//);
    if (!m) throw new ApiAuthError("Not a valid Firebase Storage download URL", 400);
    const bucketInUrl = decodeURIComponent(m[1]);
    if (bucketInUrl !== expectedBucket) {
      throw new ApiAuthError("File URL bucket is not allowed", 400);
    }
    return;
  }

  if (url.hostname === "storage.googleapis.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== expectedBucket) {
      throw new ApiAuthError("File URL bucket is not allowed", 400);
    }
    return;
  }

  throw new ApiAuthError("File URL host is not allowed", 400);
}
