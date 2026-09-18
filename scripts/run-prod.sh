#!/usr/bin/env bash
# Build and start Atlas KB in production on 127.0.0.1:43123.
# Public access is only via SSH reverse tunnel (see ensure-tunnel.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${ATLAS_KB_PROD_LOG:-/tmp/atlas-kb-prod.log}"
PIDFILE="${ATLAS_KB_PROD_PID:-/tmp/atlas-kb-prod.pid}"
PORT="${ATLAS_KB_PORT:-43123}"
HOST="${ATLAS_KB_HOST:-127.0.0.1}"
APP_MARKER="$ROOT"

export PATH="${HOME}/.local/bin:${PATH}"

log() { printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$LOG"; }

load_env() {
  local envfile="${ROOT}/.env.local"
  if [[ ! -f "$envfile" ]]; then
    echo "missing ${envfile}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$envfile"
  set +a
}

ensure_postgres() {
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    return 0
  fi
  log "postgres not ready; attempting start of cluster 18/main"
  sudo pg_ctlcluster 18 main start >/dev/null 2>&1 || sudo service postgresql start >/dev/null 2>&1 || true
  sleep 1
  if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    log "ERROR: postgres 127.0.0.1:5432 is down"
    exit 1
  fi
}

# Stop only Atlas KB next/pnpm whose cwd is this app —
# never this script / its parent (a wrapper cmdline can mention the path).
stop_atlas_next() {
  local pids=() pid cwd cmd
  local self=$$ parent=$PPID
  for pid in $(pgrep -f 'next-server|next (dev|start)|pnpm (dev|start)|pnpm.cjs (dev|start)' || true); do
    [[ -d "/proc/${pid}" ]] || continue
    [[ "$pid" == "$self" || "$pid" == "$parent" ]] && continue
    cwd="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
    cmd="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)"
    [[ "$cmd" == *run-prod.sh* || "$cmd" == *ensure-tunnel.sh* || "$cmd" == *prod-status.sh* ]] && continue
    # Match working directory only (cmdline path matches kill the invoker).
    if [[ "$cwd" == "${APP_MARKER}" || "$cwd" == "${APP_MARKER}/"* ]]; then
      pids+=("$pid")
    fi
  done

  if [[ -f "$PIDFILE" ]]; then
    local old
    old="$(tr -d '[:space:]' < "$PIDFILE" || true)"
    if [[ -n "${old}" && -d "/proc/${old}" ]]; then
      pids+=("$old")
    fi
  fi

  if ((${#pids[@]} == 0)); then
    return 0
  fi

  # Unique PIDs
  local uniq=()
  readarray -t uniq < <(printf '%s\n' "${pids[@]}" | sort -u)
  log "stopping Atlas KB next/pnpm pids: ${uniq[*]}"
  kill -TERM "${uniq[@]}" 2>/dev/null || true

  local i
  for i in $(seq 1 20); do
    local alive=()
    for pid in "${uniq[@]}"; do
      [[ -d "/proc/${pid}" ]] && alive+=("$pid")
    done
    ((${#alive[@]} == 0)) && break
    sleep 0.25
  done

  local leftover=()
  for pid in "${uniq[@]}"; do
    if [[ -d "/proc/${pid}" ]]; then
      leftover+=("$pid")
    fi
  done
  if ((${#leftover[@]} > 0)); then
    log "SIGKILL leftover Atlas KB pids: ${leftover[*]}"
    kill -KILL "${leftover[@]}" 2>/dev/null || true
    sleep 0.3
  fi
}

wait_port_free() {
  local i
  for i in $(seq 1 40); do
    if ! ss -tln | grep -qE ":${PORT}\\b"; then
      return 0
    fi
    sleep 0.25
  done
  log "ERROR: port ${PORT} still in use:"
  ss -tlnp | grep -E ":${PORT}\\b" | tee -a "$LOG" || true
  exit 1
}

wait_ready() {
  local i
  for i in $(seq 1 60); do
    if curl -sf -o /dev/null --max-time 2 "http://${HOST}:${PORT}/login"; then
      return 0
    fi
    sleep 1
  done
  log "ERROR: production server did not become ready on ${HOST}:${PORT}"
  tail -n 80 "$LOG" || true
  exit 1
}

mkdir -p "$(dirname "$LOG")"
touch "$LOG"
cd "$ROOT"

log "=== run-prod.sh starting (cwd=${ROOT}) ==="
load_env
export NODE_ENV=production
export PORT
# Do not override MOCK_* — .env.local values stay as sourced.

ensure_postgres
stop_atlas_next
wait_port_free

log "pnpm build"
if ! pnpm build >>"$LOG" 2>&1; then
  log "ERROR: pnpm build failed (see ${LOG})"
  exit 1
fi
log "pnpm build ok"

log "starting next start --hostname ${HOST} --port ${PORT}"
# Bind loopback only; public host reverse-forwards to this.
setsid nohup pnpm exec next start --hostname "$HOST" --port "$PORT" >>"$LOG" 2>&1 < /dev/null &
echo $! > "$PIDFILE"
log "launcher pid $(cat "$PIDFILE") written to ${PIDFILE}"

wait_ready

listener_pid="$(ss -tlnp | sed -n "s/.*:${PORT} .*pid=\\([0-9]*\\).*/\\1/p" | head -1 || true)"
log "production ready  http://${HOST}:${PORT}/login  launcher=$(cat "$PIDFILE") listener=${listener_pid:-unknown}"
echo "OK pid=$(cat "$PIDFILE") listener=${listener_pid:-unknown} log=${LOG}"
