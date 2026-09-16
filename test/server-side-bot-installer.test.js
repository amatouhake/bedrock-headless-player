'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const nbt = require('prismarine-nbt')
const {
  PACK_ID,
  PACK_VERSION,
  assertServerStopped,
  enableBehaviorPack,
  enableGameTestExperiment,
  install,
  parseProperties
} = require('../src/server-side-bot-installer')

function makeLevelDat (experiments = {}) {
  const root = {
    type: 'compound',
    name: '',
    value: {
      LevelName: { type: 'string', value: 'Fixture World' },
      experiments: { type: 'compound', value: experiments }
    }
  }
  const payload = nbt.writeUncompressed(root, 'little')
  const file = Buffer.alloc(payload.length + 8)
  file.writeUInt32LE(10, 0)
  file.writeUInt32LE(payload.length, 4)
  payload.copy(file, 8)
  return file
}

test('property parsing ignores comments and preserves values containing equals', () => {
  const properties = parseProperties('# comment\nonline-mode=true\nservice-overrides={"uri":"a=b"}\n')
  assert.equal(properties.get('online-mode'), 'true')
  assert.equal(properties.get('service-overrides'), '{"uri":"a=b"}')
})

test('installer detects the target server executable while it is running', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-running-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.symlinkSync('/usr/bin/sleep', path.join(directory, 'bedrock_server'))
  const process = spawn(path.join(directory, 'bedrock_server'), ['30'])
  context.after(() => process.kill())
  await new Promise((resolve, reject) => {
    process.once('spawn', resolve)
    process.once('error', reject)
  })
  assert.throws(() => assertServerStopped(directory), /BDS is still running as process/)
})

test('GameTest experiment patch is backed up, valid NBT, and idempotent', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-level-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const level = path.join(directory, 'level.dat')
  const backup = path.join(directory, 'level.dat.backup')
  fs.writeFileSync(level, makeLevelDat({ experiments_ever_used: { type: 'byte', value: 0 } }))

  assert.equal(await enableGameTestExperiment(level, backup), true)
  assert.deepEqual(fs.readFileSync(backup), makeLevelDat({ experiments_ever_used: { type: 'byte', value: 0 } }))
  const patched = fs.readFileSync(level)
  assert.equal(patched.readUInt32LE(4), patched.length - 8)
  const parsed = await nbt.parseUncompressed(patched.subarray(8), 'little')
  const experiments = parsed.value.experiments.value
  assert.equal(experiments.gametest.value, 1)
  assert.equal(experiments.experiments_ever_used.value, 1)
  assert.equal(experiments.saved_with_toggled_experiments.value, 1)

  assert.equal(await enableGameTestExperiment(level, path.join(directory, 'unused.backup')), false)
  assert.equal(fs.existsSync(path.join(directory, 'unused.backup')), false)
})

test('behavior-pack stack installation updates one entry without duplication', (context) => {
  const world = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-stack-'))
  context.after(() => fs.rmSync(world, { recursive: true, force: true }))
  fs.writeFileSync(path.join(world, 'world_behavior_packs.json'), JSON.stringify([
    { pack_id: 'another-pack', version: [4, 5, 6] },
    { pack_id: PACK_ID, version: [0, 0, 1] }
  ]))
  enableBehaviorPack(world)
  enableBehaviorPack(world)
  const stack = JSON.parse(fs.readFileSync(path.join(world, 'world_behavior_packs.json'), 'utf8'))
  assert.equal(stack.filter(entry => entry.pack_id === PACK_ID).length, 1)
  assert.deepEqual(stack.find(entry => entry.pack_id === PACK_ID).version, PACK_VERSION)
  assert.deepEqual(stack.find(entry => entry.pack_id === 'another-pack').version, [4, 5, 6])
})

test('installer preserves online mode and copies the pack into an isolated server fixture', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-install-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const server = path.join(directory, 'server')
  const world = path.join(server, 'worlds', 'Fixture World')
  const pack = path.join(directory, 'pack')
  fs.mkdirSync(world, { recursive: true })
  fs.mkdirSync(pack)
  fs.writeFileSync(path.join(pack, 'manifest.json'), '{}')
  fs.writeFileSync(path.join(server, 'server.properties'), 'online-mode=true\nlevel-name=Fixture World\n')
  fs.writeFileSync(path.join(world, 'level.dat'), makeLevelDat())

  const result = await install({ serverDirectory: server, packSource: pack, now: new Date('2026-09-17T00:00:00Z') })
  assert.equal(result.experimentChanged, true)
  assert.equal(fs.readFileSync(path.join(server, 'server.properties'), 'utf8'), 'online-mode=true\nlevel-name=Fixture World\n')
  assert.equal(fs.existsSync(path.join(result.destination, 'manifest.json')), true)
  assert.equal(fs.existsSync(result.backupPath), true)
  const stack = JSON.parse(fs.readFileSync(path.join(world, 'world_behavior_packs.json'), 'utf8'))
  assert.deepEqual(stack, [{ pack_id: PACK_ID, version: PACK_VERSION }])
})

test('installer refuses an offline-mode server', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerbot-offline-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'server.properties'), 'online-mode=false\nlevel-name=World\n')
  await assert.rejects(
    install({ serverDirectory: directory, packSource: directory }),
    /must explicitly keep online-mode=true/
  )
})
