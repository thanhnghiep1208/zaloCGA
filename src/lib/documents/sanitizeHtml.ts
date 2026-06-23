import sanitizeHtml from "sanitize-html";

/**
 * Allowed tags and attributes for Tiptap editor output.
 * Covers: starter-kit (headings, lists, blockquote, code, hr) + image + link extensions.
 */
const ALLOWED_TAGS = [
  "p", "strong", "em", "s", "u",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "br", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
  "img", "a",
];

/** Sanitize Tiptap-generated HTML before storing or serving. */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: {
      // Only HTTPS for images — blocks javascript:, data:, blob:
      img: ["https"],
    },
    transformTags: {
      // Force safe link attributes regardless of what the author set
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}
