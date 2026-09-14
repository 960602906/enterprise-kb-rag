import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1 });

  await sql`
    DO $$ BEGIN
      CREATE TYPE ingest_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ingest_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      status ingest_job_status NOT NULL DEFAULT 'queued',
      attempts integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 3,
      last_error text,
      available_at timestamp NOT NULL DEFAULT now(),
      locked_at timestamp,
      locked_by varchar(120),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS ingest_jobs_document_idx ON ingest_jobs(document_id)`;
  await sql`CREATE INDEX IF NOT EXISTS ingest_jobs_status_idx ON ingest_jobs(status, available_at)`;
  await sql`CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING GIN (tsv)`;
  await sql`
    DO $$ BEGIN
      CREATE INDEX chunks_embedding_hnsw_idx ON chunks
        USING hnsw (embedding vector_cosine_ops);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN null;
    END $$;
  `;

  console.log("Ingest jobs + retrieval indexes ready.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
