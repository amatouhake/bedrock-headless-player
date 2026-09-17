'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const JWT = require('jsonwebtoken')
const {
  createLocalIdentityToken,
  createLocalOwnerbotAuth,
  loadOrCreateOwnerKeyPair,
  stableIdentityId,
  tamperPayload
} = require('../src/local-ownerbot-auth')

test('generates and reuses a mode-0600 P-384 owner key', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-key-'))
  const filename = path.join(directory, 'owner-private.pem')
  const first = loadOrCreateOwnerKeyPair(filename)
  fs.chmodSync(filename, 0o644)
  const second = loadOrCreateOwnerKeyPair(filename)
  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(first.publicKeyDerBase64, second.publicKeyDerBase64)
  assert.equal(fs.statSync(filename).mode & 0o777, 0o600)
  assert.equal(first.privateKey.asymmetricKeyDetails.namedCurve, 'secp384r1')
})

test('refuses a symlink as a private-key path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-key-link-'))
  const real = path.join(directory, 'real.pem')
  loadOrCreateOwnerKeyPair(real)
  const link = path.join(directory, 'linked.pem')
  fs.symlinkSync(real, link)
  assert.throws(() => loadOrCreateOwnerKeyPair(link), /regular file, not a symlink/)
})

test('creates a cryptographically valid local identity bound to the client key', () => {
  const owner = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  const client = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  const cpk = client.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const identityId = stableIdentityId('ownerbot://local', 'CryptoBot')
  const token = createLocalIdentityToken({
    privateKey: owner.privateKey,
    identityId,
    username: 'CryptoBot',
    clientPublicKey: cpk,
    now: 1_800_000_000,
    tokenId: 'b26f0455-9505-4c4e-a3f0-a1c72b58b8ef'
  })
  const claims = JWT.verify(token, owner.publicKey, {
    algorithms: ['ES384'],
    issuer: 'ownerbot://local',
    audience: 'endstone://local-ownerbot',
    clockTimestamp: 1_800_000_001
  })
  assert.equal(claims.sub, identityId)
  assert.equal(claims.xname, 'CryptoBot')
  assert.equal(claims.cpk, cpk)
  assert.equal(claims.xid, undefined)
  assert.equal(claims.XUID, undefined)
})

test('tampering changes the payload without producing a valid signature', () => {
  const owner = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  const client = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  const token = createLocalIdentityToken({
    privateKey: owner.privateKey,
    identityId: stableIdentityId('ownerbot://local', 'TamperBot'),
    username: 'TamperBot',
    clientPublicKey: client.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  })
  assert.throws(() => JWT.verify(tamperPayload(token, { xname: 'Attacker' }), owner.publicKey, {
    algorithms: ['ES384']
  }), /invalid signature/)
})

test('authflow emits a fresh owner-signed token and a stable local identity', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-flow-'))
  const auth = createLocalOwnerbotAuth({
    username: 'FlowBot',
    privateKeyPath: path.join(directory, 'private.pem'),
    publicKeyPath: path.join(directory, 'public.pem')
  })
  const client = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  const cpk = client.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const first = await auth.authflow.getMinecraftBedrockToken(cpk)
  const second = await auth.authflow.getMinecraftBedrockToken(cpk)
  const ownerPublic = crypto.createPublicKey(fs.readFileSync(path.join(directory, 'public.pem')))
  const firstClaims = JWT.verify(first.token, ownerPublic, { algorithms: ['ES384'] })
  const secondClaims = JWT.verify(second.token, ownerPublic, { algorithms: ['ES384'] })
  assert.equal(firstClaims.sub, auth.identityId)
  assert.equal(secondClaims.sub, auth.identityId)
  assert.notEqual(firstClaims.jti, secondClaims.jti)
  assert.equal(first.chain.length, 2)
  const profile = JWT.decode(first.chain[1])
  assert.equal(profile.extraData.displayName, 'FlowBot')
  assert.equal(profile.extraData.identity, auth.identityId)
  assert.equal(profile.extraData.XUID, undefined)
  assert.equal(profile.extraData.titleId, undefined)
})
