import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { AccessError, requireKbAccess, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { deleteDocument, enqueueDocumentProcessing } from "@/lib/rag";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function POST(_req: Request, ctx: Ctx) {
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

    await requireKbAccess(userId, doc.knowledgeBaseId, "manage");
    const { jobId, inline } = await enqueueDocumentProcessing(id, {
      waitInline: true,
    });

    const [updated] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    return NextResponse.json({
      item: updated,
      jobId,
      queued: !inline,
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** @deprecated Prefer DELETE /api/documents/:id */
export async function DELETE(_req: Request, ctx: Ctx) {
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

    await requireKbAccess(userId, doc.knowledgeBaseId, "manage");
    await deleteDocument(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
