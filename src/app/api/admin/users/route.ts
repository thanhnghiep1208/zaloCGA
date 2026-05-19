import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  ApiAuthError,
  requireAdmin,
  requireUidFromRequest,
} from "@/lib/api-request-auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  buildAuthEmailForUsername,
  validateCreateAdminUserBody,
} from "@/lib/admin-users";

export async function POST(req: Request) {
  try {
    const callerUid = await requireUidFromRequest(req);
    await requireAdmin(callerUid);

    if (!adminAuth || !adminDb) {
      throw new ApiAuthError("Server configuration error", 500);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiAuthError("Invalid JSON body", 400);
    }

    const parsed = validateCreateAdminUserBody(body);
    if (!parsed.ok) {
      throw new ApiAuthError(parsed.message, 400);
    }

    const { username, password, role, displayName } = parsed.data;
    const email = buildAuthEmailForUsername(username);

    const existingByUsername = await adminDb
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();
    if (!existingByUsername.empty) {
      throw new ApiAuthError("Username already exists", 409);
    }

    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: displayName ?? username,
        emailVerified: true,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-exists") {
        throw new ApiAuthError("Username already exists", 409);
      }
      console.error("[admin/users] createUser failed", err);
      throw new ApiAuthError("Could not create user", 500);
    }

    try {
      await adminDb.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        username,
        email,
        displayName: displayName ?? null,
        role,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: callerUid,
      });
    } catch (err) {
      try {
        await adminAuth.deleteUser(userRecord.uid);
      } catch (rollbackErr) {
        console.error("[admin/users] rollback deleteUser failed", rollbackErr);
      }
      console.error("[admin/users] Firestore set failed", err);
      throw new ApiAuthError("Could not save user profile", 500);
    }

    return NextResponse.json({
      uid: userRecord.uid,
      username,
      email,
      role,
      displayName: displayName ?? null,
    });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/users] POST", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
