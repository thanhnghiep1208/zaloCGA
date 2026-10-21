import { NextResponse } from "next/server";
import { ApiAuthError, requireAdmin, requireUidFromRequest } from "@/lib/api-request-auth";
import { validateAccountContactBody } from "@/lib/account-contact";
import { getAccountContact, saveAccountContact } from "@/lib/account-contact-server";

function errorResponse(error: unknown, label: string) {
  if (error instanceof ApiAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[admin/settings/contact] ${label}`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    await requireAdmin(await requireUidFromRequest(req));
    return NextResponse.json(await getAccountContact());
  } catch (error) {
    return errorResponse(error, "GET");
  }
}

export async function PUT(req: Request) {
  try {
    const callerUid = await requireUidFromRequest(req);
    await requireAdmin(callerUid);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiAuthError("Invalid JSON body", 400);
    }

    const parsed = validateAccountContactBody(body);
    if (!parsed.ok) {
      throw new ApiAuthError(parsed.message, 400);
    }

    await saveAccountContact(parsed.data, callerUid);
    return NextResponse.json(parsed.data);
  } catch (error) {
    return errorResponse(error, "PUT");
  }
}
