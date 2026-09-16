# Agent handoff

The first headless-player milestone is complete and live-tested. Read `README.md` for setup and `evidence/2026-09-16-live-test.md` for the proof run.

## Current state

- Canonical repository: `/home/kenke/bedrock-fake-player-lab/bedrock-headless-player`
- Branch in all writable repositories: `feat/bedrock-1.26.50`
- Official server tested: BDS 1.26.51.1, build 51061372
- Negotiated schema: Bedrock 1.26.50, protocol 2193
- `minecraft-data`: `4e99c655`
- `bedrock-protocol`: `9cdadae`
- live-tested application commit: `6f5adee`
- Mojang reference: `refs/bedrock-protocol-docs`, tag `v1.26.50`, commit `475bd72e`
- obsolete bootstrap directory: `tmp/obsolete-bootstrap-project-20260916`

The 1.26.50 BDS uses NetherNet/WebRTC for gameplay. The protocol fork supplies HTTP SDP signaling, offline ES384 identity binding, data-channel framing, and transport-aware packet framing. Inner Minecraft encryption is skipped because DTLS secures NetherNet. RakNet remains available for older versions.

The data fork preserves 1.26.45 and adds generated 1.26.50 protocol data. The critical Cereal transition removes redundant outer presence markers from `PlayerAuthInput`, `InventoryTransaction`, and `ItemStackResponse`; normal optionals retain one marker. `PlayerAuthInput` values preserve reserved numeric gaps. Coupled StartGame, item, sound, actor-delta, dimension, camera-preset, and packet-ID changes are represented.

The application completes resource-pack and loading-screen negotiation, requests a chunk radius, follows authoritative movement corrections, sends input at 20 Hz, moves briefly with the `up` input, returns to neutral ticks, and disconnects cleanly. The live harness waits before reusing the offline identity so BDS can destroy the prior WebRTC session.

## Operational notes

Use `scripts/setup-dev.sh` after changing either fork. Use `scripts/live-test.sh` for the complete cold integration test. It owns server cleanup only when it starts the server itself. Runtime server files belong under `server/` and `tmp/`, never in this repository.

The local server deliberately has `online-mode=false`. Keep it local and do not expose port 19132 to an untrusted network. No Microsoft credentials or authentication caches are needed or stored.

Keep future work narrow. Add protocol fixes to `minecraft-data`, transport/session fixes to `bedrock-protocol`, and player behavior here. The project deliberately excludes world modeling, pathfinding, inventory automation, crafting, combat, and public-server compatibility work.
