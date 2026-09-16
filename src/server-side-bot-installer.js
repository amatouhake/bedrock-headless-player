'use strict'

const fs = require('node:fs')
const path = require('node:path')
const nbt = require('prismarine-nbt')

const PACK_ID = '99d57d87-e1ee-4d64-8cb3-06b5fe18e875'
const PACK_VERSION = [1, 0, 0]
const PACK_DIRECTORY = 'local_owner_simulated_players'

function parseProperties (contents) {
  const properties = new Map()
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator >= 0) properties.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }
  return properties
}

function assertServerStopped (serverDirectory) {
  const executablePath = path.resolve(serverDirectory, 'bedrock_server')
  const expectedExecutable = fs.existsSync(executablePath) ? fs.realpathSync(executablePath) : executablePath
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      if (fs.realpathSync(`/proc/${entry}/exe`) === expectedExecutable) {
        throw new Error(`BDS is still running as process ${entry}; stop it before installing the behavior pack`)
      }
    } catch (error) {
      if (error.message.includes('BDS is still running')) throw error
    }
  }
}

async function enableGameTestExperiment (levelDatPath, backupPath) {
  const file = fs.readFileSync(levelDatPath)
  if (file.length < 9) throw new Error(`Invalid level.dat: ${levelDatPath}`)
  const declaredLength = file.readUInt32LE(4)
  if (declaredLength !== file.length - 8) throw new Error(`Invalid level.dat payload length: declared ${declaredLength}, actual ${file.length - 8}`)

  const root = await nbt.parseUncompressed(file.subarray(8), 'little')
  if (!root.value.experiments) root.value.experiments = { type: 'compound', value: {} }
  const experiments = root.value.experiments.value
  const alreadyEnabled = experiments.gametest?.value === 1 &&
    experiments.experiments_ever_used?.value === 1 &&
    experiments.saved_with_toggled_experiments?.value === 1
  if (alreadyEnabled) return false

  experiments.gametest = { type: 'byte', value: 1 }
  experiments.experiments_ever_used = { type: 'byte', value: 1 }
  experiments.saved_with_toggled_experiments = { type: 'byte', value: 1 }
  fs.copyFileSync(levelDatPath, backupPath, fs.constants.COPYFILE_EXCL)

  const encoded = nbt.writeUncompressed(root, 'little')
  const output = Buffer.allocUnsafe(encoded.length + 8)
  file.copy(output, 0, 0, 4)
  output.writeUInt32LE(encoded.length, 4)
  encoded.copy(output, 8)
  fs.writeFileSync(levelDatPath, output)
  return true
}

function enableBehaviorPack (worldDirectory) {
  const stackPath = path.join(worldDirectory, 'world_behavior_packs.json')
  let stack = []
  if (fs.existsSync(stackPath)) stack = JSON.parse(fs.readFileSync(stackPath, 'utf8'))
  if (!Array.isArray(stack)) throw new Error(`${stackPath} must contain an array`)
  const existing = stack.find((entry) => entry.pack_id === PACK_ID)
  if (existing) existing.version = PACK_VERSION
  else stack.push({ pack_id: PACK_ID, version: PACK_VERSION })
  fs.writeFileSync(stackPath, `${JSON.stringify(stack, null, 2)}\n`)
}

async function install ({ serverDirectory, packSource, now = new Date() }) {
  serverDirectory = path.resolve(serverDirectory)
  packSource = path.resolve(packSource)
  assertServerStopped(serverDirectory)
  const propertiesPath = path.join(serverDirectory, 'server.properties')
  const properties = parseProperties(fs.readFileSync(propertiesPath, 'utf8'))
  if (properties.get('online-mode') !== 'true') {
    throw new Error('Refusing installation: server.properties must explicitly keep online-mode=true')
  }
  const levelName = properties.get('level-name')
  if (!levelName) throw new Error('server.properties has no level-name')
  const worldDirectory = path.join(serverDirectory, 'worlds', levelName)
  const levelDatPath = path.join(worldDirectory, 'level.dat')
  if (!fs.existsSync(levelDatPath)) throw new Error(`World level.dat does not exist: ${levelDatPath}`)

  const timestamp = now.toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(worldDirectory, `level.dat.before-ownerbot-${timestamp}`)
  const experimentChanged = await enableGameTestExperiment(levelDatPath, backupPath)
  const destination = path.join(serverDirectory, 'development_behavior_packs', PACK_DIRECTORY)
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(packSource, destination, { recursive: true })
  enableBehaviorPack(worldDirectory)
  return { serverDirectory, worldDirectory, destination, backupPath: experimentChanged ? backupPath : null, experimentChanged }
}

module.exports = {
  PACK_DIRECTORY,
  PACK_ID,
  PACK_VERSION,
  assertServerStopped,
  enableBehaviorPack,
  enableGameTestExperiment,
  install,
  parseProperties
}
