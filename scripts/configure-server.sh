#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROPERTIES="$LAB_ROOT/server/current/server.properties"

if [[ ! -f "$PROPERTIES" ]]; then
  echo "Missing $PROPERTIES; run scripts/download-server.sh first" >&2
  exit 1
fi

set_property() {
  local key="$1" value="$2"
  if rg -q "^${key}=" "$PROPERTIES"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$PROPERTIES"
  else
    printf '%s=%s\n' "$key" "$value" >>"$PROPERTIES"
  fi
}

set_property server-name "Bedrock Headless Player Lab"
set_property level-name "Headless Player Lab"
set_property server-port "19132"
set_property server-portv6 "19133"
set_property online-mode "false"
set_property allow-list "false"
set_property enable-lan-visibility "false"
set_property allow-cheats "true"
set_property view-distance "8"
set_property default-player-permission-level "member"
set_property emit-server-telemetry "false"
set_property transport "nethernet"

echo "Configured local-only offline BDS at $PROPERTIES"
