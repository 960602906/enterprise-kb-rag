import "dotenv/config";
import postgres from "postgres";

/**
 * Bootstrap SQL migration: extensions + tables aligned with src/lib/db/schema.ts
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { max: 1 });

  console.log("Enabling extensions...");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

  await sql`
    DO $$ BEGIN
      CREATE TYPE member_role AS ENUM ('read', 'manage');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE document_status AS ENUM ('pending', 'processing', 'ready', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `;

  console.log("Creating tables...");

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text,
      email text NOT NULL UNIQUE,
      email_verified timestamp,
      image text,
      password_hash text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type text NOT NULL,
      provider text NOT NULL,
      provider_account_id text NOT NULL,
      refresh_token text,
      access_token text,
      expires_at integer,
      token_type text,
      scope text,
      id_token text,
      session_state text,
      PRIMARY KEY (provider, provider_account_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires timestamp NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier text NOT NULL,
      token text NOT NULL,
      expires timestamp NOT NULL,
      PRIMARY KEY (identifier, token)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(200) NOT NULL,
      description text,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS kb_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role member_role NOT NULL DEFAULT 'read',
      created_at timestamp NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS kb_members_kb_user_idx ON kb_members(knowledge_base_id, user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS kb_members_user_idx ON kb_members(user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      title varchar(500) NOT NULL,
      filename varchar(500) NOT NULL,
      mime_type varchar(120) NOT NULL,
      file_size integer NOT NULL DEFAULT 0,
      storage_path text NOT NULL,
      status document_status NOT NULL DEFAULT 'pending',
      error_message text,
      page_count integer,
      chunk_count integer DEFAULT 0,
      uploaded_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      processed_at timestamp,
      metadata jsonb DEFAULT '{}'::jsonb
    );
  `;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb`;
  await sql`CREATE INDEX IF NOT EXISTS documents_kb_idx ON documents(knowledge_base_id)`;
  await sql`CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      chunk_index integer NOT NULL,
      content text NOT NULL,
      token_count integer NOT NULL DEFAULT 0,
      page_number integer,
      heading_path text,
      embedding vector(1536),
      tsv tsvector,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks(document_id)`;
  await sql`CREATE INDEX IF NOT EXISTS chunks_kb_idx ON chunks(knowledge_base_id)`;
  await sql`CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING GIN (tsv)`;
  await sql`
    DO $$ BEGIN
      CREATE INDEX chunks_embedding_hnsw_idx ON chunks
        USING hnsw (embedding vector_cosine_ops);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN null;
    END $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(300),
      knowledge_base_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role varchar(20) NOT NULL,
      content text NOT NULL,
      citations jsonb DEFAULT '[]'::jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS qa_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      session_id uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
      question text NOT NULL,
      answer text,
      knowledge_base_ids jsonb DEFAULT '[]'::jsonb,
      retrieved_chunk_ids jsonb DEFAULT '[]'::jsonb,
      retrieval_scores jsonb DEFAULT '[]'::jsonb,
      latency_ms integer,
      model varchar(120),
      created_at timestamp NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS qa_logs_user_idx ON qa_logs(user_id)`;

  await sql`
    CREATE OR REPLACE FUNCTION chunks_tsv_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.tsv := to_tsvector('english', coalesce(NEW.content, ''));
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `;
  await sql`DROP TRIGGER IF EXISTS chunks_tsv_update ON chunks`;
  await sql`
    CREATE TRIGGER chunks_tsv_update
    BEFORE INSERT OR UPDATE OF content ON chunks
    FOR EACH ROW EXECUTE FUNCTION chunks_tsv_trigger();
  `;

  console.log("Migration complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
