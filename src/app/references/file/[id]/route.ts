import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import mammoth from "mammoth";

export const runtime = "nodejs";

function buildContentDisposition(fileName: string, mode: "inline" | "attachment"): string {
  const normalized = (fileName || "reference").replace(/[\r\n"]/g, " ").trim() || "reference";
  const asciiFallback = normalized.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(normalized)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!adminDb) {
    return NextResponse.json({ error: "Admin DB unavailable" }, { status: 500 });
  }

  const snap = await adminDb.collection("documents").doc(id).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const data = snap.data() as { fileUrl?: string; fileName?: string; mimeType?: string } | undefined;
  const fileUrl = data?.fileUrl;
  if (!fileUrl) {
    return NextResponse.json({ error: "Missing source URL" }, { status: 400 });
  }

  const upstream = await fetch(fileUrl);
  if (!upstream.ok) {
    return NextResponse.json({ error: "Failed to fetch source file" }, { status: 502 });
  }

  const forceDownload = req.nextUrl.searchParams.get("download") === "1";
  const mimeType = (data?.mimeType || upstream.headers.get("content-type") || "").toLowerCase();
  const fileName = (data?.fileName || "").toLowerCase();

  // Download must always return original file binary as attachment.
  if (forceDownload) {
    if (!upstream.body) {
      return NextResponse.json({ error: "Empty response body" }, { status: 502 });
    }
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);
    headers.set("content-disposition", buildContentDisposition(data?.fileName || "reference", "attachment"));
    headers.set("cache-control", "private, max-age=300");
    return new NextResponse(upstream.body, { status: 200, headers });
  }

  // DOCX cannot be reliably viewed inline by browsers, so convert to HTML.
  if (
    mimeType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
    fileName.endsWith(".docx")
  ) {
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const converted = await mammoth.convertToHtml({ buffer });
    const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${data?.fileName || "Reference document"}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 980px; margin: 24px auto; padding: 0 16px; line-height: 1.6; color: #292827; }
      h1,h2,h3 { line-height: 1.25; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #dcd7d3; padding: 8px; text-align: left; }
      img { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>${converted.value}</body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, max-age=300",
      },
    });
  }

  const headers = new Headers();
  // Prefer inline-friendly content-types to avoid forced download.
  if (mimeType.includes("csv") || fileName.endsWith(".csv")) {
    headers.set("content-type", "text/csv; charset=utf-8");
  } else if (mimeType.includes("text/plain") || fileName.endsWith(".txt")) {
    headers.set("content-type", "text/plain; charset=utf-8");
  } else if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
    headers.set("content-type", "application/pdf");
  } else {
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
  }
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("content-disposition", buildContentDisposition(data?.fileName || "reference", "inline"));
  headers.set("cache-control", "private, max-age=300");

  if (!upstream.body) {
    return NextResponse.json({ error: "Empty response body" }, { status: 502 });
  }
  return new NextResponse(upstream.body, { status: 200, headers });
}
