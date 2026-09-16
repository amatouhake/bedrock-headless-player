#!/usr/bin/env bash
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROPERTIES="$LAB_ROOT/server/current/server.properties"
BDS_PORT="${BDS_PORT:-19132}"
BDS_PORT_V6="${BDS_PORT_V6:-$((BDS_PORT + 1))}"

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
set_property server-port "$BDS_PORT"
set_property server-portv6 "$BDS_PORT_V6"
set_property online-mode "false"
set_property allow-list "false"
set_property enable-lan-visibility "false"
set_property allow-cheats "true"
set_property view-distance "8"
set_property default-player-permission-level "member"
set_property emit-server-telemetry "false"
set_property transport "nethernet"

echo "Configured local-only offline BDS at $PROPERTIES on port $BDS_PORT"
