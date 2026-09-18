# Deploy & Operations Guide

**English**（this page） · **中文** · [中文指南](./DEPLOY.md)

Step-by-step guide for beginners: deploy [Atlas KB](./README.md) (enterprise knowledge-base RAG) on your laptop or a VPS, then run day-to-day operations.

This project is **self-hosted open source**: you run the app and Postgres yourself and bring your own LLM / embedding keys. It is **not** a free public cloud SaaS.

> **Related docs**
>
> - Quick start: [README.md](./README.md)
> - Chinese deploy guide: [DEPLOY.md](./DEPLOY.md)
> - Env template: [`.env.example`](./.env.example)
> - Single-node helpers: [scripts/README-prod.md](./scripts/README-prod.md)
> - Security reporting: [SECURITY.md](./SECURITY.md)

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Local quick start](#2-local-quick-start)
3. [Single-machine / VPS production](#3-single-machine--vps-production)
4. [Chat vs embeddings](#4-chat-vs-embeddings)
5. [First login & daily ops](#5-first-login--daily-ops)
6. [SearchKnowledge API curl](#6-searchknowledge-api-curl)
7. [Common failures](#7-common-failures)
8. [Ops checklist](#8-ops-checklist)

---

## 1. Prerequisites

Install these on your machine or server first:

| Software | Suggested version | Notes |
|----------|-------------------|-------|
| **Node.js** | **22+** (matches CI) | [nodejs.org](https://nodejs.org/) |
| **pnpm** | **10.x** (see `package.json` → `packageManager`) | `corepack enable && corepack prepare pnpm@10.33.3 --activate` |
| **Docker** + Compose | Recent stable | One-command Postgres + pgvector |
| **Git** | Any recent version | Clone this repo |

Optional (production / tunnel):

| Software | Purpose |
|----------|---------|
| **SSH client** | `scripts/ensure-tunnel.sh` reverse tunnel |
| **Nginx / Caddy** etc. | Reverse proxy + HTTPS (advanced; see below) |

Sanity checks:

```bash
node -v          # should be >= v22
pnpm -v          # should show 10.x
docker --version
docker compose version
```

---

## 2. Local quick start

Copy and run these steps in order.

### 2.1 Clone and install

```bash
git clone https://github.com/960602906/enterprise-kb-rag.git
cd enterprise-kb-rag

pnpm install
cp .env.example .env.local
```

### 2.2 Edit `.env.local` (minimum required)

Open `.env.local` and set at least:

```bash
# Generate a secret (run in a terminal, paste the output into .env.local)
openssl rand -base64 32
```

```bash
# Change at least these in .env.local:
AUTH_SECRET=<random string from the step above>
AUTH_URL=http://localhost:43123
DATABASE_URL=postgresql://kb_rag:kb_rag@localhost:5433/kb_rag
```

For a local demo you can temporarily enable mocks (**demo only — retrieval quality is poor**):

```bash
MOCK_EMBEDDINGS=true
MOCK_CHAT=true
```

For real Q&A, configure API keys (see [section 4](#4-chat-vs-embeddings)) and keep `MOCK_*=false`.

### 2.3 Start Postgres + pgvector

```bash
docker compose up -d
docker compose ps
```

Expect container `atlas-kb-pg` to be **healthy**, port map **localhost:5433 → 5432**.

### 2.4 Migrate and seed

```bash
pnpm db:migrate
pnpm db:seed
```

- `db:migrate`: create tables, enable `vector` / `pg_trgm` and related extensions
- `db:seed`: create demo users and demo knowledge bases

Default seed accounts (**change passwords before any public exposure**):

| Role | Email | Password |
|------|-------|----------|
| Admin `manage` | `admin@example.com` | `admin123456` |
| Member `read` | `member@example.com` | `member123456` |

Override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` etc. (see `.env.example`).

### 2.5 Start the app

**Development mode:**

```bash
pnpm dev
```

**Or production-style:**

```bash
pnpm build
pnpm start
```

Open in a browser: <http://localhost:43123>

---

## 3. Single-machine / VPS production

Best for: **one Linux box** running this project long-term (self-hosted). No paid hosting platform is required.

> Optional: if you already have a pgvector-enabled hosted Postgres (e.g. Neon / Supabase), you can put only the database in the cloud and still run the app on your own machine. The primary path remains “your machine + Docker Compose”.

### 3.1 Prepare the server

1. Install Node 22+, pnpm, and Docker (same as section 1)
2. Clone the repo and run `pnpm install`
3. `cp .env.example .env.local` and fill in the checklist below

### 3.2 Production env checklist

In `.env.local`, set at least:

```bash
# --- Required ---
DATABASE_URL=postgresql://kb_rag:kb_rag@localhost:5433/kb_rag
AUTH_SECRET=<output of openssl rand -base64 32>
AUTH_URL=https://kb.example.com          # your public Origin (include scheme)

# --- Security ---
DISABLE_REGISTER=true
SEARCH_KNOWLEDGE_ALLOW_ALL=false
SEED_ADMIN_PASSWORD=<strong password>   # if you still seed, replace the default

# --- Models (real RAG; do not use MOCK_*) ---
OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=                       # set only for DeepSeek / compatible gateways
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
MOCK_EMBEDDINGS=false
MOCK_CHAT=false

# --- Ingest queue (turn off inline in production) ---
INGEST_WORKER_INLINE=false
# CRON_SECRET=<random string>            # if using HTTP drain / Vercel Cron

# --- Uploads (local disk is fine on a single node) ---
STORAGE_DRIVER=local
UPLOAD_DIR=./uploads
```

Why these matter:

| Setting | Reason |
|---------|--------|
| `DISABLE_REGISTER=true` | Close public sign-up |
| `INGEST_WORKER_INLINE=false` | Do not embed inside the upload/process request (avoids timeouts) |
| `MOCK_*=false` | Mocks are for smoke tests only, not production retrieval |
| `AUTH_URL` | Must match the Origin users type in the browser |

### 3.3 Database, migrate, build, start

```bash
# 1) Database
docker compose up -d

# 2) Migrate + (optional) seed
pnpm db:migrate
pnpm db:seed          # first time only; later change passwords in the UI — do not re-seed weak defaults

# 3) Build and start in the foreground (for debugging)
pnpm build
pnpm start            # listens on 43123 by default
```

Or use the repo’s single-node helper (background `next start`, logs under `/tmp`):

```bash
./scripts/run-prod.sh
# log: /tmp/atlas-kb-prod.log
# PID:  /tmp/atlas-kb-prod.pid
```

See [scripts/README-prod.md](./scripts/README-prod.md).

### 3.4 Start the ingest worker (required in production)

When `INGEST_WORKER_INLINE=false`, documents enter a queue and something must drain it:

**Option A — long-running worker (recommended for self-host):**

```bash
# separate terminal / systemd unit
pnpm jobs:work
```

One-shot drain (fine for system cron):

```bash
pnpm jobs:work:once
```

**Option B — inline processing (small traffic / local debug only):**

```bash
# .env.local
INGEST_WORKER_INLINE=true
# or leave unset (dev defaults toward inline)
```

**Option C — HTTP drain (optional):**

```bash
curl -sS -X POST "https://kb.example.com/api/ingest" \
  -H "authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"drain":true,"limit":3}'
```

(If you deploy on Vercel or similar serverless, use the Cron in `vercel.json` hitting `/api/cron/ingest`. For self-host, prefer option A.)

### 3.5 Reverse proxy and HTTPS (advanced overview)

The app listens on **43123** by default. For public access:

1. Put **Nginx / Caddy / Traefik** in front so `443` proxies to `127.0.0.1:43123`
2. Issue a certificate (e.g. Let’s Encrypt)
3. Set `AUTH_URL` to `https://your-domain`
4. Open only `80/443` (and SSH) on the firewall — do **not** expose the database port to the internet

Example Nginx shape (adjust paths for your distro):

```nginx
server {
  listen 443 ssl http2;
  server_name kb.example.com;

  # ssl_certificate     ...;
  # ssl_certificate_key ...;

  location / {
    proxy_pass http://127.0.0.1:43123;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

This repo is **not** tied to a specific cloud vendor; configure certificates and DNS for your environment.

### 3.6 Optional: SSH reverse tunnel

If the app runs on an internal machine and you need to expose it through **your own** public jump host:

```bash
export ATLAS_KB_REMOTE_HOST=your.public.host   # required: your jump hostname or IP (never commit it)
export ATLAS_KB_REMOTE_USER=root                 # optional, default root
export ATLAS_KB_PORT=43123                       # optional

./scripts/ensure-tunnel.sh
# or keep it alive:
./scripts/ensure-tunnel.sh --loop
```

Behavior: on the jump host, bind `0.0.0.0:43123` back to local `127.0.0.1:43123`.

Health check:

```bash
ATLAS_KB_REMOTE_HOST=your.public.host ./scripts/prod-status.sh
```

**Notes:**

- You **must** set `ATLAS_KB_REMOTE_HOST` — scripts have **no** default public IP
- Never commit real hostnames, private keys, or passwords to Git
- A tunnel is only connectivity; production still benefits from HTTPS in front of the jump host

---

## 4. Chat vs embeddings

Both capabilities talk to an **OpenAI-compatible** HTTP API, but they do different jobs:

| Capability | Env vars | Purpose |
|------------|----------|---------|
| **Chat** | `OPENAI_API_KEY` + `CHAT_MODEL` (+ optional `OPENAI_BASE_URL`) | Streaming Q&A |
| **Embeddings** | Same key stack + `EMBEDDING_MODEL` | Document ingest vectors + retrieval |

### 4.1 OpenAI (chat + embeddings from one vendor)

```bash
OPENAI_API_KEY=sk-...
# Do not set OPENAI_BASE_URL to an empty string
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
MOCK_EMBEDDINGS=false
MOCK_CHAT=false
```

Embedding dimensions must match the schema (currently **1536**, matching `text-embedding-3-small`).

### 4.2 DeepSeek and other compatible gateways (often chat-only)

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.deepseek.com/v1   # example — follow vendor docs
CHAT_MODEL=deepseek-chat
```

If that vendor has **no** embeddings API:

- Use DeepSeek (or similar) for chat;
- Still need a compatible endpoint that can serve `text-embedding-3-small` (or the same dimension) — e.g. OpenAI / AI Gateway;
- Or temporarily set `MOCK_EMBEDDINGS=true` for **demo only** (poor retrieval; do not ship).

The current implementation calls chat and embeddings through the **same** `OPENAI_API_KEY` / `OPENAI_BASE_URL`. If chat and embeddings must use different base URLs, pick a gateway that exposes both, or temporarily mock embeddings (local smoke only).

### 4.3 Mock (demo only)

```bash
MOCK_EMBEDDINGS=true
MOCK_CHAT=true
```

- No API spend
- Answers and retrieval are **much weaker** than real vectors
- Fine for CI / local smoke; **turn off for production and real evals**

---

## 5. First login & daily ops

### 5.1 Sign in

1. Open `AUTH_URL` (locally usually <http://localhost:43123>)
2. Use the seed admin: `admin@example.com` / `admin123456` (or your `SEED_*` values)
3. **Change the password immediately** (or delete the weak account and create a new admin). Never expose default passwords on the public internet.

In production, confirm `DISABLE_REGISTER=true`.

### 5.2 Create a knowledge base

1. Go to **Knowledge bases**
2. Create a KB and note its name and UUID (needed when binding API keys)

### 5.3 Upload and process documents

1. Open the KB detail page → upload PDF / Markdown / TXT / DOCX  
   (sample: [`samples/employee-handbook.md`](./samples/employee-handbook.md))
2. Click **Process**
3. Status should become `ready` (if stuck at `queued` / `processing`, see [section 7](#7-common-failures))
4. In **Chat**, select that KB and ask e.g. “How many PTO days?” / “病假有几天？”

### 5.4 Create an API key (for external retrieval)

1. Sign in as a user with **manage** on the target knowledge base(s)
2. Open **Settings → API keys** at **`/settings/api-keys`**
3. Create a key → bind KB UUID(s) → plaintext is shown **once** — store it in a secrets manager immediately
4. The page includes a beginner **How to use** guide; examples use the relative path `/api/search-knowledge`

Prefer UI multi-keys. The legacy `SEARCH_KNOWLEDGE_API_KEY` env var is compatibility-only.

---

## 6. SearchKnowledge API curl

Replace `{BASE}` with your Origin (local example: `http://localhost:43123`). **Never** paste real secrets into docs or issues.

```bash
export BASE="http://localhost:43123"
export ATLAS_SEARCH_API_KEY="your-secret"   # from /settings/api-keys

curl -sS -X POST "${BASE}/api/search-knowledge" \
  -H "content-type: application/json" \
  -H "x-api-key: ${ATLAS_SEARCH_API_KEY}" \
  -d '{"query":"How many PTO days?","topK":8,"knowledgeBaseIds":["<kb-uuid>"]}'
```

Relative path (stable form for integrators):

```text
POST {BASE}/api/search-knowledge
Header: x-api-key: <secret>
Body: { "query": "...", "topK": 8, "knowledgeBaseIds": ["<uuid>"] }
```

Successful response shape: `{ "items": [{ "title", "snippet", "sourcePath", "score", ... }] }`.  
This route **only retrieves** — it does **not** call the chat LLM.

Common HTTP statuses:

| Status | Meaning |
|--------|---------|
| **401** | Missing / unknown / disabled key |
| **403** | Key has no KB bindings, or requested unbound `knowledgeBaseIds` |
| **200** | OK (`items` may be empty = no hits) |

---

## 7. Common failures

### 7.1 Documents stay `queued` / `pending` and never become `ready`

**Likely causes**

1. Production set `INGEST_WORKER_INLINE=false` but no worker is running  
2. Worker / Cron is down, or `CRON_SECRET` does not match  
3. Embedding API errors (key, base URL, model name)  
4. Job stuck in `running` (crashed process) — re-queued after about `INGEST_LOCK_TTL_MS=180000` (3 minutes) by default

**What to do**

```bash
# 1) Confirm a worker is running
pnpm jobs:work

# or one-shot drain
pnpm jobs:work:once

# 2) Check app / worker logs for embed / OpenAI errors

# 3) Confirm you did not leave MOCK / empty-key combos in a bad state
grep -E 'MOCK_|OPENAI_|INGEST_' .env.local
```

### 7.2 SearchKnowledge returns 401 / 403

| Status | Check |
|--------|-------|
| **401** | Is `x-api-key` correct? Disabled / rotated? Using an expired plaintext secret? |
| **403** | Does the UI binding include the target KB? Are all requested `knowledgeBaseIds` in the bind list? Keys with zero bindings always 403 |

After creating a key, self-test with the curl in section 6. Keep `SEARCH_KNOWLEDGE_ALLOW_ALL=false`.

### 7.3 Startup errors about migrate / missing tables

```bash
pnpm db:migrate
# if the DB is empty, then:
pnpm db:seed
```

Confirm `DATABASE_URL` points at the running Postgres (Compose default port is **5433**, not 5432).

### 7.4 `docker compose` will not start / cannot connect

```bash
docker compose ps
docker compose logs postgres --tail=80
# confirm DATABASE_URL uses port 5433
```

### 7.5 SSH reverse tunnel is down

```bash
# jump host is required
export ATLAS_KB_REMOTE_HOST=your.public.host

./scripts/ensure-tunnel.sh
./scripts/prod-status.sh
```

Check:

1. Can this machine `ssh ${ATLAS_KB_REMOTE_USER}@${ATLAS_KB_REMOTE_HOST}` (key auth, `BatchMode`)?
2. Is the app listening on `127.0.0.1:43123` (`./scripts/run-prod.sh` or `pnpm start`)?
3. Does the jump host firewall allow the port?
4. Logs: `/tmp/atlas-kb-tunnel.log`

### 7.6 Login loops / cookie issues

- Does `AUTH_URL` match the browser Origin **exactly** (`http` vs `https`, host, port)?
- Do not run `pnpm dev` as a long-lived public production server

### 7.7 Chat has no stream / answers look made up

- Is `MOCK_CHAT=true` still on?
- Do `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `CHAT_MODEL` match vendor docs?
- Are documents `ready`, and is the matching KB selected on the Chat page?

---

## 8. Ops checklist

### Daily

- [ ] Postgres is up (`docker compose ps` or system service)
- [ ] App is up (`pnpm start` or `./scripts/run-prod.sh`)
- [ ] If `INGEST_WORKER_INLINE=false`: `pnpm jobs:work` is running
- [ ] Optional tunnel: `ATLAS_KB_REMOTE_HOST=... ./scripts/ensure-tunnel.sh`

### Shipping a new version

```bash
git pull
pnpm install
pnpm db:migrate          # required when schema changed
pnpm build
# restart next start / run-prod.sh
# restart jobs:work if used
```

### Security baseline

- [ ] Strong `AUTH_SECRET`
- [ ] Default seed passwords changed
- [ ] `DISABLE_REGISTER=true` (when you do not need public sign-up)
- [ ] `SEARCH_KNOWLEDGE_ALLOW_ALL=false`
- [ ] Never commit `.env.local`
- [ ] Never paste real IPs, hostnames, or secrets into README / issues / PRs

### After reboot

1. `docker compose up -d` (or start system Postgres)
2. `./scripts/run-prod.sh` or `pnpm start`
3. `pnpm jobs:work` (if using queue mode)
4. If needed: `ATLAS_KB_REMOTE_HOST=... ./scripts/ensure-tunnel.sh`
5. `./scripts/prod-status.sh` (optional health check)

---

## Appendix: command cheat sheet

| Command | Purpose |
|---------|---------|
| `docker compose up -d` | Start Postgres + pgvector |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:seed` | Seed demo users / KBs |
| `pnpm dev` | Dev server on `:43123` |
| `pnpm build && pnpm start` | Production build + start |
| `pnpm jobs:work` | Long-running ingest worker |
| `pnpm jobs:work:once` | One-shot queue drain |
| `./scripts/run-prod.sh` | Single-node build + background start |
| `./scripts/ensure-tunnel.sh` | SSH reverse tunnel (needs `ATLAS_KB_REMOTE_HOST`) |
| `./scripts/prod-status.sh` | Health checks |

More product detail and API ACL rules: [README.md](./README.md).  
中文版：[DEPLOY.md](./DEPLOY.md).
