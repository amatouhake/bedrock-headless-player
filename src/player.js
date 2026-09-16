'use strict'

const fs = require('fs')
const path = require('path')

function loadProtocol (modulePath) {
  return require(path.resolve(modulePath))
}

function wait (milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function copyPosition (position) {
  return { x: position.x, y: position.y, z: position.z }
}

class HeadlessPlayer {
  constructor (options = {}) {
    this.options = {
      host: '127.0.0.1',
      port: 19132,
      username: 'HeadlessPlayer',
      version: '1.26.50',
      protocol: 2193,
      auth: 'offline',
      transport: 'nethernet',
      idleBeforeMs: 3000,
      moveMs: 2000,
      idleAfterMs: 10000,
      speedPerTick: 0.215,
      protocolPath: path.join(__dirname, '..', '..', 'forks', 'bedrock-protocol'),
      serverIdentityPinPath: path.join(__dirname, '..', '..', 'tmp', 'bds-runtime', 'server-identity.pin'),
      ...options
    }
    if (this.options.auth === 'trusted-key') {
      throw new Error('trusted-key authentication is unavailable with BDS 1.26.51.1/protocol 2193: online NetherNet reaches Bedrock login but rejects current self-signed tokens and historical trusted certificate chains')
    }
    if (this.options.auth !== 'offline') {
      throw new Error(`Unsupported authentication mode: ${this.options.auth}`)
    }
    if (this.options.transport === 'raknet') {
      throw new Error('RakNet is unavailable in BDS 1.26.51.1: this release accepts only NetherNet player connections')
    }
    if (this.options.transport !== 'nethernet') {
      throw new Error(`Unsupported transport: ${this.options.transport}`)
    }
    this.tick = 0n
    this.position = null
    this.input = 'neutral'
    this.errors = []
    this.corrections = []
    this.sentTicks = 0
    this.neutralTicks = 0
    this.movementTicks = 0
    this.timer = null
  }

  log (event, data = {}) {
    const entry = { time: new Date().toISOString(), event, ...data }
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  }

  connect () {
    this.protocol = loadProtocol(this.options.protocolPath)
    let serverIdentityPin
    if (fs.existsSync(this.options.serverIdentityPinPath)) {
      serverIdentityPin = fs.readFileSync(this.options.serverIdentityPinPath, 'utf8').trim()
      if (serverIdentityPin) this.log('server_identity_pin_loaded', { pin: serverIdentityPin })
    }
    this.client = this.protocol.createClient({
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      version: this.options.version,
      offline: true,
      raknetBackend: 'nethernet',
      nethernetServerKeyPin: serverIdentityPin || undefined,
      onNetherNetServerTrust: identity => {
        if (!['127.0.0.1', 'localhost', '::1'].includes(this.options.host)) return false
        fs.mkdirSync(path.dirname(this.options.serverIdentityPinPath), { recursive: true })
        fs.writeFileSync(this.options.serverIdentityPinPath, `${identity.pin}\n`, { mode: 0o600 })
        this.log('server_identity_trusted', { pin: identity.pin, domain: identity.domain })
        return true
      },
      conLog: message => this.log('transport', { message }),
      connectTimeout: 15000
    })

    this.client.on('network_settings', packet => {
      this.log('network_settings', {
        requestedProtocol: this.client.options.protocolVersion,
        expectedProtocol: this.options.protocol,
        compression: packet.compression_algorithm
      })
      if (this.client.options.protocolVersion !== this.options.protocol) {
        this.fail(new Error(`Expected protocol ${this.options.protocol}, got ${this.client.options.protocolVersion}`))
      }
    })
    this.client.on('play_status', packet => this.log('play_status', { status: packet.status }))
    this.client.on('resource_packs_info', packet => this.log('resource_packs_info', {
      mustAccept: packet.must_accept,
      packCount: packet.texture_packs.length
    }))
    this.client.on('resource_pack_stack', packet => this.log('resource_pack_stack', {
      mustAccept: packet.must_accept,
      packCount: packet.resource_packs.length
    }))
    this.client.on('start_game', packet => {
      this.position = this.options.position
        ? copyPosition(this.options.position)
        : copyPosition(packet.player_position)
      // PlayerInputTick is a per-client prediction sequence. StartGame's
      // current_tick is the world clock and must not be used here.
      this.tick = 1n
      this.log('start_game', {
        runtimeEntityId: String(packet.runtime_entity_id),
        position: this.position,
        positionSource: this.options.position ? 'configured-authoritative-spawn' : 'start-game',
        spawnPosition: packet.spawn_position,
        serverTick: String(packet.current_tick),
        inputTick: String(this.tick),
        engine: packet.engine
      })
      this.client.queue('serverbound_loading_screen', { type: 1 })
      this.log('loading_screen_started')
    })
    this.client.on('correct_player_move_prediction', packet => {
      if (packet.prediction_type !== 'player') return
      this.position = copyPosition(packet.position)
      this.advanceInputTick(packet.tick)
      this.corrections.push({ tick: String(packet.tick), position: copyPosition(packet.position) })
      this.log('movement_correction', this.corrections.at(-1))
    })
    this.client.on('move_player', packet => {
      if (String(packet.runtime_id) !== String(this.client.entityId)) {
        this.log('other_player_position', {
          runtimeEntityId: String(packet.runtime_id),
          expectedRuntimeEntityId: String(this.client.entityId),
          mode: packet.mode,
          position: copyPosition(packet.position)
        })
        return
      }
      this.position = copyPosition(packet.position)
      this.advanceInputTick(packet.tick)
      this.log('server_position', {
        mode: packet.mode,
        position: copyPosition(packet.position),
        tick: String(packet.tick)
      })
    })
    this.client.on('error', error => this.fail(error))
    this.client.on('kick', packet => this.fail(new Error(`Kicked: ${packet.message}`)))
    this.client.on('close', reason => {
      if (!this.disconnecting) this.fail(new Error(`Connection closed unexpectedly: ${reason || 'no reason'}`))
    })
    this.client.once('spawn', () => {
      this.client.queue('serverbound_loading_screen', { type: 2 })
      this.log('loading_screen_completed')
      this.runLifecycle()
    })

    return new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }

  startTicks () {
    this.timer = setInterval(() => this.sendTick(), 50)
  }

  advanceInputTick (acknowledgedTick) {
    const next = BigInt(acknowledgedTick) + 1n
    if (next > this.tick) this.tick = next
  }

  sendTick () {
    if (!this.position || this.client.status !== 4) {
      if (!this.tickBlockedLogged) {
        this.tickBlockedLogged = true
        this.log('tick_blocked', { hasPosition: Boolean(this.position), clientStatus: this.client.status })
      }
      return
    }
    const moving = this.input === 'forward'
    const previous = copyPosition(this.position)
    if (moving) this.position.z += this.options.speedPerTick
    const delta = {
      x: this.position.x - previous.x,
      y: this.position.y - previous.y,
      z: this.position.z - previous.z
    }
    this.client.queue('player_auth_input', {
      pitch: 0,
      yaw: 0,
      position: copyPosition(this.position),
      move_vector: { x: 0, z: moving ? 1 : 0 },
      head_yaw: 0,
      input_data: moving ? ['up'] : [],
      input_mode: 'mouse',
      play_mode: 'normal',
      interaction_model: 'crosshair',
      interact_rotation: { x: 0, z: 0 },
      tick: this.tick,
      delta,
      transaction: undefined,
      item_stack_request: undefined,
      block_action: undefined,
      vehicle_rotation: undefined,
      predicted_vehicle: undefined,
      analogue_move_vector: { x: 0, z: moving ? 1 : 0 },
      camera_orientation: { x: 0, y: 0, z: 1 },
      raw_move_vector: { x: 0, z: moving ? 1 : 0 }
    })
    this.sentTicks++
    if (moving) this.movementTicks++
    else this.neutralTicks++
    this.tick++
  }

  async runLifecycle () {
    try {
      this.log('spawn', { position: copyPosition(this.position) })
      this.startTicks()
      await wait(this.options.idleBeforeMs)
      this.input = 'forward'
      this.log('movement_started', { position: copyPosition(this.position) })
      await wait(this.options.moveMs)
      this.input = 'neutral'
      const stoppedPosition = copyPosition(this.position)
      this.log('movement_stopped', { position: stoppedPosition })
      await wait(this.options.idleAfterMs)
      this.log('stable', {
        position: copyPosition(this.position),
        corrections: this.corrections.length,
        sentTicks: this.sentTicks,
        neutralTicks: this.neutralTicks,
        movementTicks: this.movementTicks,
        postStopDisplacement: Math.hypot(
          this.position.x - stoppedPosition.x,
          this.position.y - stoppedPosition.y,
          this.position.z - stoppedPosition.z
        ),
        durationMs: this.options.idleBeforeMs + this.options.moveMs + this.options.idleAfterMs
      })
      clearInterval(this.timer)
      this.disconnecting = true
      this.client.disconnect('Headless player test complete')
      this.log('disconnected_cleanly')
      this.resolve({ position: copyPosition(this.position), corrections: this.corrections })
    } catch (error) {
      this.fail(error)
    }
  }

  fail (error) {
    if (this.failed) return
    this.failed = true
    clearInterval(this.timer)
    this.errors.push(error)
    this.log('error', { message: error.message, stack: error.stack })
    this.client?.close()
    this.reject?.(error)
  }
}

module.exports = { HeadlessPlayer }
