# Trusted-key authentication investigation — 2026-09-17

## Versions and provenance

- Official Linux BDS: `1.26.51.1`, build `51061372`, branch `r/26_u5`, commit `0559ac59aa24e42d30e238bc55cdb306232a6507`
- Network schema: Bedrock `1.26.50`, protocol `2193`
- Starting `bedrock-protocol`: `fb0af8e388127724c323fd46800e47ba004b1c55`
- Starting `minecraft-data`: `7c1fe886dd92837c0550e8eff91440361c7d677f`
- Starting headless player: `8feb3475d37b7c50e90c5ccd5fcbb2ff3c702013`
- Mojang NetherNet guide revision inspected: `19e25de129227373e97dfa340af93ccf12c0feb9`
- Historical FakePlayer revisions inspected: `01fa84c1b26c9715c9d6c27d79eddfc7e10c9fc8` and `f1676958454702672f57ca775556f72d97d408b7`
- Test trusted-key SPKI SHA-256: `829e3c314d58284cc2543ef4ee7c1d582e5cd1f844217c97835aa423f11ffe95`
- Microsoft/Xbox account, token, or authentication cache used: **no**

The private test key was stored only under `/home/kenke/bedrock-fake-player-lab/tmp/trusted-key-auth/` with mode 0600. It is not committed. Full JWTs and private material were not retained.

## NetherNet, online mode, trusted key present

BDS configuration:

```properties
online-mode=true
transport=nethernet
allow-list=false
enable-lan-visibility=false
trusted-key=<base64 P-384 SPKI omitted>
```

The following client identity constructions were exercised:

1. Historical three-JWT chain anchored by the configured trusted key, with an empty multiplayer token and `AuthenticationType: 2` (`SELF_SIGNED`), matching Cloudburst's current serialization of the maintained FakePlayer code.
2. Current-format multiplayer token signed by the trusted key, with its `cpk` bound to the per-connection key and a dummy certificate chain.
3. Current-format self-signed token where the persistent configured trusted key was also the connection key and `cpk`.
4. The current token plus historical chain together.
5. Normal (`0`), guest (`1`), and self-signed (`2`) authentication-type probes; historical `FakePlayer` and current `Mojang` issuer variants; padded and historical unpadded SPKI representations.

All variants reached the same boundary. A representative compact trace was:

```text
server_identity_trusted ... domain=self
network_settings requestedProtocol=2193 expectedProtocol=2193 compression=deflate
Server requested disconnect: <empty>
Kicked: <empty>
```

No `play_status: login_success`, resource-pack packet, StartGame, or spawn followed. This places rejection after HTTP signaling and DTLS/WebRTC establishment, after RequestNetworkSettings, and at the Bedrock Login authentication step.

Raw sanitized client trace: `/home/kenke/bedrock-fake-player-lab/tmp/trusted-key-auth/nethernet-online-trusted-key.log`.

## NetherNet controls

An ordinary self-signed offline identity against the same `online-mode=true` server also reached `network_settings` and was rejected at Login. Repeating the trusted-key client after removing `trusted-key` from `server.properties` produced the same boundary. These controls show that local BDS signaling admission itself was not evidence of trusted-key authorization.

Sanitized traces:

- `/home/kenke/bedrock-fake-player-lab/tmp/trusted-key-auth/nethernet-online-offline-identity.log`
- `/home/kenke/bedrock-fake-player-lab/tmp/trusted-key-auth/nethernet-online-no-server-trusted-key.log`

An `online-mode=false` trusted-chain probe was also rejected at Login, while the established current offline OIDC form remains the known-good control. This corroborates that the historical certificate construction is no longer a valid protocol-2193 substitute.

## RakNet

With `online-mode=true`, the configured trusted key, and `transport=raknet`, BDS printed:

```text
Version: 1.26.51.1
Build ID: 51061372
IPv4 supported, port: 19172: Used for gameplay
Server started.
================ TRANSPORT TYPE ERROR  ===================
Your current connection type is not set to NetherNet. In this release, NetherNet is the only supported transport type.
Players will not be able to connect to your game without NetherNet.
```

RakNet ping and connect timed out; authentication was never reached. Raw server excerpt: `/home/kenke/bedrock-fake-player-lab/tmp/trusted-key-auth/raknet-online-server.log`.

## Determination

This is result **C** for BDS 1.26.51.1: `trusted-key` does not provide a Microsoft-free `online-mode=true` player login path on the current official server.

- NetherNet does not reject these local probes at signaling; it rejects them at Bedrock Login. Consequently, this observed BDS path does not require a Microsoft GameServerToken independently at signaling, even though Mojang's generic NetherNet partner documentation specifies one.
- RakNet cannot be used to reach the historical trusted-key Login path because this BDS release disables RakNet player connections before authentication.
- The `trusted-key` spelling remains in the BDS binary and is silently accepted in `server.properties`, but the matched-key and removed-key experiments showed no effective authorization at protocol 2193.

No generic `bedrock-protocol` trusted-key API was retained because none of the candidate wire forms was accepted. Experimental edits were discarded and the validated upstream-quality branch was left unchanged.

## Regression validation

- `npm test` in `bedrock-headless-player`: 6/6 passed, including explicit no-downgrade auth/transport checks and PlayerAuthInput coverage.
- `BEDROCK_TEST_VERSION=1.26.50 XDG_CACHE_HOME=/tmp/bedrock-standard-cache npm test` in `bedrock-protocol`: lint, TypeScript declarations, live vanilla 1.26.50, RakNet client/server/proxy, login verification, NetherNet, and schema tests passed; 62/62 tests.
- `./scripts/live-test.sh` against official BDS 1.26.51.1 restored to `online-mode=false`, `transport=nethernet`: passed connect, login, resources, StartGame, spawn, 199 neutral ticks, 20 movement ticks, server corrections confirming movement, stop, stable idle, clean disconnect, reconnect, second spawn, and second clean disconnect.
- Fresh compact live traces:
  - `evidence/live-20260916T172200Z-first.jsonl`
  - `evidence/live-20260916T172200Z-reconnect.jsonl`
  - `evidence/live-20260916T172200Z-server.txt`
- The managed BDS process stopped cleanly after the run.
