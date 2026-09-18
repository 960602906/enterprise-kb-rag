# Contributing

Thanks for helping improve Atlas KB (self-hosted enterprise KB RAG).

## Setup

```bash
pnpm install
cp .env.example .env.local
# set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

App: http://localhost:43123 — Postgres (Compose): localhost:5433.

For a first local smoke test without API keys you may set `MOCK_EMBEDDINGS=true` and `MOCK_CHAT=true`. Prefer real embeddings when changing retrieval behavior.

## Checks before a PR

```bash
pnpm lint
pnpm typecheck
pnpm eval:unit
pnpm eval:api-keys
```

### Retrieval golden path (needs seeded DB)

Same sequence as CI (`.github/workflows/ci.yml`):

```bash
pnpm db:migrate          # if schema changed
pnpm db:seed             # if DB is empty
pnpm eval:ingest-sample  # samples/employee-handbook.md → Employee Handbook KB
pnpm eval:retrieval      # config/eval-queries.json
```

Optional fixture override:

```bash
EVAL_QUERIES_PATH=config/examples/skyroc-eval-queries.json pnpm eval:retrieval
```

CI also runs unit evals without Postgres, then a Postgres service job for ingest + retrieval with mocks.

## Scope guidelines

- Keep product names and tenant corpora out of `src/`. Put them in `config/` or `config/examples/`.
- Filter knowledge-base IDs **before** retrieval. Do not retrieve-then-filter.
- Prefer env / JSON config over new hard-coded weights or synonym bags.
- Do not commit secrets, private IPs, or `.env.local`. Use placeholders in docs.
- This repo is **self-host open source** — avoid assuming a shared free SaaS or multi-tenant billing.

## PR tips

- Keep diffs focused; document env or migrate steps in the PR body when needed.
- If you touch SearchKnowledge or ACL, add/extend `pnpm eval:api-keys` / retrieval cases.
