#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
SERVER_DIR="${SERVER_DIR:-$LAB_ROOT/tmp/endstone-ownerbot}"
ENDSTONE_PACKAGE="${ENDSTONE_PACKAGE:-$LAB_ROOT/tmp/endstone-pylib-v01111}"
LIBCXX_DIR="${LIBCXX_DIR:-$LAB_ROOT/tmp/endstone-sysroot20/usr/lib/x86_64-linux-gnu}"
PROTOCOL_PATH="${BEDROCK_PROTOCOL_PATH:-$LAB_ROOT/forks/bedrock-protocol}"
RUNTIME_DIR="${VIDEO_DEMO_RUNTIME:-$LAB_ROOT/tmp/video-demo-runtime}"
PORT="${BDS_PORT:-19261}"
UDP_PORT_RANGE="${BDS_UDP_PORT_RANGE:-20000-20100}"

SERVER_PID="$RUNTIME_DIR/server.pid"
SERVER_FIFO="$RUNTIME_DIR/server.stdin"
SERVER_LOG="$RUNTIME_DIR/server.log"
PIN="$RUNTIME_DIR/server-identity.pin"
BOT_DIR="$RUNTIME_DIR/bots"
SERVER_UNIT="ownerbot-video-bds.service"
NODE_BIN="$(command -v node)"

mkdir -p "$RUNTIME_DIR" "$BOT_DIR"

[[ "$(sed -n 's/^online-mode=//p' "$SERVER_DIR/server.properties" | tail -1)" == true ]] || { echo 'online-mode must be true' >&2; exit 1; }
[[ "$(sed -n 's/^allow-cheats=//p' "$SERVER_DIR/server.properties" | tail -1)" == false ]] || { echo 'allow-cheats must be false' >&2; exit 1; }
[[ "$(sed -n 's/^transport=//p' "$SERVER_DIR/server.properties" | tail -1)" == nethernet ]] || { echo 'transport must be nethernet' >&2; exit 1; }
[[ "$UDP_PORT_RANGE" =~ ^[0-9]+-[0-9]+$ ]] || { echo 'BDS_UDP_PORT_RANGE must be start-end' >&2; exit 1; }

# NetherNet needs a distinct ICE/UDP allocation for simultaneous peers. Endstone
# otherwise defaults this to the single signaling port on first startup.
if grep -q '^server-udp-ports=' "$SERVER_DIR/server.properties"; then
  sed -i "s/^server-udp-ports=.*/server-udp-ports=$UDP_PORT_RANGE/" "$SERVER_DIR/server.properties"
else
  printf '\nserver-udp-ports=%s\n' "$UDP_PORT_RANGE" >>"$SERVER_DIR/server.properties"
fi

if systemctl --user is-active --quiet "$SERVER_UNIT"; then
  echo "Video demo server already running (unit $SERVER_UNIT)" >&2
  exit 1
fi
if ss -ltn | awk '{print $4}' | grep -Eq "(^|:)$PORT$"; then
  echo "TCP port $PORT is already in use" >&2
  exit 1
fi

rm -f "$PIN" "$SERVER_PID"
[[ -p "$SERVER_FIFO" ]] || { rm -f "$SERVER_FIFO"; mkfifo "$SERVER_FIFO"; }
: >"$SERVER_LOG"

systemctl --user reset-failed "$SERVER_UNIT" >/dev/null 2>&1 || true
systemd-run --user --quiet --unit="$SERVER_UNIT" --collect \
  --property="StandardOutput=append:$SERVER_LOG" \
  --property="StandardError=append:$SERVER_LOG" \
  bash -c '
  exec 9<>"$1"
  exec env PYTHONPATH="$2" LD_LIBRARY_PATH="$3" "$4/bin/python" -m endstone -s "$5" -y <&9
' _ "$SERVER_FIFO" "$ENDSTONE_PACKAGE" "$LIBCXX_DIR" "$LAB_ROOT/tmp/endstone-venv" "$SERVER_DIR"
server_pid="$(systemctl --user show --property=MainPID --value "$SERVER_UNIT")"
echo "$server_pid" >"$SERVER_PID"

for _ in {1..240}; do
  if grep -q 'Server started\.' "$SERVER_LOG" && \
      curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:$PORT/v1/join" >/dev/null 2>&1; then
    break
  fi
  if ! systemctl --user is-active --quiet "$SERVER_UNIT"; then tail -100 "$SERVER_LOG"; exit 1; fi
  sleep 0.25
done
grep -q 'Server started\.' "$SERVER_LOG" || { echo 'BDS did not finish startup' >&2; exit 1; }
curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:$PORT/v1/join" >/dev/null

start_bot() {
  local number="$1" name pid_file log_file unit
  name="$(printf 'OwnerBot%02d' "$number")"
  pid_file="$BOT_DIR/$name.pid"
  log_file="$BOT_DIR/$name.jsonl"
  unit="ownerbot-video-bot-$(printf '%02d' "$number").service"
  : >"$log_file"
  systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
  systemd-run --user --quiet --unit="$unit" --collect \
    --working-directory="$PROJECT_ROOT" \
    --property="StandardOutput=append:$log_file" \
    --property="StandardError=append:$log_file" \
    "$NODE_BIN" "$PROJECT_ROOT/src/cli.js" \
    --host 127.0.0.1 --port "$PORT" --username "$name" \
    --auth local-ownerbot --transport nethernet \
    --protocol-path "$PROTOCOL_PATH" \
    --owner-private-key "$PROJECT_ROOT/.local-ownerbot/owner-private.pem" \
    --owner-public-key "$PROJECT_ROOT/.local-ownerbot/owner-public.pem" \
    --server-identity-pin-path "$PIN" \
    --persistent true --demo-enabled true --jump-duration-ms 10000 --reply-stagger-ms 75
  systemctl --user show --property=MainPID --value "$unit" >"$pid_file"
  for _ in {1..120}; do
    grep -q '"event":"persistent_idle"' "$log_file" && return 0
    systemctl --user is-active --quiet "$unit" || { tail -80 "$log_file"; return 1; }
    sleep 0.25
  done
  echo "$name did not reach persistent idle" >&2
  return 1
}

# The first client establishes the server-identity TOFU pin before the others
# start, avoiding concurrent first-write races.
start_bot 1
for number in {2..10}; do start_bot "$number"; done

echo "Video demo ready: BDS unit $SERVER_UNIT (PID $server_pid), 10 bots, port $PORT"
echo "Server log: $SERVER_LOG"
echo "Bot logs: $BOT_DIR"
