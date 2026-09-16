#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
MCDATA="$LAB_ROOT/forks/minecraft-data"
PROTOCOL="$LAB_ROOT/forks/bedrock-protocol"
DATA_LINK="$PROTOCOL/node_modules/minecraft-data/minecraft-data"

(cd "$MCDATA/tools/js" && npm install && npm run build)
(cd "$PROTOCOL" && npm install)

# raknet-native ships a Linux N-API binary but its installer does not place it
# in Node 22's bindings lookup directory. NetherNet itself does not need this;
# the upstream in-process RakNet/proxy tests do.
raknet_prebuild="$PROTOCOL/node_modules/raknet-native/prebuilds/linux-5-x64/node-raknet.node"
if [[ -f "$raknet_prebuild" ]]; then
  node_abi="$(node -p 'process.versions.modules')"
  raknet_binding="$PROTOCOL/node_modules/raknet-native/lib/binding/node-v${node_abi}-linux-x64/node-raknet.node"
  if [[ ! -f "$raknet_binding" ]]; then
    mkdir -p "$(dirname "$raknet_binding")"
    cp "$raknet_prebuild" "$raknet_binding"
  fi
fi

if [[ -L "$DATA_LINK" ]]; then
  [[ "$(readlink -f "$DATA_LINK")" == "$MCDATA" ]] || {
    echo "$DATA_LINK points to an unexpected repository" >&2
    exit 1
  }
elif [[ -d "$DATA_LINK" ]]; then
  if [[ -e "$DATA_LINK.published" ]]; then
    echo "Refusing to replace $DATA_LINK because $DATA_LINK.published already exists" >&2
    exit 1
  fi
  mv "$DATA_LINK" "$DATA_LINK.published"
  ln -s "$MCDATA" "$DATA_LINK"
else
  ln -s "$MCDATA" "$DATA_LINK"
fi

(cd "$PROTOCOL/node_modules/minecraft-data" && npm run generate:data)
echo "Local forks are installed, built, and linked."
