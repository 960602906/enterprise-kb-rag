import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AccessError, requireUserId } from "@/lib/auth/acl";
import { deleteApiKey, updateApiKey } from "@/lib/api-keys/service";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  knowledgeBaseIds: z.array(z.string().uuid()).min(1).optional(),
  rateLimitPerMin: z.number().int().min(1).max(10_000).nullable().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());
    if (
      body.name === undefined &&
      body.enabled === undefined &&
      body.knowledgeBaseIds === undefined &&
      body.rateLimitPerMin === undefined
    ) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }
    const item = await updateApiKey({
      userId,
      apiKeyId: id,
      name: body.name,
      enabled: body.enabled,
      knowledgeBaseIds: body.knowledgeBaseIds,
      rateLimitPerMin: body.rateLimitPerMin,
    });
    return NextResponse.json({ item });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    await deleteApiKey(userId, id);
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
