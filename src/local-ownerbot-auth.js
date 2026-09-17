'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const JWT = require('jsonwebtoken')

const DEFAULT_ISSUER = 'ownerbot://local'
const DEFAULT_AUDIENCE = 'endstone://local-ownerbot'

function atomicPrivateWrite (filename, contents) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  fs.writeFileSync(temporary, contents, { mode: 0o600, flag: 'wx' })
  fs.renameSync(temporary, filename)
  fs.chmodSync(filename, 0o600)
}

function loadOrCreateOwnerKeyPair (privateKeyPath) {
  let privateKey
  let created = false
  if (fs.existsSync(privateKeyPath)) {
    const metadata = fs.lstatSync(privateKeyPath)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('Local ownerbot private key path must be a regular file, not a symlink')
    }
    fs.chmodSync(privateKeyPath, 0o600)
    privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath))
  } else {
    const generated = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
    privateKey = generated.privateKey
    atomicPrivateWrite(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
    created = true
  }
  if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'secp384r1') {
    throw new Error('Local ownerbot key must be an EC P-384 private key')
  }
  const publicKey = crypto.createPublicKey(privateKey)
  return {
    privateKey,
    publicKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    publicKeyDerBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    created
  }
}

function writePublicKey (publicKeyPath, publicKeyPem) {
  fs.mkdirSync(path.dirname(publicKeyPath), { recursive: true })
  fs.writeFileSync(publicKeyPath, publicKeyPem, { mode: 0o644 })
}

function stableIdentityId (issuer, name) {
  const bytes = crypto.createHash('sha256').update(`${issuer}\0${name}`, 'utf8').digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return [
    bytes.subarray(0, 4).toString('hex'),
    bytes.subarray(4, 6).toString('hex'),
    bytes.subarray(6, 8).toString('hex'),
    bytes.subarray(8, 10).toString('hex'),
    bytes.subarray(10).toString('hex')
  ].join('-')
}

function signCompact (payload, privateKey, header = {}) {
  return JWT.sign(payload, privateKey, {
    algorithm: 'ES384',
    header: { kid: 'ownerbot-local', ...header }
  })
}

function tamperPayload (token, changes) {
  const parts = token.split('.')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  parts[1] = Buffer.from(JSON.stringify({ ...payload, ...changes })).toString('base64url')
  return parts.join('.')
}

function createLocalIdentityToken ({
  privateKey,
  issuer = DEFAULT_ISSUER,
  audience = DEFAULT_AUDIENCE,
  identityId,
  username,
  clientPublicKey,
  now = Math.floor(Date.now() / 1000),
  lifetimeSeconds = 60,
  tokenId = crypto.randomUUID(),
  variant = 'valid'
}) {
  let tokenIssuer = issuer
  let cpk = clientPublicKey
  let issuedAt = now
  let notBefore = now - 1
  let expiresAt = now + lifetimeSeconds
  if (variant === 'wrong-issuer') tokenIssuer = `${issuer}/wrong`
  if (variant === 'expired') {
    issuedAt = now - 300
    notBefore = now - 300
    expiresAt = now - 180
  }
  if (variant === 'wrong-cpk') {
    cpk = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).publicKey
      .export({ type: 'spki', format: 'der' }).toString('base64')
  }
  const payload = {
    iss: tokenIssuer,
    aud: audience,
    sub: identityId,
    xname: username,
    cpk,
    jti: tokenId,
    iat: issuedAt,
    nbf: notBefore,
    exp: expiresAt
  }
  const token = signCompact(payload, privateKey)
  return variant === 'tampered' ? tamperPayload(token, { xname: `${username}-tampered` }) : token
}

function createProfileCertificate ({ privateKey, publicKeyDerBase64, identityId, username, clientPublicKey, issuer }) {
  return signCompact({
    iss: issuer,
    extraData: {
      displayName: username,
      identity: identityId
    },
    certificateAuthority: false,
    identityPublicKey: clientPublicKey
  }, privateKey, { x5u: publicKeyDerBase64 })
}

function createLocalOwnerbotAuth ({
  username,
  privateKeyPath,
  publicKeyPath,
  issuer = DEFAULT_ISSUER,
  audience = DEFAULT_AUDIENCE,
  identityId = stableIdentityId(issuer, username),
  lifetimeSeconds = 60,
  variant = 'valid'
}) {
  const keys = loadOrCreateOwnerKeyPair(privateKeyPath)
  if (publicKeyPath) writePublicKey(publicKeyPath, keys.publicKeyPem)
  const authflow = {
    async getMinecraftBedrockToken (clientPublicKey) {
      const token = createLocalIdentityToken({
        privateKey: keys.privateKey,
        issuer,
        audience,
        identityId,
        username,
        clientPublicKey,
        lifetimeSeconds,
        variant
      })
      const profileCertificate = createProfileCertificate({
        privateKey: keys.privateKey,
        publicKeyDerBase64: keys.publicKeyDerBase64,
        identityId,
        username,
        clientPublicKey,
        issuer
      })
      return { chain: [profileCertificate, profileCertificate], token }
    }
  }
  return {
    authflow,
    identityId,
    issuer,
    audience,
    publicKeyPem: keys.publicKeyPem,
    created: keys.created
  }
}

module.exports = {
  DEFAULT_AUDIENCE,
  DEFAULT_ISSUER,
  createLocalIdentityToken,
  createLocalOwnerbotAuth,
  loadOrCreateOwnerKeyPair,
  stableIdentityId,
  tamperPayload,
  writePublicKey
}
