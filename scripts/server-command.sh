#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$LAB_ROOT/tmp/bds-runtime"
PID_FILE="$RUNTIME_DIR/bds.pid"
FIFO="$RUNTIME_DIR/bds.stdin"

if [[ ! -f "$PID_FILE" ]] || ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Managed BDS is not running" >&2
  exit 1
fi
if [[ $# -eq 0 ]]; then
  echo "usage: $0 <BDS command>" >&2
  exit 2
fi
printf '%s\n' "$*" >"$FIFO"
