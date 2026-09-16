'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const protocolRoot = path.resolve(__dirname, '..', '..', 'forks', 'bedrock-protocol')
const { createDeserializer, createSerializer } = require(path.join(protocolRoot, 'src', 'transforms', 'serializer'))

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
