import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

/** Mark all login sessions for a user as revoked (remote sign-out signal). */
export async function revokeAllAuthSessionsForUser(userId: string): Promise<number> {
  if (!adminDb) return 0;

  const snap = await adminDb
    .collection("authSessions")
    .where("userId", "==", userId)
    .get();

  if (snap.empty) return 0;

  const batch = adminDb.batch();
  for (const docSnap of snap.docs) {
    batch.update(docSnap.ref, {
      revoked: true,
      revokedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return snap.size;
}
