/**
 * Don't Sink, Don't Die — Atomic Checkpoint State Snapshot & Replay Serializer
 * (`shared/state-snapshot.js`)
 *
 * Enforces Helmet 02 (The RTS Flight Engineer) & Sovereign Core Architecture:
 * 1. Deterministic State Snapshotting:
 *    - Captures the complete authoritative simulation state at any river checkpoint
 *      (e.g., standard Act checkpoints z = -375, -750, -1125, or any arbitrary river z-coordinate).
 *    - Serializes player raft(s), companion bots, active enemy states (positions, health, cooldowns),
 *      boss/Kraken phase progression, tarot blessings, harbor armory upgrades, coins, and wave index.
 * 2. Compact JSON & Base64 Wire Format:
 *    - Quantizes numerical floats where appropriate to minimize payload size.
 *    - Supports JSON and Base64 (`SNAPSHOT_<base64>`) formats for URLs, bug reports, and save slots.
 * 3. Tamper-Evident FNV-1a Checksum Validation:
 *    - Enforces cryptographic/deterministic integrity checking to detect bit-flips, corrupted saves,
 *      or malformed network packets.
 * 4. Atomic Run Resumption & Bug State Reproduction:
 *    - Allows players to resume seamlessly from their last crossed checkpoint with exact inventory,
 *      bot companion states, and health.
 *    - Allows developers and QA auditors to instantiate the exact reproduction state of any reported bug.
 * 5. Snapshot Diffing & Diagnostics:
 *    - Highlights drift or state divergence between expected baseline and actual resumed state.
 *
 * Pure, zero-dependency ES module. Shared across server, browser client, and test runner.
 */

import {
    PLAYER,
    WATER_SURFACE_Y,
    CHECKPOINTS,
    createGameState,
    addPlayer,
} from './game-core.js';

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_PREFIX = 'SNAPSHOT_';

/** Major River Act Checkpoints in the 1500m Course */
export const MAJOR_CHECKPOINTS = Object.freeze([-375, -750, -1125]);

/** Checkpoint tolerance window in meters for detecting checkpoint crossing */
export const CHECKPOINT_TOLERANCE_METERS = 2.5;

/**
 * 32-bit FNV-1a non-cryptographic deterministic hash for payload checksums.
 * Produces an 8-character hex string.
 *
 * @param {string} str
 * @returns {string} 8-character hex checksum
 */
export function computeSnapshotChecksum(str) {
    if (typeof str !== 'string') return '00000000';
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Cross-environment Base64 encoder (Node.js Buffer or browser btoa).
 */
export function stringToBase64(str) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'utf8').toString('base64');
    }
    if (typeof btoa === 'function') {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    }
    throw new Error('Base64 encoding not supported in current environment');
}

/**
 * Cross-environment Base64 decoder (Node.js Buffer or browser atob).
 */
export function base64ToString(b64) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(b64, 'base64').toString('utf8');
    }
    if (typeof atob === 'function') {
        return decodeURIComponent(
            Array.prototype.map.call(atob(b64), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        );
    }
    throw new Error('Base64 decoding not supported in current environment');
}

/**
 * Rounds a number to a fixed decimal precision to prevent float rounding noise.
 */
function roundNum(val, decimals = 3) {
    if (!Number.isFinite(val)) return 0;
    const factor = 10 ** decimals;
    return Math.round(val * factor) / factor;
}

/**
 * Normalizes a 3D vector to fixed float precision.
 */
function roundVec3(v, decimals = 3) {
    if (!v || typeof v !== 'object') return { x: 0, y: 0, z: 0 };
    return {
        x: roundNum(v.x, decimals),
        y: roundNum(v.y, decimals),
        z: roundNum(v.z, decimals),
    };
}

/**
 * Normalizes a quaternion to fixed float precision.
 */
function roundQuat(q, decimals = 4) {
    if (!q || typeof q !== 'object') return { x: 0, y: 0, z: 0, w: 1 };
    return {
        x: roundNum(q.x, decimals),
        y: roundNum(q.y, decimals),
        z: roundNum(q.z, decimals),
        w: roundNum(q.w, decimals),
    };
}

/**
 * Determines whether a given river z coordinate is at or near one of the major checkpoints.
 *
 * @param {number} z - River z coordinate
 * @param {number[]} [checkpoints=MAJOR_CHECKPOINTS]
 * @param {number} [tolerance=CHECKPOINT_TOLERANCE_METERS]
 * @returns {number|null} The matched checkpoint z or null
 */
export function findMatchingCheckpoint(z, checkpoints = MAJOR_CHECKPOINTS, tolerance = CHECKPOINT_TOLERANCE_METERS) {
    if (!Number.isFinite(z)) return null;
    for (const cp of checkpoints) {
        if (Math.abs(z - cp) <= tolerance) {
            return cp;
        }
    }
    return null;
}

/**
 * Evaluates whether a z coordinate qualifies as a valid checkpoint.
 */
export function isCheckpointZ(z, checkpoints = MAJOR_CHECKPOINTS, tolerance = CHECKPOINT_TOLERANCE_METERS) {
    return findMatchingCheckpoint(z, checkpoints, tolerance) !== null;
}

/**
 * Captures an atomic snapshot of the entire deterministic game state.
 *
 * @param {object} gameState - Authoritative state from game-core.js
 * @param {object} [options={}] - Additional runtime context
 * @param {number} [options.checkpointZ] - Explicit checkpoint Z coordinate
 * @param {number} [options.checkpointIndex] - Checkpoint sequence index (e.g. 1, 2, 3)
 * @param {object} [options.krakenState] - State of the Dread Kraken boss if active
 * @param {object} [options.tarotState] - Player tarot draft / blessings state
 * @param {string} [options.mode='coop'] - Game mode ('coop', 'daily', 'splitscreen', 'endless')
 * @param {number} [options.seed=1] - World / run random seed
 * @param {string} [options.tag='checkpoint'] - Descriptive tag or bug identifier
 * @returns {object} Normalized snapshot object ready for serialization
 */
export function captureStateSnapshot(gameState, options = {}) {
    if (!gameState || typeof gameState !== 'object') {
        throw new Error('captureStateSnapshot: invalid or missing gameState');
    }

    const checkpointZ = Number.isFinite(options.checkpointZ)
        ? Number(options.checkpointZ)
        : (gameState.lastCheckpointZ || 0);

    const checkpointIndex = Number.isFinite(options.checkpointIndex)
        ? Number(options.checkpointIndex)
        : Math.round(Math.abs(checkpointZ) / 375);

    // 1. Capture Player & Bot States
    const players = {};
    if (gameState.players) {
        for (const [id, p] of Object.entries(gameState.players)) {
            if (!p || typeof p !== 'object') continue;
            const pObj = {
                id: String(p.id || id),
                name: String(p.name || id),
                isBot: Boolean(p.isBot),
                color: Number.isFinite(p.color) ? p.color : 0xffffff,
                position: roundVec3(p.position),
                velocity: roundVec3(p.velocity),
                quaternion: roundQuat(p.quaternion),
                yaw: Number.isFinite(p.yaw) ? roundNum(p.yaw, 4) : 0,
                health: Number.isFinite(p.health) ? roundNum(p.health, 1) : 0,
                maxHealth: Number.isFinite(p.maxHealth) ? roundNum(p.maxHealth, 1) : PLAYER.startHealth,
                isDead: Boolean(p.isDead),
                coins: Number.isFinite(p.coins) ? Math.max(0, Math.round(p.coins)) : 0,
                upgrades: Array.isArray(p.upgrades) ? [...p.upgrades].sort() : [],
                kills: Number.isFinite(p.kills) ? p.kills : 0,
                damageDealt: Number.isFinite(p.damageDealt) ? roundNum(p.damageDealt, 1) : 0,
                damageTaken: Number.isFinite(p.damageTaken) ? roundNum(p.damageTaken, 1) : 0,
                bestZ: Number.isFinite(p.bestZ) ? roundNum(p.bestZ, 2) : roundNum(p.position?.z || 0, 2),
            };
            if (Number.isFinite(p.botIndex)) pObj.botIndex = p.botIndex;
            if (p.mode) pObj.mode = String(p.mode);
            players[id] = pObj;
        }
    }

    // 2. Capture Enemies State
    const enemies = {};
    if (gameState.enemies) {
        for (const [id, e] of Object.entries(gameState.enemies)) {
            if (!e || typeof e !== 'object') continue;
            enemies[id] = {
                id: String(e.id || id),
                type: String(e.type || id),
                position: roundVec3(e.position),
                health: Number.isFinite(e.health) ? Math.max(0, roundNum(e.health, 1)) : 0,
                maxHealth: Number.isFinite(e.maxHealth) ? Math.max(0, roundNum(e.maxHealth, 1)) : 0,
                hasSpawned: Boolean(e.hasSpawned),
                respawnAt: Number.isFinite(e.respawnAt) ? e.respawnAt : null,
                state: e.state ? String(e.state) : undefined,
                targetPos: e.targetPos ? roundVec3(e.targetPos) : undefined,
                cooldownUntil: Number.isFinite(e.cooldownUntil) ? e.cooldownUntil : undefined,
            };
        }
    }

    // 3. Capture Dread Kraken Boss State if available
    let kraken = null;
    const rawKraken = options.krakenState || gameState.krakenState || null;
    if (rawKraken && typeof rawKraken === 'object') {
        kraken = {
            isSpawned: Boolean(rawKraken.isSpawned),
            isDefeated: Boolean(rawKraken.isDefeated),
            phase: Number.isFinite(rawKraken.phase) ? rawKraken.phase : 1,
            health: Number.isFinite(rawKraken.health) ? roundNum(rawKraken.health, 1) : 0,
            maxHealth: Number.isFinite(rawKraken.maxHealth) ? roundNum(rawKraken.maxHealth, 1) : 1500,
            position: roundVec3(rawKraken.position || { x: 0, y: -2, z: -1350 }),
            enraged: Boolean(rawKraken.enraged),
        };
    }

    // 4. Capture Tarot State if available
    let tarot = null;
    const rawTarot = options.tarotState || gameState.tarotState || null;
    if (rawTarot && typeof rawTarot === 'object') {
        tarot = {
            blessings: Array.isArray(rawTarot.blessings) ? [...rawTarot.blessings].sort() : [],
            activeDraft: rawTarot.activeDraft ? { ...rawTarot.activeDraft } : null,
        };
    }

    // 5. Construct Normalized Envelope
    return {
        version: SNAPSHOT_VERSION,
        tag: String(options.tag || 'checkpoint'),
        mode: String(options.mode || gameState.mode || 'coop'),
        seed: Number.isFinite(options.seed) ? options.seed : (gameState.seed || 1),
        now: Number.isFinite(gameState.now) ? gameState.now : 0,
        tickCount: Number.isFinite(gameState.tickCount) ? gameState.tickCount : 0,
        wave: Number.isFinite(gameState.wave) ? gameState.wave : 1,
        checkpointZ: roundNum(checkpointZ, 2),
        checkpointIndex,
        gameStarted: Boolean(gameState.gameStarted),
        gameWon: Boolean(gameState.gameWon),
        players,
        enemies,
        kraken,
        tarot,
        timestamp: Date.now(),
    };
}

/**
 * Serializes a state snapshot object into a compact JSON or Base64 string with checksum envelope.
 *
 * @param {object} snapshot - Object produced by captureStateSnapshot
 * @param {('json'|'base64')} [format='json']
 * @returns {string} Serialized string representation
 */
export function serializeSnapshot(snapshot, format = 'json') {
    if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('serializeSnapshot: invalid snapshot object');
    }

    // Clone payload and omit existing checksum to compute canonical hash
    const cleanPayload = { ...snapshot };
    delete cleanPayload.checksum;

    const payloadJson = JSON.stringify(cleanPayload);
    const checksum = computeSnapshotChecksum(payloadJson);

    const envelope = {
        ...cleanPayload,
        checksum,
    };

    const envelopeJson = JSON.stringify(envelope);

    if (format === 'base64') {
        return `${SNAPSHOT_PREFIX}${stringToBase64(envelopeJson)}`;
    }
    return envelopeJson;
}

/**
 * Deserializes and validates a state snapshot string (JSON or Base64).
 * Enforces checksum integrity and structural invariants.
 *
 * @param {string} serialized - JSON string or SNAPSHOT_<base64> string
 * @returns {object} Validated and hydrated snapshot object
 */
export function deserializeSnapshot(serialized) {
    if (typeof serialized !== 'string' || !serialized.trim()) {
        throw new Error('deserializeSnapshot: empty or invalid serialized string');
    }

    let jsonStr = serialized.trim();
    if (jsonStr.startsWith(SNAPSHOT_PREFIX)) {
        const rawB64 = jsonStr.slice(SNAPSHOT_PREFIX.length);
        jsonStr = base64ToString(rawB64);
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (err) {
        throw new Error(`deserializeSnapshot: failed to parse JSON (${err.message})`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('deserializeSnapshot: parsed payload is not an object');
    }

    // Prototype pollution guard
    if (Object.hasOwn(parsed, '__proto__') || Object.hasOwn(parsed, 'constructor') || Object.hasOwn(parsed, 'prototype')) {
        throw new Error('deserializeSnapshot: rejected potentially malicious prototype pollution payload');
    }

    if (!parsed.checksum || typeof parsed.checksum !== 'string') {
        throw new Error('deserializeSnapshot: missing required checksum');
    }

    // Validate checksum integrity
    const originalChecksum = parsed.checksum;
    const verifyCopy = { ...parsed };
    delete verifyCopy.checksum;

    const computed = computeSnapshotChecksum(JSON.stringify(verifyCopy));
    if (computed !== originalChecksum) {
        throw new Error(`deserializeSnapshot: checksum verification failed (expected ${originalChecksum}, computed ${computed})`);
    }

    // Validate mandatory structural fields
    if (typeof parsed.version !== 'number') {
        throw new Error('deserializeSnapshot: missing or invalid snapshot version');
    }
    if (typeof parsed.checkpointZ !== 'number' || !Number.isFinite(parsed.checkpointZ)) {
        throw new Error('deserializeSnapshot: missing or invalid checkpointZ');
    }
    if (!parsed.players || typeof parsed.players !== 'object') {
        throw new Error('deserializeSnapshot: missing or invalid players table');
    }

    return parsed;
}

/**
 * Restores a game state from a validated snapshot so gameplay can resume
 * seamlessly or reproduce an exact bug scenario.
 *
 * @param {object} snapshot - Validated snapshot object from deserializeSnapshot
 * @param {object} [targetState] - Optional existing state to hydrate into; if omitted, creates a fresh state
 * @returns {object} Hydrated authoritative game state
 */
export function restoreStateFromSnapshot(snapshot, targetState = null) {
    if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('restoreStateFromSnapshot: invalid snapshot');
    }

    const state = targetState || createGameState({ seed: snapshot.seed || 1 });

    state.now = snapshot.now || 0;
    state.tickCount = snapshot.tickCount || 0;
    state.wave = snapshot.wave || 1;
    state.lastCheckpointZ = snapshot.checkpointZ || 0;
    state.gameStarted = Boolean(snapshot.gameStarted);
    state.gameWon = Boolean(snapshot.gameWon);
    state.mode = snapshot.mode || 'coop';

    // 1. Restore Players & Bots
    state.players = {};
    if (snapshot.players) {
        for (const [id, pData] of Object.entries(snapshot.players)) {
            state.players[id] = {
                id: pData.id || id,
                name: pData.name || id,
                isBot: Boolean(pData.isBot),
                botIndex: pData.botIndex ?? (pData.isBot ? 0 : undefined),
                color: pData.color ?? 0xffffff,
                position: { ...pData.position },
                velocity: { ...pData.velocity },
                quaternion: { ...pData.quaternion },
                yaw: pData.yaw || 0,
                health: pData.health ?? PLAYER.startHealth,
                maxHealth: pData.maxHealth ?? PLAYER.startHealth,
                isDead: Boolean(pData.isDead),
                coins: pData.coins ?? 0,
                upgrades: Array.isArray(pData.upgrades) ? [...pData.upgrades] : [],
                kills: pData.kills || 0,
                damageDealt: pData.damageDealt || 0,
                damageTaken: pData.damageTaken || 0,
                bestZ: pData.bestZ ?? pData.position.z,
                mode: pData.mode || (pData.isBot ? 'follow' : undefined),
            };
            if (pData.isBot) {
                state.players[id].nextAttackAt = 0;
                state.players[id].lastHitAt = -Infinity;
                state.players[id].nextCheckpoint = 0;
            }
        }
    }

    // 2. Restore Enemies
    if (snapshot.enemies && state.enemies) {
        for (const [id, eData] of Object.entries(snapshot.enemies)) {
            if (state.enemies[id]) {
                state.enemies[id].position = { ...eData.position };
                state.enemies[id].health = eData.health ?? state.enemies[id].health;
                state.enemies[id].maxHealth = eData.maxHealth ?? state.enemies[id].maxHealth;
                state.enemies[id].hasSpawned = Boolean(eData.hasSpawned);
                state.enemies[id].respawnAt = eData.respawnAt ?? null;
                if (eData.state) state.enemies[id].state = eData.state;
                if (eData.targetPos) state.enemies[id].targetPos = { ...eData.targetPos };
                if (eData.cooldownUntil !== undefined) state.enemies[id].cooldownUntil = eData.cooldownUntil;
            }
        }
    }

    // 3. Restore Kraken State
    if (snapshot.kraken) {
        state.krakenState = {
            isSpawned: Boolean(snapshot.kraken.isSpawned),
            isDefeated: Boolean(snapshot.kraken.isDefeated),
            phase: snapshot.kraken.phase || 1,
            health: snapshot.kraken.health ?? 1500,
            maxHealth: snapshot.kraken.maxHealth ?? 1500,
            position: { ...(snapshot.kraken.position || { x: 0, y: -2, z: -1350 }) },
            enraged: Boolean(snapshot.kraken.enraged),
        };
    }

    // 4. Restore Tarot State
    if (snapshot.tarot) {
        state.tarotState = {
            blessings: Array.isArray(snapshot.tarot.blessings) ? [...snapshot.tarot.blessings] : [],
            activeDraft: snapshot.tarot.activeDraft ? { ...snapshot.tarot.activeDraft } : null,
        };
    }

    return state;
}

/**
 * Compares two snapshots and returns a structured list of discrepancies/divergences.
 * Essential for verifying deterministic replay accuracy and diagnosing bug states.
 *
 * @param {object} snapA - Baseline snapshot
 * @param {object} snapB - Candidate snapshot
 * @returns {object} { identical: boolean, differences: string[] }
 */
export function diffSnapshots(snapA, snapB) {
    const differences = [];

    if (!snapA || !snapB) {
        return { identical: false, differences: ['One or both snapshots are null/invalid'] };
    }

    if (snapA.checkpointZ !== snapB.checkpointZ) {
        differences.push(`checkpointZ mismatch: ${snapA.checkpointZ} vs ${snapB.checkpointZ}`);
    }
    if (snapA.wave !== snapB.wave) {
        differences.push(`wave mismatch: ${snapA.wave} vs ${snapB.wave}`);
    }

    // Compare player counts and player attributes
    const pKeysA = Object.keys(snapA.players || {}).sort();
    const pKeysB = Object.keys(snapB.players || {}).sort();

    if (pKeysA.join(',') !== pKeysB.join(',')) {
        differences.push(`player set mismatch: [${pKeysA.join(',')}] vs [${pKeysB.join(',')}]`);
    } else {
        for (const pid of pKeysA) {
            const pA = snapA.players[pid];
            const pB = snapB.players[pid];
            if (pA.health !== pB.health) {
                differences.push(`player ${pid} health mismatch: ${pA.health} vs ${pB.health}`);
            }
            if (pA.coins !== pB.coins) {
                differences.push(`player ${pid} coins mismatch: ${pA.coins} vs ${pB.coins}`);
            }
            if ((pA.upgrades || []).join(',') !== (pB.upgrades || []).join(',')) {
                differences.push(`player ${pid} upgrades mismatch: [${pA.upgrades}] vs [${pB.upgrades}]`);
            }
            if (Math.abs((pA.position?.z || 0) - (pB.position?.z || 0)) > 0.05) {
                differences.push(`player ${pid} z pos mismatch: ${pA.position?.z} vs ${pB.position?.z}`);
            }
        }
    }

    // Compare enemies
    const eKeysA = Object.keys(snapA.enemies || {}).sort();
    const eKeysB = Object.keys(snapB.enemies || {}).sort();
    if (eKeysA.join(',') !== eKeysB.join(',')) {
        differences.push(`enemy set mismatch: [${eKeysA.join(',')}] vs [${eKeysB.join(',')}]`);
    } else {
        for (const eid of eKeysA) {
            const eA = snapA.enemies[eid];
            const eB = snapB.enemies[eid];
            if (eA.health !== eB.health) {
                differences.push(`enemy ${eid} health mismatch: ${eA.health} vs ${eB.health}`);
            }
        }
    }

    return {
        identical: differences.length === 0,
        differences,
    };
}
