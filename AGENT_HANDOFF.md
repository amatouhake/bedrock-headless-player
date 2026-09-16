# Agent handoff

The first headless-player milestone and its review remediation are complete and live-tested. Read `README.md` for setup and `evidence/2026-09-16-review-remediation.md` for the latest proof run.

## Current state

- Canonical repository: `/home/kenke/bedrock-fake-player-lab/bedrock-headless-player`
- Project branch: `investigate/online-bot-auth`; both PrismarineJS forks remain on `feat/bedrock-1.26.50`
- Official server tested: BDS 1.26.51.1, build 51061372
- Negotiated schema: Bedrock 1.26.50, protocol 2193
- `minecraft-data`: `7c1fe886dd92837c0550e8eff91440361c7d677f`
- `bedrock-protocol`: `fb0af8e388127724c323fd46800e47ba004b1c55`
- authentication work started from application checkpoint: `8feb3475d37b7c50e90c5ccd5fcbb2ff3c702013`
- online bot investigation started from authentication checkpoint: `7db421b53807732ec16dabeb1f54a3c9858bcca0`
- Mojang reference: `refs/bedrock-protocol-docs`, tag `v1.26.50`, commit `475bd72e`
- obsolete bootstrap directory: `tmp/obsolete-bootstrap-project-20260916`

The 1.26.50 BDS uses NetherNet/WebRTC for gameplay. The protocol fork signs offline and authenticated offers, verifies the server JWT and detached fingerprint signature, pins plaintext-HTTP server keys, separates reliable reassembly from unreliable traffic, bounds fragmentation, reports pre-connect failures, handles both JSON and empty BDS status responses, and preserves RakNet behavior.

The data fork preserves 1.26.45 and adds generated 1.26.50 protocol data. It now includes the reviewed optional gathering fields, noise alignment, diagnostic position/dimension, debug-text line gap, pack-setting string arrays, and the exact 1.26.50 global block-state palette pinned by Geyser's 1.26.50 generator tag. The critical Cereal transition removes redundant outer presence markers from `PlayerAuthInput`, `InventoryTransaction`, and `ItemStackResponse`; normal optionals retain one marker.

The application completes resource-pack and loading-screen negotiation, requests a chunk radius, follows authoritative movement corrections, sends input at 20 Hz, moves briefly with the `up` input, returns to neutral ticks, and disconnects cleanly. The live harness waits before reusing the offline identity so BDS can destroy the prior WebRTC session.

The separate `feat/trusted-key-auth` investigation found no Microsoft-free online-mode path on BDS 1.26.51.1. NetherNet self-signed and trusted-key identities both establish signaling/DTLS and negotiate protocol 2193, then fail at the Bedrock Login packet. This release explicitly disables RakNet player connections before authentication. The project rejects `--auth trusted-key` and `--transport raknet` early; see `AUTHENTICATION.md` and `evidence/2026-09-17-trusted-key-auth.md`.

The `investigate/online-bot-auth` phase found no stock additive Login issuer or working auth-service override. It did produce a practical accountless option for a controlled server: an experimental GameTest `SimulatedPlayer` pack. The installer refuses offline mode, backs up and patches `level.dat`, and installs the pack idempotently. Official BDS 1.26.51.1 live evidence proves empty-XUID spawn, server-observed walking, stopping at a stable position, disconnect and same-name respawn while `online-mode=true`. Read `SERVER_SIDE_BOTS.md` and `evidence/2026-09-17-online-bot-auth-options.md` before changing this area.

## Operational notes

Use `scripts/setup-dev.sh` after changing either fork. Use `scripts/live-test.sh` for the complete cold integration test. It owns server cleanup only when it starts the server itself. Runtime server files belong under `server/` and `tmp/`, never in this repository.

The external-client integration server deliberately has `online-mode=false`; keep it local. The separate server-side-bot setup requires `online-mode=true` and Beta APIs. The managed server rotates its self-signed key at process start; `start-server.sh` resets the loopback TOFU pin then, while reconnects to the same process must match the saved pin. No Microsoft credentials or authentication caches are needed or stored for either local test.

Keep future work narrow. Add protocol fixes to `minecraft-data`, transport/session fixes to `bedrock-protocol`, and player behavior here. The project deliberately excludes world modeling, pathfinding, inventory automation, crafting, combat, and public-server compatibility work.
