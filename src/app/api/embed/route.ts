import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiAuthError, requireUidFromRequest } from "@/lib/api-request-auth";
import { nextJsonChatAuthError } from "@/lib/server-json-response";
import { embedQuery } from "@/lib/documents/embeddings";

const EmbedRequestSchema = z.object({
  query: z.string().min(1).max(12000),
});

export async function POST(req: Request) {
  try {
    await requireUidFromRequest(req);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = EmbedRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const embedding = await embedQuery(parsed.data.query.trim());
    return NextResponse.json({ embedding });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return nextJsonChatAuthError(error);
    }
    console.error("[EmbedRoute] Error:", error);
    return NextResponse.json({ error: "Failed to compute embedding" }, { status: 500 });
  }
}
