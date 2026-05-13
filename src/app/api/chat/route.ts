import { NextResponse } from "next/server";
import { RetrievalService } from "@/lib/RetrievalService";
import { ApiAuthError, requireUidFromRequest } from "@/lib/api-request-auth";
import { assertFirebaseStorageDownloadUrl } from "@/lib/api-request-auth";
import {
  estimateRelevanceScore,
  inferQueryType,
  logAnalyticsEvent,
} from "@/lib/analytics-events";
import {
  chatServerErrorResponse,
  nextJsonChatAuthError,
} from "@/lib/server-json-response";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\n…";
}

/** Per-turn cap for conversation sent to Gemini (limits pasted blobs). */
const MAX_CONVERSATION_CHARS_PER_TURN = envInt(
  "CHAT_CONVERSATION_MAX_CHARS_PER_TURN",
  2500
);
/** Cap on the latest user message length sent to the model. */
const MAX_QUERY_CHARS = envInt("CHAT_QUERY_MAX_CHARS", 12000);
const MAX_ATTACHMENTS_PER_TURN = envInt("CHAT_MAX_ATTACHMENTS_PER_TURN", 4);

type ChatAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  downloadURL: string;
  expiresAt: number;
};

function parseStorageObjectPathFromDownloadUrl(downloadURL: string): string | null {
  try {
    const url = new URL(downloadURL);
    if (url.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const idx = url.pathname.indexOf(marker);
      if (idx < 0) return null;
      return decodeURIComponent(url.pathname.slice(idx + marker.length));
    }
    if (url.hostname === "storage.googleapis.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      return parts.slice(1).join("/");
    }
    return null;
  } catch {
    return null;
  }
}

function extractReferencedSources(
  fullResponse: string,
  availableSources: string[]
): string[] {
  const match = fullResponse.match(/\[SOURCES_USED:\s*([^\]]*)\]/i);
  if (!match) return [];

  const requested = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.length === 0) return [];

  const sourceLookup = new Map(
    availableSources.map((name) => [name.toLowerCase(), name] as const)
  );
  const normalized: string[] = [];

  requested.forEach((item) => {
    const exact = sourceLookup.get(item.toLowerCase());
    if (exact) {
      normalized.push(exact);
      return;
    }
    const fuzzy = availableSources.find(
      (name) =>
        name.toLowerCase().includes(item.toLowerCase()) ||
        item.toLowerCase().includes(name.toLowerCase())
    );
    if (fuzzy) normalized.push(fuzzy);
  });

  return Array.from(new Set(normalized));
}

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);

    const body = await req.json();
    const { query, conversation, attachments, sessionId } = body as {
      query?: string;
      conversation?: { role: "user" | "assistant"; content: string }[];
      attachments?: ChatAttachment[];
      sessionId?: string;
    };
    const safeSessionId =
      typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "draft";

    const safeAttachments = Array.isArray(attachments)
      ? attachments
          .filter(
            (a) =>
              a &&
              typeof a.downloadURL === "string" &&
              typeof a.mimeType === "string" &&
              typeof a.name === "string" &&
              typeof a.expiresAt === "number"
          )
          .slice(0, MAX_ATTACHMENTS_PER_TURN)
      : [];

    for (const attachment of safeAttachments) {
      assertFirebaseStorageDownloadUrl(attachment.downloadURL);
      if (!attachment.mimeType.startsWith("image/")) {
        throw new ApiAuthError("Attachment must be an image", 400);
      }
      if (attachment.expiresAt <= Date.now()) {
        throw new ApiAuthError("Attachment has expired. Please upload again.", 400);
      }
      const objectPath = parseStorageObjectPathFromDownloadUrl(attachment.downloadURL);
      const expectedPrefix = `chat-attachments/${uid}/${safeSessionId}/`;
      if (!objectPath || !objectPath.startsWith(expectedPrefix)) {
        throw new ApiAuthError("Attachment does not belong to this session", 403);
      }
    }


    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const safeConversation = Array.isArray(conversation)
      ? conversation
          .filter(
            (t) =>
              t &&
              (t.role === "user" || t.role === "assistant") &&
              typeof t.content === "string" &&
              t.content.trim().length > 0
          )
          .slice(-8)
      : [];

    const boundedQuery = truncateText(query.trim(), MAX_QUERY_CHARS);
    const boundedConversation = safeConversation.map((t) => ({
      role: t.role,
      content: truncateText(t.content, MAX_CONVERSATION_CHARS_PER_TURN),
    }));

    const retrievalQuery =
      boundedConversation.length > 0
        ? `${boundedConversation
            .filter((t) => t.role === "user")
            .slice(-2)
            .map((t) => t.content)
            .join("\n")}\n${boundedQuery}`.trim()
        : boundedQuery;

    const queryType = inferQueryType(query);
    await logAnalyticsEvent("query_sent", {
      user_id: uid,
      query_text: query,
      type: queryType,
    });

    const responseStart = Date.now();

    // Hit the abstracted Provider
    const contextSnippets = await RetrievalService.getContext(retrievalQuery);

    console.log(
      `[ChatRoute] Query: "${query}". Found ${contextSnippets.length} relevant snippets.`
    );
    if (contextSnippets.length > 0) {
      console.log(`[ChatRoute] Documents in context: ${contextSnippets.map(s => s.fileName).join(", ")}`);
    }

    // Get strictly-prompted stream from our isolated service
    const stream = await RetrievalService.generateChatResponse(
      boundedQuery,
      contextSnippets,
      boundedConversation,
      safeAttachments.map((a) => ({
        downloadURL: a.downloadURL,
        mimeType: a.mimeType,
        name: a.name,
      }))
    );

    // Stream transformation to safely pack sources into the first bytes
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = "";
          const sourcesChunk = JSON.stringify({ type: "sources", data: contextSnippets }) + "\n\n===CHUNK_SPLIT===\n\n";
          controller.enqueue(encoder.encode(sourcesChunk));

          for await (const chunk of stream) {
            if (chunk.text) {
              fullResponse += chunk.text;
              controller.enqueue(encoder.encode(chunk.text));
            }
          }

          const latencyMs = Date.now() - responseStart;
          const referencedSources = extractReferencedSources(
            fullResponse,
            contextSnippets.map((s) => s.fileName)
          );
          await logAnalyticsEvent("response_delivered", {
            user_id: uid,
            response_type: queryType,
            relevance_score: estimateRelevanceScore(query, fullResponse),
            latency_ms: latencyMs,
            referenced_sources: referencedSources,
          });
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
      return nextJsonChatAuthError(error);
    }
    const err = error as { message?: string; stack?: string };
    console.error("Chat API Critical Failure:", error);
    const details = err.message || "Unknown error";
    return chatServerErrorResponse(details, err.stack);
  }
}
