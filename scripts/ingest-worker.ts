import "dotenv/config";
import { drainIngestQueue } from "../src/lib/jobs/ingest-queue";

const limit = Number(process.env.INGEST_BATCH_SIZE ?? 10);
const once = process.argv.includes("--once");
const intervalMs = Number(process.env.INGEST_POLL_MS ?? 2000);

async function tick() {
  const result = await drainIngestQueue({
    limit,
    workerId: `cli-${process.pid}`,
  });
  if (result.processed.length || result.failed.length || result.reclaimed) {
    console.log(
      `[ingest-worker] processed=${result.processed.length} failed=${result.failed.length} reclaimed=${result.reclaimed}`,
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (once) {
    await tick();
    process.exit(0);
  }
  console.log(
    `[ingest-worker] polling every ${intervalMs}ms (batch=${limit})`,
  );
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("[ingest-worker]", err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
