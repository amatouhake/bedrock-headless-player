#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
EVIDENCE_DIR="$PROJECT_ROOT/evidence"
SERVER_PORT="$(sed -n 's/^server-port=//p' "$LAB_ROOT/server/current/server.properties" | tail -1)"
SERVER_PORT="${SERVER_PORT:-19132}"
mkdir -p "$EVIDENCE_DIR"

started_here=false
if ! curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:$SERVER_PORT/v1/join" >/dev/null 2>&1; then
  "$PROJECT_ROOT/scripts/start-server.sh"
  started_here=true
fi
cleanup() {
  if [[ "$started_here" == true ]]; then "$PROJECT_ROOT/scripts/stop-server.sh"; fi
}
trap cleanup EXIT

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
first="$EVIDENCE_DIR/live-$stamp-first.jsonl"
second="$EVIDENCE_DIR/live-$stamp-reconnect.jsonl"
server="$EVIDENCE_DIR/live-$stamp-server.txt"

wait_for_event() {
  local file="$1" event="$2"
  for _ in {1..240}; do
    if [[ -f "$file" ]] && rg -q "\"event\":\"$event\"" "$file"; then return 0; fi
    sleep 0.25
  done
  echo "Timed out waiting for $event in $file" >&2
  return 1
}

node "$PROJECT_ROOT/src/cli.js" \
  --port "$SERVER_PORT" \
  --idle-before-ms 4000 --move-ms 1000 --idle-after-ms 6000 \
  > >(tee "$first") &
client_pid=$!

wait_for_event "$first" spawn
if [[ -p "$LAB_ROOT/tmp/bds-runtime/bds.stdin" ]]; then
  "$PROJECT_ROOT/scripts/server-command.sh" querytarget @a
fi
wait_for_event "$first" movement_stopped
if [[ -p "$LAB_ROOT/tmp/bds-runtime/bds.stdin" ]]; then
  "$PROJECT_ROOT/scripts/server-command.sh" querytarget @a
  sleep 3
  "$PROJECT_ROOT/scripts/server-command.sh" querytarget @a
fi
wait "$client_pid"

# Let BDS finish destroying the first offline player session before the next
# WebRTC peer logs in. Immediate reuse can race the server's session teardown.
sleep 3
node "$PROJECT_ROOT/src/cli.js" \
  --port "$SERVER_PORT" \
  --idle-before-ms 1000 --move-ms 0 --idle-after-ms 2000 | tee "$second"

if [[ -f "$LAB_ROOT/tmp/bds-runtime/bds.log" ]]; then
  tail -160 "$LAB_ROOT/tmp/bds-runtime/bds.log" >"$server"
fi

node - "$first" "$second" <<'NODE'
const fs = require('fs')
const [firstPath, secondPath] = process.argv.slice(2)
const read = file => fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)
const first = read(firstPath)
const second = read(secondPath)
const requireEvent = (entries, name) => {
  const event = entries.find(entry => entry.event === name)
  if (!event) throw new Error(`Missing ${name}`)
  return event
}
for (const name of ['network_settings', 'resource_packs_info', 'start_game', 'loading_screen_completed', 'spawn', 'movement_started', 'movement_stopped', 'stable', 'disconnected_cleanly']) requireEvent(first, name)
if (!first.some(entry => entry.event === 'server_identity_trusted' || entry.event === 'server_identity_pin_loaded')) throw new Error('Server identity was not trusted or pinned')
if (requireEvent(first, 'network_settings').requestedProtocol !== 2193) throw new Error('Protocol was not 2193')
const stable = requireEvent(first, 'stable')
if (stable.movementTicks < 1 || stable.neutralTicks < 20) throw new Error('Insufficient movement or neutral input ticks')
for (const name of ['network_settings', 'spawn', 'stable', 'disconnected_cleanly']) requireEvent(second, name)
requireEvent(second, 'server_identity_pin_loaded')
NODE

echo "Live lifecycle, movement, stop, and reconnect passed."
echo "Client evidence: $first $second"
echo "Server evidence: $server"
