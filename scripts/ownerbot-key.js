#!/usr/bin/env node
'use strict'

const path = require('node:path')
const {
  loadOrCreateOwnerKeyPair,
  writePublicKey
} = require('../src/local-ownerbot-auth')

function parseArgs (values) {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    if (!key?.startsWith('--') || values[index + 1] === undefined) throw new Error(`Invalid argument: ${key}`)
    result[key.slice(2)] = values[index + 1]
  }
  return result
}

const options = parseArgs(process.argv.slice(2))
const privateKeyPath = path.resolve(options.private || '.local-ownerbot/owner-private.pem')
const publicKeyPath = path.resolve(options.public || '.local-ownerbot/owner-public.pem')
const keys = loadOrCreateOwnerKeyPair(privateKeyPath)
writePublicKey(publicKeyPath, keys.publicKeyPem)

process.stdout.write(JSON.stringify({
  created: keys.created,
  privateKeyPath,
  publicKeyPath,
  privateKeyMode: '0600',
  publicKeyPem: keys.publicKeyPem.trim()
}, null, 2) + '\n')
