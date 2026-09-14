import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  AccessError,
  listKnowledgeBasesForUser,
  requireUserId,
} from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { kbMembers, knowledgeBases } from "@/lib/db/schema";

export async function GET() {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const items = await listKnowledgeBasesForUser(userId);
    return NextResponse.json({ items });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const body = createSchema.parse(await req.json());

    const [kb] = await db
      .insert(knowledgeBases)
      .values({
        name: body.name,
        description: body.description ?? null,
        ownerId: userId,
      })
      .returning();

    await db.insert(kbMembers).values({
      knowledgeBaseId: kb.id,
      userId,
      role: "manage",
    });

    return NextResponse.json(
      { item: { ...kb, role: "manage" as const } },
      { status: 201 },
    );
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
