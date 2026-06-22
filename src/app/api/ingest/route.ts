import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import {
  ApiAuthError,
  assertFirebaseStorageDownloadUrl,
  requireContributorOrAdmin,
  requireUidFromRequest,
} from "@/lib/api-request-auth";
import { logAnalyticsEvent } from "@/lib/analytics-events";
import { GEMINI_FLASH_MODEL } from "@/lib/gemini-models";
import { writeDocumentChunks } from "@/lib/documents/embeddings";

const IngestRequestSchema = z.object({
  fileUrl: z.string().url("fileUrl must be a valid URL"),
  mimeType: z.string().default(""),
  fileName: z.string().default(""),
  docId: z.string().default(""),
});

let _ingestAi: GoogleGenAI | null = null;
function getIngestAi(): GoogleGenAI {
  if (!_ingestAi) {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    _ingestAi = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1beta" } });
  }
  return _ingestAi;
}

export const dynamic = "force-dynamic";

const EXTRACT_PROMPT =
  "Extract all legible text from this document for indexing. If there are tables, convert them to markdown. Do not add any conversational filler or meta-talk. Just provide the text.";

/**
 * Upload a PDF to the Gemini File API, wait for it to become ACTIVE,
 * run extraction, then clean up. Falls back to inline base64 on any error.
 */
async function extractPdfText(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<string> {
  // Use File API for PDFs ≥ 4 MB to avoid inline payload limits; smaller files use inline directly.
  const INLINE_THRESHOLD = 4 * 1024 * 1024;

  if (arrayBuffer.byteLength < INLINE_THRESHOLD) {
    return extractPdfInline(arrayBuffer);
  }

  try {
    return await extractPdfViaFileApi(arrayBuffer, fileName);
  } catch (e) {
    console.warn("[Ingest] File API failed, retrying inline:", e instanceof Error ? e.message : e);
    return extractPdfInline(arrayBuffer);
  }
}

async function extractPdfInline(arrayBuffer: ArrayBuffer): Promise<string> {
  const base64Data = Buffer.from(arrayBuffer).toString("base64");
  const result = await getIngestAi().models.generateContent({
    model: GEMINI_FLASH_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: base64Data, mimeType: "application/pdf" } },
          { text: EXTRACT_PROMPT },
        ],
      },
    ],
  });
  return result.text || "";
}

async function extractPdfViaFileApi(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<string> {
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });

  const ai = getIngestAi();
  let file = await ai.files.upload({
    file: blob,
    config: {
      mimeType: "application/pdf",
      displayName: fileName || "document.pdf",
    },
  });

  // Poll until ACTIVE (max 90 s)
  const deadline = Date.now() + 90_000;
  while (file.state === "PROCESSING") {
    if (Date.now() > deadline) throw new Error("Gemini file processing timed out after 90 s");
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: file.name! });
  }

  if (file.state !== "ACTIVE") {
    throw new Error(`Gemini file entered state: ${String(file.state)}`);
  }

  try {
    const result = await getIngestAi().models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: file.uri!, mimeType: "application/pdf" } },
            { text: EXTRACT_PROMPT },
          ],
        },
      ],
    });
    return result.text || "";
  } finally {
    void ai.files.delete({ name: file.name! }).catch((e) =>
      console.warn("[Ingest] File API cleanup failed:", e)
    );
  }
}

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    await requireContributorOrAdmin(uid);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = IngestRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { fileUrl, mimeType, fileName, docId } = parsed.data;

    assertFirebaseStorageDownloadUrl(fileUrl);

    const mime = String(mimeType).toLowerCase();
    const urlLower = fileUrl.toLowerCase();
    const nameLower = String(fileName).toLowerCase();

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file binary: ${response.statusText}`);
    }

    const headerMime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const effectiveMime = mime || headerMime;

    const isPdf =
      effectiveMime.includes("pdf") ||
      urlLower.includes(".pdf") ||
      nameLower.endsWith(".pdf");
    const isDocx =
      effectiveMime.includes("wordprocessingml") ||
      urlLower.includes(".docx") ||
      nameLower.endsWith(".docx");

    const arrayBuffer = await response.arrayBuffer();

    let extractedText = "";
    const parseStart = Date.now();

    if (isPdf) {
      try {
        extractedText = await extractPdfText(arrayBuffer, String(fileName));
      } catch (aiError: unknown) {
        const msg = aiError instanceof Error ? aiError.message : String(aiError);
        console.error("[Ingest] PDF extraction failed:", aiError);
        void logAnalyticsEvent("parse_failed", {
          user_id: uid,
          error_type: "ai_extraction",
          latency_ms: Date.now() - parseStart,
        });
        throw new Error(`AI Extraction Engine failed: ${msg}`);
      }
    } else if (isDocx) {
      try {
        const buffer = Buffer.from(arrayBuffer);
        const raw = await mammoth.extractRawText({ buffer });
        extractedText = raw.value?.trim() || "";
        if (!extractedText) {
          const html = await mammoth.convertToHtml({ buffer });
          extractedText = html.value
            ? html.value
                .replace(/<\/(p|div|h[1-6]|tr|li|br\s*\/?)>/gi, "\n")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+\n/g, "\n")
                .replace(/[ \t]{2,}/g, " ")
                .trim()
            : "";
        }
      } catch (docxErr: unknown) {
        const msg = docxErr instanceof Error ? docxErr.message : String(docxErr);
        console.error("[Ingest] DOCX extraction failed:", docxErr);
        void logAnalyticsEvent("parse_failed", {
          user_id: uid,
          error_type: "docx_parse",
          latency_ms: Date.now() - parseStart,
        });
        throw new Error(`DOCX parse failed: ${msg}`);
      }
    } else if (mime.includes("text") || mime.includes("csv")) {
      extractedText = Buffer.from(arrayBuffer).toString("utf-8");
    } else {
      extractedText = `(AI Processing not supported for MIME type: ${mimeType}. Please use PDF, DOCX, TXT, or CSV.)`;
    }

    // Guard: Firestore 1 MB document limit
    if (extractedText.length > 900_000) {
      extractedText = extractedText.substring(0, 900_000) + "... [Truncated]";
    }

    const ruleCountExtracted = extractedText
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.startsWith("-") || l.startsWith("*") || l.includes("quy tắc"))
      .length;

    void logAnalyticsEvent("parse_success", {
      user_id: uid,
      rule_count_extracted: ruleCountExtracted,
      latency_ms: Date.now() - parseStart,
    });

    const finalText = extractedText.trim() || "(No text content extracted by AI)";

    let chunkCount = 0;
    if (docId && finalText && finalText !== "(No text content extracted by AI)") {
      try {
        const r = await writeDocumentChunks(String(docId), String(fileName) || String(docId), finalText);
        chunkCount = r.chunkCount;
        console.log(`[Ingest] Wrote ${chunkCount} chunks for doc ${docId}`);
      } catch (embedErr) {
        console.error("[Ingest] Embedding/chunking failed (non-fatal):", embedErr);
      }
    }

    return NextResponse.json({ success: true, textContent: finalText, chunkCount });
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    const err = error as { message?: string; stack?: string };
    console.error("[Ingest] Server error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Parse failure",
        ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
