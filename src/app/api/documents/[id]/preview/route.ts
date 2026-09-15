import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import mammoth from "mammoth";
import { auth } from "@/lib/auth";
import { AccessError, requireKbAccess, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import {
  contentUrls,
  isDocxDocument,
  isMarkdownDocument,
  isPdfDocument,
  isPlainTextDocument,
  markdownToSafeHtml,
  sanitizePreviewHtml,
  type DocumentPreviewPayload,
} from "@/lib/documents/preview";
import { getObjectStore } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Build an in-app preview payload (text / rendered markdown / docx HTML / PDF URL).
 * Requires KB read (or manage). Does not expose bytes across tenants.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await requireKbAccess(userId, doc.knowledgeBaseId, "read");

    const { contentUrl, downloadUrl } = contentUrls(doc.id);
    const base = {
      title: doc.title,
      filename: doc.filename,
      mimeType: doc.mimeType,
      downloadUrl,
    };

    if (isPdfDocument(doc.filename, doc.mimeType)) {
      const payload: DocumentPreviewPayload = {
        kind: "pdf",
        ...base,
        contentUrl,
      };
      return NextResponse.json({ item: payload });
    }

    const buffer = await getObjectStore().get(doc.storagePath);

    if (isDocxDocument(doc.filename, doc.mimeType)) {
      try {
        const result = await mammoth.convertToHtml(
          { buffer },
          { convertImage: mammoth.images.dataUri },
        );
        const payload: DocumentPreviewPayload = {
          kind: "html",
          ...base,
          body: sanitizePreviewHtml(result.value || "<p></p>"),
        };
        return NextResponse.json({ item: payload });
      } catch (err) {
        const payload: DocumentPreviewPayload = {
          kind: "unavailable",
          ...base,
          message:
            err instanceof Error
              ? err.message
              : "DOCX conversion failed",
        };
        return NextResponse.json({ item: payload });
      }
    }

    const text = buffer.toString("utf-8");

    if (isMarkdownDocument(doc.filename, doc.mimeType)) {
      const payload: DocumentPreviewPayload = {
        kind: "html",
        ...base,
        body: sanitizePreviewHtml(markdownToSafeHtml(text)),
      };
      return NextResponse.json({ item: payload });
    }

    if (isPlainTextDocument(doc.filename, doc.mimeType)) {
      const payload: DocumentPreviewPayload = {
        kind: "text",
        ...base,
        body: text,
      };
      return NextResponse.json({ item: payload });
    }

    // Fallback: treat unknown allowed uploads as UTF-8 text.
    const payload: DocumentPreviewPayload = {
      kind: "text",
      ...base,
      body: text,
    };
    return NextResponse.json({ item: payload });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
