#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER_DIR="$LAB_ROOT/server/current"
RUNTIME_DIR="$LAB_ROOT/tmp/bds-runtime"
PID_FILE="$RUNTIME_DIR/bds.pid"
FIFO="$RUNTIME_DIR/bds.stdin"
LOG="$RUNTIME_DIR/bds.log"
IDENTITY_PIN="$RUNTIME_DIR/server-identity.pin"
SERVER_PORT="$(sed -n 's/^server-port=//p' "$SERVER_DIR/server.properties" | tail -1)"
SERVER_PORT="${SERVER_PORT:-19132}"

mkdir -p "$RUNTIME_DIR"
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "BDS already running (PID $(cat "$PID_FILE"))"
  exit 0
fi
rm -f "$PID_FILE"
[[ -p "$FIFO" ]] || { rm -f "$FIFO"; mkfifo "$FIFO"; }

# Vanilla BDS creates a new self-signed NetherNet operator key at each process
# start. Reset TOFU only when this managed loopback server is deliberately
# restarted; reconnects to the same process must continue using the saved pin.
rm -f "$IDENTITY_PIN"

: >"$LOG"
# The detached shell opens the FIFO read/write so BDS never observes an EOF
# between commands. setsid/nohup keep it alive after this launcher exits.
nohup setsid bash -c '
  cd "$1"
  exec 9<>"$2"
  exec env LD_LIBRARY_PATH=. ./bedrock_server <&9
' _ "$SERVER_DIR" "$FIFO" >>"$LOG" 2>&1 </dev/null &
pid=$!
echo "$pid" >"$PID_FILE"

for _ in {1..60}; do
  if curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:$SERVER_PORT/v1/join" >/dev/null 2>&1; then
    echo "BDS ready on port $SERVER_PORT (PID $pid, log $LOG)"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    tail -80 "$LOG"
    exit 1
  fi
  sleep 0.25
done
echo "BDS did not become ready"
exit 1
