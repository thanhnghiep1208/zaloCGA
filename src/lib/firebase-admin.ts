import * as admin from "firebase-admin";

/**
 * Initialize Firebase Admin safely for Next.js 15/16.
 * Bypasses Firestore Security Rules for server-side RAG.
 */
function resolveProjectId(): string | undefined {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    undefined
  );
}

function resolveStorageBucketName(): string | undefined {
  const raw = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!raw) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Accept gs://bucket-name format
  if (trimmed.startsWith("gs://")) {
    return trimmed.slice(5).split("/")[0];
  }

  // Accept full https URL if provided by mistake
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      if (u.hostname === "storage.googleapis.com") {
        return u.pathname.split("/").filter(Boolean)[0];
      }
      if (u.hostname === "firebasestorage.googleapis.com") {
        const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\//);
        if (m?.[1]) return decodeURIComponent(m[1]);
      }
    } catch {
      return undefined;
    }
  }

  return trimmed;
}

function getAdminApp(): admin.app.App | null {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const projectId = resolveProjectId();
  const storageBucket = resolveStorageBucketName();
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

  if (!projectId) {
    console.error(
      "[FirebaseAdmin] Missing project id: set GOOGLE_CLOUD_PROJECT (auto on Cloud Run), FIREBASE_PROJECT_ID, or NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    );
  }

  // 1) Explicit service account JSON (App Hosting env / .env.local)
  if (rawKey) {
    try {
      const parsed = JSON.parse(rawKey) as Record<string, unknown>;
      const hasKey =
        typeof parsed.private_key === "string" && typeof parsed.client_email === "string";
      if (hasKey) {
        const pid =
          projectId ||
          (typeof parsed.project_id === "string" ? parsed.project_id : undefined);
        if (!pid) {
          console.error(
            "[FirebaseAdmin] No project id: set NEXT_PUBLIC_FIREBASE_PROJECT_ID / FIREBASE_PROJECT_ID or use JSON with project_id"
          );
        }
        console.log("[FirebaseAdmin] Initializing with FIREBASE_SERVICE_ACCOUNT_KEY");
        return admin.initializeApp({
          credential: admin.credential.cert(parsed as admin.ServiceAccount),
          projectId: pid,
          ...(storageBucket ? { storageBucket } : {}),
        });
      }
      console.error("[FirebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY JSON missing private_key/client_email");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[FirebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON:", msg);
      // Continue to ADC — bad paste should not brick the whole server
    }
  }

  // 2) Cloud Run / App Hosting: workload identity (no JSON env needed if IAM is correct)
  if (projectId) {
    try {
      console.log("[FirebaseAdmin] Trying applicationDefault() credentials");
      return admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
        ...(storageBucket ? { storageBucket } : {}),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[FirebaseAdmin] applicationDefault() failed:", msg);
    }
  }

  // 3) Last resort (often fails verifyIdToken outside GCP)
  if (projectId) {
    try {
      console.warn("[FirebaseAdmin] Falling back to initializeApp({ projectId }) only");
      return admin.initializeApp({
        projectId,
        ...(storageBucket ? { storageBucket } : {}),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[FirebaseAdmin] projectId-only init failed:", msg);
    }
  }

  console.error(
    "[FirebaseAdmin] Could not initialize. Set FIREBASE_SERVICE_ACCOUNT_KEY (one-line JSON from Firebase Console → Service accounts) or ensure this runtime has ADC + IAM (Service Account Token Creator / Firebase Admin) on GOOGLE_CLOUD_PROJECT."
  );
  return null;
}

const app = getAdminApp();
const adminDb = app ? admin.firestore(app) : null;
const adminAuth = app ? admin.auth(app) : null;
const adminStorage = app ? admin.storage(app) : null;
const adminStorageBucketName = resolveStorageBucketName();

export { adminDb, adminAuth, adminStorage, adminStorageBucketName };
