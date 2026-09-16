# Upstream-quality review remediation evidence — 2026-09-17

## Tested revisions

- Official Linux BDS: 1.26.51.1, build 51061372, branch `r/26_u5`, commit `0559ac59aa24e42d30e238bc55cdb306232a6507`
- Network schema: Bedrock 1.26.50, protocol 2193; `StartGame.engine`: `1.26.51`
- Mojang protocol docs: tag `v1.26.50`, commit `475bd72ed89036af4eb18426774ef3b953de7603`
- `minecraft-data`: `7c1fe886dd92837c0550e8eff91440361c7d677f`
- `bedrock-protocol`: `fb0af8e388127724c323fd46800e47ba004b1c55`
- Live-tested headless-player code: `21b60364f5573f4e0e3c2598b440527ba179a3c7`

## Review dispositions

1. **Furnace options — confirmed.** The packet used shifted type values and a single varint. Its canonical YAML now has `none=0`, `furnace=1`, `blast_furnace=2`, and `smoker=3`, followed by the complete left-tab enum, filtering bool, and layout enum. Generated JSON and a byte-level `[3, 10, 1, 4]` round trip cover the wire order.
2. **Default transport — confirmed.** Generic clients now choose NetherNet implicitly for 1.26.50 and later and retain RakNet for older versions. Explicit backend choices are unchanged. Public ping and `createClient()` try the current NetherNet default, then fall back to RakNet only when the caller did not select a backend. Current, older, explicit, JSON-status, empty-status, internal RakNet, and live NetherNet paths are covered.
3. **Node 14 package loading — confirmed.** `node-datachannel` is now optional and loaded only when NetherNet is instantiated. A separate Node-14 syntax regression in the new login code was also removed. A fresh packed production install loads the package and auth/login modules on Node 14.21.3; CI repeats this check. NetherNet itself is documented as requiring Node 18.20 or later.
4. **Block-derived datasets — confirmed.** Version 1.26.50 now resolves its own items and collision data. The reproducible importer produced 2,076 runtime items and 403 interned collision shapes, with collision cardinality checked for all 1,477 blocks. Representative 40-state stairs, 16-state fences, new poplar blocks, wool/concrete variants, and empty-collision plants are checked through the public generated package.
5. **New-block metadata — confirmed.** The prior 121 placeholders were replaced using exact Cloudburst attributes, Mojang behavior/loot definitions, and documented analogous-block inheritance. Every new block has an item and drop mapping; material/tool assertions cover wood, wool, concrete, plants, and state-heavy blocks. The four remaining `default` materials match their established sapling, shrub, mushroom, and bed analogues rather than an importer fallback.
6. **Map-decoration enum — confirmed.** The malformed duplicate sequence was replaced with Mojang's indices 23–30 (`witch_hut` through `count`). Generated mappings and symbolic encode/decode tests cover `warm_ocean_ruins=29`.
7. **Negotiated channel limit — confirmed.** Reliable fragmentation now uses `min(local cap, reliable.maxMessageSize()) - 1`, enforces the one-byte 256-fragment ceiling for that size, checks every native send result, and terminates the transport on send failure. Tests cover below/at/above boundaries, too-small limits, maximum payload, and false sends.
8. **Close during signaling — confirmed.** ICE gathering, fetch, timeout, and trust work share an abortable terminal lifecycle. Local close aborts and releases the peer while suppressing later callbacks. Tests close during ICE, pending fetch, and pending trust, including late resolve and reject paths.
9. **Native runtime shutdown — confirmed.** The native module is reference-counted across concurrent clients and automatically cleaned after the final peer closes. Child-process tests prove normal process exit and recreation after cleanup without application-level cleanup. The headless application removed its manual helper call and exited normally in both live sessions.
10. **Transient WebRTC disconnect — confirmed.** `disconnected` is treated as recoverable; only `failed`, `closed`, or channel closure is terminal. The state test covers `disconnected → connected` recovery followed by terminal failure.
11. **Typed public API — confirmed.** Declarations now include the NetherNet backend, URL/pin/trust options, server-identity event, cleanup export, corrected client/server constructors, and ping options. Strict TypeScript consumer compilation covers these additions and verifies ordinary inherited events remain usable.
12. **Disconnect reasons — confirmed.** Mojang values 148 and 149 now map to `missing_structure_data` and `unsupported_transport`; generated JSON and byte-level symbolic round trips cover value 149.

## Checks

```text
forks/minecraft-data/tools/js: npm run build                         PASS
forks/minecraft-data/tools/js: npm test                              PASS (1,881 passing, 1 pending)
forks/minecraft-data: deterministic 1.26.50 regeneration             PASS (22,091 states; 1,477 blocks; 2,076 items; 403 shapes)
forks/bedrock-protocol: npm run lint                                 PASS
forks/bedrock-protocol: npm run test:types                           PASS
forks/bedrock-protocol: npm run build                                PASS (all supported schemas compiled)
forks/bedrock-protocol: targeted NetherNet/schema tests              PASS (21 passing)
forks/bedrock-protocol: complete npm test version matrix             PASS (221 passing; 15 minutes)
forks/bedrock-protocol: implicit-backend createClient vs local BDS   PASS (NetherNet; protocol 2193; spawned)
packed package: Node 14.21.3 production install + require/auth load  PASS
bedrock-headless-player: npm test                                    PASS (2 passing)
bedrock-headless-player: bash -n scripts/*.sh                        PASS
bedrock-headless-player: ./scripts/live-test.sh                      PASS
```

Ubuntu 24.04 no longer supplies OpenSSL 1.1, which old official BDS fixtures need. The complete compatibility run uses an extracted official Ubuntu `libssl1.1_1.1.1f-1ubuntu2.24` package through `LD_LIBRARY_PATH`; nothing was installed system-wide.

## Fresh live result

The first client verified and trusted server identity pin `sha256:0e486c50ccc73edf0c341b170f417e87b1cd30338d6e3263654944a4172d8683`, negotiated protocol 2193, completed login, zero-pack negotiation, `StartGame`, loading-screen completion, and spawn. It sent 219 valid input ticks: 20 moving and 199 neutral. BDS `querytarget` observed Z move from 0.50 to 4.817328, then settle at 4.800103. The client remained connected for six seconds after stopping and disconnected cleanly.

The second client loaded the saved pin, completed the same login/spawn lifecycle, sent 59 neutral ticks, remained stable, and disconnected cleanly. BDS logged both connections, spawns, and disconnects. The harness stopped BDS, and the client process exited without calling the explicit cleanup helper; no BDS/client process or port listener remained.

- [`live-20260916T162752Z-first.jsonl`](live-20260916T162752Z-first.jsonl)
- [`live-20260916T162752Z-reconnect.jsonl`](live-20260916T162752Z-reconnect.jsonl)
- [`live-20260916T162752Z-server.txt`](live-20260916T162752Z-server.txt)

## Remaining limits and proposed upstream split

The authenticated NetherNet assertion path is covered with a cryptographically verified GameServerToken fixture, but no live Microsoft-account session was run because no credential was available or needed for the local offline BDS. Node 14 remains supported for package loading and RakNet consumers; NetherNet requires the native dependency's Node 18.20 minimum.

Recommended `minecraft-data` split: protocol structures/enums, then generated block/item/collision data plus importer and provenance. Recommended `bedrock-protocol` split: 1.26.50 wire fixtures, NetherNet runtime/default/lifecycle changes, then TypeScript declarations. These branches are ready for another independent upstream-quality review before those submission branches are prepared.
