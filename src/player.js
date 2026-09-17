'use strict'

const fs = require('fs')
const path = require('path')
const { createLocalOwnerbotAuth } = require('./local-ownerbot-auth')

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
      ownerPrivateKeyPath: path.join(__dirname, '..', '.local-ownerbot', 'owner-private.pem'),
      ownerPublicKeyPath: path.join(__dirname, '..', '.local-ownerbot', 'owner-public.pem'),
      localAuthIssuer: 'ownerbot://local',
      localAuthAudience: 'endstone://local-ownerbot',
      localAuthVariant: 'valid',
      persistent: false,
      demoEnabled: false,
      demoTrigger: 'bots',
      jumpDurationMs: 10000,
      replyStaggerMs: 75,
      logOtherPlayerPositions: false,
      ...options
    }
    if (this.options.auth === 'trusted-key') {
      throw new Error('trusted-key authentication is unavailable with BDS 1.26.51.1/protocol 2193: online NetherNet reaches Bedrock login but rejects current self-signed tokens and historical trusted certificate chains')
    }
    if (!['offline', 'local-ownerbot'].includes(this.options.auth)) {
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
    this.replyTimers = new Set()
    this.demoActive = false
    this.airborne = false
    this.verticalVelocity = 0
    this.groundY = null
    this.dead = false
    this.respawnPending = false
    this.respawnReadySent = false
    this.spawned = false
  }

  log (event, data = {}) {
    const entry = { time: new Date().toISOString(), event, ...data }
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  }

  connect () {
    this.protocol = loadProtocol(this.options.protocolPath)
    let localAuth
    if (this.options.auth === 'local-ownerbot') {
      localAuth = createLocalOwnerbotAuth({
        username: this.options.username,
        privateKeyPath: this.options.ownerPrivateKeyPath,
        publicKeyPath: this.options.ownerPublicKeyPath,
        issuer: this.options.localAuthIssuer,
        audience: this.options.localAuthAudience,
        identityId: this.options.identityId,
        variant: this.options.localAuthVariant
      })
      this.options.identityId = localAuth.identityId
      this.log('local_ownerbot_auth', {
        issuer: localAuth.issuer,
        audience: localAuth.audience,
        identityId: localAuth.identityId,
        keyCreated: localAuth.created,
        variant: this.options.localAuthVariant
      })
    }
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
      offline: this.options.auth === 'offline',
      authflow: localAuth?.authflow,
      skinData: localAuth ? { SelfSignedId: localAuth.identityId } : undefined,
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
    this.client.on('set_health', packet => this.handleHealth(packet))
    this.client.on('death_info', packet => this.requestRespawn('death_info'))
    this.client.on('respawn', packet => this.handleRespawn(packet))
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
      this.groundY = this.position.y
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
      if (!this.airborne) this.groundY = this.position.y
      this.advanceInputTick(packet.tick)
      this.corrections.push({ tick: String(packet.tick), position: copyPosition(packet.position) })
      this.log('movement_correction', this.corrections.at(-1))
    })
    this.client.on('move_player', packet => {
      if (String(packet.runtime_id) !== String(this.client.entityId)) {
        if (this.options.logOtherPlayerPositions) {
          this.log('other_player_position', {
            runtimeEntityId: String(packet.runtime_id),
            expectedRuntimeEntityId: String(this.client.entityId),
            mode: packet.mode,
            position: copyPosition(packet.position)
          })
        }
        return
      }
      this.position = copyPosition(packet.position)
      if (!this.airborne) this.groundY = this.position.y
      this.advanceInputTick(packet.tick)
      this.log('server_position', {
        mode: packet.mode,
        position: copyPosition(packet.position),
        tick: String(packet.tick)
      })
    })
    this.client.on('error', error => this.fail(error))
    this.client.on('text', packet => this.handleText(packet))
    this.client.on('kick', packet => this.fail(new Error(`Kicked: ${packet.message}`)))
    this.client.on('close', reason => {
      if (!this.disconnecting) this.fail(new Error(`Connection closed unexpectedly: ${reason || 'no reason'}`))
    })
    this.client.once('spawn', () => {
      this.spawned = true
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
    const inputData = moving ? ['up'] : []
    const now = Date.now()
    let startedJump = false
    if (this.demoActive && now < this.demoEndsAt && !this.airborne) {
      this.airborne = true
      this.verticalVelocity = 0.42
      startedJump = true
      inputData.push('jump_down', 'start_jumping')
    }
    if (this.airborne) {
      inputData.push('jumping')
      this.position.y += this.verticalVelocity
      this.verticalVelocity = (this.verticalVelocity - 0.08) * 0.98
      if (this.verticalVelocity < 0 && this.position.y <= this.groundY) {
        this.position.y = this.groundY
        this.verticalVelocity = 0
        this.airborne = false
        if (now >= this.demoEndsAt) this.finishDemo()
      }
    } else if (this.demoActive && now >= this.demoEndsAt) {
      this.finishDemo()
    }
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
      input_data: inputData,
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
    if (startedJump) this.log('demo_jump', { position: copyPosition(this.position) })
    this.tick++
  }

  handleHealth (packet) {
    const health = Number(packet.health)
    this.log('health', { health })
    if (health <= 0) {
      this.requestRespawn('set_health')
    } else {
      this.dead = false
      this.respawnPending = false
      this.respawnReadySent = false
    }
  }

  requestRespawn (source) {
    if (this.respawnPending || !this.client || this.client.status !== 4) return false
    this.respawnPending = true
    this.respawnReadySent = false
    this.dead = true
    this.finishDemo()
    this.airborne = false
    this.verticalVelocity = 0
    this.sendRespawnAction('request')
    this.log('respawn_requested', { source, runtimeEntityId: String(this.client.entityId) })
    return true
  }

  sendRespawnAction (phase) {
    this.client.queue('player_action', {
      runtime_entity_id: this.client.entityId,
      action: 'respawn',
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: -1
    })
    this.log('respawn_action_sent', { phase, runtimeEntityId: String(this.client.entityId) })
  }

  handleRespawn (packet) {
    this.log('respawn_state', {
      state: packet.state,
      position: copyPosition(packet.position),
      runtimeEntityId: String(packet.runtime_entity_id)
    })
    // Mojang's PlayerRespawnState values are SearchingForSpawn=0,
    // ReadyToSpawn=1 and ClientReadyToSpawn=2. Once the server starts its
    // search, the client announces readiness exactly once. The server then
    // finishes with ReadyToSpawn and the authoritative spawn position.
    if (packet.state === 0) {
      if (this.respawnReadySent) return false
      this.respawnReadySent = true
      this.client.queue('respawn', {
        position: { x: 0, y: 0, z: 0 },
        state: 2,
        runtime_entity_id: this.client.entityId
      })
      this.log('respawn_ready_sent', { runtimeEntityId: String(this.client.entityId) })
      return true
    }
    if (packet.state !== 1) return false
    this.position = copyPosition(packet.position)
    this.groundY = this.position.y
    this.airborne = false
    this.verticalVelocity = 0
    this.dead = false
    if (this.respawnPending && this.spawned) this.sendRespawnAction('finalize')
    this.log('respawn_completed', { position: copyPosition(this.position) })
    return true
  }

  handleText (packet) {
    if (!this.options.demoEnabled || packet.type !== 'chat') return
    const message = String(packet.message || '').trim()
    const source = String(packet.source_name || '')
    this.log('chat_received', { source, message })
    if (message.toLowerCase() !== this.options.demoTrigger.toLowerCase()) return
    if (/^OwnerBot\d{2}$/i.test(source)) return
    this.startDemo(source)
  }

  startDemo (source) {
    if (this.demoActive) {
      this.log('demo_trigger_ignored', { source, reason: 'already-active' })
      return false
    }
    this.demoActive = true
    this.demoEndsAt = Date.now() + this.options.jumpDurationMs
    const sequence = Number.parseInt(this.options.username.match(/(\d+)$/)?.[1] || '0', 10)
    const replyTimer = setTimeout(() => {
      this.replyTimers.delete(replyTimer)
      if (!this.client || this.client.status !== 4) return
      this.sendChat('ready!')
      this.log('demo_reply', { message: 'ready!' })
    }, Math.max(0, sequence - 1) * this.options.replyStaggerMs)
    this.replyTimers.add(replyTimer)
    this.log('demo_started', { source, durationMs: this.options.jumpDurationMs })
    return true
  }

  sendChat (message) {
    if (!this.client || this.client.status !== 4) throw new Error('Cannot send chat before the player is connected')
    this.client.queue('text', {
      needs_translation: false,
      category: 'authored',
      type: 'chat',
      source_name: this.options.username,
      message,
      xuid: '',
      platform_chat_id: '',
      has_filtered_message: false,
      filtered_message: undefined
    })
    this.log('chat_sent', { message })
  }

  finishDemo () {
    if (!this.demoActive) return
    this.demoActive = false
    this.log('demo_completed', { position: this.position && copyPosition(this.position) })
  }

  async runLifecycle () {
    try {
      this.log('spawn', { position: copyPosition(this.position) })
      this.startTicks()
      if (this.options.persistent) {
        this.log('persistent_idle', { demoEnabled: this.options.demoEnabled })
        return
      }
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
    for (const timer of this.replyTimers) clearTimeout(timer)
    this.replyTimers.clear()
    this.errors.push(error)
    this.log('error', { message: error.message, stack: error.stack })
    this.client?.close()
    this.reject?.(error)
  }

  disconnect (reason = 'Headless player stopped') {
    if (this.disconnecting) return
    clearInterval(this.timer)
    for (const timer of this.replyTimers) clearTimeout(timer)
    this.replyTimers.clear()
    this.disconnecting = true
    this.client?.disconnect?.(reason)
    this.log('disconnected_cleanly', { reason })
    this.resolve?.({ position: this.position && copyPosition(this.position), corrections: this.corrections })
  }
}

module.exports = { HeadlessPlayer }
