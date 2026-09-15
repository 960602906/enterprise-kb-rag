/**
 * Helpers for in-app document preview / download.
 * Bytes always come from the object store (local or S3) via storagePath.
 */

export type PreviewKind = "text" | "markdown" | "html" | "pdf";

export type DocumentPreviewPayload =
  | {
      kind: "text" | "markdown" | "html";
      title: string;
      filename: string;
      mimeType: string;
      body: string;
      downloadUrl: string;
    }
  | {
      kind: "pdf";
      title: string;
      filename: string;
      mimeType: string;
      contentUrl: string;
      downloadUrl: string;
    }
  | {
      kind: "unavailable";
      title: string;
      filename: string;
      mimeType: string;
      message: string;
      downloadUrl: string;
    };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function extensionOf(filename: string): string {
  const lower = filename.toLowerCase();
  const i = lower.lastIndexOf(".");
  return i >= 0 ? lower.slice(i) : "";
}

export function isPdfDocument(filename: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || extensionOf(filename) === ".pdf";
}

export function isDocxDocument(filename: string, mimeType: string): boolean {
  return mimeType === DOCX_MIME || extensionOf(filename) === ".docx";
}

export function isMarkdownDocument(filename: string, mimeType: string): boolean {
  const ext = extensionOf(filename);
  return (
    ext === ".md" ||
    ext === ".markdown" ||
    mimeType === "text/markdown" ||
    mimeType === "text/x-markdown"
  );
}

export function isPlainTextDocument(filename: string, mimeType: string): boolean {
  return extensionOf(filename) === ".txt" || mimeType === "text/plain";
}

/** Prefer download affordance for binary office/PDF types. */
export function prefersDownloadAction(
  filename: string,
  mimeType?: string | null,
): boolean {
  const mime = mimeType ?? "";
  return isPdfDocument(filename, mime) || isDocxDocument(filename, mime);
}

export function resolveDownloadContentType(
  filename: string,
  mimeType: string,
): string {
  if (isPdfDocument(filename, mimeType)) return "application/pdf";
  if (isDocxDocument(filename, mimeType)) return DOCX_MIME;
  if (isMarkdownDocument(filename, mimeType)) return "text/markdown; charset=utf-8";
  if (isPlainTextDocument(filename, mimeType)) return "text/plain; charset=utf-8";
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  return "application/octet-stream";
}

export function contentUrls(documentId: string): {
  contentUrl: string;
  downloadUrl: string;
} {
  const base = `/api/documents/${documentId}/content`;
  return {
    contentUrl: base,
    downloadUrl: `${base}?download=1`,
  };
}

/** Escape HTML then apply a small set of Markdown constructs. */
export function markdownToSafeHtml(source: string): string {
  const escaped = escapeHtml(source);
  const fences: string[] = [];
  let html = escaped.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    const i = fences.length;
    fences.push(
      `<pre class="doc-preview-pre"><code>${code.replace(/^\n/, "")}</code></pre>`,
    );
    return `\u0000FENCE${i}\u0000`;
  });

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(
    /^######\s+(.+)$/gm,
    '<h6 class="doc-preview-h">$1</h6>',
  );
  html = html.replace(
    /^#####\s+(.+)$/gm,
    '<h5 class="doc-preview-h">$1</h5>',
  );
  html = html.replace(
    /^####\s+(.+)$/gm,
    '<h4 class="doc-preview-h">$1</h4>',
  );
  html = html.replace(
    /^###\s+(.+)$/gm,
    '<h3 class="doc-preview-h">$1</h3>',
  );
  html = html.replace(
    /^##\s+(.+)$/gm,
    '<h2 class="doc-preview-h">$1</h2>',
  );
  html = html.replace(
    /^#\s+(.+)$/gm,
    '<h1 class="doc-preview-h">$1</h1>',
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
  );
  html = html.replace(/^(?:[-*])\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(?:<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("\u0000FENCE") ||
        trimmed.startsWith("<pre")
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  html = html.replace(/\u0000FENCE(\d+)\u0000/g, (_m, i: string) => {
    return fences[Number(i)] ?? "";
  });

  return html;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

/**
 * Best-effort HTML sanitizer for preview bodies (esp. mammoth DOCX output).
 * Strips scripts/handlers and non-http(s)/data-image URLs. Not a full DOMPurify
 * replacement — prefer keep allowlist tight.
 */
export function sanitizePreviewHtml(html: string): string {
  let out = html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_m, attr: string, _q: string, d?: string, s?: string, u?: string) => {
      const raw = (d ?? s ?? u ?? "").trim();
      const lower = raw.toLowerCase();
      const ok =
        lower.startsWith("https://") ||
        lower.startsWith("http://") ||
        lower.startsWith("mailto:") ||
        (attr.toLowerCase() === "src" && lower.startsWith("data:image/"));
      if (!ok) return "";
      const safe = raw.replace(/"/g, "&quot;");
      return ` ${attr}="${safe}"`;
    });

  // Drop tags outside the allowlist (keep their text content).
  out = out.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (full, tag: string) => {
    if (ALLOWED_TAGS.has(tag.toLowerCase())) return full;
    return "";
  });

  return out;
}
