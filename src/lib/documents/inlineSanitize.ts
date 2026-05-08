type ExtractedImage = {
  path: string;
  downloadURL: string;
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function stripHtmlToPlainText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ");

  const withBreaks = noScript
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractStorageImagesFromHtml(html: string): ExtractedImage[] {
  const out: ExtractedImage[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null = regex.exec(html);
  while (m) {
    const src = m[1]?.trim();
    if (src) {
      try {
        const u = new URL(src);
        if (
          u.hostname === "firebasestorage.googleapis.com" &&
          /^\/v0\/b\/[^/]+\/o\//.test(u.pathname)
        ) {
          const pathEncoded = u.pathname.split("/o/")[1] || "";
          const path = decodeURIComponent(pathEncoded);
          out.push({ path, downloadURL: src });
        }
      } catch {
        // ignore invalid URL
      }
    }
    m = regex.exec(html);
  }
  return Array.from(new Map(out.map((x) => [x.downloadURL, x])).values());
}

