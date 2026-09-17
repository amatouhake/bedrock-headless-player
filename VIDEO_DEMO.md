# Persistent ten-bot video demo

This setup runs official BDS 1.26.51.1 through Endstone v0.11.11 plus the
local-ownerbot trust hook. It keeps `online-mode=true`, `allow-cheats=false`,
survival mode, and a world whose creative and experiment history flags remain
zero. It does not use GameTest, Beta APIs, commands, or a behavior pack.

The server uses NetherNet signaling on TCP port 19261 and an explicit
`server-udp-ports=20000-20100` range. A range is required for simultaneous
WebRTC clients; one UDP allocation admits only one peer.

This host uses WSL mirrored networking. Its Hyper-V firewall defaults to
blocking inbound traffic, and Windows cannot reach this WSL listener through
its own LAN address without a TCP proxy. With the demo server running, open an
**Administrator PowerShell** and run the committed LAN-only helper:

```powershell
powershell -ExecutionPolicy Bypass -File "\\wsl.localhost\Ubuntu\home\kenke\bedrock-fake-player-lab\bedrock-headless-player\scripts\allow-video-demo-firewall.ps1"
```

The helper permits TCP 19261 and UDP 20000-20100 only from
`192.168.1.0/24`. It also forwards the Windows LAN address on TCP 19261 to the
working WSL localhost signaling endpoint; NetherNet WebRTC traffic continues
directly over UDP. Connect the Windows Minecraft client to `192.168.1.5` port
`19261`. Pass `-Remove` later to delete the firewall rules and TCP proxy.
Linux-side automation cannot approve the Windows UAC prompt.

Start the server and ten persistent clients with:

```bash
cd /home/kenke/bedrock-fake-player-lab/bedrock-headless-player
./scripts/start-video-demo.sh
```

The launcher creates user-level transient services named
`ownerbot-video-bds.service` and `ownerbot-video-bot-01.service` through
`ownerbot-video-bot-10.service`. This keeps them alive after the launching
terminal exits. It starts the first bot alone to establish the server identity
pin, then starts the remaining clients.

In normal player chat, send `bots` with any capitalization and optional outer
whitespace. Each bot replies `ready!`, repeatedly jumps using
`PlayerAuthInput` for approximately ten seconds without horizontal input, then
returns to persistent idle. An active cycle ignores repeated triggers; a new
trigger works after completion. Messages sent by `OwnerBot01` through
`OwnerBot10` cannot trigger the action.

Runtime logs are under:

```text
/home/kenke/bedrock-fake-player-lab/tmp/video-demo-runtime/server.log
/home/kenke/bedrock-fake-player-lab/tmp/video-demo-runtime/bots/
```

After recording and achievement testing, stop all clients cleanly and ask BDS
to save and stop with:

```bash
cd /home/kenke/bedrock-fake-player-lab/bedrock-headless-player
./scripts/stop-video-demo.sh
```

The auth hook logs local bots as `Accepted local ownerbot` with an empty XUID.
An ordinary Microsoft-authenticated player does not match the local issuer and
continues through the original BDS validator. No Microsoft human login was
automated for this setup, and actual Xbox achievement unlocking remains a
manual test rather than a claimed result.
