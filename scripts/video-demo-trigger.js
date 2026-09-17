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
  await wait(1000)
  player.sendChat('bots')
  await wait(13000)
  player.sendChat('Bots')
  await wait(13000)
  player.disconnect('Demo trigger validation complete')
  await connection
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => player.disconnect(`Received ${signal}`))
}

main().catch(error => {
  player.disconnect('Demo trigger validation failed')
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
