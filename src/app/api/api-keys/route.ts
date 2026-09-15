import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AccessError, requireUserId } from "@/lib/auth/acl";
import {
  createApiKey,
  listApiKeysForUser,
  listManageableKnowledgeBases,
} from "@/lib/api-keys/service";

export async function GET() {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const [items, manageableKnowledgeBases] = await Promise.all([
      listApiKeysForUser(userId),
      listManageableKnowledgeBases(userId),
    ]);
    return NextResponse.json({
      items,
      manageableKnowledgeBases: manageableKnowledgeBases.map((kb) => ({
        id: kb.id,
        name: kb.name,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  knowledgeBaseIds: z.array(z.string().uuid()).min(1),
  rateLimitPerMin: z.number().int().min(1).max(10_000).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const body = createSchema.parse(await req.json());
    const item = await createApiKey({
      userId,
      name: body.name,
      knowledgeBaseIds: body.knowledgeBaseIds,
      rateLimitPerMin: body.rateLimitPerMin,
    });
    return NextResponse.json({ item }, { status: 201 });
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
