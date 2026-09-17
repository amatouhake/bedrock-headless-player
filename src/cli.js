#!/usr/bin/env node
'use strict'

const { HeadlessPlayer } = require('./player')

function args (values) {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    if (!key?.startsWith('--') || values[index + 1] === undefined) throw new Error(`Invalid argument: ${key}`)
    result[key.slice(2)] = values[index + 1]
  }
  return result
}

function position (value) {
  if (!value) return undefined
  const coordinates = value.split(',').map(Number)
  if (coordinates.length !== 3 || coordinates.some(Number.isNaN)) throw new Error('Position must be x,y,z')
  return { x: coordinates[0], y: coordinates[1], z: coordinates[2] }
}

function boolean (value) {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Expected true or false, got: ${value}`)
}

async function main () {
  const options = args(process.argv.slice(2))
  const overrides = {
    host: options.host,
    port: options.port && Number(options.port),
    username: options.username,
    auth: options.auth,
    transport: options.transport,
    position: position(options.position),
    protocolPath: options['protocol-path'] || process.env.BEDROCK_PROTOCOL_PATH,
    serverIdentityPinPath: options['server-identity-pin-path'],
    ownerPrivateKeyPath: options['owner-private-key'],
    ownerPublicKeyPath: options['owner-public-key'],
    localAuthIssuer: options['local-auth-issuer'],
    localAuthAudience: options['local-auth-audience'],
    localAuthVariant: options['local-auth-variant'],
    identityId: options['identity-id'],
    persistent: boolean(options.persistent),
    demoEnabled: boolean(options['demo-enabled']),
    demoTrigger: options['demo-trigger'],
    jumpDurationMs: options['jump-duration-ms'] && Number(options['jump-duration-ms']),
    replyStaggerMs: options['reply-stagger-ms'] && Number(options['reply-stagger-ms']),
    logOtherPlayerPositions: boolean(options['log-other-player-positions']),
    idleBeforeMs: options['idle-before-ms'] && Number(options['idle-before-ms']),
    moveMs: options['move-ms'] && Number(options['move-ms']),
    idleAfterMs: options['idle-after-ms'] && Number(options['idle-after-ms']),
    speedPerTick: options['speed-per-tick'] && Number(options['speed-per-tick'])
  }
  for (const key of Object.keys(overrides)) if (overrides[key] === undefined) delete overrides[key]
  const player = new HeadlessPlayer(overrides)
  const stop = signal => player.disconnect(`Received ${signal}`)
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))
  await player.connect()
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
