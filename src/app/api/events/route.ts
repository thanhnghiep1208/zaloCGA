import { NextResponse } from "next/server";
import { ApiAuthError, requireUidFromRequest } from "@/lib/api-request-auth";
import { logAnalyticsEvent, type LoggedEventName } from "@/lib/analytics-events";

const ALLOWED_EVENTS: LoggedEventName[] = ["file_uploaded", "user_feedback"];

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    const body = await req.json();
    const { eventName, payload } = body as {
      eventName?: LoggedEventName;
      payload?: Record<string, unknown>;
    };

    if (!eventName || !ALLOWED_EVENTS.includes(eventName)) {
      return NextResponse.json({ error: "Event not allowed" }, { status: 400 });
    }

    await logAnalyticsEvent(eventName, {
      ...(payload || {}),
      user_id: uid,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to log event" },
      { status: 500 }
    );
  }
}
