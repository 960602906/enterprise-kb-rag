import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AccessError, requireKbAccess, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { kbMembers, users } from "@/lib/db/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    await requireKbAccess(userId, id, "read");

    const members = await db
      .select({
        id: kbMembers.id,
        userId: kbMembers.userId,
        role: kbMembers.role,
        email: users.email,
        name: users.name,
        createdAt: kbMembers.createdAt,
      })
      .from(kbMembers)
      .innerJoin(users, eq(users.id, kbMembers.userId))
      .where(eq(kbMembers.knowledgeBaseId, id));

    return NextResponse.json({ members });
  } catch (err) {
    return handleError(err);
  }
}

const addSchema = z.object({
  email: z.string().email(),
  role: z.enum(["read", "manage"]).default("read"),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    await requireKbAccess(userId, id, "manage");
    const body = addSchema.parse(await req.json());

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (!target) {
      return NextResponse.json(
        { error: "User not found. They must sign up / be seeded first." },
        { status: 404 },
      );
    }

    const [existing] = await db
      .select()
      .from(kbMembers)
      .where(
        and(
          eq(kbMembers.knowledgeBaseId, id),
          eq(kbMembers.userId, target.id),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(kbMembers)
        .set({ role: body.role })
        .where(eq(kbMembers.id, existing.id))
        .returning();
      return NextResponse.json({ member: updated });
    }

    const [member] = await db
      .insert(kbMembers)
      .values({
        knowledgeBaseId: id,
        userId: target.id,
        role: body.role,
      })
      .returning();

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

const deleteSchema = z.object({
  userId: z.string().uuid(),
});

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    await requireKbAccess(userId, id, "manage");
    const body = deleteSchema.parse(await req.json());

    await db
      .delete(kbMembers)
      .where(
        and(
          eq(kbMembers.knowledgeBaseId, id),
          eq(kbMembers.userId, body.userId),
        ),
      );

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
