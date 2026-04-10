import { NextResponse } from "next/server";
import { RetrievalService } from "@/lib/RetrievalService";
import { ApiAuthError, requireUidFromRequest } from "@/lib/api-request-auth";

export async function POST(req: Request) {
  try {
    await requireUidFromRequest(req);

    const body = await req.json();
    const { query } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Hit the abstracted Provider
    const contextSnippets = await RetrievalService.getContext(query);

    console.log(`[ChatRoute] Query: "${query}". Found ${contextSnippets.length} relevant snippets.`);
    if (contextSnippets.length > 0) {
      console.log(`[ChatRoute] Documents in context: ${contextSnippets.map(s => s.fileName).join(", ")}`);
    }

    // Get strictly-prompted stream from our isolated service
    const stream = await RetrievalService.generateChatResponse(query, contextSnippets);

    // Stream transformation to safely pack sources into the first bytes
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const sourcesChunk = JSON.stringify({ type: "sources", data: contextSnippets }) + "\n\n===CHUNK_SPLIT===\n\n";
          controller.enqueue(encoder.encode(sourcesChunk));

          for await (const chunk of stream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch(e) {
          console.error("Streaming error", e);
          controller.error(e);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const err = error as { message?: string; stack?: string };
    console.error("Chat API Critical Failure:", error);
    return new Response(
      JSON.stringify({
        error: "Server Error",
        details: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
