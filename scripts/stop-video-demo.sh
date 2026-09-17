#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
RUNTIME_DIR="${VIDEO_DEMO_RUNTIME:-$LAB_ROOT/tmp/video-demo-runtime}"
BOT_DIR="$RUNTIME_DIR/bots"

if [[ -d "$BOT_DIR" ]]; then
  for number in {01..10}; do systemctl --user stop "ownerbot-video-bot-$number.service" 2>/dev/null || true; done
  for _ in {1..80}; do
    running=false
    for number in {01..10}; do
      systemctl --user is-active --quiet "ownerbot-video-bot-$number.service" && running=true
    done
    [[ "$running" == false ]] && break
    sleep 0.25
  done
fi

if systemctl --user is-active --quiet ownerbot-video-bds.service; then
  printf 'stop\n' >"$RUNTIME_DIR/server.stdin"
  for _ in {1..120}; do
    systemctl --user is-active --quiet ownerbot-video-bds.service || break
    sleep 0.25
  done
fi
systemctl --user stop ownerbot-video-bds.service 2>/dev/null || true

echo 'Video demo processes stopped'
