import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiAuthError, requireUidFromRequest } from "@/lib/api-request-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  CLIENT_ANALYTICS_EVENTS,
  logAnalyticsEvent,
  type ClientLoggedEventName,
} from "@/lib/analytics-events";

const ALLOWED_EVENTS: ClientLoggedEventName[] = CLIENT_ANALYTICS_EVENTS;

// VULN-006: per-event allowlists with .strict() to reject unknown keys.
const EventPayloadSchemas: Record<ClientLoggedEventName, z.ZodTypeAny> = {
  user_feedback: z.object({
    feedback: z.enum(["thumbs_up", "thumbs_down"]).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(500).optional(),
    session_id: z.string().max(128).optional(),
    message_id: z.string().max(128).optional(),
  }).strict(),
  session_started: z.object({
    session_id: z.string().max(128).optional(),
  }).strict(),
  session_ended: z.object({
    session_id: z.string().max(128).optional(),
    duration_ms: z.number().nonnegative().optional(),
    query_count: z.number().nonnegative().optional(),
  }).strict(),
  response_copied: z.object({
    session_id: z.string().max(128).optional(),
    message_id: z.string().max(128).optional(),
  }).strict(),
  document_viewed: z.object({
    doc_id: z.string().max(128).optional(),
    file_name: z.string().max(256).optional(),
  }).strict(),
  file_uploaded: z.object({
    file_type: z.string().max(64).optional(),
    size: z.number().nonnegative().optional(),
    session_id: z.string().max(128).optional(),
  }).strict(),
};

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    await checkRateLimit(uid, "events", 60);

    const body = await req.json();
    const { eventName, payload } = body as {
      eventName?: ClientLoggedEventName;
      payload?: Record<string, unknown>;
    };

    if (!eventName || !ALLOWED_EVENTS.includes(eventName)) {
      return NextResponse.json({ error: "Event not allowed" }, { status: 400 });
    }

    const schema = EventPayloadSchemas[eventName];
    const rawPayload = payload && typeof payload === "object" ? payload : {};
    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    await logAnalyticsEvent(eventName, {
      ...(parsed.data as Record<string, unknown>),
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
