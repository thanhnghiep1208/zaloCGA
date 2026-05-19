import { NextResponse } from "next/server";
import {
  ApiAuthError,
  requireAdmin,
  requireUidFromRequest,
} from "@/lib/api-request-auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { revokeAllAuthSessionsForUser } from "@/lib/admin-auth-sessions";
import { validatePatchAdminUserBody } from "@/lib/admin-users";

type RouteContext = { params: Promise<{ uid: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const callerUid = await requireUidFromRequest(req);
    await requireAdmin(callerUid);

    if (!adminAuth || !adminDb) {
      throw new ApiAuthError("Server configuration error", 500);
    }

    const { uid } = await context.params;
    if (!uid?.trim()) {
      throw new ApiAuthError("Missing user id", 400);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiAuthError("Invalid JSON body", 400);
    }

    const parsed = validatePatchAdminUserBody(body);
    if (!parsed.ok) {
      throw new ApiAuthError(parsed.message, 400);
    }

    const profileRef = adminDb.collection("users").doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      throw new ApiAuthError("User not found", 404);
    }

    const { role, password, disabled, displayName } = parsed.data;

    const authUpdate: {
      password?: string;
      disabled?: boolean;
      displayName?: string;
    } = {};
    if (password !== undefined) authUpdate.password = password;
    if (disabled !== undefined) authUpdate.disabled = disabled;
    if (displayName !== undefined) authUpdate.displayName = displayName || undefined;

    if (Object.keys(authUpdate).length > 0) {
      try {
        await adminAuth.updateUser(uid, authUpdate);
      } catch (err) {
        console.error("[admin/users] updateUser failed", err);
        throw new ApiAuthError("Could not update auth user", 500);
      }
    }

    const firestoreUpdate: Record<string, unknown> = {};
    if (role !== undefined) firestoreUpdate.role = role;
    if (displayName !== undefined) firestoreUpdate.displayName = displayName || null;
    if (disabled !== undefined) firestoreUpdate.disabled = disabled;

    if (Object.keys(firestoreUpdate).length > 0) {
      await profileRef.set(firestoreUpdate, { merge: true });
    }

    if (disabled === true || password !== undefined) {
      await revokeAllAuthSessionsForUser(uid);
    }

    return NextResponse.json({ ok: true, uid });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/users] PATCH", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const callerUid = await requireUidFromRequest(req);
    await requireAdmin(callerUid);

    if (!adminAuth || !adminDb) {
      throw new ApiAuthError("Server configuration error", 500);
    }

    const { uid } = await context.params;
    if (!uid?.trim()) {
      throw new ApiAuthError("Missing user id", 400);
    }

    if (uid === callerUid) {
      throw new ApiAuthError("Cannot delete your own account", 400);
    }

    const profileRef = adminDb.collection("users").doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      throw new ApiAuthError("User not found", 404);
    }

    try {
      await adminAuth.deleteUser(uid);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/user-not-found") {
        console.error("[admin/users] deleteUser failed", err);
        throw new ApiAuthError("Could not delete auth user", 500);
      }
    }

    await profileRef.delete();

    return NextResponse.json({ ok: true, uid });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[admin/users] DELETE", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
