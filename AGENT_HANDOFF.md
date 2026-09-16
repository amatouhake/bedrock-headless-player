# Agent handoff

The first headless-player milestone and its review remediation are complete and live-tested. Read `README.md` for setup and `evidence/2026-09-16-review-remediation.md` for the latest proof run.

## Current state

- Canonical repository: `/home/kenke/bedrock-fake-player-lab/bedrock-headless-player`
- Branch in all writable repositories: `feat/bedrock-1.26.50`
- Official server tested: BDS 1.26.51.1, build 51061372
- Negotiated schema: Bedrock 1.26.50, protocol 2193
- `minecraft-data`: `098d90ab`
- `bedrock-protocol`: `74e1914f`
- live-tested application commit: `f045ce2b`
- Mojang reference: `refs/bedrock-protocol-docs`, tag `v1.26.50`, commit `475bd72e`
- obsolete bootstrap directory: `tmp/obsolete-bootstrap-project-20260916`

The 1.26.50 BDS uses NetherNet/WebRTC for gameplay. The protocol fork signs offline and authenticated offers, verifies the server JWT and detached fingerprint signature, pins plaintext-HTTP server keys, separates reliable reassembly from unreliable traffic, bounds fragmentation, reports pre-connect failures, handles both JSON and empty BDS status responses, and preserves RakNet behavior.

The data fork preserves 1.26.45 and adds generated 1.26.50 protocol data. It now includes the reviewed optional gathering fields, noise alignment, diagnostic position/dimension, debug-text line gap, pack-setting string arrays, and the exact 1.26.50 global block-state palette pinned by Geyser's 1.26.50 generator tag. The critical Cereal transition removes redundant outer presence markers from `PlayerAuthInput`, `InventoryTransaction`, and `ItemStackResponse`; normal optionals retain one marker.

The application completes resource-pack and loading-screen negotiation, requests a chunk radius, follows authoritative movement corrections, sends input at 20 Hz, moves briefly with the `up` input, returns to neutral ticks, and disconnects cleanly. The live harness waits before reusing the offline identity so BDS can destroy the prior WebRTC session.

## Operational notes

Use `scripts/setup-dev.sh` after changing either fork. Use `scripts/live-test.sh` for the complete cold integration test. It owns server cleanup only when it starts the server itself. Runtime server files belong under `server/` and `tmp/`, never in this repository.

The local server deliberately has `online-mode=false`. Keep its configured port local and do not expose it to an untrusted network. The managed server rotates its self-signed key at process start; `start-server.sh` resets the loopback TOFU pin then, while reconnects to the same process must match the saved pin. No Microsoft credentials or authentication caches are needed or stored.

Keep future work narrow. Add protocol fixes to `minecraft-data`, transport/session fixes to `bedrock-protocol`, and player behavior here. The project deliberately excludes world modeling, pathfinding, inventory automation, crafting, combat, and public-server compatibility work.
