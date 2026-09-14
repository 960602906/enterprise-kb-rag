#!/usr/bin/env bash
# Ensure SSH reverse tunnel: public 115.190.128.7:43123 -> local 127.0.0.1:43123
# Usage: ensure-tunnel.sh [--loop]
set -euo pipefail

LOG="${ATLAS_KB_TUNNEL_LOG:-/tmp/atlas-kb-tunnel.log}"
PIDFILE="${ATLAS_KB_TUNNEL_PID:-/tmp/atlas-kb-tunnel.pid}"
REMOTE_HOST="${ATLAS_KB_REMOTE_HOST:-115.190.128.7}"
REMOTE_USER="${ATLAS_KB_REMOTE_USER:-root}"
REMOTE_PORT="${ATLAS_KB_PORT:-43123}"
LOCAL_HOST="127.0.0.1"
LOCAL_PORT="${ATLAS_KB_PORT:-43123}"
LOOP=0
[[ "${1:-}" == "--loop" ]] && LOOP=1

log() { printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$LOG"; }

ssh_forward_pattern() {
  # Anchor at start so leftover bash wrappers are not counted as the tunnel.
  printf '^ssh -N .* -R 0.0.0.0:%s:%s:%s %s@%s' \
    "$REMOTE_PORT" "$LOCAL_HOST" "$LOCAL_PORT" "$REMOTE_USER" "$REMOTE_HOST"
}

tunnel_pids() {
  pgrep -f "$(ssh_forward_pattern)" || true
}

# Healthy: remote sshd is forwarding TCP on the reverse port (success or
# immediate connection-refused). Hang/timeout means a stale forward.
tunnel_healthy() {
  ssh -o BatchMode=yes -o ConnectTimeout=8 \
    -o StrictHostKeyChecking=accept-new \
    "${REMOTE_USER}@${REMOTE_HOST}" \
    "timeout 3 bash -c 'echo >/dev/tcp/127.0.0.1/${REMOTE_PORT}'" >/dev/null 2>&1
}

start_tunnel() {
  local old pids
  pids="$(tunnel_pids)"
  if [[ -n "$pids" ]]; then
    log "killing stale tunnel pids: ${pids}"
    # shellcheck disable=SC2086
    kill -TERM $pids 2>/dev/null || true
    sleep 1
    pids="$(tunnel_pids)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -KILL $pids 2>/dev/null || true
      sleep 0.5
    fi
  fi

  log "starting reverse tunnel ${REMOTE_HOST}:${REMOTE_PORT} -> ${LOCAL_HOST}:${LOCAL_PORT}"
  setsid nohup ssh -N \
    -o BatchMode=yes \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=accept-new \
    -R "0.0.0.0:${REMOTE_PORT}:${LOCAL_HOST}:${LOCAL_PORT}" \
    "${REMOTE_USER}@${REMOTE_HOST}" >>"$LOG" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"
  sleep 2
  if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    log "ERROR: tunnel process exited immediately (see ${LOG})"
    tail -n 30 "$LOG" || true
    return 1
  fi
  if tunnel_healthy; then
    log "tunnel healthy pid=$(cat "$PIDFILE")"
    return 0
  fi
  log "WARN: tunnel process up but remote TCP check failed (app may be down); pid=$(cat "$PIDFILE")"
  return 0
}

ensure_once() {
  local pids
  pids="$(tunnel_pids)"
  if [[ -n "$pids" ]] && tunnel_healthy; then
    # Keep pidfile in sync
    echo "$pids" | awk '{print $1}' > "$PIDFILE"
    log "tunnel already up pids=${pids}"
    return 0
  fi
  if [[ -n "$pids" ]]; then
    log "tunnel process present but unhealthy; restarting"
  else
    log "tunnel down; starting"
  fi
  start_tunnel
}

mkdir -p "$(dirname "$LOG")"
touch "$LOG"

if ((LOOP)); then
  log "ensure-tunnel --loop (30s)"
  while true; do
    ensure_once || true
    sleep 30
  done
else
  ensure_once
fi
