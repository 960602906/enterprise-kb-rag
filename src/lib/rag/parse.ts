import mammoth from "mammoth";

export type ParsedDocument = {
  text: string;
  pageCount?: number;
};

/**
 * Parse uploaded files into plain text.
 * Supported: PDF, Markdown, txt, docx.
 * TODO: OCR for scanned PDFs.
 * TODO: Connectors — Notion / 飞书 / Confluence sync adapters.
 */
export async function parseFile(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ParsedDocument> {
  const lower = filename.toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return parsePdf(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value };
  }

  return { text: buffer.toString("utf-8") };
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const mod = await import("pdf-parse");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (mod as any).default ?? mod;

    if (typeof pdfParse === "function") {
      const data = await pdfParse(buffer);
      return {
        text: insertPageMarkers(data.text ?? "", data.numpages),
        pageCount: data.numpages,
      };
    }

    if (pdfParse?.PDFParse) {
      const parser = new pdfParse.PDFParse({ data: buffer });
      const result = await parser.getText();
      const pages = result?.pages?.length ?? result?.total ?? undefined;
      const text =
        typeof result === "string"
          ? result
          : (result?.text ??
            (result?.pages ?? [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((p: any, i: number) => `--- Page ${i + 1} ---\n${p.text ?? p}`)
              .join("\n\n"));
      return { text, pageCount: pages };
    }

    throw new Error("Unsupported pdf-parse API shape");
  } catch (err) {
    throw new Error(
      `PDF parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function insertPageMarkers(text: string, pageCount?: number): string {
  if (!pageCount || pageCount <= 1) return text;
  if (text.includes("\f")) {
    return text
      .split("\f")
      .map((p, i) => `--- Page ${i + 1} ---\n${p.trim()}`)
      .join("\n\n");
  }
  return text;
}

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
] as const;

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".md",
  ".markdown",
  ".txt",
  ".docx",
];

export function isAllowedUpload(filename: string, mimeType: string): boolean {
  const lower = filename.toLowerCase();
  const extOk = ALLOWED_EXTENSIONS.some((e) => lower.endsWith(e));
  const mimeOk = (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
  return extOk || mimeOk;
}
