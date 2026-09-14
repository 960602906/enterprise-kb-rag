# Contributing

## Setup

```bash
pnpm install
cp .env.example .env.local
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

App: http://localhost:43123 — Postgres: localhost:5433.

## Checks before a PR

```bash
pnpm lint
pnpm typecheck
```

Retrieval regression (needs a seeded DB + ingested sample handbook):

```bash
pnpm eval:retrieval
```

## Scope

- Keep product names and tenant corpora out of `src/`. Put them in `config/` or `config/examples/`.
- Filter knowledge-base IDs **before** retrieval. Do not retrieve-then-filter.
- Prefer env / JSON config over new hard-coded weights or synonym bags.
