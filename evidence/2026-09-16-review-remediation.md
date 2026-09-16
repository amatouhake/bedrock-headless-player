# Review remediation evidence — 2026-09-16

## Tested revisions

- Official Linux BDS: 1.26.51.1, build 51061372, branch `r/26_u5`, commit `0559ac59aa24e42d30e238bc55cdb306232a6507`
- Network schema: Bedrock 1.26.50, protocol 2193; `StartGame.engine`: `1.26.51`
- Mojang protocol docs: tag `v1.26.50`, commit `475bd72ed89036af4eb18426774ef3b953de7603`
- `minecraft-data`: `098d90ab363db8bc33bec48a140ce635a8fab2ad`
- `bedrock-protocol`: `74e1914f5ee41bb688460ae1af167be6a7a21f72`
- live-tested headless-player implementation: `f045ce2b88ea1cecf2d9c57e40891d1143c579c8`

## Review dispositions

1. **Server identity verification — confirmed.** The transport discarded an unverified assertion. It now verifies the self-signed server JWT through its embedded JWK, verifies the detached ES384 signature over canonical SDP fingerprints, and applies an explicit key pin or TOFU callback before stripping `a=identity`. Tests reject changed pins, fingerprint tampering, and missing assertions.
2. **Authenticated offer identity — confirmed.** Online offers omitted the already acquired `GameServerToken`. They now attach the token and sign the offer fingerprints with the bound client private key. A deterministic authenticated fixture verifies the resulting assertion; no Microsoft credential was used for a live online-mode test.
3. **NetherNet status handling — partial.** A documented JSON response was passed to the RakNet semicolon parser as claimed. The official BDS tested here instead returns HTTP 200 with `Content-Length: 0`. The public ping flow now handles both JSON and empty bodies, maps JSON status fields, and falls back to the selected/current version for an empty response. The fresh run used the empty-body path without `skipPing`.
4. **Cross-channel reassembly — confirmed.** Reliable and unreliable SCTP channels shared one fragment buffer. Reliable reassembly is now isolated; unreliable messages require header zero and are delivered as complete packets. Tests interleave unreliable traffic between reliable fragments and cover malformed-sequence recovery.
5. **Missing 1.26.50 schema fields — confirmed.** Mojang's tagged schemas require all eight optional gathering fields, `NoiseAlignment`, diagnostic position/dimension, debug-text line gap, and the string-array pack-setting variant. These are present in YAML and regenerated JSON, with byte-level round trips for presence markers, field order, compressed values, and variant payloads.
6. **1.26.50 block-state palette — confirmed.** Geyser's exact `26.2_1.26.50` generator tag pins Cloudburst data commit `7046791ae9fcf056a3b26cd6605ffc1db6d97357`. The version now maps to its own 22,091-state palette and 1,477-block index. Regression checks cover 16 fence connection states, 40 stair corner states, 256 tripwire states, and new poplar blocks.
7. **One-byte fragment count — confirmed.** The old 10,000-byte chunks overflowed the header above 256 fragments. Chunks now use the negotiated 262,144-byte SCTP maximum minus the header, and payloads above 256 such fragments are rejected. Tests cover zero length, one/two fragments, the exact 256-fragment maximum, and overflow.
8. **Pre-connect signaling errors — confirmed.** Early failures used the close path while status was still disconnected. The transport now has a single guarded error path wired to `Client`, including ICE state failures before channel open. Tests prove immediate error delivery without waiting for the connection timeout and suppress duplicate failures.
9. **Input tick rewind — confirmed.** Delayed corrections assigned `ack + 1` unconditionally. The player now advances with `max(current, ack + 1)`. Tests cover stale, equal, and future acknowledgements.

## Checks

```text
forks/minecraft-data/tools/js: npm run build                         PASS
forks/minecraft-data/tools/js: npm test                              PASS (1,876 passing, 1 pending)
forks/bedrock-protocol: targeted NetherNet/schema tests              PASS (12 passing)
forks/bedrock-protocol: BEDROCK_TEST_VERSION=1.26.50 npm test         PASS (53 passing)
bedrock-headless-player: npm test                                    PASS (1 file, 2 assertions/tests)
bedrock-headless-player: bash -n scripts/*.sh                        PASS
bedrock-headless-player: ./scripts/live-test.sh                      PASS
```

The complete protocol suite includes current vanilla BDS, in-process RakNet, and RakNet proxy coverage. The live remediation run used the local official BDS on port 19152 because rapid diagnostic restarts had temporarily prevented BDS from rebinding the default port; the scripts now read `server-port` and support a `BDS_PORT` override.

## Fresh live result

The first connection trusted verified server pin `sha256:bbf7c277f5ada4578746bd6b4bbe7681e5f119c3a50732759d0b891de54a99`. It negotiated protocol 2193, completed login, zero-pack negotiation, `StartGame`, loading-screen completion, and spawn. It sent 219 valid input ticks: 20 moving and 199 neutral. BDS observed position change from Z=0.50 to Z=4.853031 and then Z=4.800103 after three stopped seconds. The client remained connected through six seconds after stopping and disconnected cleanly.

The second client loaded the saved server pin, received runtime entity ID 19, completed the same lifecycle, sent 59 ticks, remained stable, and disconnected cleanly. BDS logged both connections, spawns, and disconnects. The harness stopped the server; a host process/socket check found no remaining BDS or client.

- [`live-20260916T145520Z-first.jsonl`](live-20260916T145520Z-first.jsonl)
- [`live-20260916T145520Z-reconnect.jsonl`](live-20260916T145520Z-reconnect.jsonl)
- [`live-20260916T145520Z-server.txt`](live-20260916T145520Z-server.txt)

## Remaining limits

Authenticated offer construction is deterministic-test evidence only because this local milestone intentionally uses offline mode. The player still has no chunk/world model, inventory behavior, pathfinding, combat, or public-server authentication. `blockCollisionShapes` and Java/Bedrock mapping tables still reuse earlier compatible datasets; the reviewed 1.26.50 global palette and block index are version-specific.
