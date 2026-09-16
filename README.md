# bedrock-headless-player

Minimal headless player client experiments for Minecraft Bedrock Edition.

The initial goal is deliberately narrow: connect to a self-hosted Bedrock Dedicated Server as a player on the newest supported Bedrock protocol, remain spawned, and perform simple player actions such as movement.

This repository is the project layer only. Protocol implementation work should remain in the local PrismarineJS forks unless a project-specific adapter is actually needed here.

## Local workspace

The development workspace is expected to live under `/home/kenke/bedrock-fake-player-lab/` with roughly this layout:

```text
bedrock-fake-player-lab/
├── project/                  # this repository
├── server/
│   ├── current/              # local BDS runtime
│   └── archives/
├── forks/
│   ├── bedrock-protocol/     # amatouhake fork + PrismarineJS upstream
│   └── minecraft-data/       # amatouhake fork + PrismarineJS upstream
├── refs/
│   └── bedrock-protocol-docs/ # Mojang protocol docs, reference only
├── captures/
├── notes/
└── tmp/
```

The forks already exist because the workspace bootstrap created them. That is fine; use them only when protocol changes are actually required.

## Scope

Keep the first milestone small:

1. identify the current Bedrock/BDS protocol version;
2. make the local `bedrock-protocol` + `minecraft-data` stack understand the minimum protocol surface needed by this client;
3. connect to the local BDS and reach a stable spawned state;
4. keep the player alive/connected;
5. send valid `PlayerAuthInput` for simple movement;
6. add only the smallest additional actions needed for validation.

Do not start by implementing pathfinding, a world model, inventory automation, combat AI, or an LLM agent layer.

See `AGENT_HANDOFF.md` before starting implementation.
