#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { HeadlessPlayer } = require('../src/player')

const projectRoot = path.resolve(__dirname, '..')
const labRoot = path.resolve(projectRoot, '..')
const port = Number(process.env.BDS_PORT || 19261)
const player = new HeadlessPlayer({
  host: '127.0.0.1',
  port,
  username: 'DemoDirector',
  auth: 'local-ownerbot',
  transport: 'nethernet',
  persistent: true,
  demoEnabled: false,
  logOtherPlayerPositions: false,
  protocolPath: path.join(labRoot, 'forks', 'bedrock-protocol'),
  serverIdentityPinPath: path.join(labRoot, 'tmp', 'video-demo-runtime', 'server-identity.pin'),
  ownerPrivateKeyPath: path.join(projectRoot, '.local-ownerbot', 'owner-private.pem'),
  ownerPublicKeyPath: path.join(projectRoot, '.local-ownerbot', 'owner-public.pem')
})

function wait (milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForSpawn () {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (player.position && player.client?.status === 4) return
    await wait(100)
  }
  throw new Error('DemoDirector did not spawn within 30 seconds')
}

async function main () {
  const connection = player.connect()
  await waitForSpawn()

  // Move the probe away from its spawn point using normal PlayerAuthInput so
  // the live server log can prove that teleport targets the speaker's current
  // position, rather than a shared spawn coordinate.
  player.input = 'forward'
  await wait(3000)
  player.input = 'neutral'
  await wait(1000)
  const triggerPosition = { ...player.position }
  player.log('tp_trigger_position', { position: triggerPosition })
  player.sendChat('  BOTS TP  ')
  await wait(3000)
  player.disconnect('Teleport trigger validation complete')
  await connection
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => player.disconnect(`Received ${signal}`))
}

main().catch(error => {
  player.disconnect('Teleport trigger validation failed')
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
