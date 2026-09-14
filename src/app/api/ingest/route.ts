import { NextResponse } from "next/server";
import { and, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  AccessError,
  getAccessibleKnowledgeBaseIds,
  requireUserId,
} from "@/lib/auth/acl";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { enqueueDocumentProcessing } from "@/lib/rag";

const bodySchema = z.object({
  documentIds: z.array(z.string().uuid()).optional(),
});

/**
 * Queue pending/failed documents the user can access.
 * POST { documentIds?: string[] } — if omitted, drains pending/failed docs.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = await requireUserId(session);
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    const accessible = await getAccessibleKnowledgeBaseIds(userId);
    if (accessible.length === 0) {
      return NextResponse.json({ queued: [] });
    }

    let docs;
    if (body.documentIds?.length) {
      docs = await db
        .select()
        .from(documents)
        .where(
          and(
            inArray(documents.id, body.documentIds),
            inArray(documents.knowledgeBaseId, accessible),
          ),
        );
    } else {
      docs = await db
        .select()
        .from(documents)
        .where(
          and(
            inArray(documents.knowledgeBaseId, accessible),
            inArray(documents.status, ["pending", "failed"]),
          ),
        )
        .limit(20);
    }

    for (const doc of docs) {
      enqueueDocumentProcessing(doc.id);
    }

    return NextResponse.json({
      queued: docs.map((d) => d.id),
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Ingest queue failed" }, { status: 500 });
  }
}
