#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
SOURCE_DIR="$PROJECT_ROOT/endstone-plugins/ownerbot-demo"
SERVER_DIR="${SERVER_DIR:-$LAB_ROOT/tmp/endstone-ownerbot}"
DIST_DIR="$PROJECT_ROOT/tmp/ownerbot-demo-dist"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR" "$SERVER_DIR/plugins"
python3 -m pip wheel --no-deps --no-build-isolation --wheel-dir "$DIST_DIR" "$SOURCE_DIR"
rm -f "$SERVER_DIR/plugins"/endstone_ownerbot_demo-*.whl
cp "$DIST_DIR"/endstone_ownerbot_demo-*.whl "$SERVER_DIR/plugins/"

echo "Installed $(basename "$DIST_DIR"/endstone_ownerbot_demo-*.whl) in $SERVER_DIR/plugins"
