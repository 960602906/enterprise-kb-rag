# Atlas KB — Enterprise Knowledge Base RAG

**Self-hosted open source** enterprise knowledge-base Q&A (RAG).  
企业知识库问答（RAG）**开源自托管**项目。

> **Not a free public cloud SaaS / 不是免费公有云服务**  
> You clone this repo, bring your own Postgres, LLM/embedding keys, and host.  
> 请自行部署；需自备数据库与模型密钥。维护者不提供对外免费托管。

Stack: **Next.js App Router**, **Tailwind v4**, **shadcn/ui**, **Auth.js (next-auth v5)**, **Drizzle + pgvector**, **Vercel AI SDK**.

---

## What you get / 功能概览

| Area | What you get |
|------|----------------|
| Auth | Email/password login & register (disable register in production) |
| Knowledge bases | Create, list, detail, delete (`manage` role) |
| Documents | Upload PDF / Markdown / TXT / DOCX → Process → `ready` |
| Members | Add by email with `read` or `manage` |
| Chat | Multi-KB select, streaming answers, citation side panel |
| SearchKnowledge | Read-only retrieval API for other services (`x-api-key`) |

**Core flow:** Create KB → Upload docs → Process → Chat with citations.

Hybrid retrieval combines **vector** (embeddings) + **keyword** (FTS / `pg_trgm` for CJK), fused with **RRF** by default. Mock embeddings are for demo only — use real embeddings for quality.

---

## Quick start / 快速开始

Prerequisites: **Node.js 22+**, **pnpm**, **Docker** (for Postgres + pgvector).

```bash
# 1) Install
pnpm install
cp .env.example .env.local

# 2) Edit .env.local — at minimum set AUTH_SECRET
#    openssl rand -base64 32

# 3) Postgres + pgvector
docker compose up -d

# 4) Schema + demo data
pnpm db:migrate
pnpm db:seed

# 5) Run (pick one)
pnpm dev                          # development — http://localhost:43123
# or production-style:
# pnpm build && pnpm start
```

Open [http://localhost:43123](http://localhost:43123).

Default seed users (**change before any public exposure** / 上线前务必修改):

| Role | Email | Password |
|------|-------|----------|
| Admin (`manage`) | `admin@example.com` | `admin123456` |
| Member (`read`) | `member@example.com` | `member123456` |

Seed also creates **Employee Handbook** (demo) and **Internal Docs** (default SearchKnowledge target). Override with `SEED_*` / `SEARCH_KNOWLEDGE_DEFAULT_KB_NAME`.

`pnpm db:migrate` enables `vector`, `pg_trgm`, and related indexes.

---

## 部署与运维 / Deploy & operations

完整、可复制的逐步说明（本机 / 单机 VPS、Worker、HTTPS 概要、SSH 隧道、首次登录、常见故障）：

| Language | Guide |
|----------|--------|
| **中文部署文档** | **[DEPLOY.md](./DEPLOY.md)** |
| **English deploy guide** | **[DEPLOY.en.md](./DEPLOY.en.md)** |

两份文档章节与步骤一一对应；文首互相链到 **English / 中文**。

| 场景 / Topic | 中文 | English |
|--------------|------|---------|
| 本机 Compose + migrate + seed + `pnpm dev` | [§2](./DEPLOY.md#2-本机快速启动) | [§2](./DEPLOY.en.md#2-local-quick-start) |
| VPS：`pnpm build && pnpm start` + `pnpm jobs:work` | [§3](./DEPLOY.md#3-单机--vps-生产部署) | [§3](./DEPLOY.en.md#3-single-machine--vps-production) |
| Chat vs embeddings / DeepSeek / `MOCK_*` | [§4](./DEPLOY.md#4-对话模型-vs-向量模型) | [§4](./DEPLOY.en.md#4-chat-vs-embeddings) |
| 首次登录、建库、上传、`/settings/api-keys` | [§5](./DEPLOY.md#5-首次登录与日常操作) | [§5](./DEPLOY.en.md#5-first-login--daily-ops) |
| SearchKnowledge curl（`/api/search-knowledge`） | [§6](./DEPLOY.md#6-searchknowledge-调用示例) | [§6](./DEPLOY.en.md#6-searchknowledge-api-curl) |
| 队列卡住、401/403、migrate、隧道断开 | [§7](./DEPLOY.md#7-常见故障) | [§7](./DEPLOY.en.md#7-common-failures) |
| 单机脚本 `run-prod.sh` / `ensure-tunnel.sh` | [scripts/README-prod.md](./scripts/README-prod.md) | same |

本项目是**开源自托管**软件：请自备机器、Postgres 与模型密钥。维护者不提供对外免费托管。  
Self-hosted open source — bring your own host, database, and API keys. Not a free public SaaS.

---

## Environment variables / 环境变量

Full commented list: [`.env.example`](./.env.example). Never commit `.env.local`.

### Required / 必填

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (Compose default below) |
| `AUTH_SECRET` | Auth.js secret (`openssl rand -base64 32`) |
| `AUTH_URL` | App origin, e.g. `http://localhost:43123` |

Compose default DB:

```text
DATABASE_URL=postgresql://kb_rag:kb_rag@localhost:5433/kb_rag
```

### AI keys — required for real chat / embeddings / 真实模型

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Chat + embeddings (OpenAI or compatible) |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible gateway (e.g. DeepSeek) |
| `AI_GATEWAY_API_KEY` | Optional Vercel AI Gateway if `OPENAI_API_KEY` is empty |
| `CHAT_MODEL` | Default `gpt-4o-mini` |
| `EMBEDDING_MODEL` | Default `text-embedding-3-small` |

**OpenAI**

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Set `OPENAI_API_KEY` in `.env.local`

**DeepSeek / OpenAI-compatible**

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.deepseek.com/v1   # example — check vendor docs
CHAT_MODEL=deepseek-chat
```

Embeddings must hit a provider that exposes an embeddings API. If your chat vendor has no embeddings endpoint, keep a separate OpenAI/Gateway key for `EMBEDDING_MODEL`, or temporarily use mocks (demo only).

**Mock mode (demo only / 仅演示)**

```bash
MOCK_EMBEDDINGS=true
MOCK_CHAT=true
```

Deterministic local answers with **no API spend**. Retrieval quality will be weak — **recommend real embeddings** for anything beyond a smoke test.

### Optional / 可选

| Variable | Purpose |
|----------|---------|
| `DISABLE_REGISTER` | `true` blocks `/api/register` (recommended in production) |
| `STORAGE_DRIVER` | `local` (default) or `s3` |
| `UPLOAD_DIR` / `MAX_UPLOAD_BYTES` | Local upload storage |
| `INGEST_WORKER_INLINE` | `false` in production; use Cron or `pnpm jobs:work` |
| `CRON_SECRET` | Bearer for `/api/cron/ingest` and drain |
| `SEARCH_KNOWLEDGE_*` | Legacy env key for SearchKnowledge (prefer UI keys) |
| `SEARCH_KNOWLEDGE_ALLOW_ALL` | **Keep `false`** |
| `SEED_*` | Seed admin/member credentials |
| `ALLOWED_DEV_ORIGINS` | Comma-separated hosts for HMR behind a proxy |

---

## SearchKnowledge API / 外部检索接口

Read-only retrieval for other services. Callers must treat snippets as **context only**.

### Preferred: multi API keys in the UI

1. Sign in as a user who can **manage** the target knowledge base(s).
2. Open **[Settings → API keys](http://localhost:43123/settings/api-keys)** (`/settings/api-keys`).
3. Create a key, bind KB UUID(s), copy the secret **once**.
4. The page includes a beginner **How to use / 使用示范** guide with `{BASE}/api/search-knowledge` examples.

### Call example

```bash
curl -sS -X POST http://localhost:43123/api/search-knowledge \
  -H "content-type: application/json" \
  -H "x-api-key: $ATLAS_SEARCH_API_KEY" \
  -d '{"query":"How many PTO days?","topK":8,"knowledgeBaseIds":["<kb-uuid>"]}'
```

Legacy env key `SEARCH_KNOWLEDGE_API_KEY` still works. Keep `SEARCH_KNOWLEDGE_ALLOW_ALL=false`. DB-issued keys **never** use ALLOW_ALL.

Details (ACL, 403 rules, admin CRUD): see [Service SearchKnowledge](#service-searchknowledge) below.

---

## Production notes / 生产简要

逐步操作与故障排查请优先阅读 **[中文 DEPLOY.md](./DEPLOY.md)** 或 **[English DEPLOY.en.md](./DEPLOY.en.md)**。下面仅作速查：

| Topic | Guidance |
|-------|----------|
| Register | `DISABLE_REGISTER=true` |
| Secrets | Change seed passwords; never commit `.env.local` |
| ALLOW_ALL | Keep `SEARCH_KNOWLEDGE_ALLOW_ALL=false` |
| Ingest | `INGEST_WORKER_INLINE=false` + `pnpm jobs:work`（或 Cron） |
| Storage | Multi-instance / serverless → `STORAGE_DRIVER=s3` |
| Auth | Strong `AUTH_SECRET`; set `AUTH_URL` to your public origin |
| Tunnel | `ATLAS_KB_REMOTE_HOST=... ./scripts/ensure-tunnel.sh`（无默认公网 IP） |

**Ingest options:** (1) omit `INGEST_WORKER_INLINE` for inline/dev · (2) `pnpm jobs:work` · (3) optional `CRON_SECRET` + `/api/cron/ingest` / drain. Details: [中文 §3.4](./DEPLOY.md#34-启动入库-worker生产必做之一) · [EN §3.4](./DEPLOY.en.md#34-start-the-ingest-worker-required-in-production).

---

## Eval / reproducibility / 评测复现

After migrate + seed (CI uses the same flow):

```bash
# Unit checks (no DB)
pnpm eval:unit
pnpm eval:api-keys

# DB golden path (needs Postgres + seed)
pnpm eval:ingest-sample    # ingest samples/employee-handbook.md
pnpm eval:retrieval        # config/eval-queries.json

# Lint / types
pnpm lint
pnpm typecheck
```

Custom fixtures:

```bash
EVAL_QUERIES_PATH=config/examples/skyroc-eval-queries.json pnpm eval:retrieval
```

CI workflow: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — lint, typecheck, unit evals, then migrate → seed → ingest-sample → retrieval with `MOCK_EMBEDDINGS=true`.

---

## Docker Compose / 数据库

[`docker-compose.yml`](./docker-compose.yml) starts **Postgres 16 + pgvector** only (enough for newcomers):

```bash
docker compose up -d
docker compose ps   # healthy on localhost:5433
```

No full app image is required — run the Next.js app with `pnpm` on the host.

---

## Security defaults / 安全默认

- `SEARCH_KNOWLEDGE_ALLOW_ALL=false`
- `MOCK_*` default `false` in `.env.example` (enable only for local demo)
- Change `SEED_*` passwords before exposing the app
- Never commit API keys, `.env.local`, or private hosts
- Report vulnerabilities via [SECURITY.md](./SECURITY.md) — **do not** paste secrets in issues

---

## Architecture (dirs)

```text
src/app/(auth)/login          Login / register
src/app/(app)/knowledge-bases KB list, create, detail
src/app/(app)/chat            Multi-KB RAG chat + citations
src/app/(app)/settings        Settings + API keys UI
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

Chrome (nav, forms, buttons, statuses, toasts) is localized. Preference: `atlas-locale` cookie (default **zh**). Uploaded documents and model answers are **not** auto-translated.

Add strings in [`src/lib/i18n/messages.ts`](./src/lib/i18n/messages.ts) under both `en` and `zh`, then `const { t } = useI18n()`.

## ACL before retrieve

Chat and ingest **filter permitted knowledge-base IDs before retrieval**. Never retrieve-then-filter. Membership roles (`read` / `manage`) gate upload, process, member admin, and delete.

## Retrieval synonyms

Hybrid keyword retrieval expands queries from JSON bags:

- Default: [`config/retrieval-synonyms.json`](./config/retrieval-synonyms.json)
- Domain overlays: [`config/examples/`](./config/examples/)
- Knobs: [`config/retrieval.json`](./config/retrieval.json)

## Hybrid retrieval

1. Vector candidates: cosine distance on `chunks.embedding`
2. Keyword: english `tsvector` unless CJK-heavy (then FTS skipped); CJK / fuzzy via `pg_trgm`
3. Fusion: **RRF** by default; `RETRIEVAL_FUSION=weighted` for min-max mix

---

## Service SearchKnowledge

### Multi-tenant guarantees

| Guarantee | Behavior |
|-----------|----------|
| DB key ↔ KB bind | Reads are **only** the key’s bound `knowledgeBaseIds` |
| Foreign `knowledgeBaseIds` | **403** if any requested id is outside the bind |
| Unbound DB key | **403** — default-deny |
| Disabled / unknown key | **401** |
| `SEARCH_KNOWLEDGE_ALLOW_ALL` | **Never** for DB keys; legacy env path only; production also needs `SEARCH_KNOWLEDGE_ALLOW_ALL_IN_PRODUCTION=true` |

### Auth lookup order

1. **DB API key** (preferred) — Settings → API keys; hashed at rest (`API_KEY_PEPPER` or `AUTH_SECRET`)
2. **Legacy env key** — `SEARCH_KNOWLEDGE_API_KEY`
3. Missing key → **401** (development: localhost-only without key logs a warning)

### Admin API (session + manage)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/api-keys` | List keys (prefix only) |
| `POST` | `/api/api-keys` | Create; plaintext **once** |
| `PATCH` | `/api/api-keys/:id` | Update |
| `DELETE` | `/api/api-keys/:id` | Revoke |
| `POST` | `/api/api-keys/:id/rotate` | Rotate secret |

UI: `/settings/api-keys`.

Response shape: `{ "items": [{ "title", "snippet", "sourcePath", "score", "docType"? }] }`. This route does **not** call the LLM.

### Sample document

Upload [`samples/employee-handbook.md`](./samples/employee-handbook.md), click **Process**, ask “How many PTO days?” / “病假有几天？”

## Contributing / License

- [DEPLOY.md](./DEPLOY.md) — 中文部署与运维逐步指南
- [DEPLOY.en.md](./DEPLOY.en.md) — English deploy & operations guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) — PRs, lint, evals
- [SECURITY.md](./SECURITY.md) — vulnerability reporting
- [LICENSE](./LICENSE) — MIT

## Roadmap (optional)

- [ ] **SSO / OIDC** — Okta, Azure AD / Entra; map groups → roles; `DISABLE_REGISTER=true`
- [ ] **Connectors** — Notion / 飞书 / Confluence sync
