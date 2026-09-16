# Current-BDS accountless player investigation — 2026-09-17

## Result

Official Linux BDS **1.26.51.1**, build **51061372**, commit `0559ac59aa24e42d30e238bc55cdb306232a6507`, advertises engine 1.26.51 and uses network protocol **2193** (Mojang schema 1.26.50).

There is no verified stock configuration that admits an **external** accountless player while preserving `online-mode=true`. The current Login validator trusts Minecraft-service keys or the server's self-signed/offline policy; `trusted-key`, service discovery, service overrides, allow lists, and the script join gate did not add a second client issuer.

There is a practical stock-BDS solution when the fake player can run inside the server: the experimental GameTest `spawnSimulatedPlayer` API. A committed behavior pack and installer provide operator-controlled accountless players while ordinary network clients continue through the unchanged online-mode authentication path.

## Current authentication path

| Layer | Verified behavior and trust point |
| --- | --- |
| NetherNet signaling | Client posts an SDP offer to `/v1/join/{networkId}`. Mojang's partner guide defines an offer `a=identity` carrying a Minecraft-auth-service `GameServerToken`, whose `cpk` signs the DTLS fingerprints. Current localhost BDS was more permissive at this layer: earlier self-signed offers reached DTLS and protocol 2193 even with online mode enabled. |
| DTLS/WebRTC | The fingerprint assertion binds the asserted connection key to the WebRTC certificate. Successful DTLS does not imply an accepted Bedrock Login. |
| Bedrock Login | Protocol 2193 supplies the current connection request/token material. `ServerConnectionAuthValidator` holds `mAllowSelfSigned` plus one `MinecraftServiceKeyManager`; `GameServerToken::_validate` verifies the token through that manager. Live custom-key attempts were rejected here. |
| Identity | The auth service's OIDC metadata advertises RS256 and claims including `xid`, `xname`, `cpk`, platform and permissions. Validated claims populate `PlayerAuthenticationInfo`; XUID/name/UUID then feed bans, allow-list and player state. |
| Authorization | Ban/allow-list/join policy happens after authentication. It cannot turn an untrusted Login into a trusted identity. |

The local generated headers used as binary-layout evidence are LeviLamina `b1dbaf6ad2c8ff81f3c84ec5e54295d55b013ab0`. Relevant declarations are `ServerConnectionAuthValidator`, `GameServerToken`, and `MinecraftServiceKeyManager`. The latter is constructed with one key source and metadata/JWKS fetch functions. This supports, but does not alone prove, the conclusion that stock BDS has one active issuer/key set rather than an additive local issuer list; the live configuration tests below supply the runtime evidence.

## Stock configuration discovery

### Verified

- The shipped `server.properties` documents `online-mode`, `allow-list`, and transport but has no custom issuer/JWKS option.
- The binary contains active parsers for undocumented `service-discovery` and `service-overrides`, plus legacy `trusted-key` and `allow-player-joining` strings.
- `config/` contained only script module permissions; it contained no authentication, OIDC, issuer, key, or service endpoint configuration.
- Running `bedrock_server --help` started the server; it did not reveal a separate command-line configuration surface.
- A binary-string scan found no plausible BDS/Minecraft authentication, issuer, JWKS, signaling, or service-endpoint environment-variable names. This rules out exposed string-keyed variables, though not an environment input assembled dynamically in code.
- `service-discovery={"environment":"prod","maxRetryAttempts":1}` resolved `client.discovery.minecraft-services.net`, then `authorization.franchise.minecraft-services.net`.
- `environment=dev` selected the fixed Mojang dev discovery and auth hosts. Stage and perf likewise selected fixed Mojang environment hosts in the broader probe.
- A per-service object in `environment` fell back to production. The parsed `DiscoveryConfig` is eight bytes in the generated current headers, consistent with an environment enum and retry setting, not an endpoint table.
- `service-overrides` is stored as `unordered_map<string,string>`. Tested flat and nested forms for `auth`, the exact authorization hostname/URI, `EndpointDiscoveryWebService`, `endpointDiscovery`, and `serviceLocator`. None changed discovery or OIDC DNS requests. The preserved matrix is [`online-auth-discovery-dns-matrix.txt`](online-auth-discovery-dns-matrix.txt).
- The official build discovery response selected `https://authorization.franchise.minecraft-services.net` for production auth. Its OIDC metadata selected issuer `https://authorization.franchise.minecraft-services.net/` and `https://authorization.franchise.minecraft-services.net/.well-known/keys`.

### Undocumented and unresolved

`service-overrides` is parsed and retained, so it is not a dead property parser. Its precise internal key namespace was not recovered. The concrete auth/discovery/service-locator spellings above did not redirect startup authentication traffic, and no request reached the local capture endpoint. It is therefore not a usable auth override on the evidence available, but this report does not claim that every unrelated service consumer ignores the map.

The fixed `dev`, `stage`, and `perf` environments replace the service environment globally. They do not add a server-owner key or a second issuer and are not legitimate production authentication routes.

## Authorization controls that failed

1. **`trusted-key`:** the prior live phase tested current and historical signed chains. NetherNet/DTLS and `NetworkSettings` succeeded; Login failed. Removing or mismatching the property did not move the boundary. See [`2026-09-17-trusted-key-auth.md`](2026-09-17-trusted-key-auth.md).
2. **Custom issuer/service endpoint:** candidate `service-overrides` shapes continued to contact Mojang production discovery and authorization; the local endpoint received no request.
3. **Allow list and permissions:** these consume an already authenticated identity. They cannot establish identity.
4. **`allow-player-joining=false` plus `@minecraft/server-admin`:** an `asyncPlayerJoin` handler that unconditionally called `allowJoin()` was loaded. A self-signed external client established NetherNet and protocol 2193, then received a Disconnect at Login. The handler emitted no event. The gate is therefore after Login authentication for this path.
5. **RakNet:** current BDS 1.26.51.1 does not expose a usable RakNet player endpoint, so it offers no alternate current authentication entry point.

No Microsoft signature verification was disabled or spoofed in these tests.

## Verified stock solution: server-side simulated players

The test server used:

```properties
online-mode=true
transport=nethernet
allow-list=false
allow-cheats=false
server-port=19180
level-name=Online Owner Bot Live
```

The installer enabled the GameTest experiment in `level.dat`, installed pack `99d57d87-e1ee-4d64-8cb3-06b5fe18e875`, and left the properties above unchanged. BDS logged successful signaling-service sign-in and Minecraft-service readiness before accepting operator commands. No Microsoft account, token, key, or auth cache was used by the simulated player.

Fresh final run evidence is [`live-20260917T042231JST-online-ownerbot-server.txt`](live-20260917T042231JST-online-ownerbot-server.txt):

```text
Version: 1.26.51.1
Build ID: 51061372
Experiment(s) active: gtst
Pack Stack - [00] Local owner simulated players ...
Signed in to signaling service successfully
Waiting for Minecraft services...
[OWNERBOT] spawned name=WalkBot ... xuid=<empty> at={"z":0,"y":53,"x":0}
Target ... "z" : 0.0
[OWNERBOT] walking name=WalkBot speed=0.8 ...
[OWNERBOT] stopped name=WalkBot at={"z":6.699999809265137,"y":50,"x":0}
Target ... "z" : 6.699999809265137
Target ... "z" : 6.699999809265137
[OWNERBOT] disconnected name=WalkBot
There are 0/10 players online
[OWNERBOT] spawned name=WalkBot ... xuid=<empty>
There are 1/10 players online: WalkBot
[OWNERBOT] disconnected name=WalkBot
Stopping server... Quit correctly
```

This proves spawn, server-observed normal walking, stop and stable position, clean removal, same-name respawn, and clean BDS exit under online mode. It does not prove an external network login because this architecture deliberately avoids one.

## Extension and hook options

### Endstone / narrow BDS hook

Endstone PR [#534](https://github.com/EndstoneMC/endstone/pull/534) merged 1.26.51 support into `v0.11` on 2026-09-16. The examined `v0.11` commit was `9066c3cc1f37fb0f5df6a73aec2a9b7310fc4451`; public PyPI 0.11.10 predates this server build. The current symbol table identifies Linux `ServerNetworkHandler::_validateLoginPacket` at `143755136`, and Endstone already hooks that function while delegating normal validation first.

Endstone does not currently expose `SimulatedPlayer` in its public plugin API. A narrow external-local-issuer extension is technically feasible, but must be a loader/core change rather than a normal plugin:

1. keep vanilla `_validateLoginPacket` and its Microsoft result unchanged;
2. only when vanilla validation fails, parse a separate local issuer token;
3. require a configured local public key, ES384 signature, issuer/audience, expiry/not-before, nonce/replay protection, and connection-key (`cpk`) binding;
4. synthesize the minimum `PlayerAuthenticationInfo` only after all local checks pass;
5. reject malformed, wrong-key, expired, replayed, and missing-binding tokens;
6. live-test that ordinary Microsoft validation still follows the original path.

Before implementing, trace whether the original validation function has already queued a disconnect when it returns `null`; if so, hook `ServerConnectionAuthValidator::_validateBase` or the caller before that side effect. This hook is version-sensitive and needs revalidation for every BDS build.

### LeviLamina

LeviLamina has mature native `SimulatedPlayer` hooks and fixes, but its latest examined releases target BDS 26.40.x/protocol 2168 while the target is 26.51.1/protocol 2193. It is not a current-build deployment choice today.

### Alternative servers

PowerNukkitX 3.0.5 advertises Bedrock 1.26.50/protocol 2193 and is the closest current replacement. Its `ProxyAuthProvider.isUnsignedLoginAllowed()` is a global unsigned-login decision in the examined source, not a per-key local trust path. A secure implementation would need a per-identity signature predicate and is a server-core change. It also does not provide BDS's vanilla implementation or a verified genuine-Xbox-achievement guarantee, so it is not competitive when vanilla behavior and achievements are requirements.

PocketMine-MP and other protocol reimplementations have still larger vanilla/gameplay gaps. They were not adopted.

## Cost fallback

The Prismarine Bedrock auth flow obtains Xbox/PlayFab service credentials and then a multiplayer token from the franchise authorization service. It does not make the Java-style entitlement query itself, so source inspection does not establish that each identity must separately purchase Bedrock.

Microsoft documents that multiplayer uses a Microsoft account and that entitlements may be direct, bundle/subscription, or device-shared on a client. It also documents that service-to-service entitlement queries do not return shared entitlements because they lack device context. Therefore:

- one distinct Microsoft/Xbox identity is required for each simultaneous external bot identity;
- the account itself has zero purchase price;
- whether current Bedrock multiplayer-token issuance accepts an unentitled fresh account remains **unresolved** here;
- it is not justified to multiply the retail game price by bot count without testing token issuance.

The smallest safe test is one fresh adult Microsoft/Xbox account with no Bedrock purchase: request the normal Bedrock service and multiplayer tokens, then attempt this local online BDS. Compare with one entitled account. No bulk purchase is needed to answer the entitlement question. This investigation had no credentials and did not run that test.

## Approach comparison

| Approach | `online-mode=true` | Microsoft account per bot | Genuine achievements | Latest BDS | Scale | Effort / maintenance | Security / cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stock config / service override | Yes | Would be no if it existed | Yes | Yes | External-client scale | No working mechanism found | No new trust surface; not viable |
| Custom local issuer in stock BDS | No additive issuer found | No | In principle yes | No stock support | External-client scale | Requires versioned core hook | Must implement full signature/replay/binding checks |
| Narrow Endstone/BDS auth hook | Yes | No | Expected unchanged, needs live proof | Source support merged; unreleased | External-client scale | High initial work; per-build symbols/tests | Local key becomes high-value credential; no account fees |
| Stock GameTest simulated player | Yes | No | **Not preserved/unsupported choice:** Beta experiment permanently marks world experimental | **Live-tested 1.26.51.1** | In-process; not benchmarked | Low; API may change | Server-console trust only; zero per-bot cost |
| Microsoft-authenticated external bot | Yes | Yes | Yes | Yes | Account/token operational limits | Moderate; token refresh/caches | Account cost free; purchase entitlement unresolved |
| PowerNukkitX/replacement | Configurable | Can be no after core work | Not verified as genuine Xbox behavior | Protocol 2193, not BDS parity | Server-dependent | High migration and compatibility cost | Larger trust and gameplay surface |

## Validation performed

```text
npm test
# 12/12 passing (including running-server refusal, NBT backup/patch,
# pack-stack idempotence, online-mode preservation, and offline-mode refusal)

node scripts/install-server-side-bot.js --server-dir .../tmp/online-bot-live
# first install backed up and patched level.dat; second was idempotent

official BDS console:
scriptevent ownerbot:spawn WalkBot 0 53 0
querytarget @a[name=WalkBot]
scriptevent ownerbot:walk WalkBot 0.8
scriptevent ownerbot:stop WalkBot
querytarget @a[name=WalkBot]
scriptevent ownerbot:disconnect WalkBot
scriptevent ownerbot:spawn WalkBot 0 53 0
scriptevent ownerbot:disconnect
stop
```

No BDS, client, or bot process remained after the final run. The Prismarine protocol/data repositories were not changed in this phase.

## Primary/current references

- Mojang NetherNet identity flow: <https://github.com/Mojang/bedrock-protocol-docs/blob/main/additional_docs/NetherNetOnboardingGuide.md>
- Official BDS properties: <https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties?view=minecraft-bedrock-stable>
- Official BDS scripting configuration: <https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting?view=minecraft-bedrock-stable>
- Global `spawnSimulatedPlayer`: <https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/minecraft-server-gametest?view=minecraft-bedrock-experimental>
- `SimulatedPlayer` API: <https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer?view=minecraft-bedrock-experimental>
- Experimental-world permanence: <https://learn.microsoft.com/en-us/minecraft/creator/documents/experimentalfeaturestoggle?view=minecraft-bedrock-stable>
- Current production OIDC metadata: <https://authorization.franchise.minecraft-services.net/.well-known/openid-configuration>
- Endstone 1.26.51 support: <https://github.com/EndstoneMC/endstone/pull/534>
- LeviLamina releases: <https://github.com/LiteLDev/LeviLamina/releases>
- PowerNukkitX releases: <https://github.com/PowerNukkitX/PowerNukkitX/releases>
- Microsoft entitlement semantics: <https://learn.microsoft.com/en-us/xbox/gdk/docs/store/commerce/service-to-service/xstore-query-user-entitlements?view=gdk-2604>
- Minecraft multiplayer requirements: <https://help.minecraft.net/hc/en-us/articles/35930809028749-Minecraft-Requirements-to-Play-Minecraft-Multiplayer-Games>
