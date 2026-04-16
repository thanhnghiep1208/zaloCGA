import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import {
  ApiAuthError,
  assertFirebaseStorageDownloadUrl,
  requireContributorOrAdmin,
  requireUidFromRequest,
} from "@/lib/api-request-auth";
import { logAnalyticsEvent } from "@/lib/analytics-events";

// Initialize Gemini for Server-side extraction via v1beta
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: { apiVersion: "v1beta" }
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const uid = await requireUidFromRequest(req);
    await requireContributorOrAdmin(uid);

    const { fileUrl, mimeType = "", fileName = "" } = await req.json();

    if (!fileUrl) {
       return NextResponse.json({ error: "Missing file URL" }, { status: 400 });
    }

    assertFirebaseStorageDownloadUrl(fileUrl);

    const mime = String(mimeType).toLowerCase();
    const urlLower = fileUrl.toLowerCase();
    const nameLower = String(fileName).toLowerCase();

    // 1. Download the storage file binary directly
    const response = await fetch(fileUrl);
    if (!response.ok) {
       throw new Error(`Failed to fetch file binary: ${response.statusText}`);
    }

    const headerMime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const effectiveMime = mime || headerMime;

    // Firebase download URLs end with ?alt=media&token=... — never use endsWith(".docx")
    const isPdf =
      effectiveMime.includes("pdf") ||
      urlLower.includes(".pdf") ||
      nameLower.endsWith(".pdf");
    const isDocx =
      effectiveMime.includes("wordprocessingml") ||
      urlLower.includes(".docx") ||
      nameLower.endsWith(".docx");

    const arrayBuffer = await response.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    let extractedText = "";
    const parseStart = Date.now();

    // 2. Extract using Gemini 3 Flash Preview (AI OCR & Parsing)
    if (isPdf) {
       try {
         const result = await ai.models.generateContent({
           model: "gemini-3-flash-preview",
           contents: [
             {
               role: "user",
               parts: [
                 { inlineData: { data: base64Data, mimeType: "application/pdf" } },
                 { text: "Extract all legible text from this document for indexing. If there are tables, convert them to markdown. Do not add any conversational filler or meta-talk. Just provide the text." }
               ]
             }
           ]
         });

         extractedText = result.text || "";
       } catch (aiError: any) {
         console.error("Gemini Extraction Failure:", aiError);
         throw new Error(`AI Extraction Engine failed: ${aiError.message}`);
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
         console.error("DOCX extraction failed:", docxErr);
         throw new Error(`DOCX parse failed: ${msg}`);
       }
    } else if (mime.includes("text") || mime.includes("csv")) {
       extractedText = Buffer.from(arrayBuffer).toString("utf-8");
    } else {
       extractedText = `(AI Processing not supported for MIME type: ${mimeType}. Please use PDF, DOCX, TXT, or CSV.)`;
    }

    // Guard rails on huge texts (1MB firestore limit buffer)
    if (extractedText.length > 900000) {
        extractedText = extractedText.substring(0, 900000) + "... [Truncated]";
    }

    const ruleCountExtracted = extractedText
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.startsWith("-") || line.startsWith("*") || line.includes("quy tắc"))
      .length;

    await logAnalyticsEvent("parse_success", {
      user_id: uid,
      rule_count_extracted: ruleCountExtracted,
      latency_ms: Date.now() - parseStart,
    });

    return NextResponse.json({ 
        success: true, 
        textContent: extractedText.trim() || "(No text content extracted by AI)" 
    });

  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    const err = error as { message?: string; stack?: string };
    console.error("Ingestion Server Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Parse failure",
        ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
