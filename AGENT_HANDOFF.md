# Agent handoff

## Mission

Build the smallest useful headless Minecraft Bedrock player client for a self-hosted Bedrock Dedicated Server (BDS).

The first success condition is not “Mineflayer for Bedrock.” It is:

- connect to the local BDS as a real player session;
- complete login/resource-pack/start-game/spawn lifecycle;
- remain connected reliably;
- send valid `PlayerAuthInput` and demonstrate simple movement;
- keep the implementation small enough that future Bedrock protocol bumps are cheap to port.

## Workspace

Assume the surrounding workspace already exists:

```text
/home/kenke/bedrock-fake-player-lab/
├── project/                    # this repository
├── server/current/             # local BDS runtime
├── forks/bedrock-protocol/     # user fork; upstream should be PrismarineJS/bedrock-protocol
├── forks/minecraft-data/       # user fork; upstream should be PrismarineJS/minecraft-data
├── refs/bedrock-protocol-docs/ # Mojang/bedrock-protocol-docs; reference only
├── captures/
├── notes/
└── tmp/
```

Before changing anything, verify the actual paths, git remotes, branch names, working-tree cleanliness, and current SHAs. Do not assume the bootstrap state is perfect.

## Current context to verify before coding

As of 2026-09-16, the relevant transition was Bedrock 1.26.45 -> 1.26.50. Re-check upstream before relying on this because the ecosystem moves quickly.

At that point:

- PrismarineJS `bedrock-protocol` supported 1.26.45;
- Mojang published 1.26.50 protocol metadata/docs;
- Mojang documented binary wire-format changes affecting `PlayerAuthInputPacket`, `InventoryTransactionPacket`, and `ItemStackResponsePacket` due removal of redundant Cereal presence markers;
- Mojang also documented StartGame-related behavior changes.

Treat Mojang protocol docs as the primary reference, then compare PrismarineJS `minecraft-data` schemas and `bedrock-protocol` behavior.

## Implementation policy

1. Start with inspection and a concrete compatibility gap report.
2. Prefer fixing protocol data in `forks/minecraft-data` when the problem is schema/data-driven.
3. Change `forks/bedrock-protocol` only when runtime/login/handshake behavior requires it.
4. Keep this project repository focused on the thin headless-player runtime and integration tests.
5. Do not vendor whole upstream repositories into this project.
6. Record every upstream/fork SHA used for a successful live test.
7. Add a reproducible minimal live test against the local BDS.
8. Never commit credentials, auth caches, packet captures containing secrets, or BDS world data.

## Authentication / server policy

The BDS is self-hosted, but do not silently weaken its authentication or security configuration. Inspect the existing `server.properties` first.

If an offline/local-only setup is useful for protocol debugging, document the proposed change and its consequences before changing `online-mode` or related settings. Prefer keeping protocol compatibility work independent from authentication policy where possible.

## First milestone

A good first milestone should prove all of the following with logs or tests:

1. the client negotiates the intended current protocol version;
2. it reaches `start_game`/spawn without parse or serialization errors;
3. it remains connected for a meaningful interval;
4. it can send neutral `PlayerAuthInput` ticks safely;
5. it can move a short, controlled distance and stop;
6. reconnect/cleanup does not leave a broken process or stale state.

## Explicit non-goals for the first milestone

Do not implement these unless they become strictly necessary to prove the milestone:

- pathfinding;
- full chunk/world modeling;
- block search;
- inventory automation;
- crafting;
- combat logic;
- visual perception;
- LLM/agent orchestration;
- multi-agent support;
- public-server compatibility hacks.

## Expected working style

Investigate first, then make the smallest patch that is justified by evidence. Keep protocol-version changes isolated and easy to diff against upstream. If the newest Bedrock version requires a broad PrismarineJS update, separate “minimum needed for this client” from “complete upstream-quality protocol support” and report that distinction clearly.
