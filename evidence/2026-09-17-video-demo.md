# Endstone v0.11.11 persistent video demo — 2026-09-17

## Pinned software

- Official Linux BDS: 1.26.51.1, build 51061372, branch `r/26_u5`
- Advertised/network protocol: 2193 (`1.26.50` schema)
- Endstone base: tag `v0.11.11`, commit
  `37b395378d91d6d20f1c52bf9d79dbd20e152458`
- Endstone local-auth branch: `investigate/local-ownerbot-auth-v0.11.11`,
  commit `0d677f9d33c8a465266e03672d0fdf82f2a42038`
- Headless-player branch: `investigate/endstone-local-trust`; demo
  implementation commit `53ca8df`
- Unchanged `bedrock-protocol`: `fb0af8e388127724c323fd46800e47ba004b1c55`
- Unchanged `minecraft-data`: `7c1fe886dd92837c0550e8eff91440361c7d677f`

## Build and automated tests

- Endstone C++ suite: 232/232 passed.
- Endstone Python suite: 107/107 passed, including preservation of an
  operator-supplied `LD_LIBRARY_PATH` in the Linux launcher.
- `bedrock-headless-player`: 21/21 passed. New coverage serializes the actual
  protocol-2193 chat packet, checks vertical-only jump input, exact trigger
  matching, bot-source rejection, and reentrancy.

## World and server state

The final stopped-world inspection immediately before the persistent launch
reported:

```text
LevelName="Endstone Ownerbot 2651"
GameType=0
ForceGameType=0
commandsEnabled=0
cheatsEnabled=0
hasBeenLoadedInCreative=0
experiments_ever_used=0
saved_with_toggled_experiments=0
```

`server.properties` has `online-mode=true`, `allow-cheats=false`, survival,
`force-gamemode=false`, `transport=nethernet`, signaling port 19261, and
`server-udp-ports=20000-20100`. No behavior or resource pack stack file is
present. BDS logged `Pack Stack - None` and Endstone 0.11.11 startup.

This verifies preserved eligibility state; it does not claim that an Xbox
achievement has been unlocked. That remains the user's manual test.

## Fresh live result

The final server run started at 18:04:24 JST. `OwnerBot01` through
`OwnerBot10` each followed the separate ES384 local-ownerbot validator,
connected with an empty XUID, received StartGame, spawned, and entered
persistent input ticking. Their stable local UUIDs are distinct.

A temporary external local identity named `DemoDirector` sent normal chat
messages `bots` and `Bots`, 13 seconds apart. On both cycles:

- BDS broadcast the trigger and all ten `ready!` replies;
- every bot generated vertical-only `PlayerAuthInput` jump impulses for
  10.17–10.46 seconds, with no horizontal input;
- every bot logged completion and returned to idle;
- all bot error counts remained zero;
- the second trigger proves the cooldown cleared;
- `DemoDirector` disconnected cleanly, leaving exactly the ten named bots.

The final service check found BDS and all ten bot units `active/running`.
Observed unit main PIDs were BDS launcher 1059100 and bots 1059234, 1059352,
1059462, 1059596, 1059736, 1059891, 1060089, 1060317, 1060569, and 1060817.
The processes are intentionally still running.

Evidence files:

- `live-20260917T180424JST-video-demo-server.txt`: BDS/Endstone startup,
  separate local acceptance, ten spawns, both chat/reply cycles, and probe
  disconnect.
- `live-20260917T180424JST-video-demo-bots.txt`: sanitized per-bot UUID, spawn,
  cycle, reply, jump, timing, correction, and error summary.
- Active runtime logs:
  `/home/kenke/bedrock-fake-player-lab/tmp/video-demo-runtime/`.

## Microsoft path and LAN access

The hook still routes only the exact configured `ownerbot://local` issuer.
Every other token enters the original BDS validator. A live Microsoft human
login was not performed because no credentials were used by automation; the
server log will distinguish a normal human XUID from the bots' explicit local
acceptance and empty XUID.

The WSL mirrored host address is `192.168.1.5`; host-side HTTP signaling
returned protocol 2193 and ten current players. Windows Hyper-V firewall has a
default inbound-block policy. The attempted non-elevated creation of narrow
LAN rules was denied with Windows error 5, so an Administrator PowerShell must
run `scripts/allow-video-demo-firewall.ps1` before the Android LAN join. The
script permits only TCP 19261 and UDP 20000-20100 from `192.168.1.0/24` and
does not restart or alter the running services.
