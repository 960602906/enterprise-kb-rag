# Atlas KB — Enterprise Knowledge Base Q&A (RAG)

Internal bilingual (EN / 中文) knowledge-base Q&A app: create knowledge bases, upload documents, process/embed them, then chat with **ACL-filtered retrieval** and **citations**.

Stack: **Next.js App Router**, **Tailwind v4**, **shadcn/ui**, **Auth.js (next-auth v5)**, **Drizzle + pgvector**, **Vercel AI SDK**.

## Product overview

| Area | What you get |
|------|----------------|
| Auth | Email/password login & register (disable register for production) |
| Knowledge bases | Create, list, detail, delete (manage role) |
| Documents | Upload PDF / Markdown / TXT / DOCX → Process → `ready` |
| Members | Add by email with `read` or `manage` |
| Chat | Multi-KB select, streaming answers, citation side panel |

**Core flow:** Create KB → Upload docs → Process → Chat with citations.

## Setup

### 1. Install

```bash
pnpm install
cp .env.example .env.local
```

### 2. Postgres + pgvector

```bash
docker compose up -d
```

Starts `pgvector/pgvector:pg16` on **localhost:5433** with user/password/db `kb_rag`.

```text
DATABASE_URL=postgresql://kb_rag:kb_rag@localhost:5433/kb_rag
```

### 3. Migrate & seed

```bash
pnpm db:migrate
pnpm db:seed
```

Default seed users (override with `SEED_*`):

- Admin: `admin@example.com` / `admin123456` (manage)
- Member: `member@example.com` / `member123456` (read)

Seed also creates **Employee Handbook** (demo) and **Internal Docs** (default SearchKnowledge target; override name with `SEARCH_KNOWLEDGE_DEFAULT_KB_NAME`).

`pnpm db:migrate` also enables `pg_trgm` and `chunks_content_trgm_idx` (needed for CJK keyword scoring).

### 4. Run

```bash
pnpm dev
```

Open [http://localhost:43123](http://localhost:43123).

### Env vars

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Auth.js secret (`openssl rand -base64 32`) |
| `NEXTAUTH_SECRET` | Optional alias for `AUTH_SECRET` |
| `AUTH_URL` | App origin (e.g. `http://localhost:43123`) |
| `OPENAI_API_KEY` | Chat + embeddings |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible gateway URL |
| `AI_GATEWAY_API_KEY` | Optional Vercel AI Gateway key |
| `EMBEDDING_MODEL` | Default `text-embedding-3-small` |
| `CHAT_MODEL` | Default `gpt-4o-mini` |
| `MOCK_EMBEDDINGS` / `MOCK_CHAT` | Local demo without API keys |
| `UPLOAD_DIR` / `MAX_UPLOAD_BYTES` | Upload storage |
| `STORAGE_DRIVER` | `local` (default) or `s3` |
| `SEED_*` | Seed admin/member credentials |
| `DISABLE_REGISTER` | Block `/api/register` when `true` |
| `CRON_SECRET` | Bearer token for Vercel Cron / drain (`INGEST_CRON_SECRET` alias) |
| `INGEST_WORKER_INLINE` | `true` to process in-request (dev default); `false` in production |
| `INGEST_BATCH_SIZE` | Docs per drain tick (default 3 on Cron, 10 on CLI worker) |
| `INGEST_LOCK_TTL_MS` | Reclaim `running` jobs after this many ms (default 180000) |
| `RETRIEVAL_FUSION` | `rrf` (default) or `weighted` |
| `RETRIEVAL_RRF_K` | RRF constant (default 60) |
| `RETRIEVAL_TRGM_MIN_SIMILARITY` | CJK / fuzzy keyword floor (default 0.35) |
| `SEARCH_KNOWLEDGE_API_KEY` | Service SearchKnowledge header `x-api-key` |
| `SEARCH_KNOWLEDGE_KB_IDS` | Comma-separated KB UUID allowlist for that key |
| `SEARCH_KNOWLEDGE_DEFAULT_KB_NAME` | Used when the request omits ids and KB_IDS is unset (default `Internal Docs`) |
| `SEARCH_KNOWLEDGE_ALLOW_ALL` | Unsafe hatch to scan every KB; keep `false` |
| `SYNONYM_CONFIG_PATH` | Retrieval synonym bags (default `config/retrieval-synonyms.json`) |
| `EVAL_QUERIES_PATH` | `pnpm eval:retrieval` fixture file |

## Retrieval synonyms

Hybrid keyword retrieval expands queries from JSON bags, not hard-coded product terms.

- Default file: [`config/retrieval-synonyms.json`](./config/retrieval-synonyms.json) (generic leave / handbook terms)
- Domain overlays: [`config/examples/`](./config/examples/) — copy bags into the default file or set `SYNONYM_CONFIG_PATH`
- Loaded by `extractKeywordTerms` → `expandSynonymTerms`

```json
{
  "version": 1,
  "bags": [
    { "id": "leave-pto", "match": "PTO|年假", "terms": ["PTO", "leave", "年假"] }
  ]
}
```

`match` is a case-insensitive JS regex. Invalid bags are skipped at load time.

## Hybrid retrieval

1. Vector candidates: cosine distance on `chunks.embedding`
2. Keyword candidates: english `tsvector` **unless** the query is CJK-heavy (then FTS is skipped). CJK / fuzzy matches use `pg_trgm` `word_similarity` plus ILIKE bigrams.
3. Fusion: **RRF** by default (`score = w / (k + rank)` per list). Set `RETRIEVAL_FUSION=weighted` for the old min-max mix.

Knobs live in [`config/retrieval.json`](./config/retrieval.json).

## OpenAI or Vercel AI Gateway keys

**OpenAI**

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Set `OPENAI_API_KEY` in `.env.local`
3. Optionally set `CHAT_MODEL` / `EMBEDDING_MODEL`

**Vercel AI Gateway**

1. Enable AI Gateway in your Vercel team and create a key
2. Set `AI_GATEWAY_API_KEY` (and optionally `OPENAI_BASE_URL`)
3. Clients fall back to the gateway key when `OPENAI_API_KEY` is empty

Without keys, set `MOCK_CHAT=true` and `MOCK_EMBEDDINGS=true` for deterministic local answers.

## Deploy on Vercel (Neon / Supabase)

1. Create a **pgvector-enabled** Postgres database:
   - [Neon](https://neon.tech): enable the `vector` and `pg_trgm` extensions (or run `pnpm db:migrate`)
   - [Supabase](https://supabase.com): `create extension if not exists vector; create extension if not exists pg_trgm;`
2. Set `DATABASE_URL` (pooled URL for the app; direct URL for migrations if needed)
3. Set `AUTH_SECRET`, `AUTH_URL` (production URL), and model keys
4. Run `pnpm db:migrate` against the remote DB
5. Deploy the Next.js app; set `STORAGE_DRIVER=s3` for multi-instance uploads
6. Production ingest (required — serverless has no long-lived `pnpm jobs:work`):
   - `INGEST_WORKER_INLINE=false`
   - `CRON_SECRET` (Vercel sends `Authorization: Bearer $CRON_SECRET`)
   - `DISABLE_REGISTER=true`
   - Keep [`vercel.json`](./vercel.json) cron: `GET /api/cron/ingest` every minute

> Disk uploads work for MVP / single-node. On Vercel, use S3-compatible object storage.
>
> Vercel Hobby only allows one cron per day. Pro (or a box running `pnpm jobs:work`) is required for timely processing.

### Production ingest checklist

| Must set | Why |
|----------|-----|
| `STORAGE_DRIVER=s3` + bucket creds | Vercel filesystem is ephemeral |
| `INGEST_WORKER_INLINE=false` | Do not embed inside the upload/process request |
| `CRON_SECRET` | Protects `/api/cron/ingest` and `POST /api/ingest { "drain": true }` |
| `DISABLE_REGISTER=true` | Block public sign-up |
| `SEARCH_KNOWLEDGE_ALLOW_ALL=false` | No implicit all-KB service reads |

Manual drain (same secret):

```bash
curl -sS -X POST https://<host>/api/ingest \
  -H "authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"drain":true,"limit":3}'
```

Self-hosted alternative: `INGEST_WORKER_INLINE=false` and run `pnpm jobs:work` (or `pnpm jobs:work:once` from system cron).

Stale `running` jobs (serverless timeout / crashed worker) are re-queued after `INGEST_LOCK_TTL_MS` (default 3 minutes). Documents stuck in `processing` go back to `queued`.

## Architecture (dirs)

```text
src/app/(auth)/login          Login / register
src/app/(app)/knowledge-bases KB list, create, detail
src/app/(app)/chat            Multi-KB RAG chat + citations
src/app/api/                  REST + streaming chat + SearchKnowledge
src/app/api/cron/ingest       Vercel Cron drain worker
src/lib/auth                  Auth.js + ACL helpers
src/lib/db                    Drizzle schema + client
src/lib/i18n                  UI chrome strings (zh / en)
src/lib/rag                   Parse, chunk, embed, retrieve, SearchKnowledge
src/lib/storage               local / S3 object store
src/lib/jobs                  ingest job queue + cron auth
config/                       synonym bags + eval fixtures
samples/                      Sample docs for testing
```

## UI language (zh / en)

Chrome (nav, forms, buttons, statuses, toasts) is localized with a small dictionary + React context. Preference is stored in the `atlas-locale` cookie (and localStorage), default **zh**. Uploaded documents and RAG model answers are **not** translated.

To add a string:

1. Add the same key under both `en` and `zh` in [`src/lib/i18n/messages.ts`](./src/lib/i18n/messages.ts)
2. In a client component: `const { t } = useI18n()` then `{t("section.key")}`
3. Interpolate with `{name}` placeholders, e.g. `t("docs.chunks", { count: 12 })`

## ACL before retrieve

Chat and ingest **filter permitted knowledge-base IDs before retrieval**. Never retrieve-then-filter — that can leak snippets across tenants. Membership roles (`read` / `manage`) gate upload, process, member admin, and delete.

## Service SearchKnowledge

Read-only retrieval API for other services. Callers must treat returned snippets as **context only** — do not invent procedures, field values, ticket IDs, or database writes that are not in the snippets.

Resolution order for which KBs are searched:

1. Request `knowledgeBaseIds` ∩ `SEARCH_KNOWLEDGE_KB_IDS` (if the allowlist is set)
2. Else the allowlist itself
3. Else the KB named `SEARCH_KNOWLEDGE_DEFAULT_KB_NAME` (default `Internal Docs`)
4. Else every KB **only if** `SEARCH_KNOWLEDGE_ALLOW_ALL=true`

### Call

```bash
curl -sS -X POST http://localhost:43123/api/search-knowledge \
  -H "content-type: application/json" \
  -H "x-api-key: $SEARCH_KNOWLEDGE_API_KEY" \
  -d '{"query":"How many PTO days?","topK":8}'
```

`GET /api/search-knowledge?query=...&topK=8&docTypes=flow,faq&knowledgeBaseIds=<uuid>` is also supported.

| Field | Notes |
|-------|--------|
| `query` | Required |
| `topK` | Optional, 1–50 (default 8) |
| `docTypes` | Optional `flow` \| `rule` \| `faq`. Untagged chunks stay eligible |
| `knowledgeBaseIds` | Optional; constrained by the allowlist above |

Response: `{ "items": [{ "title", "snippet", "sourcePath", "score", "docType"? }] }`.

Auth: header `x-api-key` must match `SEARCH_KNOWLEDGE_API_KEY`. If the env is unset, production returns 503; development allows **localhost only** and logs a warning.

This route does **not** stream chat or call the LLM. Existing `/api/chat` RAG is unchanged.

### Chunking defaults

See [`src/lib/rag/chunk-config.ts`](./src/lib/rag/chunk-config.ts):

- Target window **400–800 tokens**, overlap **~100**
- Prefer markdown headings; for `docType=flow`, also split on `步骤` / `Step N` / numbered steps
- Chunk metadata: `docType`, `sourcePath`, `title` (inferred from path/filename or upload form fields `docType` / `sourcePath`)

## Sample document

Upload [`samples/employee-handbook.md`](./samples/employee-handbook.md) (bilingual PTO policy), click **Process**, then ask in Chat e.g. “How many PTO days?” / “病假有几天？”

```bash
pnpm eval:retrieval
```

## TODOs

- [ ] **SSO / OIDC** — Okta, Azure AD / Entra, Google Workspace; map groups → `kb_members` roles; set `DISABLE_REGISTER=true`
- [ ] **Connectors** — Notion / 飞书 / Confluence sync into knowledge bases
