import "dotenv/config";
import postgres from "postgres";

/**
 * Adds `queued` to document_status so the UI can show「排队中」after Process
 * enqueues an ingest job, before a worker starts running.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1 });

  await sql`
    DO $$ BEGIN
      ALTER TYPE document_status ADD VALUE 'queued';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  console.log("document_status includes queued.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
