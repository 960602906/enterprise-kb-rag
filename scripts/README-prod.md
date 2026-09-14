# Atlas KB — production on this box

Public origin: `http://115.190.128.7:43123`  
Local bind: `127.0.0.1:43123` only. The public host reverse-forwards; do not expose `:43123` on other box interfaces.

Postgres is **system postgresql 18** on `127.0.0.1:5432` (database `kb_rag`). Not Docker. Leave `MOCK_EMBEDDINGS=true` and `MOCK_CHAT=true`.

## Commands

```bash
cd /workspace/enterprise-kb-rag
./scripts/run-prod.sh          # load .env.local, pnpm build, pnpm/next start
./scripts/ensure-tunnel.sh     # start SSH -R if down (or restart if stale)
./scripts/prod-status.sh       # postgres / next / tunnel / SearchKnowledge
```

- Prod log / pid: `/tmp/atlas-kb-prod.log`  `/tmp/atlas-kb-prod.pid`
- Tunnel log / pid: `/tmp/atlas-kb-tunnel.log`  `/tmp/atlas-kb-tunnel.pid`

`ensure-tunnel.sh --loop` retries every 30s (optional long-running supervisor).

## After box reboot

1. Start postgres if needed: `sudo pg_ctlcluster 18 main start`
2. `./scripts/run-prod.sh`
3. `./scripts/ensure-tunnel.sh`
4. `./scripts/prod-status.sh`

## Cron / @every (optional)

Re-check the reverse tunnel every minute (safe if already up):

```cron
* * * * * /workspace/enterprise-kb-rag/scripts/ensure-tunnel.sh >> /tmp/atlas-kb-tunnel.cron.log 2>&1
```

Equivalent systemd-timer / watch pattern: `@every 1m` → `ensure-tunnel.sh`.

Do **not** run `pnpm dev` on port 43123 while production is up. Do not kill skyroc `pnpm` / vite.
