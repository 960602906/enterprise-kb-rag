import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestJobs } from "@/lib/db/ingest-jobs";
import { processDocument } from "@/lib/rag/ingest";

export type IngestJobStatus = "queued" | "running" | "succeeded" | "failed";

const DEFAULT_MAX_ATTEMPTS = 3;

export function inlineIngestEnabled(): boolean {
  if (process.env.INGEST_WORKER_INLINE === "true") return true;
  if (process.env.INGEST_WORKER_INLINE === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** Persist a job. Optionally kick an in-process run (dev default). */
export async function enqueueDocumentProcessing(
  documentId: string,
): Promise<{ jobId: string; inline: boolean }> {
  const [existing] = await db
    .select()
    .from(ingestJobs)
    .where(eq(ingestJobs.documentId, documentId))
    .limit(1);

  let jobId: string;
  if (existing && (existing.status === "queued" || existing.status === "running")) {
    jobId = existing.id;
  } else if (existing) {
    const [updated] = await db
      .update(ingestJobs)
      .set({
        status: "queued",
        lastError: null,
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(ingestJobs.id, existing.id))
      .returning();
    jobId = updated.id;
  } else {
    const [created] = await db
      .insert(ingestJobs)
      .values({
        documentId,
        status: "queued",
        maxAttempts: Number(process.env.INGEST_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS),
      })
      .returning();
    jobId = created.id;
  }

  const inline = inlineIngestEnabled();
  if (inline) {
    void runJob(jobId).catch((err) => {
      console.error(`[ingest-queue] inline job ${jobId} failed:`, err);
    });
  }
  return { jobId, inline };
}

export async function drainIngestQueue(options?: {
  limit?: number;
  workerId?: string;
}): Promise<{ processed: string[]; failed: string[] }> {
  const limit = options?.limit ?? 10;
  const workerId =
    options?.workerId ?? `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const processed: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < limit; i++) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    try {
      await runClaimedJob(job.id, job.documentId, job.attempts, job.maxAttempts);
      processed.push(job.documentId);
    } catch {
      failed.push(job.documentId);
    }
  }
  return { processed, failed };
}

type Claimed = {
  id: string;
  documentId: string;
  attempts: number;
  maxAttempts: number;
};

async function claimNextJob(workerId: string): Promise<Claimed | null> {
  const rows = await db.execute<{
    id: string;
    document_id: string;
    attempts: number;
    max_attempts: number;
  }>(sql`
    UPDATE ingest_jobs
    SET
      status = 'running',
      locked_at = now(),
      locked_by = ${workerId},
      attempts = attempts + 1,
      updated_at = now()
    WHERE id = (
      SELECT id FROM ingest_jobs
      WHERE status = 'queued'
        AND available_at <= now()
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, document_id, attempts, max_attempts
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

async function runJob(jobId: string): Promise<void> {
  const [job] = await db
    .select()
    .from(ingestJobs)
    .where(eq(ingestJobs.id, jobId))
    .limit(1);
  if (!job) return;
  if (job.status === "succeeded") return;

  await db
    .update(ingestJobs)
    .set({
      status: "running",
      lockedAt: new Date(),
      lockedBy: `inline-${process.pid}`,
      attempts: job.attempts + 1,
      updatedAt: new Date(),
    })
    .where(eq(ingestJobs.id, jobId));

  await runClaimedJob(job.id, job.documentId, job.attempts + 1, job.maxAttempts);
}

async function runClaimedJob(
  jobId: string,
  documentId: string,
  attempts: number,
  maxAttempts: number,
): Promise<void> {
  try {
    await processDocument(documentId);
    await db
      .update(ingestJobs)
      .set({
        status: "succeeded",
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(ingestJobs.id, jobId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retry = attempts < maxAttempts;
    await db
      .update(ingestJobs)
      .set({
        status: retry ? "queued" : "failed",
        lastError: message.slice(0, 2000),
        availableAt: retry
          ? new Date(Date.now() + backoffMs(attempts))
          : new Date(),
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(ingestJobs.id, jobId));
    throw err;
  }
}

function backoffMs(attempts: number): number {
  return Math.min(60_000, 2 ** Math.max(0, attempts - 1) * 1000);
}
