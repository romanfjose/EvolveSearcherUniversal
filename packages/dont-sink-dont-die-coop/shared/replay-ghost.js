// Pure, deterministic Run Recorder, Delta Compression, Ghost Playback, and Daily Seed Mutator engine.
// Zero external dependencies. Shared across client, offline loopback, and test suite.

export const REPLAY_VERSION = 1;
export const DEFAULT_RECORD_INTERVAL_MS = 50; // 20 Hz recording matches tick rate

/**
 * 10 Daily Challenge Mutators modifying river physics, enemy threats, economy, and jump mechanics.
 */
export const DAILY_MUTATORS = {
    'Turbo Rapids': {
        id: 'turbo-rapids',
        name: 'Turbo Rapids',
        description: 'River current and paddle thrust are increased by 75%, making the river a blistering sprint.',
        modifiers: {
            currentMultiplier: 1.75,
            paddleThrustMultiplier: 1.75,
            enemySpeedMultiplier: 1.25,
            gravityMultiplier: 1.0,
            healthMultiplier: 1.0,
            damageMultiplier: 1.0,
            coinRewardMultiplier: 1.2,
        },
    },
    'Glass Cannon': {
        id: 'glass-cannon',
        name: 'Glass Cannon',
        description: 'Crew health is halved, but hammer and paddle damage is tripled.',
        modifiers: {
            currentMultiplier: 1.0,
            paddleThrustMultiplier: 1.0,
            enemySpeedMultiplier: 1.0,
            gravityMultiplier: 1.0,
            healthMultiplier: 0.5,
            damageMultiplier: 3.0,
            coinRewardMultiplier: 1.5,
        },
    },
    'Double Wizard': {
        id: 'double-wizard',
        name: 'Double Wizard',
        description: 'Arcane River Wizards spawn at double frequency with extra aggressive telekinetic throws.',
        modifiers: {
            currentMultiplier: 1.0,
            paddleThrustMultiplier: 1.0,
            enemySpeedMultiplier: 1.35,
            gravityMultiplier: 1.0,
            healthMultiplier: 1.0,
            damageMultiplier: 1.25,
            coinRewardMultiplier: 2.0,
            wizardSpawnMultiplier: 2.0,
        },
    },
    'Low Gravity Jumps': {
        id: 'low-gravity-jumps',
        name: 'Low Gravity Jumps',
        description: 'River gravity is reduced by 60%, sending jumping rafts soaring high above obstacles.',
        modifiers: {
            currentMultiplier: 1.0,
            paddleThrustMultiplier: 1.1,
            enemySpeedMultiplier: 0.9,
            gravityMultiplier: 0.4,
            jumpVelocityMultiplier: 1.4,
            healthMultiplier: 1.0,
            damageMultiplier: 1.0,
            coinRewardMultiplier: 1.25,
        },
    },
    'Golden Rush': {
        id: 'golden-rush',
        name: 'Golden Rush',
        description: 'Enemies drop 3x coins and Harbor Shop armory upgrades cost 50% less.',
        modifiers: {
            currentMultiplier: 1.0,
            paddleThrustMultiplier: 1.0,
            enemySpeedMultiplier: 1.1,
            gravityMultiplier: 1.0,
            healthMultiplier: 1.0,
            damageMultiplier: 1.0,
            coinRewardMultiplier: 3.0,
            shopCostMultiplier: 0.5,
        },
    },
    'Nitro Drift': {
        id: 'nitro-drift',
        name: 'Nitro Drift',
        description: 'Lateral drag is halved and turning rate is doubled, creating high-speed oversteer drifts.',
        modifiers: {
            currentMultiplier: 1.2,
            paddleThrustMultiplier: 1.3,
            keelGripMultiplier: 0.4,
            turnRateMultiplier: 2.0,
            gravityMultiplier: 1.0,
            healthMultiplier: 1.0,
            damageMultiplier: 1.0,
            coinRewardMultiplier: 1.3,
        },
    },
    'Nightmare Swarm': {
        id: 'nightmare-swarm',
        name: 'Nightmare Swarm',
        description: 'All monsters attack 50% faster and Mud Alien AoE expands drastically.',
        modifiers: {
            currentMultiplier: 0.9,
            paddleThrustMultiplier: 1.0,
            enemySpeedMultiplier: 1.5,
            enemyDamageMultiplier: 1.4,
            gravityMultiplier: 1.0,
            healthMultiplier: 1.0,
            damageMultiplier: 1.0,
            coinRewardMultiplier: 2.5,
        },
    },
    'Heavy Anvil': {
        id: 'heavy-anvil',
        name: 'Heavy Anvil',
        description: 'Raft mass is doubled; jumps are shallow but river obstacles are shoved aside with high inertia.',
        modifiers: {
            currentMultiplier: 0.8,
            paddleThrustMultiplier: 1.5,
            massMultiplier: 2.0,
            gravityMultiplier: 1.5,
            healthMultiplier: 1.8,
            damageMultiplier: 1.5,
            coinRewardMultiplier: 1.4,
        },
    },
    'Bouncy Hull': {
        id: 'bouncy-hull',
        name: 'Bouncy Hull',
        description: 'Hydrostatic water landing impacts rebound into bonus airborne hops.',
        modifiers: {
            currentMultiplier: 1.0,
            paddleThrustMultiplier: 1.0,
            bounceFactor: 0.65,
            gravityMultiplier: 0.85,
            healthMultiplier: 1.0,
            damageMultiplier: 1.0,
            coinRewardMultiplier: 1.2,
        },
    },
    'Vampiric Oar': {
        id: 'vampiric-oar',
        name: 'Vampiric Oar',
        description: 'Melee weapon strikes on monsters restore 15% of damage dealt back to raft integrity.',
        modifiers: {
            currentMultiplier: 1.0,
            paddleThrustMultiplier: 1.0,
            enemySpeedMultiplier: 1.15,
            gravityMultiplier: 1.0,
            healthMultiplier: 0.8,
            damageMultiplier: 1.2,
            lifeStealRatio: 0.15,
            coinRewardMultiplier: 1.5,
        },
    },
};

export const DAILY_MUTATOR_KEYS = Object.keys(DAILY_MUTATORS);

/**
 * Deterministic daily seed generator from UTC year, month, and day.
 */
export function getDailySeed(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    // 32-bit FNV-1a hash
    let hash = 0x811c9dc5;
    const str = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Returns the deterministic daily challenge mutator for a given date or seed.
 */
export function getDailyMutator(seedOrDate = new Date()) {
    const seed = typeof seedOrDate === 'number' ? (seedOrDate >>> 0) : getDailySeed(seedOrDate);
    const index = seed % DAILY_MUTATOR_KEYS.length;
    const key = DAILY_MUTATOR_KEYS[index];
    return {
        ...DAILY_MUTATORS[key],
        seed,
        dateKey: typeof seedOrDate === 'object' && seedOrDate instanceof Date
            ? `${seedOrDate.getUTCFullYear()}-${String(seedOrDate.getUTCMonth() + 1).padStart(2, '0')}-${String(seedOrDate.getUTCDate()).padStart(2, '0')}`
            : null,
    };
}

/**
 * Applies mutator modifiers to game core constants or state params cleanly.
 */
export function applyMutatorModifiers(baseParams, mutator) {
    if (!mutator || !mutator.modifiers) return { ...baseParams };
    const mods = mutator.modifiers;
    const out = { ...baseParams };

    if (mods.currentMultiplier && out.baseCurrent !== undefined) {
        out.baseCurrent *= mods.currentMultiplier;
    }
    if (mods.paddleThrustMultiplier && out.basePaddle !== undefined) {
        out.basePaddle *= mods.paddleThrustMultiplier;
    }
    if (mods.gravityMultiplier && out.gravity !== undefined) {
        out.gravity *= mods.gravityMultiplier;
    }
    if (mods.jumpVelocityMultiplier && out.jumpVelocity !== undefined) {
        out.jumpVelocity *= mods.jumpVelocityMultiplier;
    }
    if (mods.keelGripMultiplier && out.keelGrip !== undefined) {
        out.keelGrip *= mods.keelGripMultiplier;
    }
    if (mods.turnRateMultiplier && out.turnRate !== undefined) {
        out.turnRate *= mods.turnRateMultiplier;
    }
    return out;
}

// ─── DELTA COMPRESSION & RUN ENCODING ───────────────────────────────────

/**
 * Quantize and round values to compact integers to minimize serialized payload.
 * Positions in cm (0.01m), angles in mrad (0.001 rad), timestamps in ms.
 */
const POS_SCALE = 100; // 0.01 precision
const YAW_SCALE = 1000; // 0.001 precision

/**
 * Compress an array of raw frames:
 *   [{ position: {x,y,z}, yaw, airborne, swing, timestamp }, ...]
 * into compact delta arrays.
 */
export function compressRunFrames(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
        return {
            count: 0,
            base: { x: 0, y: 0, z: 0, yaw: 0, t: 0 },
            deltas: [],
        };
    }

    const first = frames[0];
    const base = {
        x: Math.round((first.position?.x || 0) * POS_SCALE) / POS_SCALE,
        y: Math.round((first.position?.y || 0) * POS_SCALE) / POS_SCALE,
        z: Math.round((first.position?.z || 0) * POS_SCALE) / POS_SCALE,
        yaw: Math.round((first.yaw || 0) * YAW_SCALE) / YAW_SCALE,
        t: Math.round(first.timestamp || 0),
    };

    let prevX = Math.round(base.x * POS_SCALE);
    let prevY = Math.round(base.y * POS_SCALE);
    let prevZ = Math.round(base.z * POS_SCALE);
    let prevYaw = Math.round(base.yaw * YAW_SCALE);
    let prevT = base.t;

    const deltas = [];

    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const curX = Math.round((f.position?.x || 0) * POS_SCALE);
        const curY = Math.round((f.position?.y || 0) * POS_SCALE);
        const curZ = Math.round((f.position?.z || 0) * POS_SCALE);
        const curYaw = Math.round((f.yaw || 0) * YAW_SCALE);
        const curT = Math.round(f.timestamp || 0);

        const dx = curX - prevX;
        const dy = curY - prevY;
        const dz = curZ - prevZ;
        const dyaw = curYaw - prevYaw;
        const dt = curT - prevT;

        // Flags packed into single bitmask: bit 0: airborne, bit 1: swing
        const flags = (f.airborne ? 1 : 0) | (f.swing ? 2 : 0);

        deltas.push([dx, dy, dz, dyaw, dt, flags]);

        prevX = curX;
        prevY = curY;
        prevZ = curZ;
        prevYaw = curYaw;
        prevT = curT;
    }

    return {
        count: frames.length,
        base,
        deltas,
    };
}

/**
 * Decompress compact deltas back into full frames array.
 */
export function decompressRunFrames(compressed) {
    if (!compressed || !Array.isArray(compressed.deltas) || compressed.deltas.length === 0) {
        return [];
    }

    const { base, deltas } = compressed;
    let curX = Math.round((base?.x || 0) * POS_SCALE);
    let curY = Math.round((base?.y || 0) * POS_SCALE);
    let curZ = Math.round((base?.z || 0) * POS_SCALE);
    let curYaw = Math.round((base?.yaw || 0) * YAW_SCALE);
    let curT = base?.t || 0;

    const frames = new Array(deltas.length);

    for (let i = 0; i < deltas.length; i++) {
        const [dx, dy, dz, dyaw, dt, flags] = deltas[i];
        curX += dx;
        curY += dy;
        curZ += dz;
        curYaw += dyaw;
        curT += dt;

        frames[i] = {
            position: {
                x: curX / POS_SCALE,
                y: curY / POS_SCALE,
                z: curZ / POS_SCALE,
            },
            yaw: curYaw / YAW_SCALE,
            airborne: !!(flags & 1),
            swing: !!(flags & 2),
            timestamp: curT,
        };
    }

    return frames;
}

/**
 * Fast checksum helper for validating exported replay payload integrity.
 */
export function computeChecksum(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

/**
 * Cross-environment Base64 encoder and decoder (Node + Browser).
 */
export function stringToBase64(str) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'utf8').toString('base64');
    }
    if (typeof btoa === 'function') {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    }
    throw new Error('Base64 encoding not supported in this environment');
}

export function base64ToString(b64) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(b64, 'base64').toString('utf8');
    }
    if (typeof atob === 'function') {
        const binary = atob(b64);
        const percentEncoded = Array.from(binary)
            .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
            .join('');
        return decodeURIComponent(percentEncoded);
    }
    throw new Error('Base64 decoding not supported in this environment');
}

/**
 * Serializes a run replay (metadata, checkpoints, and compressed frames) into JSON or Base64 string.
 */
export function exportRunReplay(runData, { format = 'json' } = {}) {
    if (!runData) throw new Error('No runData provided to exportRunReplay');

    const compressed = runData.compressed || compressRunFrames(runData.frames || []);
    const payload = {
        version: REPLAY_VERSION,
        playerName: runData.playerName || 'Ghost Navigator',
        color: runData.color || 0x38f2ff,
        finalTimeMs: runData.finalTimeMs || 0,
        checkpoints: runData.checkpoints || {}, // { "-150": 12400, "-300": 24800, ... }
        mutator: runData.mutator ? (runData.mutator.name || runData.mutator) : null,
        seed: runData.seed || 1,
        compressed,
        date: runData.date || new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(payload);
    const checksum = computeChecksum(jsonStr);
    const envelope = { ...payload, checksum };
    const envelopeJson = JSON.stringify(envelope);

    if (format === 'base64') {
        return `GHOST_${stringToBase64(envelopeJson)}`;
    }
    return envelopeJson;
}

/**
 * Deserializes and validates a run replay string (JSON or Base64).
 */
export function importRunReplay(serialized) {
    if (typeof serialized !== 'string' || !serialized.trim()) {
        throw new Error('Invalid replay string: empty input');
    }

    let jsonStr = serialized.trim();
    if (jsonStr.startsWith('GHOST_')) {
        const rawB64 = jsonStr.slice(6);
        jsonStr = base64ToString(rawB64);
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error(`Failed to parse replay JSON: ${e.message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid replay structure: expected object');
    }
    if (!parsed.compressed || !Array.isArray(parsed.compressed.deltas)) {
        throw new Error('Invalid replay structure: missing compressed deltas');
    }

    // Verify checksum if present
    if (parsed.checksum) {
        const copy = { ...parsed };
        const originalChecksum = copy.checksum;
        delete copy.checksum;
        const computed = computeChecksum(JSON.stringify(copy));
        if (computed !== originalChecksum) {
            throw new Error(`Replay data integrity check failed (expected ${originalChecksum}, got ${computed})`);
        }
    }

    // Restore full frames array
    const frames = decompressRunFrames(parsed.compressed);

    return {
        version: parsed.version || 1,
        playerName: parsed.playerName || 'Ghost Navigator',
        color: parsed.color || 0x38f2ff,
        finalTimeMs: parsed.finalTimeMs || 0,
        checkpoints: parsed.checkpoints || {},
        mutator: parsed.mutator || null,
        seed: parsed.seed || 1,
        compressed: parsed.compressed,
        frames,
        date: parsed.date || null,
    };
}

// ─── CHECKPOINT SPLIT DELTAS ───────────────────────────────────────────

/**
 * Calculates the split delta string (e.g. "-1.4s" or "+0.8s") comparing
 * the current run's checkpoint time against the Personal Best ghost's checkpoint time.
 * Returns null if either run hasn't crossed this checkpoint.
 */
export function formatSplitDelta(currentTimeMs, ghostTimeMs) {
    if (currentTimeMs == null || ghostTimeMs == null) return null;
    const deltaMs = currentTimeMs - ghostTimeMs;
    const deltaSec = deltaMs / 1000;
    const sign = deltaSec <= 0 ? '-' : '+';
    const absSec = Math.abs(deltaSec).toFixed(1);
    return `${sign}${absSec}s`;
}

/**
 * Calculates comprehensive split data for a given checkpoint Z.
 */
export function getCheckpointSplit(checkpointZ, currentRunSplits, ghostSplits) {
    const key = String(checkpointZ);
    const curTime = currentRunSplits?.[key];
    const ghostTime = ghostSplits?.[key];

    if (curTime == null || ghostTime == null) {
        return {
            checkpointZ,
            currentMs: curTime ?? null,
            ghostMs: ghostTime ?? null,
            deltaMs: null,
            splitText: null,
            isAhead: null,
        };
    }

    const deltaMs = curTime - ghostTime;
    const deltaSec = deltaMs / 1000;
    const isAhead = deltaMs <= 0;
    const splitText = formatSplitDelta(curTime, ghostTime);

    return {
        checkpointZ,
        currentMs: curTime,
        ghostMs: ghostTime,
        deltaMs,
        deltaSec,
        splitText,
        isAhead,
    };
}

// ─── PERSONAL BEST LOCAL STORAGE MANAGER ────────────────────────────────

export const PB_STORAGE_KEY_PREFIX = 'dont_sink_pb_ghost_';

/**
 * Fallback in-memory storage for test suites or headless environments where localStorage is not defined.
 */
const memoryStorage = new Map();

function getStorage() {
    if (typeof localStorage !== 'undefined') {
        return localStorage;
    }
    return {
        getItem: (k) => memoryStorage.get(k) ?? null,
        setItem: (k, v) => memoryStorage.set(k, String(v)),
        removeItem: (k) => memoryStorage.delete(k),
        clear: () => memoryStorage.clear(),
    };
}

export function getPBStorageKey(mutatorId = 'standard') {
    return `${PB_STORAGE_KEY_PREFIX}${mutatorId || 'standard'}`;
}

export function savePersonalBest(runData, { mutatorId = 'standard', storage = getStorage() } = {}) {
    if (!runData || !runData.finalTimeMs) return false;
    const existing = loadPersonalBest({ mutatorId, storage });
    if (existing && existing.finalTimeMs <= runData.finalTimeMs) {
        // Not a new personal best (current is slower or equal)
        return false;
    }
    const exported = exportRunReplay(runData, { format: 'json' });
    const key = getPBStorageKey(mutatorId);
    storage.setItem(key, exported);
    return true;
}

export function loadPersonalBest({ mutatorId = 'standard', storage = getStorage() } = {}) {
    const key = getPBStorageKey(mutatorId);
    const item = storage.getItem(key);
    if (!item) return null;
    try {
        return importRunReplay(item);
    } catch {
        return null;
    }
}

export function clearPersonalBest({ mutatorId = 'standard', storage = getStorage() } = {}) {
    const key = getPBStorageKey(mutatorId);
    storage.removeItem(key);
}

export function isNewPersonalBest(currentTimeMs, { mutatorId = 'standard', storage = getStorage() } = {}) {
    if (!currentTimeMs || currentTimeMs <= 0) return false;
    const existing = loadPersonalBest({ mutatorId, storage });
    if (!existing || !existing.finalTimeMs) return true;
    return currentTimeMs < existing.finalTimeMs;
}

// ─── RUN RECORDER CLASS ────────────────────────────────────────────────

export class RunRecorder {
    constructor({ sampleIntervalMs = DEFAULT_RECORD_INTERVAL_MS, playerName = 'Player', color = 0x38f2ff } = {}) {
        this.sampleIntervalMs = sampleIntervalMs;
        this.playerName = playerName;
        this.color = color;
        this.frames = [];
        this.checkpoints = {};
        this.startTimeMs = null;
        this.lastSampleTimeMs = -Infinity;
        this.finalTimeMs = null;
        this.mutator = null;
        this.seed = 1;
        this.isRecording = false;
    }

    start({ startTimeMs = 0, mutator = null, seed = 1 } = {}) {
        this.frames = [];
        this.checkpoints = {};
        this.startTimeMs = startTimeMs;
        this.lastSampleTimeMs = -Infinity;
        this.finalTimeMs = null;
        this.mutator = mutator;
        this.seed = seed;
        this.isRecording = true;
    }

    recordFrame(craftState, currentTimeMs, { force = false } = {}) {
        if (!this.isRecording) return false;
        if (!craftState || !craftState.position) return false;

        const relTimeMs = currentTimeMs - (this.startTimeMs || 0);

        if (!force && (relTimeMs - this.lastSampleTimeMs < this.sampleIntervalMs)) {
            return false;
        }

        const frame = {
            position: {
                x: craftState.position.x || 0,
                y: craftState.position.y || 0,
                z: craftState.position.z || 0,
            },
            yaw: craftState.yaw || 0,
            airborne: !!craftState.airborne,
            swing: !!craftState.swing,
            timestamp: Math.max(0, Math.round(relTimeMs)),
        };

        this.frames.push(frame);
        this.lastSampleTimeMs = relTimeMs;
        return true;
    }

    recordCheckpoint(checkpointZ, currentTimeMs) {
        if (!this.isRecording) return;
        const key = String(checkpointZ);
        if (this.checkpoints[key] == null) {
            const relTimeMs = currentTimeMs - (this.startTimeMs || 0);
            this.checkpoints[key] = Math.max(0, Math.round(relTimeMs));
        }
    }

    finish(finalTimeMs) {
        if (!this.isRecording) return null;
        this.isRecording = false;
        const totalDuration = finalTimeMs != null
            ? Math.max(0, Math.round(finalTimeMs - (this.startTimeMs || 0)))
            : (this.frames.length ? this.frames[this.frames.length - 1].timestamp : 0);

        this.finalTimeMs = totalDuration;

        return this.toReplayData();
    }

    toReplayData() {
        return {
            version: REPLAY_VERSION,
            playerName: this.playerName,
            color: this.color,
            finalTimeMs: this.finalTimeMs || (this.frames.length ? this.frames[this.frames.length - 1].timestamp : 0),
            checkpoints: { ...this.checkpoints },
            mutator: this.mutator,
            seed: this.seed,
            frames: [...this.frames],
            compressed: compressRunFrames(this.frames),
        };
    }
}

// ─── GHOST PLAYBACK & FRAME INTERPOLATION ──────────────────────────────

/**
 * Shortest angular distance interpolation for yaw angle (radians).
 */
export function lerpAngle(a, b, t) {
    const diff = (b - a) % (Math.PI * 2);
    const shortDiff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + shortDiff * Math.min(1, Math.max(0, t));
}

export class GhostPlayback {
    constructor(replayData) {
        if (!replayData) {
            throw new Error('GhostPlayback requires replayData');
        }
        this.data = replayData;
        this.frames = replayData.frames || decompressRunFrames(replayData.compressed) || [];
        this.checkpoints = replayData.checkpoints || {};
        this.finalTimeMs = replayData.finalTimeMs || (this.frames.length ? this.frames[this.frames.length - 1].timestamp : 0);
        this.lastSearchIndex = 0;
    }

    getFrameCount() {
        return this.frames.length;
    }

    getDurationMs() {
        return this.finalTimeMs;
    }

    /**
     * Binary search / indexed lookup to find surrounding frames for continuous interpolation.
     */
    sample(timeMs) {
        if (this.frames.length === 0) {
            return {
                position: { x: 0, y: 0.25, z: 0 },
                yaw: 0,
                airborne: false,
                swing: false,
                timestamp: timeMs,
                completed: true,
            };
        }

        const clampedT = Math.max(0, timeMs);

        // Before first frame
        if (clampedT <= this.frames[0].timestamp) {
            const first = this.frames[0];
            return {
                position: { ...first.position },
                yaw: first.yaw,
                airborne: first.airborne,
                swing: first.swing,
                timestamp: first.timestamp,
                completed: false,
            };
        }

        // After last frame
        const last = this.frames[this.frames.length - 1];
        if (clampedT >= last.timestamp) {
            return {
                position: { ...last.position },
                yaw: last.yaw,
                airborne: last.airborne,
                swing: last.swing,
                timestamp: last.timestamp,
                completed: true,
            };
        }

        // Locate surrounding frames: frames[i].timestamp <= clampedT < frames[i+1].timestamp
        let i = this.lastSearchIndex;
        if (i < 0 || i >= this.frames.length - 1 || this.frames[i].timestamp > clampedT) {
            i = 0;
        }

        while (i < this.frames.length - 1 && this.frames[i + 1].timestamp <= clampedT) {
            i++;
        }
        this.lastSearchIndex = i;

        const f0 = this.frames[i];
        const f1 = this.frames[i + 1];
        const span = f1.timestamp - f0.timestamp;
        const alpha = span > 0 ? (clampedT - f0.timestamp) / span : 0;

        // Smooth cubic or linear position lerp
        const px = f0.position.x + (f1.position.x - f0.position.x) * alpha;
        const py = f0.position.y + (f1.position.y - f0.position.y) * alpha;
        const pz = f0.position.z + (f1.position.z - f0.position.z) * alpha;
        const yaw = lerpAngle(f0.yaw, f1.yaw, alpha);

        return {
            position: { x: px, y: py, z: pz },
            yaw,
            airborne: alpha < 0.5 ? f0.airborne : f1.airborne,
            swing: alpha < 0.5 ? f0.swing : f1.swing,
            timestamp: clampedT,
            completed: false,
        };
    }
}
