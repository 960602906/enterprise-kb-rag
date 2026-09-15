import "dotenv/config";
import postgres from "postgres";

/**
 * SearchKnowledge multi-key tables.
 * Plaintext keys are never stored — only SHA-256(pepper || key) hashes.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1 });

  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(200) NOT NULL,
      key_hash text NOT NULL,
      key_prefix varchar(16) NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      rate_limit_per_min integer,
      last_used_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS api_keys_created_by_idx ON api_keys(created_by)`;

  await sql`
    CREATE TABLE IF NOT EXISTS api_key_knowledge_bases (
      api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      PRIMARY KEY (api_key_id, knowledge_base_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS api_key_kbs_kb_idx ON api_key_knowledge_bases(knowledge_base_id)`;

  console.log("API keys tables ready.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
