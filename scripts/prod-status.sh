#!/usr/bin/env bash
# Print postgres / next start / tunnel / public SearchKnowledge status.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="${ATLAS_KB_PROD_PID:-/tmp/atlas-kb-prod.pid}"
TUNNEL_PIDFILE="${ATLAS_KB_TUNNEL_PID:-/tmp/atlas-kb-tunnel.pid}"
PORT="${ATLAS_KB_PORT:-43123}"
REMOTE_HOST="${ATLAS_KB_REMOTE_HOST:-115.190.128.7}"
API_KEY="dev-skyroc-search-knowledge"
if [[ -f "${ROOT}/.env.local" ]]; then
  # shellcheck disable=SC1091
  API_KEY="$(set -a; source "${ROOT}/.env.local" >/dev/null 2>&1; printf '%s' "${SEARCH_KNOWLEDGE_API_KEY:-dev-skyroc-search-knowledge}")"
fi

ok() { printf '  %-22s OK    %s\n' "$1" "$2"; }
bad() { printf '  %-22s FAIL  %s\n' "$1" "$2"; }
note() { printf '  %-22s ----  %s\n' "$1" "$2"; }

echo "Atlas KB production status $(date -Is)"
echo

# --- postgres ---
if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  ok postgres "127.0.0.1:5432 accepting (kb_rag)"
else
  bad postgres "127.0.0.1:5432 not ready"
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
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PORT}/login")"
  ok "next start" "http://127.0.0.1:${PORT}/login -> ${code}  pidfile=${prod_pid:-none}  ${listener}"
else
  bad "next start" "local /login not 200  pidfile=${prod_pid:-none}  listen=${listener:-none}"
fi

# --- tunnel ---
tun_pids="$(pgrep -f "^ssh -N .* -R 0.0.0.0:${PORT}:127.0.0.1:${PORT} root@${REMOTE_HOST}" || true)"
if [[ -n "$tun_pids" ]]; then
  if ssh -o BatchMode=yes -o ConnectTimeout=8 "root@${REMOTE_HOST}" \
      "timeout 3 bash -c 'echo >/dev/tcp/127.0.0.1/${PORT}'" >/dev/null 2>&1; then
    ok tunnel "ssh pids=${tun_pids}  remote TCP ${REMOTE_HOST}:${PORT} forwarding"
  else
    bad tunnel "ssh pids=${tun_pids} but remote TCP check failed (stale?)"
  fi
else
  bad tunnel "no reverse ssh -R process"
fi

# --- public login ---
pub_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "http://${REMOTE_HOST}:${PORT}/login" || echo 000)"
if [[ "$pub_code" == "200" ]]; then
  ok "public /login" "http://${REMOTE_HOST}:${PORT}/login -> ${pub_code}"
else
  bad "public /login" "http://${REMOTE_HOST}:${PORT}/login -> ${pub_code}"
fi

# --- public SearchKnowledge ---
tmp="$(mktemp)"
sk_code="$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 30 \
  -X POST "http://${REMOTE_HOST}:${PORT}/api/search-knowledge" \
  -H "content-type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"售后怎么查","topK":5}' || echo 000)"
items="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d.get('items') or []))" "$tmp" 2>/dev/null || echo err)"
if [[ "$sk_code" == "200" && "$items" != "err" && "$items" -gt 0 ]]; then
  ok SearchKnowledge "POST public 售后怎么查 -> ${sk_code} items=${items}"
else
  bad SearchKnowledge "POST public -> ${sk_code} items=${items} body=$(head -c 240 "$tmp")"
fi
rm -f "$tmp"

echo
note restart "scripts/run-prod.sh && scripts/ensure-tunnel.sh"
note logs "prod=/tmp/atlas-kb-prod.log  tunnel=/tmp/atlas-kb-tunnel.log"
