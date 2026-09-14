import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AccessError, requireKbAccess, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { documents, knowledgeBases } from "@/lib/db/schema";
import { deleteKnowledgeBaseObjects } from "@/lib/rag";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    const role = await requireKbAccess(userId, id, "read");

    const [kb] = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, id))
      .limit(1);

    if (!kb) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.knowledgeBaseId, id))
      .orderBy(desc(documents.createdAt));

    return NextResponse.json({ item: { ...kb, role }, documents: docs });
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    await requireKbAccess(userId, id, "manage");
    const body = patchSchema.parse(await req.json());

    const [updated] = await db
      .update(knowledgeBases)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBases.id, id))
      .returning();

    return NextResponse.json({ item: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    await requireKbAccess(userId, id, "manage");

    await deleteKnowledgeBaseObjects(id);
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof AccessError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: err.flatten() }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
