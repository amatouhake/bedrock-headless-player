# Endstone local-ownerbot authentication

This experimental path admits explicitly signed external bots to an official
Bedrock Dedicated Server while the server keeps `online-mode=true`. Ordinary
players still use BDS's normal Microsoft/Xbox validator. It was tested with
official Linux BDS 1.26.51.1, build 51061372, protocol 2193.

The implementation is split between:

- Endstone branch `investigate/local-ownerbot-auth`, commit
  `68ccf906de0d81442de3df4217319de13b32703c`, based on Endstone `v0.11`
  commit `9066c3cc1f37fb0f5df6a73aec2a9b7310fc4451`;
- this repository's `investigate/endstone-local-trust` branch;
- unchanged `bedrock-protocol` commit
  `fb0af8e388127724c323fd46800e47ba004b1c55` and `minecraft-data` commit
  `7c1fe886dd92837c0550e8eff91440361c7d677f`.

This is a version-sensitive BDS runtime hook. It is not a stock Endstone
feature and it has not been proposed upstream.

## Decision flow

The current BDS validator sends its rejection before returning an empty
`PlayerAuthenticationInfo`, so a wrapper cannot call vanilla validation and
then recover. The hook instead uses the configured issuer as an explicit route:

1. parse the untrusted issuer claim;
2. if it does not exactly match `local-bot-auth.issuer`, call the original BDS
   validator unchanged;
3. if it matches, require a valid ES384 owner signature, issuer, audience,
   validity window, one-use `jti`, local UUID/name, and P-384 `cpk`;
4. verify the client-data JWT with that `cpk` and bind `ThirdPartyName` and
   `SelfSignedId` to the owner token;
5. construct a local, non-host `PlayerAuthenticationInfo` with no XUID;
6. send invalid local candidates through the stock validator, which rejects
   them under online mode.

No Microsoft issuer, XUID, entitlement, or token is asserted by the local
identity. The `cpk` also binds the NetherNet offer to the client's ephemeral
connection key. The server logs local acceptance with an empty XUID, making the
path distinguishable from Microsoft authentication.

## Build Endstone

Use the exact base revision and branch:

```bash
cd /home/kenke/bedrock-fake-player-lab/tmp
git clone https://github.com/EndstoneMC/endstone.git endstone-reference
cd endstone-reference
git switch --detach 9066c3cc1f37fb0f5df6a73aec2a9b7310fc4451
git switch -c investigate/local-ownerbot-auth
# Apply or fetch commits 41a65719 and 68ccf906 from the saved experiment.

conan install . --build=missing -s '&:build_type=RelWithDebInfo'
source build/RelWithDebInfo/generators/conanbuild.sh
cmake --preset conan-relwithdebinfo
cmake --build --preset conan-relwithdebinfo
ctest --test-dir build/RelWithDebInfo --output-on-failure
```

Endstone's normal Linux build requires Clang and libc++. This host had Clang 18
but no system libc++, so the validated build used locally extracted Debian
libc++20/libc++abi20/libunwind20 packages under
`tmp/endstone-sysroot20` and put their include/library paths in
`CPLUS_INCLUDE_PATH`, `LIBRARY_PATH`, and `LD_LIBRARY_PATH`. This is a host
workaround, not a runtime design requirement. The resulting suite passed
232/232 tests.

Stage/install the resulting Endstone package by the project's normal wheel
workflow, or install the built runtime and Python extension into an Endstone
package tree. The validated runtime was launched with:

```bash
PYTHONPATH=/path/to/endstone-package \
LD_LIBRARY_PATH=/path/to/libc++20/lib \
python -m endstone -s /path/to/bds -y
```

## Generate the owner key

From this project:

```bash
npm install
npm run ownerbot:key
```

The command creates `.local-ownerbot/owner-private.pem` with mode 0600 and
`.local-ownerbot/owner-public.pem`, then prints the public PEM and both paths.
The directory is ignored by Git. Existing private-key paths must be regular
files; symlinks are rejected.

Copy only the public key to a server-owned location. Configure `endstone.toml`:

```toml
[local-bot-auth]
enabled = true
issuer = "ownerbot://local"
audience = "endstone://local-ownerbot"
public-key-file = "/absolute/path/to/owner-public.pem"
clock-skew-seconds = 5
max-token-lifetime-seconds = 120
```

The BDS properties used for validation were:

```properties
online-mode=true
allow-cheats=false
allow-list=false
transport=nethernet
server-port=19261
max-players=20
```

No experiment or behavior pack is needed.

## Run a bot

The server's self-signed NetherNet identity changes on each BDS process start.
Use a fresh pin file after a deliberate restart, then retain it for reconnects
to that process.

```bash
node src/cli.js \
  --host 127.0.0.1 \
  --port 19261 \
  --username OwnerBot1 \
  --auth local-ownerbot \
  --transport nethernet \
  --owner-private-key .local-ownerbot/owner-private.pem \
  --owner-public-key .local-ownerbot/owner-public.pem \
  --server-identity-pin-path .local-ownerbot/server-19261.pin
```

The auth modes remain explicit. The client never downgrades
`local-ownerbot` to offline mode and never changes the selected transport.

## Security and operational limits

- Possession of the owner private key authorizes local bot identities. Keep it
  on an operator-controlled issuer/bot host and rotate the configured public
  key if it is exposed.
- The replay cache is process-local and cleared by a BDS restart. Tokens live
  for at most 120 seconds by default and carry a fresh random `jti`.
- Each bot gets a distinct stable UUID derived from issuer and name, and a new
  ephemeral P-384 connection key for each session. One owner root can authorize
  many bots.
- The successful 10-client sample used about 165 MiB RSS per Node/WebRTC client.
  Client processes, chunk traffic, and BDS player simulation will limit scale
  before signature verification does.
- The test preserved survival mode, `allow-cheats=false`, commands disabled,
  and both experiment-history flags at zero. This establishes configuration
  and world eligibility preservation; no Xbox achievement unlock was live
  tested.
- No Microsoft-authenticated human account was available for a live control.
  Structurally, every token outside the exact local issuer still calls the
  original BDS validator, and the feature-disabled live control rejected the
  same local identity.

See [`evidence/2026-09-17-endstone-local-trust.md`](evidence/2026-09-17-endstone-local-trust.md)
for the complete test record and standalone-hook assessment.
