#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$LAB_ROOT/tmp/bds-runtime"
PID_FILE="$RUNTIME_DIR/bds.pid"
FIFO="$RUNTIME_DIR/bds.stdin"

if [[ ! -f "$PID_FILE" ]]; then
  echo "BDS is not running"
  exit 0
fi
pid="$(cat "$PID_FILE")"
if kill -0 "$pid" 2>/dev/null; then
  printf 'stop\n' >"$FIFO"
  for _ in {1..80}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.25
  done
fi
if kill -0 "$pid" 2>/dev/null; then
  echo "BDS did not stop cleanly (PID $pid)" >&2
  exit 1
fi
rm -f "$PID_FILE" "$FIFO"
# Give the signaling listener and WebRTC worker time to release their sockets
# before an immediate restart.
sleep 2
echo "BDS stopped"
