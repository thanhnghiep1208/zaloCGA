import { NextResponse } from "next/server";
import { z } from "zod";
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
import { checkChatRateLimit } from "@/lib/rate-limit";
import {
  buildScopedQuery,
  sanitizeScope,
  scopeHintForPrompt,
} from "@/lib/chat/scope-options";

const ChatAttachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  storagePath: z.string(),
  downloadURL: z.string().url(),
  expiresAt: z.number(),
});

const ChatRequestSchema = z.object({
  query: z.string().min(1).optional(),
  sessionId: z.string().optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  attachments: z.array(ChatAttachmentSchema).optional(),
  embedding: z.array(z.number()).optional(),
  scope: z.unknown().optional(),
});

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
    await checkChatRateLimit(uid);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = ChatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { query, conversation, attachments, sessionId, embedding, scope } = parsed.data;
    const safeScope = sanitizeScope(scope);
    const safeSessionId =
      typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "draft";

    const safeAttachments = (attachments ?? []).slice(0, MAX_ATTACHMENTS_PER_TURN);

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

    const safeConversation = (conversation ?? [])
      .filter((t) => t.content.trim().length > 0)
      .slice(-8);

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
    void logAnalyticsEvent("query_sent", {
      user_id: uid,
      query_text: query,
      type: queryType,
      scope_message_type: safeScope.messageType,
      scope_ui_pattern: safeScope.uiPattern,
    });

    const responseStart = Date.now();

    const scopedRetrievalQuery = buildScopedQuery(retrievalQuery, safeScope);
    const contextSnippets = await RetrievalService.getContext(scopedRetrievalQuery, embedding, safeScope);

    console.log(
      `[ChatRoute] Query: "${query}". Found ${contextSnippets.length} relevant snippets.`
    );
    if (contextSnippets.length > 0) {
      console.log(`[ChatRoute] Documents in context: ${contextSnippets.map(s => s.fileName).join(", ")}`);
    }

    // Get strictly-prompted stream from our isolated service
    const scopeHint = scopeHintForPrompt(safeScope);
    const promptQuery = scopeHint ? `${scopeHint}\n\n${boundedQuery}` : boundedQuery;
    const stream = await RetrievalService.generateChatResponse(
      promptQuery,
      contextSnippets,
      boundedConversation,
      safeAttachments.map((a) => ({
        downloadURL: a.downloadURL,
        mimeType: a.mimeType,
        name: a.name,
      }))
    );

    // NDJSON stream: each line is a complete JSON object.
    // Line 1: {"t":"s","d":[...sources]}  — sent before any text
    // Line N: {"t":"x","d":"text delta"}  — one per Gemini chunk
    const encoder = new TextEncoder();
    const ndjsonLine = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = "";
          controller.enqueue(ndjsonLine({ t: "s", d: contextSnippets }));

          for await (const chunk of stream) {
            if (chunk.text) {
              fullResponse += chunk.text;
              controller.enqueue(ndjsonLine({ t: "x", d: chunk.text }));
            }
          }

          const latencyMs = Date.now() - responseStart;
          const referencedSources = extractReferencedSources(
            fullResponse,
            contextSnippets.map((s) => s.fileName)
          );
          void logAnalyticsEvent("response_delivered", {
            user_id: uid,
            response_type: queryType,
            relevance_score: estimateRelevanceScore(query, fullResponse),
            latency_ms: latencyMs,
            referenced_sources: referencedSources,
          });
        } catch (e) {
          console.error("Streaming error", e);
          controller.error(e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
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
