'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { HeadlessPlayer } = require('../src/player')

test('defaults explicitly to offline NetherNet', () => {
  const player = new HeadlessPlayer()
  assert.equal(player.options.auth, 'offline')
  assert.equal(player.options.transport, 'nethernet')
})

test('rejects trusted-key instead of downgrading authentication', () => {
  assert.throws(
    () => new HeadlessPlayer({ auth: 'trusted-key', transport: 'nethernet' }),
    /trusted-key authentication is unavailable.*rejects current self-signed tokens and historical trusted certificate chains/
  )
})

test('rejects RakNet instead of switching transports', () => {
  assert.throws(
    () => new HeadlessPlayer({ auth: 'offline', transport: 'raknet' }),
    /RakNet is unavailable.*accepts only NetherNet/
  )
})

test('keeps Microsoft authentication distinct from offline mode', () => {
  assert.throws(
    () => new HeadlessPlayer({ auth: 'microsoft', transport: 'nethernet' }),
    /Unsupported authentication mode: microsoft/
  )
})

test('accepts local-ownerbot only as an explicit NetherNet authentication mode', () => {
  const player = new HeadlessPlayer({ auth: 'local-ownerbot', transport: 'nethernet' })
  assert.equal(player.options.auth, 'local-ownerbot')
  assert.equal(player.options.transport, 'nethernet')
})
