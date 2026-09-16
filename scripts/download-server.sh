#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ARCHIVE="$LAB_ROOT/server/archives/bedrock-server-1.26.51.1.zip"
SERVER_DIR="$LAB_ROOT/server/current"
URL="https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.51.1.zip"
SHA256="ad91d3b824e51ea50b5bb601c295cbd8f543a29b14315c2ad89ff27311e2d860"

mkdir -p "$(dirname "$ARCHIVE")"
if [[ ! -f "$ARCHIVE" ]]; then curl -fL "$URL" -o "$ARCHIVE"; fi
printf '%s  %s\n' "$SHA256" "$ARCHIVE" | sha256sum -c -

if [[ -e "$SERVER_DIR/bedrock_server" ]]; then
  echo "BDS is already installed at $SERVER_DIR" >&2
  exit 0
fi
mkdir -p "$SERVER_DIR"
unzip -q "$ARCHIVE" -d "$SERVER_DIR"
echo "Installed official BDS 1.26.51.1 in $SERVER_DIR"
