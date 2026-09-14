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
| `SEED_*` | Seed admin/member credentials |
| `DISABLE_REGISTER` | Block `/api/register` when `true` |

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
   - [Neon](https://neon.tech): enable the `vector` extension
   - [Supabase](https://supabase.com): `create extension if not exists vector;`
2. Set `DATABASE_URL` (pooled URL for the app; direct URL for migrations if needed)
3. Set `AUTH_SECRET`, `AUTH_URL` (production URL), and model keys
4. Run `pnpm db:migrate` against the remote DB
5. Deploy the Next.js app; replace local `UPLOAD_DIR` with object storage for multi-instance (see TODOs)

> Disk uploads work for MVP / single-node. On Vercel, use Blob/S3 for durable files.

## Architecture (dirs)

```text
src/app/(auth)/login          Login / register
src/app/(app)/knowledge-bases KB list, create, detail
src/app/(app)/chat            Multi-KB RAG chat + citations
src/app/api/                  REST + streaming chat
src/lib/auth                  Auth.js + ACL helpers
src/lib/db                    Drizzle schema + client
src/lib/i18n                  UI chrome strings (zh / en)
src/lib/rag                   Parse, chunk, embed, retrieve
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

## Sample document

Upload [`samples/employee-handbook.md`](./samples/employee-handbook.md) (bilingual PTO policy), click **Process**, then ask in Chat e.g. “How many PTO days?” / “病假有几天？”

## TODOs

- [ ] **SSO / OIDC** — Okta, Azure AD / Entra, Google Workspace; map groups → `kb_members` roles; set `DISABLE_REGISTER=true`
- [ ] **Connectors** — Notion / 飞书 / Confluence sync into knowledge bases
- [ ] **Object storage** — replace local `UPLOAD_DIR` for Vercel / multi-instance
- [ ] **Hardened ACL audits** — row-level checks on every chunk id returned to the client
