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
import { authorizeCronRequest } from "@/lib/jobs/cron-auth";
import { drainIngestQueue, enqueueDocumentProcessing } from "@/lib/jobs/ingest-queue";

export const maxDuration = 60;

const bodySchema = z.object({
  documentIds: z.array(z.string().uuid()).optional(),
  drain: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

/**
 * Queue pending/failed documents the user can access,
 * or drain the ingest job table when `{ drain: true }` + cron secret.
 */
export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    if (body.drain) {
      const authz = authorizeCronRequest(req);
      if (!authz.ok) {
        return NextResponse.json({ error: authz.error }, { status: authz.status });
      }
      const result = await drainIngestQueue({
        limit: body.limit ?? Number(process.env.INGEST_BATCH_SIZE ?? 3),
        workerId: `api-drain-${process.pid}`,
      });
      return NextResponse.json({
        ok: true,
        processed: result.processed,
        failed: result.failed,
        reclaimed: result.reclaimed,
      });
    }

    const session = await auth();
    const userId = await requireUserId(session);

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

    const queued: string[] = [];
    for (const doc of docs) {
      await enqueueDocumentProcessing(doc.id);
      queued.push(doc.id);
    }

    return NextResponse.json({ queued });
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
