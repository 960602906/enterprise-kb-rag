import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { AccessError, requireKbAccess, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { resolveDownloadContentType } from "@/lib/documents/preview";
import { getObjectStore } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Stream original file bytes for inline preview (PDF iframe) or download.
 * Requires KB read (or manage) access — same ACL as document metadata GET.
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    const download =
      new URL(req.url).searchParams.get("download") === "1" ||
      new URL(req.url).searchParams.get("download") === "true";

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await requireKbAccess(userId, doc.knowledgeBaseId, "read");

    const buffer = await getObjectStore().get(doc.storagePath);
    const contentType = resolveDownloadContentType(doc.filename, doc.mimeType);
    const disposition = download ? "attachment" : "inline";
    const encodedName = encodeURIComponent(doc.filename);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Content fetch failed" }, { status: 500 });
  }
}
