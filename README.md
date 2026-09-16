# bedrock-headless-player

This is a minimal headless Minecraft Bedrock player built on PrismarineJS `bedrock-protocol`. It connects to a local Bedrock Dedicated Server (BDS), completes login and resource-pack negotiation, reaches `StartGame` and spawn, sends neutral `PlayerAuthInput` ticks, walks forward briefly, stops, disconnects, and reconnects.

The implementation was live-tested on 2026-09-16 against official Linux BDS **1.26.51.1** (build 51061372, engine string `1.26.51`). The server negotiates the Mojang **1.26.50 network schema, protocol 2193**. The BDS distribution version and network schema version are intentionally recorded separately.

## Workspace

The tested layout is:

```text
/home/kenke/bedrock-fake-player-lab/
├── bedrock-headless-player/       # this canonical project
├── server/
│   ├── current/                   # disposable BDS runtime and world
│   └── archives/                  # downloaded official zip
├── forks/
│   ├── bedrock-protocol/          # amatouhake fork
│   └── minecraft-data/            # amatouhake fork
├── refs/
│   └── bedrock-protocol-docs/     # Mojang reference checkout
├── captures/
├── notes/
└── tmp/
    └── obsolete-bootstrap-project-20260916/ # archived old project/ directory
```

The old bootstrap `project/` directory had no unique committed implementation. It was inspected and moved under `tmp/` rather than deleted.

## Tested revisions

The protocol/data checkpoint remains on `feat/bedrock-1.26.50`; this project uses the separate investigation branch `feat/trusted-key-auth`:

- `minecraft-data`: `7c1fe886dd92837c0550e8eff91440361c7d677f`
- `bedrock-protocol`: `fb0af8e388127724c323fd46800e47ba004b1c55`
- this project’s authentication branch started from the validated checkpoint `8feb3475d37b7c50e90c5ccd5fcbb2ff3c702013`
- Mojang reference tag: `v1.26.50`, commit `475bd72ed89036af4eb18426774ef3b953de7603`

During development, `bedrock-protocol/node_modules/minecraft-data/minecraft-data` is a symlink to the adjacent `forks/minecraft-data` checkout. `scripts/setup-dev.sh` creates that link and rebuilds generated protocol data.

## Prerequisites

- Linux x86-64
- Node.js 22 and npm
- `curl`, `unzip`, `sha256sum`, `sed`, and `rg`
- the workspace layout above with both PrismarineJS forks checked out on the tested branches

Install and link the local forks:

```bash
cd /home/kenke/bedrock-fake-player-lab/bedrock-headless-player
./scripts/setup-dev.sh
```

## Local server

Download the exact official BDS archive used by the test and verify its SHA-256:

```bash
./scripts/download-server.sh
./scripts/configure-server.sh
```

The expected archive is `bedrock-server-1.26.51.1.zip`, SHA-256 `ad91d3b824e51ea50b5bb601c295cbd8f543a29b14315c2ad89ff27311e2d860`.

The configuration script selects NetherNet, disables Xbox authentication and the allow list, disables LAN visibility, and uses port 19132 by default. Set `BDS_PORT=19142 ./scripts/configure-server.sh` to select another local port; the start and live-test scripts read it from `server.properties`. `online-mode=false` permits self-signed offline identities. Do not expose this unauthenticated test server to a public or untrusted network.

Start, issue a console command, and stop the managed server with:

```bash
./scripts/start-server.sh
./scripts/server-command.sh list
./scripts/stop-server.sh
```

The scripts keep the BDS process and FIFO under `../tmp/bds-runtime`, wait for its HTTP signaling endpoint, shut it down through the console, and verify process exit. Vanilla BDS generates a new self-signed NetherNet identity on each process start, so the managed start script clears the loopback-only TOFU pin at that point. Reconnects to the same process verify the saved pin. Binaries, worlds, logs, and runtime state stay outside this repository.

## Client

With BDS running, the default client command is:

```bash
npm start
```

Useful options include `--host`, `--port`, `--username`, `--idle-before-ms`, `--move-ms`, `--idle-after-ms`, `--speed-per-tick`, `--position x,y,z`, and `--protocol-path`. The default protocol path is the adjacent local fork.

Authentication and transport can be stated explicitly as `--auth offline --transport nethernet`. Current BDS 1.26.51.1 does not provide a working Microsoft-free `online-mode=true` trusted-key path, and disables RakNet player connections; requesting either combination fails early rather than changing modes. See [`AUTHENTICATION.md`](AUTHENTICATION.md) and the [live investigation evidence](evidence/2026-09-17-trusted-key-auth.md).

Output is JSON Lines. A successful run includes `network_settings`, `resource_packs_info`, `start_game`, `loading_screen_completed`, `spawn`, `movement_started`, `movement_stopped`, `stable`, and `disconnected_cleanly`. The `stable` record includes sent neutral/movement tick counts and server corrections.

## Reproduce the live test

The single command below cold-starts BDS if needed, runs the full movement lifecycle, queries the server’s authoritative player position before and after movement, disconnects, reconnects the same identity, validates both JSONL traces, and stops a server it started:

```bash
./scripts/live-test.sh
```

The fresh post-authentication-investigation control is retained as `evidence/live-20260916T172200Z-{first,reconnect,server}.*`. It proves that the supported offline lifecycle still works after the negative online-mode experiments.

Run local checks with:

```bash
npm test
(cd ../forks/minecraft-data/tools/js && npm run build && XDG_CACHE_HOME=/tmp/bedrock-standard-cache npm test)
(cd ../forks/bedrock-protocol && BEDROCK_TEST_VERSION=1.26.50 XDG_CACHE_HOME=/tmp/bedrock-standard-cache npm test)
```

## Scope

The player maintains only the state needed for this lifecycle. It has no chunk/world model, pathfinding, inventory automation, crafting, combat, block search, visual perception, or Microsoft-account authentication. Movement is a fixed forward input. The 1.26.50 data changes cover the lifecycle and closely coupled wire changes exercised here; they are not a claim that every unrelated gameplay packet has been live-tested.
