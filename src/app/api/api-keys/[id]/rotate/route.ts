import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AccessError, requireUserId } from "@/lib/auth/acl";
import { rotateApiKey } from "@/lib/api-keys/service";

type Ctx = { params: Promise<{ id: string }> };

/** Issue a new plaintext secret; old secret stops working immediately. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const { id } = await ctx.params;
    const item = await rotateApiKey(userId, id);
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
