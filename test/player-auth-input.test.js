'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const protocolRoot = path.resolve(__dirname, '..', '..', 'forks', 'bedrock-protocol')
const { createDeserializer, createSerializer } = require(path.join(protocolRoot, 'src', 'transforms', 'serializer'))
const { HeadlessPlayer } = require('../src/player')

test('1.26.50 neutral PlayerAuthInput has one marker per optional', () => {
  const serializer = createSerializer('1.26.50')
  const deserializer = createDeserializer('1.26.50')
  const packet = {
    pitch: 0,
    yaw: 0,
    position: { x: 1, y: 64, z: 2 },
    move_vector: { x: 0, z: 0 },
    head_yaw: 0,
    input_data: [],
    input_mode: 'mouse',
    play_mode: 'normal',
    interaction_model: 'crosshair',
    interact_rotation: { x: 0, z: 0 },
    tick: 42n,
    delta: { x: 0, y: 0, z: 0 },
    analogue_move_vector: { x: 0, z: 0 },
    camera_orientation: { x: 0, y: 0, z: 1 },
    raw_move_vector: { x: 0, z: 0 }
  }
  const encoded = serializer.createPacketBuffer({ name: 'player_auth_input', params: packet })
  const decoded = deserializer.parsePacketBuffer(encoded).data
  assert.equal(decoded.name, 'player_auth_input')
  assert.deepEqual(decoded.params.input_data, [])
  assert.equal(decoded.params.tick, 42n)
  assert.equal(decoded.params.transaction, undefined)
  assert.equal(encoded.length, 92)
})

test('server corrections never rewind PlayerInputTick', () => {
  const player = new HeadlessPlayer()
  player.tick = 80n
  player.advanceInputTick(42n)
  assert.equal(player.tick, 80n)
  player.advanceInputTick(79n)
  assert.equal(player.tick, 80n)
  player.advanceInputTick(100n)
  assert.equal(player.tick, 101n)
})

test('demo input is vertical-only and emits valid jump flags', () => {
  const queued = []
  const player = new HeadlessPlayer({ username: 'OwnerBot01', demoEnabled: true, jumpDurationMs: 10000 })
  player.client = { status: 4, queue: (name, packet) => queued.push({ name, packet }) }
  player.position = { x: 10, y: 64, z: -3 }
  player.groundY = 64
  player.startDemo('HumanPlayer')
  player.sendTick()
  const input = queued.find(entry => entry.name === 'player_auth_input').packet
  assert.equal(input.position.x, 10)
  assert.equal(input.position.z, -3)
  assert.equal(input.move_vector.x, 0)
  assert.equal(input.move_vector.z, 0)
  assert.deepEqual(input.input_data, ['jump_down', 'start_jumping', 'jumping'])
  assert.ok(input.delta.y > 0)
  player.disconnect()
})

test('demo trigger is exact, ignores bot sources, and is reentrant after completion', () => {
  const player = new HeadlessPlayer({ username: 'OwnerBot03', demoEnabled: true })
  player.client = { status: 4, queue: () => {} }
  player.handleText({ type: 'chat', source_name: 'HumanPlayer', message: ' BOTS ' })
  assert.equal(player.demoActive, true)
  assert.equal(player.startDemo('HumanPlayer'), false)
  player.airborne = false
  player.finishDemo()
  assert.equal(player.startDemo('HumanPlayer'), true)
  player.finishDemo()
  player.handleText({ type: 'chat', source_name: 'OwnerBot09', message: 'bots' })
  assert.equal(player.demoActive, false)
  player.handleText({ type: 'system', source_name: 'HumanPlayer', message: 'bots' })
  assert.equal(player.demoActive, false)
  player.disconnect()
})

test('demo chat reply serializes with the 1.26.50 packet layout', async () => {
  const serializer = createSerializer('1.26.50')
  const deserializer = createDeserializer('1.26.50')
  const queued = []
  const player = new HeadlessPlayer({ username: 'OwnerBot01', demoEnabled: true, replyStaggerMs: 0 })
  player.client = { status: 4, queue: (name, packet) => queued.push({ name, packet }) }
  player.startDemo('HumanPlayer')
  await new Promise(resolve => setTimeout(resolve, 5))
  const reply = queued.find(entry => entry.name === 'text')
  const encoded = serializer.createPacketBuffer({ name: reply.name, params: reply.packet })
  const decoded = deserializer.parsePacketBuffer(encoded).data.params
  assert.equal(decoded.type, 'chat')
  assert.equal(decoded.category, 'authored')
  assert.equal(decoded.source_name, 'OwnerBot01')
  assert.equal(decoded.message, 'ready!')
  assert.equal(decoded.has_filtered_message, false)
  player.disconnect()
})
