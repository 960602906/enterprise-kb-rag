#!/usr/bin/env bash
# Print postgres / next start / optional tunnel / SearchKnowledge status.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="${ATLAS_KB_PROD_PID:-/tmp/atlas-kb-prod.pid}"
TUNNEL_PIDFILE="${ATLAS_KB_TUNNEL_PID:-/tmp/atlas-kb-tunnel.pid}"
PORT="${ATLAS_KB_PORT:-43123}"
REMOTE_HOST="${ATLAS_KB_REMOTE_HOST:-}"
REMOTE_USER="${ATLAS_KB_REMOTE_USER:-root}"
API_KEY=""
if [[ -f "${ROOT}/.env.local" ]]; then
  # shellcheck disable=SC1091
  API_KEY="$(set -a; source "${ROOT}/.env.local" >/dev/null 2>&1; printf '%s' "${SEARCH_KNOWLEDGE_API_KEY:-}")"
fi

ok() { printf '  %-22s OK    %s\n' "$1" "$2"; }
bad() { printf '  %-22s FAIL  %s\n' "$1" "$2"; }
note() { printf '  %-22s ----  %s\n' "$1" "$2"; }
skip() { printf '  %-22s SKIP  %s\n' "$1" "$2"; }

echo "Atlas KB production status $(date -Is)"
echo

# --- postgres (Docker Compose uses 5433; system installs often use 5432) ---
if pg_isready -h 127.0.0.1 -p 5433 >/dev/null 2>&1; then
  ok postgres "127.0.0.1:5433 accepting (docker-compose default)"
elif pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  ok postgres "127.0.0.1:5432 accepting"
else
  bad postgres "neither 127.0.0.1:5433 nor :5432 is ready"
fi

# --- next start ---
prod_pid=""
[[ -f "$PIDFILE" ]] && prod_pid="$(tr -d '[:space:]' < "$PIDFILE")"
listener="$(ss -tlnp 2>/dev/null | grep -E ":${PORT}\\b" | head -1 || true)"
next_cmd="$(pgrep -a -f 'next start --hostname|next start --port' 2>/dev/null | grep enterprise-kb-rag | head -1 || pgrep -a 'next start' 2>/dev/null | head -1 || true)"
dev_cmd="$(pgrep -af 'next dev --port 43123' || true)"

if [[ -n "$dev_cmd" ]]; then
  bad "next start" "next DEV still running: ${dev_cmd}"
elif curl -sf -o /dev/null --max-time 5 "http://127.0.0.1:${PORT}/login"; then
  code="$(curl -sS -o /dev/null --max-time 5 -w '%{http_code}' "http://127.0.0.1:${PORT}/login")"
  ok "next start" "http://127.0.0.1:${PORT}/login -> ${code}  pidfile=${prod_pid:-none}  ${listener}"
else
  bad "next start" "local /login not 200  pidfile=${prod_pid:-none}  listen=${listener:-none}"
fi

# --- tunnel / public (optional) ---
if [[ -z "$REMOTE_HOST" ]]; then
  skip tunnel "set ATLAS_KB_REMOTE_HOST to enable"
  skip "public /login" "set ATLAS_KB_REMOTE_HOST to enable"
else
  tun_pids="$(pgrep -f "^ssh -N .* -R 0.0.0.0:${PORT}:127.0.0.1:${PORT} ${REMOTE_USER}@${REMOTE_HOST}" || true)"
  if [[ -n "$tun_pids" ]]; then
    if ssh -o BatchMode=yes -o ConnectTimeout=8 "${REMOTE_USER}@${REMOTE_HOST}" \
        "timeout 3 bash -c 'echo >/dev/tcp/127.0.0.1/${PORT}'" >/dev/null 2>&1; then
      ok tunnel "ssh pids=${tun_pids}  remote TCP ${REMOTE_HOST}:${PORT} forwarding"
    else
      bad tunnel "ssh pids=${tun_pids} but remote TCP check failed (stale?)"
    fi
  else
    bad tunnel "no reverse ssh -R process"
  fi

  pub_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "http://${REMOTE_HOST}:${PORT}/login" || echo 000)"
  if [[ "$pub_code" == "200" ]]; then
    ok "public /login" "http://${REMOTE_HOST}:${PORT}/login -> ${pub_code}"
  else
    bad "public /login" "http://${REMOTE_HOST}:${PORT}/login -> ${pub_code}"
  fi
fi

# --- SearchKnowledge (local preferred; public if REMOTE_HOST set) ---
if [[ -z "$API_KEY" ]]; then
  skip SearchKnowledge "set SEARCH_KNOWLEDGE_API_KEY in .env.local (or use Settings → API keys)"
else
  sk_host="127.0.0.1"
  [[ -n "$REMOTE_HOST" ]] && sk_host="$REMOTE_HOST"
  tmp="$(mktemp)"
  sk_code="$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 30 \
    -X POST "http://${sk_host}:${PORT}/api/search-knowledge" \
    -H "content-type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -d '{"query":"How many PTO days?","topK":5}' || echo 000)"
  items="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d.get('items') or []))" "$tmp" 2>/dev/null || echo err)"
  if [[ "$sk_code" == "200" && "$items" != "err" && "$items" -gt 0 ]]; then
    ok SearchKnowledge "POST ${sk_host} -> ${sk_code} items=${items}"
  else
    bad SearchKnowledge "POST ${sk_host} -> ${sk_code} items=${items} body=$(head -c 240 "$tmp")"
  fi
  rm -f "$tmp"
fi

echo
note restart "scripts/run-prod.sh && ATLAS_KB_REMOTE_HOST=... scripts/ensure-tunnel.sh"
note logs "prod=/tmp/atlas-kb-prod.log  tunnel=/tmp/atlas-kb-tunnel.log"
note pidfiles "prod=${PIDFILE}  tunnel=${TUNNEL_PIDFILE}"
