# Atlas KB — self-hosted production helpers

Optional scripts for running a single-node production process on your own machine
or VPS. They are **not** required for the Docker Compose + `pnpm` quick start.

For the full beginner deploy & ops guide (Chinese-first), see **[DEPLOY.md](../DEPLOY.md)**.

## Environment

| Variable | Purpose |
|----------|---------|
| `ATLAS_KB_REMOTE_HOST` | Public host for reverse-tunnel helpers (required for tunnel scripts) |
| `ATLAS_KB_REMOTE_USER` | SSH user (default `root`) |
| `ATLAS_KB_PORT` | App port (default `43123`) |
| `ATLAS_KB_HOST` | Bind address for `next start` (default `127.0.0.1`) |

Do **not** commit real hosts, passwords, or API keys. Copy `.env.example` → `.env.local`.

## Commands

```bash
# from the repo root
./scripts/run-prod.sh          # load .env.local, pnpm build, next start
./scripts/ensure-tunnel.sh     # SSH -R reverse tunnel (needs ATLAS_KB_REMOTE_HOST)
./scripts/prod-status.sh       # postgres / next / tunnel / SearchKnowledge checks
```

- Prod log / pid: `/tmp/atlas-kb-prod.log`  `/tmp/atlas-kb-prod.pid`
- Tunnel log / pid: `/tmp/atlas-kb-tunnel.log`  `/tmp/atlas-kb-tunnel.pid`

`ensure-tunnel.sh --loop` retries every 30s (optional supervisor).

## Typical flow after reboot

1. Start Postgres (Docker Compose or your system service)
2. `./scripts/run-prod.sh`
3. Optionally `ATLAS_KB_REMOTE_HOST=your.public.host ./scripts/ensure-tunnel.sh`
4. `./scripts/prod-status.sh`

## Notes

- Prefer `INGEST_WORKER_INLINE=false` plus `pnpm jobs:work` (or Cron) in production.
- Do **not** run `pnpm dev` on the same port while production is up.
- Change seed passwords before exposing any public URL; set `DISABLE_REGISTER=true`.
