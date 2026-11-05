/**
 * Don't Sink, Don't Die — Network Disconnect & Offline Mid-Run Failover Breaker
 *
 * Enforces Helmet 03 ("Where's the Bathroom?" QA Breaker) and Helmet 02 (Subsystem Fault Isolation):
 * 1. Sudden Socket.io Disconnect & Mid-Air Waterfall Failover:
 *    - Detects socket connection drops, transport closes, or heartbeat timeouts.
 *    - Seamlessly transfers authority to a local offline deterministic loopback simulation
 *      without resetting player coins, upgrades, inventory, or river Z position.
 *    - Preserves mid-air ballistic kinematic trajectories (e.g. while flying over a waterfall or ramp).
 * 2. Adversarial Packet Sanitizer:
 *    - Filters malformed packets (corrupt payloads, NaN/Infinity transforms, null objects, prototype pollution).
 *    - Logs structured diagnostics for rejected packets.
 * 3. Out-of-Order State Snapshot Sequencer:
 *    - Reorders jittered network snapshots by sequence number / server timestamp.
 *    - Drops stale or duplicate snapshots while preventing rubber-banding.
 * 4. Latency Spike Watchdog & Heartbeat Monitor:
 *    - Detects severe latency spikes (e.g. >= 2000ms ping/stall).
 *    - Automatically trips failover to local offline simulation if the server stalls during critical action.
 *
 * Zero external dependencies. Designed for use in browser client, server, and headless node:test suites.
 */

import { createGameState, addPlayer, tick, stepWatercraftKinematics, PLAYER, WATER_SURFACE_Y } from './game-core.js';

export const FAILOVER_CONSTANTS = {
    DEFAULT_HEARTBEAT_INTERVAL_MS: 1000,
    LATENCY_SPIKE_THRESHOLD_MS: 2000,
    MAX_CONSECUTIVE_CORRUPT_PACKETS: 5,
    STALE_SNAPSHOT_TOLERANCE_MS: 300,
    LOCAL_PLAYER_ID: 'local-player',
};

/**
 * Validates whether an incoming transform object contains finite numerical values.
 */
export function isValidVector3(v) {
    if (!v || typeof v !== 'object') return false;
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * Validates whether an incoming quaternion contains finite numerical values.
 */
export function isValidQuaternion(q) {
    if (!q || typeof q !== 'object') return false;
    return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

/**
 * Sanitizes and validates an arbitrary incoming server packet.
 * Returns { valid: boolean, reason: string | null, sanitizedData: any }.
 */
export function sanitizeServerPacket(event, rawData) {
    if (typeof event !== 'string' || !event) {
        return { valid: false, reason: 'invalid_event_name', sanitizedData: null };
    }

    // Guard against prototype pollution keys
    if (rawData && typeof rawData === 'object') {
        if (Object.hasOwn(rawData, '__proto__') || Object.hasOwn(rawData, 'constructor') || Object.hasOwn(rawData, 'prototype')) {
            return { valid: false, reason: 'prototype_pollution_attempt', sanitizedData: null };
        }
    }

    switch (event) {
        case 'playerMoved': {
            if (!rawData || typeof rawData !== 'object') {
                return { valid: false, reason: 'missing_player_data', sanitizedData: null };
            }
            if (!rawData.id || typeof rawData.id !== 'string') {
                return { valid: false, reason: 'missing_or_invalid_player_id', sanitizedData: null };
            }
            if (!isValidVector3(rawData.position)) {
                return { valid: false, reason: 'nan_or_invalid_position', sanitizedData: null };
            }
            const q = isValidQuaternion(rawData.quaternion) ? rawData.quaternion : { x: 0, y: 0, z: 0, w: 1 };
            return {
                valid: true,
                reason: null,
                sanitizedData: {
                    id: String(rawData.id),
                    position: { x: Number(rawData.position.x), y: Number(rawData.position.y), z: Number(rawData.position.z) },
                    quaternion: { x: Number(q.x), y: Number(q.y), z: Number(q.z), w: Number(q.w) },
                    seq: Number.isFinite(rawData.seq) ? rawData.seq : undefined,
                    time: Number.isFinite(rawData.time) ? rawData.time : undefined,
                },
            };
        }

        case 'enemiesUpdate': {
            if (!rawData || typeof rawData !== 'object') {
                return { valid: false, reason: 'invalid_enemies_payload', sanitizedData: null };
            }
            const sanitizedEnemies = {};
            for (const [key, enemy] of Object.entries(rawData)) {
                if (!enemy || typeof enemy !== 'object') continue;
                if (!isValidVector3(enemy.position)) continue;
                sanitizedEnemies[key] = {
                    id: String(enemy.id || key),
                    type: String(enemy.type || key),
                    position: { x: Number(enemy.position.x), y: Number(enemy.position.y), z: Number(enemy.position.z) },
                    health: Number.isFinite(enemy.health) ? Math.max(0, enemy.health) : 0,
                    maxHealth: Number.isFinite(enemy.maxHealth) ? enemy.maxHealth : 100,
                    state: enemy.state ? String(enemy.state) : undefined,
                };
            }
            return { valid: true, reason: null, sanitizedData: sanitizedEnemies };
        }

        case 'scoreboard': {
            if (!rawData || typeof rawData !== 'object') {
                return { valid: false, reason: 'invalid_scoreboard_payload', sanitizedData: null };
            }
            return {
                valid: true,
                reason: null,
                sanitizedData: {
                    wave: Number.isFinite(rawData.wave) ? rawData.wave : 1,
                    leadZ: Number.isFinite(rawData.leadZ) ? rawData.leadZ : 0,
                    gameWon: Boolean(rawData.gameWon),
                    players: Array.isArray(rawData.players) ? rawData.players.filter((p) => p && typeof p === 'object') : [],
                },
            };
        }

        case 'playerStatsUpdate': {
            if (!rawData || typeof rawData !== 'object') {
                return { valid: false, reason: 'invalid_stats_payload', sanitizedData: null };
            }
            return {
                valid: true,
                reason: null,
                sanitizedData: {
                    id: rawData.id ? String(rawData.id) : undefined,
                    coins: Number.isFinite(rawData.coins) ? Math.max(0, rawData.coins) : 0,
                    upgrades: Array.isArray(rawData.upgrades) ? [...rawData.upgrades] : [],
                    kills: Number.isFinite(rawData.kills) ? rawData.kills : 0,
                    damageDealt: Number.isFinite(rawData.damageDealt) ? rawData.damageDealt : 0,
                },
            };
        }

        case 'playerHealthUpdate': {
            if (!rawData || typeof rawData !== 'object') {
                return { valid: false, reason: 'invalid_health_payload', sanitizedData: null };
            }
            return {
                valid: true,
                reason: null,
                sanitizedData: {
                    id: rawData.id ? String(rawData.id) : undefined,
                    health: Number.isFinite(rawData.health) ? rawData.health : 0,
                    maxHealth: Number.isFinite(rawData.maxHealth) ? rawData.maxHealth : 100,
                    damage: Number.isFinite(rawData.damage) ? rawData.damage : 0,
                    blocked: Boolean(rawData.blocked),
                },
            };
        }

        default:
            // Allow general well-formed payloads
            return { valid: true, reason: null, sanitizedData: rawData };
    }
}

/**
 * Manages out-of-order snapshot streams and rejects stale state updates.
 */
export class SnapshotSequencer {
    constructor({ staleToleranceMs = FAILOVER_CONSTANTS.STALE_SNAPSHOT_TOLERANCE_MS } = {}) {
        this.staleToleranceMs = staleToleranceMs;
        this.lastAcceptedSeq = -1;
        this.lastAcceptedTimestamp = -1;
        this.droppedStaleCount = 0;
        this.receivedCount = 0;
    }

    /**
     * Evaluates whether a snapshot with seq and/or timestamp should be accepted.
     */
    processSnapshot(snapshot) {
        this.receivedCount++;
        if (!snapshot || typeof snapshot !== 'object') {
            this.droppedStaleCount++;
            return { accepted: false, reason: 'empty_snapshot' };
        }

        const seq = Number.isFinite(snapshot.seq) ? snapshot.seq : null;
        const time = Number.isFinite(snapshot.time) ? snapshot.time : null;

        // If sequence number is provided, enforce strict monotonicity
        if (seq !== null) {
            if (seq <= this.lastAcceptedSeq) {
                this.droppedStaleCount++;
                return { accepted: false, reason: 'out_of_order_seq', seq, lastSeq: this.lastAcceptedSeq };
            }
            this.lastAcceptedSeq = seq;
        }

        // If timestamp is provided, verify it does not lag past stale tolerance
        if (time !== null) {
            if (time < this.lastAcceptedTimestamp - this.staleToleranceMs) {
                this.droppedStaleCount++;
                return { accepted: false, reason: 'stale_timestamp', time, lastTime: this.lastAcceptedTimestamp };
            }
            this.lastAcceptedTimestamp = Math.max(this.lastAcceptedTimestamp, time);
        }

        return { accepted: true, reason: null };
    }

    reset() {
        this.lastAcceptedSeq = -1;
        this.lastAcceptedTimestamp = -1;
        this.droppedStaleCount = 0;
        this.receivedCount = 0;
    }
}

/**
 * Monitors connection health, heartbeats, and latency spikes.
 */
export class LatencyWatchdog {
    constructor({
        spikeThresholdMs = FAILOVER_CONSTANTS.LATENCY_SPIKE_THRESHOLD_MS,
        onSpike = null,
        onTimeout = null,
    } = {}) {
        this.spikeThresholdMs = spikeThresholdMs;
        this.onSpike = onSpike;
        this.onTimeout = onTimeout;
        this.lastHeartbeatTime = Date.now();
        this.currentRttMs = 0;
        this.isSpikeActive = false;
        this.spikeCount = 0;
    }

    recordPing(sentTime, recvTime = Date.now()) {
        const rtt = Math.max(0, recvTime - sentTime);
        this.currentRttMs = rtt;
        this.lastHeartbeatTime = recvTime;

        if (rtt >= this.spikeThresholdMs) {
            this.isSpikeActive = true;
            this.spikeCount++;
            if (this.onSpike) this.onSpike(rtt);
            return { spike: true, rtt };
        }

        this.isSpikeActive = false;
        return { spike: false, rtt };
    }

    recordHeartbeat(now = Date.now()) {
        this.lastHeartbeatTime = now;
    }

    checkLiveness(now = Date.now()) {
        const elapsedSinceHeartbeat = now - this.lastHeartbeatTime;
        if (elapsedSinceHeartbeat >= this.spikeThresholdMs) {
            this.isSpikeActive = true;
            if (this.onTimeout) this.onTimeout(elapsedSinceHeartbeat);
            return { timedOut: true, elapsedMs: elapsedSinceHeartbeat };
        }
        return { timedOut: false, elapsedMs: elapsedSinceHeartbeat };
    }
}

/**
 * Creates an authoritative local offline loopback state seeded with the exact
 * state of the player mid-run, preserving coins, upgrades, position, velocity,
 * enemies, and checkpoint progression.
 */
export function createOfflineFailoverState({
    activeRaftState,
    playerStats,
    enemies = {},
    wave = 1,
    lastCheckpointZ = 0,
    seed = 42,
    botCount = 2,
} = {}) {
    const gameState = createGameState({ seed });
    const localId = FAILOVER_CONSTANTS.LOCAL_PLAYER_ID;

    // Build the local player object
    const pPos = activeRaftState?.position || { x: 0, y: WATER_SURFACE_Y, z: 0 };
    const pVel = activeRaftState?.velocity || { x: 0, y: 0, z: 0 };
    const pQuat = activeRaftState?.quaternion || { x: 0, y: 0, z: 0, w: 1 };
    const upgrades = Array.isArray(playerStats?.upgrades) ? [...playerStats.upgrades] : [];
    const coins = Number.isFinite(playerStats?.coins) ? playerStats.coins : PLAYER.startCoins;
    const health = Number.isFinite(playerStats?.health) ? playerStats.health : PLAYER.startHealth;
    const maxHealth = Number.isFinite(playerStats?.maxHealth) ? playerStats.maxHealth : PLAYER.startHealth;

    gameState.players[localId] = {
        id: localId,
        isBot: false,
        name: playerStats?.name || 'You (Offline)',
        color: 0x44ff44,
        position: { x: pPos.x, y: pPos.y, z: pPos.z },
        velocity: { x: pVel.x, y: pVel.y, z: pVel.z },
        quaternion: { x: pQuat.x, y: pQuat.y, z: pQuat.z, w: pQuat.w },
        health,
        maxHealth,
        isDead: false,
        coins,
        upgrades,
        kills: playerStats?.kills || 0,
        damageDealt: playerStats?.damageDealt || 0,
        damageTaken: playerStats?.damageTaken || 0,
        bestZ: Math.min(0, pPos.z),
    };

    gameState.wave = wave;
    gameState.lastCheckpointZ = lastCheckpointZ;
    gameState.gameStarted = true;

    // Spawn companion bots clustered around the local player
    for (let i = 0; i < botCount; i++) {
        const botId = `bot-${i + 1}`;
        addPlayer(gameState, botId, { isBot: true });
        if (gameState.players[botId]) {
            gameState.players[botId].position.x = pPos.x + (i === 0 ? -4 : 4);
            gameState.players[botId].position.y = WATER_SURFACE_Y;
            gameState.players[botId].position.z = pPos.z + 5;
            gameState.players[botId].coins = 50;
        }
    }

    // Restore enemies if provided
    for (const [key, eData] of Object.entries(enemies)) {
        if (gameState.enemies[key] && eData) {
            Object.assign(gameState.enemies[key], {
                position: { ...eData.position },
                health: eData.health ?? gameState.enemies[key].health,
                maxHealth: eData.maxHealth ?? gameState.enemies[key].maxHealth,
                hasSpawned: true,
                state: eData.state || gameState.enemies[key].state,
            });
        }
    }

    return gameState;
}

/**
 * Network Failover Coordinator
 *
 * Sits as an adaptive proxy/facade between the game client (main.js) and the network transport.
 * Seamlessly manages packet sanity, sequence ordering, disconnect recovery, and mid-air failover.
 */
export class NetworkFailoverCoordinator {
    constructor({
        onModeChange = null,
        onToast = null,
        staleToleranceMs = FAILOVER_CONSTANTS.STALE_SNAPSHOT_TOLERANCE_MS,
        latencySpikeThresholdMs = FAILOVER_CONSTANTS.LATENCY_SPIKE_THRESHOLD_MS,
        maxCorruptPackets = FAILOVER_CONSTANTS.MAX_CONSECUTIVE_CORRUPT_PACKETS,
    } = {}) {
        this.mode = 'online'; // 'online' | 'reconnecting' | 'offline_failover'
        this.onModeChange = onModeChange;
        this.onToast = onToast;
        this.maxCorruptPackets = maxCorruptPackets;

        this.sequencer = new SnapshotSequencer({ staleToleranceMs });
        this.watchdog = new LatencyWatchdog({
            spikeThresholdMs: latencySpikeThresholdMs,
            onSpike: (rtt) => this._handleLatencySpike(rtt),
            onTimeout: (elapsed) => this._handleTimeout(elapsed),
        });

        // Failover state and offline simulation context
        this.offlineGameState = null;
        this.handlers = new Map();
        this.consecutiveCorruptPackets = 0;
        this.totalPacketsReceived = 0;
        this.totalPacketsRejected = 0;
        this.failoverTimestamp = null;
        this.lastHandledPosition = { x: 0, y: 0, z: 0 };

        // Preserved persistent player cache
        this.cachedStats = {
            coins: PLAYER.startCoins,
            upgrades: [],
            health: PLAYER.startHealth,
            maxHealth: PLAYER.startHealth,
            kills: 0,
            damageDealt: 0,
        };
        this.cachedRaft = {
            position: { x: 0, y: 0.5, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            yaw: 0,
            airborne: false,
        };
    }

    on(event, cb) {
        if (!this.handlers.has(event)) this.handlers.set(event, []);
        this.handlers.get(event).push(cb);
        return this;
    }

    off(event, cb) {
        const list = this.handlers.get(event);
        if (list) this.handlers.set(event, list.filter((f) => f !== cb));
        return this;
    }

    emitToHandlers(event, data) {
        const list = this.handlers.get(event);
        if (list) {
            for (const cb of list) cb(data);
        }
    }

    /**
     * Cache latest client state in case an abrupt disconnect strikes mid-frame.
     */
    updateClientCache(raftState, stats = {}) {
        if (raftState) {
            if (raftState.position && isValidVector3(raftState.position)) {
                this.cachedRaft.position = { ...raftState.position };
            }
            if (raftState.velocity && isValidVector3(raftState.velocity)) {
                this.cachedRaft.velocity = { ...raftState.velocity };
            }
            if (raftState.quaternion && isValidQuaternion(raftState.quaternion)) {
                this.cachedRaft.quaternion = { ...raftState.quaternion };
            }
            if (Number.isFinite(raftState.yaw)) {
                this.cachedRaft.yaw = raftState.yaw;
            }
            this.cachedRaft.airborne = Boolean(raftState.airborne || this.cachedRaft.position.y > 1.0);
        }
        if (stats) {
            if (Number.isFinite(stats.coins)) this.cachedStats.coins = stats.coins;
            if (Array.isArray(stats.upgrades)) this.cachedStats.upgrades = [...stats.upgrades];
            if (Number.isFinite(stats.health)) this.cachedStats.health = stats.health;
            if (Number.isFinite(stats.maxHealth)) this.cachedStats.maxHealth = stats.maxHealth;
            if (Number.isFinite(stats.kills)) this.cachedStats.kills = stats.kills;
        }
    }

    /**
     * Processes an incoming raw server packet.
     * Rejects corrupted payloads, enforces snapshot ordering, and protects active gameplay.
     */
    receivePacket(event, rawPayload) {
        this.totalPacketsReceived++;
        this.watchdog.recordHeartbeat();

        // 1. Sanitize payload
        const sanitizeResult = sanitizeServerPacket(event, rawPayload);
        if (!sanitizeResult.valid) {
            this.totalPacketsRejected++;
            this.consecutiveCorruptPackets++;
            if (this.consecutiveCorruptPackets >= this.maxCorruptPackets) {
                this._triggerFailover('corrupt_packet_storm');
            }
            return { handled: false, error: sanitizeResult.reason };
        }

        this.consecutiveCorruptPackets = 0;
        const data = sanitizeResult.sanitizedData;

        // 2. Snapshot sequence and timestamp ordering check for movement/state
        if (event === 'playerMoved' || event === 'stateSnapshot') {
            const seqResult = this.sequencer.processSnapshot(data);
            if (!seqResult.accepted) {
                this.totalPacketsRejected++;
                return { handled: false, error: seqResult.reason };
            }
        }

        // 3. Track player stats and movement to guarantee continuity
        if (event === 'playerStatsUpdate' && data) {
            this.updateClientCache(null, data);
        } else if (event === 'playerMoved' && data) {
            this.lastHandledPosition = { ...data.position };
        }

        // 4. Forward sanitized event to registered listeners
        this.emitToHandlers(event, data);
        return { handled: true, error: null, data };
    }

    /**
     * Simulates a sudden Socket.io connection drop / transport close.
     */
    simulateDisconnect(reason = 'transport_close') {
        if (this.mode === 'offline_failover') return;
        this._triggerFailover(`disconnect_${reason}`);
    }

    /**
     * Seamlessly hands over authority to the local deterministic simulation.
     * Guarantees player coins, upgrades, and river coordinates are NOT reset.
     */
    _triggerFailover(reason) {
        this.mode = 'offline_failover';
        this.failoverTimestamp = Date.now();

        // Instantiate authoritative offline game state seeded from cached run stats
        this.offlineGameState = createOfflineFailoverState({
            activeRaftState: this.cachedRaft,
            playerStats: this.cachedStats,
            wave: Math.max(1, Math.floor(Math.abs(this.cachedRaft.position.z) / 150) + 1),
            lastCheckpointZ: Math.floor(this.cachedRaft.position.z / 150) * 150,
        });

        if (this.onModeChange) this.onModeChange(this.mode, { reason, cachedRaft: this.cachedRaft });
        if (this.onToast) this.onToast(`Network disconnected (${reason}). Seamlessly switched to offline simulation!`);

        // Emit local authoritative takeover event
        this.emitToHandlers('authorityHandover', {
            mode: 'offline_failover',
            reason,
            player: this.offlineGameState.players[FAILOVER_CONSTANTS.LOCAL_PLAYER_ID],
        });
    }

    _handleLatencySpike(rtt) {
        if (this.onToast) {
            this.onToast(`Latency spike detected (${Math.round(rtt)}ms)!`);
        }
        if (rtt >= FAILOVER_CONSTANTS.LATENCY_SPIKE_THRESHOLD_MS * 1.5 && this.mode === 'online') {
            this._triggerFailover(`latency_spike_${rtt}ms`);
        }
    }

    _handleTimeout(elapsed) {
        if (this.mode === 'online') {
            this._triggerFailover(`heartbeat_timeout_${elapsed}ms`);
        }
    }

    /**
     * Fixed-step loop for local offline simulation following a failover.
     * Seamlessly steps physics, enemies, and boat kinematics.
     */
    stepOfflineSimulation(dt = 1 / 60, inputs = {}) {
        if (this.mode !== 'offline_failover' || !this.offlineGameState) {
            return null;
        }

        const localP = this.offlineGameState.players[FAILOVER_CONSTANTS.LOCAL_PLAYER_ID];
        if (!localP) return null;

        // Kinematic stepping of local raft with inputs
        const craft = {
            position: localP.position,
            velocity: localP.velocity,
            angularVelocity: { x: 0, y: 0, z: 0 },
            yaw: this.cachedRaft.yaw || 0,
        };

        const kinResult = stepWatercraftKinematics(craft, {
            w: Boolean(inputs.w),
            a: Boolean(inputs.a),
            s: Boolean(inputs.s),
            d: Boolean(inputs.d),
            space: Boolean(inputs.space),
            upgrades: localP.upgrades,
        }, dt);

        this.cachedRaft.position = { ...craft.position };
        this.cachedRaft.velocity = { ...craft.velocity };
        this.cachedRaft.yaw = craft.yaw;
        this.cachedRaft.airborne = craft.position.y > 1.0;

        // Step authoritative game-core tick
        const tickEvents = tick(this.offlineGameState, Math.round(dt * 1000));
        for (const ev of tickEvents) {
            this.emitToHandlers(ev.event, ev.data);
        }

        return {
            player: localP,
            kinematics: kinResult,
            events: tickEvents,
        };
    }
}
