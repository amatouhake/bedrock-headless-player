# Accountless server-side players with online mode enabled

The practical stock-BDS solution is a GameTest `SimulatedPlayer`. It is created inside the trusted server process, so it has no network connection, Xbox identity, or Microsoft credential. Network clients still pass through normal BDS authentication because `online-mode=true` remains unchanged.

This is different from the external `bedrock-protocol` headless player. Use it when an in-world server-side actor is sufficient and the experimental-world tradeoff is acceptable.

## Install

Use official BDS 1.26.51.1 or a compatible newer build. Configure a private test world with at least:

```properties
online-mode=true
transport=nethernet
allow-cheats=false
content-log-console-output-enabled=true
```

Start BDS once so it creates the configured world, then stop it cleanly. Install dependencies and the behavior pack:

```bash
cd /home/kenke/bedrock-fake-player-lab/bedrock-headless-player
npm install
npm run install:server-bot -- --server-dir /home/kenke/bedrock-fake-player-lab/server/current
```

The installer:

- refuses to run while that BDS executable is active;
- refuses a server unless it explicitly has `online-mode=true`;
- makes a timestamped `level.dat` backup before its first change;
- enables the `gametest`/Beta APIs experiment;
- copies the pack under `development_behavior_packs`;
- adds one idempotent entry to `world_behavior_packs.json`;
- does not change authentication, transport, allow-list, cheats, or other server policy.

The experiment is a permanent world-level compatibility choice. Mojang labels Beta APIs experimental, and experimental worlds cannot be restored to a non-experimental state through supported settings. Use a world copy and do not use this route for a world where Xbox achievement eligibility must be preserved.

## Operate

Start the managed BDS and send commands through its console:

```bash
./scripts/start-server.sh
./scripts/server-command.sh scriptevent ownerbot:spawn Worker1 0 70 0
./scripts/server-command.sh scriptevent ownerbot:walk Worker1 0.8
./scripts/server-command.sh scriptevent ownerbot:stop Worker1
./scripts/server-command.sh scriptevent ownerbot:status
./scripts/server-command.sh scriptevent ownerbot:teleport Worker1 10 70 10
./scripts/server-command.sh scriptevent ownerbot:disconnect Worker1
./scripts/stop-server.sh
```

`spawn` accepts `[name [x y z]]`; omitted coordinates use the world spawn X/Z at Y=100. `walk` must be stopped explicitly and accepts a speed from 0 through 1. `disconnect` with no name removes every player created by this pack. The console log prefixes all lifecycle records with `[OWNERBOT]`.

The live test used `online-mode=true`, `transport=nethernet`, `allow-cheats=false`, and no Microsoft credential. BDS listed the simulated player as online with empty XUID/PFID, observed normal walking from Z=0.0 to Z=6.7, observed a stable stopped position, removed it, and spawned the same name again. See [the investigation report](evidence/2026-09-17-online-bot-auth-options.md) and [raw sanitized server evidence](evidence/live-20260917T042231JST-online-ownerbot-server.txt).

## Limits

- `SimulatedPlayer` and the global `spawnSimulatedPlayer` function are experimental GameTest APIs and may change with BDS updates.
- These actors exist only inside one BDS process. They cannot join another server, exercise NetherNet/Login compatibility, or represent a real Xbox identity.
- They count as players in the BDS player list. Scale is bounded by server/world load and was not benchmarked here.
- Mojang notes that some ordinary entity/player events do not fire identically for simulated players.
- The supplied pack is a small operator control surface, not a pathfinder or automation framework.
