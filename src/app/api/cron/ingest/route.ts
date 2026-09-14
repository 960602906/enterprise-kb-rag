import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/jobs/cron-auth";
import { drainIngestQueue } from "@/lib/jobs/ingest-queue";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * Vercel Cron target. Sends `Authorization: Bearer $CRON_SECRET`.
 * Also accepts POST with the same auth (manual drain).
 */
async function handle(req: Request) {
  const authz = authorizeCronRequest(req);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const url = new URL(req.url);
  const limit = Number(
    url.searchParams.get("limit") ?? process.env.INGEST_BATCH_SIZE ?? 3,
  );
  const batch = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), 1), 20)
    : 3;

  try {
    const result = await drainIngestQueue({
      limit: batch,
      workerId: `cron-${process.pid}`,
    });
    return NextResponse.json({
      ok: true,
      processed: result.processed,
      failed: result.failed,
      reclaimed: result.reclaimed,
    });
  } catch (err) {
    console.error("[cron/ingest]", err);
    return NextResponse.json({ error: "Ingest drain failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
