import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AccessError, requireUserId } from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { qaLogs } from "@/lib/db/schema";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(raw)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.round(raw)))
      : DEFAULT_LIMIT;

    const items = await db
      .select({
        id: qaLogs.id,
        question: qaLogs.question,
        answer: qaLogs.answer,
        latencyMs: qaLogs.latencyMs,
        model: qaLogs.model,
        knowledgeBaseIds: qaLogs.knowledgeBaseIds,
        retrievedChunkIds: qaLogs.retrievedChunkIds,
        createdAt: qaLogs.createdAt,
      })
      .from(qaLogs)
      .where(eq(qaLogs.userId, userId))
      .orderBy(desc(qaLogs.createdAt))
      .limit(limit);

    return NextResponse.json({
      items: items.map((row) => ({
        ...row,
        answerPreview: (row.answer ?? "").slice(0, 280),
        chunkCount: row.retrievedChunkIds?.length ?? 0,
      })),
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[qa-logs]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
