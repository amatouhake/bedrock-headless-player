# Authentication boundary on BDS 1.26.51.1

The headless player supports explicit `offline` and experimental `local-ownerbot` modes over NetherNet. It rejects `trusted-key` and RakNet explicitly. These decisions are based on live tests against official Linux BDS 1.26.51.1 (build 51061372, protocol 2193), rather than on historical property behavior.

## Current result

| BDS player transport | `online-mode=false`, offline identity | `online-mode=true`, trusted key, no Microsoft credentials | `online-mode=true`, Microsoft |
| --- | --- | --- | --- |
| NetherNet | Full lifecycle live-tested | Signaling, DTLS, and protocol negotiation succeed; BDS rejects the Login packet | Not live-tested in this project |
| RakNet | Unavailable in this BDS release | Unavailable in this BDS release | Unavailable in this BDS release |

For **stock BDS**, this remains the current result. A broader investigation also tested hidden service configuration, fixed service environments, candidate service overrides, and the script join gate; none added a second trusted client issuer. See [`evidence/2026-09-17-online-bot-auth-options.md`](evidence/2026-09-17-online-bot-auth-options.md).

The Endstone experiment adds the missing trust point as a narrow BDS runtime hook. With `--auth local-ownerbot --transport nethernet`, a short-lived ES384 token under the server owner's configured key was live-accepted with `online-mode=true`, an empty Microsoft XUID, no experiments, and the full spawn/movement/reconnect lifecycle. All other issuers still enter the stock Microsoft validator. This is an explicit server modification rather than a newly discovered `trusted-key` behavior; see [`ENDSTONE_LOCAL_TRUST.md`](ENDSTONE_LOCAL_TRUST.md).

For the self-hosted-server use case, stock BDS does have an accountless path that does not weaken network authentication: create a GameTest `SimulatedPlayer` inside the server. The actor has no XUID or network session, while ordinary clients still face `online-mode=true`. The included implementation and live commands are documented in [`SERVER_SIDE_BOTS.md`](SERVER_SIDE_BOTS.md). This option requires the permanent Beta APIs experiment and should not be used where achievement eligibility must remain intact.

The RakNet cells are transport failures, before any authentication mechanism can run. Although `server.properties` still accepts `transport=raknet`, BDS logs that NetherNet is the only supported transport in this release and does not expose a usable RakNet gameplay endpoint.

## What was tested

For the trusted-key probe, a persistent EC P-384 key was generated outside the repository. Its X.509 SubjectPublicKeyInfo DER was base64-encoded for `trusted-key`; its private key never appeared in logs or committed files.

The current OIDC-style attempts covered both plausible trust bindings: a trusted-key-signed multiplayer token whose `cpk` was the per-connection P-384 key, and a self-signed token where the persistent configured trusted key was itself the connection key and `cpk`. The connection key signed the NetherNet fingerprint assertion and client-data JWT. The legacy attempt reproduced the historical three-token certificate path with `AuthenticationType: 2` (`SELF_SIGNED`): connection key to trusted key, trusted key to an ephemeral CA, and ephemeral CA back to the connection key with player identity claims. A combined request supplied both current and legacy forms. BDS rejected every form at the Bedrock Login packet when `online-mode=true`.

The signaling boundary is observable. Both the trusted-key probe and an unrelated self-signed offline identity received an SDP answer, established DTLS/WebRTC, and received `NetworkSettings` for protocol 2193 before BDS sent an empty-reason Disconnect in response to Login. Removing `trusted-key` did not move this boundary. Therefore this BDS build does not use `trusted-key` as an effective Login authorization mechanism, and its local signaling endpoint does not require a Microsoft-issued token before DTLS. This is narrower than the generic partner flow in Mojang's [NetherNet onboarding guide](https://github.com/Mojang/bedrock-protocol-docs/blob/main/additional_docs/NetherNetOnboardingGuide.md), which specifies auth-service validation of the client's GameServerToken but also describes admission as server policy.

The historical implementation studied was [`ddf8196/FakePlayer`](https://github.com/ddf8196/FakePlayer/tree/01fa84c1b26c9715c9d6c27d79eddfc7e10c9fc8), plus a maintained 2026 fork at commit `f1676958454702672f57ca775556f72d97d408b7`. It generated P-384 keys, wrote unpadded base64 SPKI to `trusted-key`, and sent the legacy three-JWT chain described above. That behavior is useful protocol history, but it does not pass current protocol 2193 Login validation.

## Deliberate failure behavior

These commands fail before opening a connection and do not downgrade authentication or change transport:

```bash
node src/cli.js --auth trusted-key --transport nethernet
node src/cli.js --auth offline --transport raknet
```

The known-good local test remains:

```bash
./scripts/configure-server.sh
./scripts/live-test.sh
```

`configure-server.sh` sets `online-mode=false` and binds the disposable local NetherNet test server. Do not expose that configuration publicly.
