# Endstone local-trust experiment — 2026-09-17

## Result

Outcome B: the Endstone-based local trust path works on official Linux BDS
**1.26.51.1**, build **51061372**, commit
`0559ac59aa24e42d30e238bc55cdb306232a6507`, network protocol **2193**.
It admits accountless external NetherNet players with `online-mode=true` while
leaving non-local identities on BDS's original Microsoft validator.

The standalone form is technically possible, but it is not small or safe
enough to duplicate yet. Endstone supplies the versioned ABI declarations,
executable-base resolution, detour registration/trampolines, BDS symbol update
pipeline, launcher, logging, and crash handling. Extracting this feature would
own all of those version-sensitive pieces for one hook.

## Exact revisions

- Endstone base: `v0.11` at
  `9066c3cc1f37fb0f5df6a73aec2a9b7310fc4451`
- Endstone experiment: branch `investigate/local-ownerbot-auth`, commits
  `41a65719` and `68ccf906de0d81442de3df4217319de13b32703c`
- headless-player implementation: branch `investigate/endstone-local-trust`,
  commit `7348e5b39922382a6fcf89fc53276b70acfc567b` plus this evidence commit
- bedrock-protocol unchanged:
  `fb0af8e388127724c323fd46800e47ba004b1c55`
- minecraft-data unchanged:
  `7c1fe886dd92837c0550e8eff91440361c7d677f`
- BDS ELF SHA-256:
  `e93e739f373a84edfff7c9cd76fcb090c2176744b412e1143f1b38e91a49bed4`
- BDS ELF Build ID: `ea299d3d03fca9827d3e71cf4e503ede30ba9805`

The unmodified Endstone base built and passed 226/226 tests before the auth
change. It booted the official server, signed into signaling, loaded a fresh
survival world with no pack stack, accepted console commands, and shut down
cleanly. Its install did not change level flags.

## Hook and authentication decision

The hook target is the existing Endstone detour for:

```text
ServerNetworkHandler::_validateLoginPacket(NetworkIdentifier const&, LoginPacket const&)
Linux RVA: 0x8918780 (143755136)
FDE range: 0x8918780..0x8919ec9
```

Calling the original validator and recovering from `nullopt` did not work: BDS
had already sent its blank Login disconnect before the wrapper returned. The
final hook therefore pre-routes only tokens whose untrusted `iss` exactly
matches the configured local issuer. A fully valid local token produces a
local/non-host `PlayerAuthenticationInfo`; non-local and invalid tokens call
the original BDS function. Ban and allow-list processing after authentication
remains unchanged.

The local owner token uses ES384 and contains only these policy claims:
`iss`, `aud`, `sub`, `xname`, `cpk`, `jti`, `iat`, `nbf`, and `exp`. It contains
no XUID or Microsoft entitlement claim. The client-data JWS must verify under
`cpk`; its `ThirdPartyName` and `SelfSignedId` must equal `xname` and `sub`.
The server records the accepted player with an empty XUID and the stable local
UUID.

## Live configuration and credentials

```properties
online-mode=true
allow-cheats=false
allow-list=false
transport=nethernet
server-port=19261
max-players=20
level-name=Endstone Ownerbot 2651
```

Endstone local auth was explicitly enabled with issuer `ownerbot://local`,
audience `endstone://local-ownerbot`, and a local P-384 public key. The client
used the matching local private key. No Microsoft/Xbox account, token, auth
cache, or entitlement was used. Private keys and complete tokens were not
recorded.

## Positive lifecycle and movement

The full client trace is
[`live-20260917T131015JST-endstone-ownerbot-first.jsonl`](live-20260917T131015JST-endstone-ownerbot-first.jsonl).
It records protocol 2193, `login_success`, resource-pack info, StartGame engine
1.26.51, spawn, 259 valid input ticks, 80 movement ticks, continued neutral
ticks after stopping, server corrections, stable connection, and clean
disconnect.

The reconnect trace is
[`live-20260917T131015JST-endstone-ownerbot-reconnect.jsonl`](live-20260917T131015JST-endstone-ownerbot-reconnect.jsonl).
The same local UUID logged in again, received StartGame at its saved position,
spawned, moved, stopped with zero final post-stop displacement, and disconnected
cleanly. A final smoke run after removing all profile XUID/title placeholders is
[`live-20260917T131015JST-endstone-ownerbot-final-smoke.jsonl`](live-20260917T131015JST-endstone-ownerbot-final-smoke.jsonl).

The sanitized BDS trace is
[`live-20260917T131015JST-endstone-ownerbot-server.txt`](live-20260917T131015JST-endstone-ownerbot-server.txt).
BDS `querytarget` recorded an initial player at Z=0.50 and the movement probe at
Z=5.70. Client corrections converged to the same server position and the server
continued accepting neutral input afterward.

## Negative controls

| Control | Boundary and result |
| --- | --- |
| Feature disabled | NetherNet and protocol 2193 succeeded; stock Login rejected the otherwise valid local identity. |
| Wrong owner key | Reached Login; local verifier logged `owner signature is invalid`; stock validator rejected it. |
| Modified payload/signature | Reached Login; local verifier logged `owner signature is invalid`; rejected. |
| Expired token | Reached Login; local verifier logged `local identity has expired`; rejected. |
| Wrong issuer | Reached Login; was not routed locally; stock online-mode validator rejected it. |
| Wrong `cpk` | NetherNet signaling rejected the offer with status 37 before Login, independently proving connection-key binding. |
| Replay | Deterministic C++ test accepted once and rejected the second use of the same `jti`. |

All negative clients exited nonzero and none received `login_success`.

No Microsoft-authenticated human credential was available for a live control.
The source-level preservation is direct: tokens outside the configured issuer,
including all normal Microsoft tokens, call the original function through
Endstone's trampoline; no Microsoft token verification code was patched.

## World and achievement eligibility

After all live runs and clean shutdown, `level.dat` contained:

```text
commandsEnabled=0
cheatsEnabled=0
hasBeenLoadedInCreative=0
GameType=0
ForceGameType=0
experiments_ever_used=0
saved_with_toggled_experiments=0
```

The server logged `Pack Stack - None`. No GameTest/Beta API or experiment was
enabled. This proves the hook did not intentionally alter the known
achievement-eligibility state. An actual Xbox achievement unlock was not tested.

## Scale result

- 1 client: full lifecycle and reconnect passed.
- 5 clients: 5/5 distinct UUIDs spawned, moved, idled, and disconnected.
- 10 clients: 10/10 distinct UUIDs spawned, moved, idled, and disconnected.
- Ten Node/WebRTC client processes sampled 1,694,032 KiB RSS total (165.4 MiB
  mean) and 117.3% summed CPU while connecting/spawning. The measurement was
  taken during the batch; the clients all exited afterward.
- One owner trust root authorized all bots; each connection generated its own
  ephemeral P-384 `cpk` and each name mapped to a different stable UUID.

The likely first scaling costs are one Node/node-datachannel runtime per bot,
NetherNet/WebRTC state, chunks, and BDS player simulation. Signature validation
is one short operation per Login and is not the expected steady-state limit.

## Automated validation

```text
headless-player: npm test                         18/18 passed
Endstone base before changes: ctest               226/226 passed
Endstone final: ctest                              232/232 passed
Endstone focused LocalOwnerbotAuthTest             6/6 passed
```

The cryptographic tests cover P-384 key generation/loading and permissions,
real ES384 verification, issuer/audience/time checks, wrong root signature,
malformed routing, replay, client-data signature, name/UUID/`cpk` binding,
disabled configuration, token tampering, and omission of Microsoft claims.

## Standalone-hook assessment

The current target can be found without private symbols using Endstone's public
pattern:

```text
55 41 57 41 56 41 55 41 54 53 48 81 EC ?? ?? ?? ??
49 89 CC 49 89 D7 49 89 F6 48 89 FB 48 8B 06 48 89 F7 48 89 D6
```

Semantic recovery notes: find the `realms\0` data reference in the function
that reads the adjacent short auth keys (`auth`, `uuid`, `xid`, `realms`, `pid`,
`nid`), walk to the prologue, then require an `.eh_frame` FDE beginning at the
candidate. On this binary the first virtual calls use vtable offsets 0x338 and
0x350, and the body compares protocol 0x891 (2193). Those checks reduce the
risk of a stale pattern resolving to an unrelated function.

A standalone Linux implementation would still need:

1. an `LD_PRELOAD` constructor and PIE executable-base discovery;
2. an inline/trampoline hook library such as funchook;
3. exact libc++ ABI declarations/layouts for `LoginPacket`,
   `BaseConnectionRequest`, `WebToken`, `PlayerAuthenticationInfo`,
   `RawGameServerToken`, `mce::UUID`, and `std::optional`;
4. the verifier, TOML configuration, OpenSSL, JSON parser, replay cache, and
   safe logging;
5. version-to-RVA/signature data, FDE/function-boundary validation, and update
   tooling for every BDS build;
6. crash diagnostics and a loader that supplies the matching libc++ runtime.

The feature-specific Endstone delta is 684 inserted lines including 234 lines
of tests. A standalone build would reuse roughly 350 verifier lines but add
several hundred lines of loader, ABI, resolution, and hook ownership plus its
own dependencies. The high-risk part is ABI/version maintenance, not the token
policy. Implementing a second live hook now would duplicate the most fragile
parts of Endstone without improving the trust boundary.

Endstone is therefore the pragmatic runtime for this feature today. A
standalone extraction becomes attractive only if deployment size is a hard
constraint and the operator accepts per-build binary validation. Endstone also
provides a useful plugin ecosystem for future server features; its steady-state
overhead did not prevent ten concurrent bots in this test.

## Remaining limits

- The runtime hook is pinned to BDS 1.26.51.1 Linux and must be re-resolved and
  live-tested for every BDS update.
- No live Microsoft-human login or real Xbox achievement unlock was exercised.
- The owner signer is currently local to each bot process. A production fleet
  should isolate it behind a small local token issuer or tightly restrict the
  bot host.
- Replay state is in memory and does not survive server restart; short expiry
  limits that window.
- Ten clients establish feasibility, not a 50/100-client capacity guarantee.
