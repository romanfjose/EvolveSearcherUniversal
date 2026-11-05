/**
 * Sovereign Core & Helmet 02 — Multiplayer Snapshot Sanitization & Defensive Invariant Shield
 * (`shared/qa-snapshot-sanitizer.js`)
 *
 * Enforces Helmet 02 (The RTS Flight Engineer) & Sovereign Core Architecture:
 * 1. Truth & The High Ground:
 *    - Never allow corrupt, malformed, or hostile network snapshots to poison local client state.
 *    - Check the payload math coldly: NaN coordinates, undefined/negative coins, prototype pollution,
 *      or unknown upgrade injections must be intercepted and healed before ever reaching the HUD,
 *      physics engine, or Three.js scene-graph hierarchy.
 * 2. Attention Is the Only Non-Renewable Fuel:
 *    - Zero-dead-touch defensive validation: if the network drops garbage, the engine self-heals in <1ms
 *      and keeps flying at 60 FPS without crashing or DDOSing the pilot with broken UI.
 * 3. Strict Boundary Isolation:
 *    - Pure, zero-dependency ES module. Headless and Node:test compatible.
 *    - Sanitizes state snapshots, player bags, transforms, HUD models, and 3D object bindings.
 */

import { PLAYER, RIVER, UPGRADES } from './game-core.js';
import { ALL_UPGRADES } from './upgrade-tree.js';
import { SAFE_DEFAULTS } from './scene-watchdog.js';

/**
 * Baseline Defaults & Clamping Limits for Sanitization
 */
export const SNAPSHOT_SANITIZER_LIMITS = Object.freeze({
    DEFAULT_COINS: 0,
    MIN_COINS: 0,
    MAX_COINS: 999999,

    DEFAULT_HEALTH: PLAYER.startHealth || 100,
    MIN_HEALTH: 0,
    MAX_HEALTH: 5000,

    DEFAULT_POS_X: 0,
    DEFAULT_POS_Y: PLAYER.restY || 0.25,
    DEFAULT_POS_Z: 0,

    CORRIDOR_HALF_WIDTH: (RIVER.width || 30) * 0.5,
    MIN_Y: -10,
    MAX_Y: 100,
    MIN_Z: -3000,
    MAX_Z: 100,

    MAX_VELOCITY: 150,
});

/**
 * Validates and sanitizes a coin value to a safe, non-negative finite integer.
 *
 * @param {*} rawCoins - Raw input value from network packet or snapshot
 * @param {number} [fallback=0] - Fallback value if corrupt
 * @returns {number} Sanitized integer coin value
 */
export function sanitizeCoins(rawCoins, fallback = SNAPSHOT_SANITIZER_LIMITS.DEFAULT_COINS) {
    if (rawCoins === null || rawCoins === undefined) {
        return fallback;
    }
    const num = Number(rawCoins);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
        return fallback;
    }
    const floored = Math.floor(num);
    if (floored < SNAPSHOT_SANITIZER_LIMITS.MIN_COINS) {
        return SNAPSHOT_SANITIZER_LIMITS.MIN_COINS;
    }
    if (floored > SNAPSHOT_SANITIZER_LIMITS.MAX_COINS) {
        return SNAPSHOT_SANITIZER_LIMITS.MAX_COINS;
    }
    return floored;
}

/**
 * Validates and sanitizes player health.
 *
 * @param {*} rawHealth
 * @param {*} rawMaxHealth
 * @returns {{ health: number, maxHealth: number }}
 */
export function sanitizeHealth(rawHealth, rawMaxHealth) {
    let max = Number(rawMaxHealth);
    if (!Number.isFinite(max) || Number.isNaN(max) || max < 1) {
        max = SNAPSHOT_SANITIZER_LIMITS.DEFAULT_HEALTH;
    }
    max = Math.min(Math.floor(max), SNAPSHOT_SANITIZER_LIMITS.MAX_HEALTH);

    let cur = Number(rawHealth);
    if (!Number.isFinite(cur) || Number.isNaN(cur)) {
        cur = max;
    }
    cur = Math.max(SNAPSHOT_SANITIZER_LIMITS.MIN_HEALTH, Math.min(Math.floor(cur), max));

    return { health: cur, maxHealth: max };
}

/**
 * Validates and sanitizes an upgrade list. Rejects prototype pollution, non-array inputs,
 * unknown upgrade strings, and duplicates.
 *
 * @param {*} rawUpgrades - Raw input array or collection
 * @returns {string[]} Sanitized array of valid unique upgrade IDs
 */
export function sanitizeUpgrades(rawUpgrades) {
    if (!Array.isArray(rawUpgrades)) {
        return [];
    }

    const validIds = new Set([
        ...Object.keys(UPGRADES || {}),
        ...Object.keys(ALL_UPGRADES || {}),
        'motor', 'weapon', 'armor',
        'motor_1', 'motor_2', 'motor_3',
        'weapon_1', 'weapon_2', 'weapon_3',
        'armor_1', 'armor_2', 'armor_3',
    ]);

    const sanitized = [];
    for (const item of rawUpgrades) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        // Prototype pollution injection defense
        if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') continue;
        if (validIds.has(trimmed) && !sanitized.includes(trimmed)) {
            sanitized.push(trimmed);
        }
    }
    return sanitized;
}

/**
 * Validates and sanitizes a 3D position vector against NaN, Infinity, and river boundaries.
 *
 * @param {*} rawPos
 * @param {object} [fallback]
 * @returns {{ x: number, y: number, z: number }}
 */
export function sanitizePosition(rawPos, fallback = {}) {
    const fx = Number.isFinite(fallback.x) ? fallback.x : SNAPSHOT_SANITIZER_LIMITS.DEFAULT_POS_X;
    const fy = Number.isFinite(fallback.y) ? fallback.y : SNAPSHOT_SANITIZER_LIMITS.DEFAULT_POS_Y;
    const fz = Number.isFinite(fallback.z) ? fallback.z : SNAPSHOT_SANITIZER_LIMITS.DEFAULT_POS_Z;

    if (!rawPos || typeof rawPos !== 'object') {
        return { x: fx, y: fy, z: fz };
    }

    const x = Number.isFinite(rawPos.x) ? rawPos.x : fx;
    const y = Number.isFinite(rawPos.y) ? rawPos.y : fy;
    const z = Number.isFinite(rawPos.z) ? rawPos.z : fz;

    return {
        x: Math.min(Math.max(x, -SNAPSHOT_SANITIZER_LIMITS.CORRIDOR_HALF_WIDTH * 1.5), SNAPSHOT_SANITIZER_LIMITS.CORRIDOR_HALF_WIDTH * 1.5),
        y: Math.min(Math.max(y, SNAPSHOT_SANITIZER_LIMITS.MIN_Y), SNAPSHOT_SANITIZER_LIMITS.MAX_Y),
        z: Math.min(Math.max(z, SNAPSHOT_SANITIZER_LIMITS.MIN_Z), SNAPSHOT_SANITIZER_LIMITS.MAX_Z),
    };
}

/**
 * Validates and sanitizes a 3D velocity vector against NaN, Infinity, and overflow speed.
 *
 * @param {*} rawVel
 * @returns {{ x: number, y: number, z: number }}
 */
export function sanitizeVelocity(rawVel) {
    if (!rawVel || typeof rawVel !== 'object') {
        return { x: 0, y: 0, z: 0 };
    }
    const clampVel = (val) => {
        if (!Number.isFinite(val) || Number.isNaN(val)) return 0;
        return Math.min(Math.max(val, -SNAPSHOT_SANITIZER_LIMITS.MAX_VELOCITY), SNAPSHOT_SANITIZER_LIMITS.MAX_VELOCITY);
    };

    return {
        x: clampVel(rawVel.x),
        y: clampVel(rawVel.y),
        z: clampVel(rawVel.z),
    };
}

/**
 * Validates and sanitizes a quaternion or rotation representation.
 *
 * @param {*} rawQuat
 * @returns {{ x: number, y: number, z: number, w: number }}
 */
export function sanitizeQuaternion(rawQuat) {
    if (!rawQuat || typeof rawQuat !== 'object') {
        return { ...SAFE_DEFAULTS.quaternion };
    }
    const x = Number.isFinite(rawQuat.x) ? rawQuat.x : 0;
    const y = Number.isFinite(rawQuat.y) ? rawQuat.y : 0;
    const z = Number.isFinite(rawQuat.z) ? rawQuat.z : 0;
    const w = Number.isFinite(rawQuat.w) ? rawQuat.w : 1;

    const lenSq = x * x + y * y + z * z + w * w;
    if (lenSq < 1e-6 || !Number.isFinite(lenSq)) {
        return { ...SAFE_DEFAULTS.quaternion };
    }
    const len = Math.sqrt(lenSq);
    return {
        x: x / len,
        y: y / len,
        z: z / len,
        w: w / len,
    };
}

/**
 * Sanitizes a complete player entry within a snapshot.
 *
 * @param {string} id - Player identifier
 * @param {*} rawPlayer - Untrusted network player state object
 * @returns {object} Completely sanitized player state object
 */
export function sanitizePlayerSnapshot(id, rawPlayer) {
    const raw = (rawPlayer && typeof rawPlayer === 'object') ? rawPlayer : {};
    const sanitizedId = String(raw.id || id || 'player_unknown');

    const { health, maxHealth } = sanitizeHealth(raw.health, raw.maxHealth);
    const coins = sanitizeCoins(raw.coins, SNAPSHOT_SANITIZER_LIMITS.DEFAULT_COINS);
    const upgrades = sanitizeUpgrades(raw.upgrades);
    const position = sanitizePosition(raw.position);
    const velocity = sanitizeVelocity(raw.velocity);
    const quaternion = sanitizeQuaternion(raw.quaternion);

    const yaw = Number.isFinite(raw.yaw) ? raw.yaw : 0;
    const isBot = Boolean(raw.isBot);
    const isDead = Boolean(raw.isDead || health <= 0);

    return {
        id: sanitizedId,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 32) : sanitizedId,
        isBot,
        botIndex: isBot && Number.isFinite(raw.botIndex) ? Math.floor(raw.botIndex) : undefined,
        color: Number.isFinite(raw.color) ? raw.color : 0xffffff,
        position,
        velocity,
        quaternion,
        yaw,
        health,
        maxHealth,
        isDead,
        coins,
        upgrades,
        kills: Number.isFinite(raw.kills) && raw.kills >= 0 ? Math.floor(raw.kills) : 0,
        damageDealt: Number.isFinite(raw.damageDealt) && raw.damageDealt >= 0 ? raw.damageDealt : 0,
        damageTaken: Number.isFinite(raw.damageTaken) && raw.damageTaken >= 0 ? raw.damageTaken : 0,
        bestZ: Number.isFinite(raw.bestZ) ? raw.bestZ : position.z,
        mode: typeof raw.mode === 'string' ? raw.mode : (isBot ? 'follow' : undefined),
    };
}

/**
 * Audits a raw snapshot payload and returns a list of detected security/integrity violations.
 *
 * @param {*} snapshot
 * @returns {{ passed: boolean, violations: string[] }}
 */
export function auditSnapshotIntegrity(snapshot) {
    const violations = [];
    if (!snapshot || typeof snapshot !== 'object') {
        return { passed: false, violations: ['Snapshot is null, undefined, or non-object'] };
    }

    // Prototype pollution inspection
    if (Object.hasOwn(snapshot, '__proto__') || Object.hasOwn(snapshot, 'constructor') || Object.hasOwn(snapshot, 'prototype')) {
        violations.push('Prototype pollution vector detected in root snapshot object');
    }

    if (snapshot.players && typeof snapshot.players === 'object') {
        for (const [pid, p] of Object.entries(snapshot.players)) {
            if (!p || typeof p !== 'object') {
                violations.push(`Player ${pid} is malformed or non-object`);
                continue;
            }
            if (p.coins === undefined || p.coins === null) {
                violations.push(`Player ${pid} coins is undefined or null`);
            } else if (!Number.isFinite(Number(p.coins)) || Number(p.coins) < 0) {
                violations.push(`Player ${pid} coins is non-finite or negative (${p.coins})`);
            }

            if (!p.position || !Number.isFinite(p.position.x) || !Number.isFinite(p.position.y) || !Number.isFinite(p.position.z)) {
                violations.push(`Player ${pid} position contains NaN or non-finite coordinates`);
            }

            if (p.upgrades !== undefined && !Array.isArray(p.upgrades)) {
                violations.push(`Player ${pid} upgrades is not an array`);
            }
        }
    }

    return {
        passed: violations.length === 0,
        violations,
    };
}

/**
 * Sanitizes an entire network snapshot prior to ingestion by game systems.
 *
 * @param {*} rawSnapshot - Untrusted payload from socket / wire
 * @returns {object} Completely safe, sanitized snapshot
 */
export function sanitizeNetworkSnapshot(rawSnapshot) {
    if (!rawSnapshot || typeof rawSnapshot !== 'object') {
        return {
            version: 1,
            now: 0,
            tickCount: 0,
            wave: 1,
            checkpointZ: 0,
            gameStarted: false,
            gameWon: false,
            mode: 'coop',
            players: {},
            enemies: {},
            kraken: null,
            tarot: { blessings: [], activeDraft: null },
            sanitized: true,
            corruptedSource: true,
        };
    }

    const clean = {};
    clean.version = Number.isFinite(Number(rawSnapshot.version)) ? Number(rawSnapshot.version) : 1;
    clean.now = Number.isFinite(Number(rawSnapshot.now)) ? Number(rawSnapshot.now) : 0;
    clean.tickCount = Number.isFinite(Number(rawSnapshot.tickCount)) ? Math.floor(Number(rawSnapshot.tickCount)) : 0;
    const waveNum = Number(rawSnapshot.wave);
    clean.wave = Number.isFinite(waveNum) && waveNum >= 1 ? Math.floor(waveNum) : 1;
    clean.checkpointZ = Number.isFinite(rawSnapshot.checkpointZ) ? rawSnapshot.checkpointZ : 0;
    clean.gameStarted = Boolean(rawSnapshot.gameStarted);
    clean.gameWon = Boolean(rawSnapshot.gameWon);
    clean.mode = typeof rawSnapshot.mode === 'string' ? rawSnapshot.mode : 'coop';

    // 1. Sanitize Players
    clean.players = {};
    if (rawSnapshot.players && typeof rawSnapshot.players === 'object') {
        for (const [id, pData] of Object.entries(rawSnapshot.players)) {
            // Guard against prototype pollution keys
            if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
            clean.players[id] = sanitizePlayerSnapshot(id, pData);
        }
    }

    // 2. Sanitize Enemies
    clean.enemies = {};
    if (rawSnapshot.enemies && typeof rawSnapshot.enemies === 'object') {
        for (const [id, eData] of Object.entries(rawSnapshot.enemies)) {
            if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
            if (!eData || typeof eData !== 'object') continue;
            const pos = sanitizePosition(eData.position);
            const { health, maxHealth } = sanitizeHealth(eData.health, eData.maxHealth);
            clean.enemies[id] = {
                id: String(eData.id || id),
                type: typeof eData.type === 'string' ? eData.type : 'whiteGuy',
                position: pos,
                health,
                maxHealth,
                hasSpawned: Boolean(eData.hasSpawned),
                respawnAt: Number.isFinite(eData.respawnAt) ? eData.respawnAt : null,
                state: typeof eData.state === 'string' ? eData.state : 'idle',
            };
        }
    }

    // 3. Sanitize Kraken
    if (rawSnapshot.kraken && typeof rawSnapshot.kraken === 'object') {
        const { health, maxHealth } = sanitizeHealth(rawSnapshot.kraken.health, rawSnapshot.kraken.maxHealth);
        clean.kraken = {
            isSpawned: Boolean(rawSnapshot.kraken.isSpawned),
            isDefeated: Boolean(rawSnapshot.kraken.isDefeated),
            phase: Number.isFinite(rawSnapshot.kraken.phase) ? Math.floor(rawSnapshot.kraken.phase) : 1,
            health,
            maxHealth,
            position: sanitizePosition(rawSnapshot.kraken.position, { x: 0, y: -2, z: -1350 }),
            enraged: Boolean(rawSnapshot.kraken.enraged),
        };
    } else {
        clean.kraken = null;
    }

    // 4. Sanitize Tarot
    if (rawSnapshot.tarot && typeof rawSnapshot.tarot === 'object') {
        clean.tarot = {
            blessings: Array.isArray(rawSnapshot.tarot.blessings) ? [...rawSnapshot.tarot.blessings] : [],
            activeDraft: rawSnapshot.tarot.activeDraft && typeof rawSnapshot.tarot.activeDraft === 'object'
                ? { ...rawSnapshot.tarot.activeDraft }
                : null,
        };
    } else {
        clean.tarot = { blessings: [], activeDraft: null };
    }

    clean.sanitized = true;
    return clean;
}

/**
 * Safely updates DOM HUD elements or HUD view model using a sanitized player snapshot.
 * Guarantees zero NaN text, zero unhandled null reference exceptions, and zero broken HTML.
 *
 * @param {object} mockHudOrDoc - Mock or real HUD controller / DOM
 * @param {*} rawPlayerSnapshot - Untrusted raw player snapshot
 * @returns {object} Rendered HUD state ViewModel
 */
export function applySanitizedSnapshotToHUD(mockHudOrDoc, rawPlayerSnapshot) {
    const cleanPlayer = sanitizePlayerSnapshot('hud_target', rawPlayerSnapshot);

    const viewModel = {
        coinsText: String(cleanPlayer.coins),
        healthText: `${cleanPlayer.health} / ${cleanPlayer.maxHealth}`,
        healthPercent: cleanPlayer.maxHealth > 0 ? (cleanPlayer.health / cleanPlayer.maxHealth) * 100 : 0,
        upgradesCount: cleanPlayer.upgrades.length,
        upgradesBadges: cleanPlayer.upgrades.map((u) => {
            const def = UPGRADES[u] || ALL_UPGRADES[u];
            return def ? def.name : u;
        }),
        isDead: cleanPlayer.isDead,
    };

    // If mockHudOrDoc provides setStats or direct DOM setters, invoke them safely
    if (mockHudOrDoc) {
        if (typeof mockHudOrDoc.setHealth === 'function') {
            mockHudOrDoc.setHealth(cleanPlayer.health, cleanPlayer.maxHealth);
        }
        if (typeof mockHudOrDoc.setStats === 'function') {
            mockHudOrDoc.setStats(cleanPlayer);
        }
        if (typeof mockHudOrDoc.getElementById === 'function') {
            const coinsEl = mockHudOrDoc.getElementById('coins');
            if (coinsEl) coinsEl.textContent = viewModel.coinsText;
            const healthEl = mockHudOrDoc.getElementById('health');
            if (healthEl) healthEl.textContent = viewModel.healthText;
        }
    }

    return viewModel;
}

/**
 * Safely updates a Three.js Object3D / Raft Mesh using a sanitized player transform.
 * Guarantees zero NaNs injected into position, rotation, quaternion, scale, or matrixWorld.
 *
 * @param {object} threeObject - Three.js Object3D or Mock Object3D
 * @param {*} rawPlayerSnapshot - Untrusted raw player state
 * @returns {boolean} True if transform applied successfully with zero NaNs
 */
export function applySanitizedSnapshotToThreeObject(threeObject, rawPlayerSnapshot) {
    if (!threeObject || typeof threeObject !== 'object') {
        return false;
    }

    const cleanPlayer = sanitizePlayerSnapshot('three_target', rawPlayerSnapshot);

    // Apply Position
    if (threeObject.position) {
        if (typeof threeObject.position.set === 'function') {
            threeObject.position.set(cleanPlayer.position.x, cleanPlayer.position.y, cleanPlayer.position.z);
        } else {
            threeObject.position.x = cleanPlayer.position.x;
            threeObject.position.y = cleanPlayer.position.y;
            threeObject.position.z = cleanPlayer.position.z;
        }
    }

    // Apply Quaternion
    if (threeObject.quaternion) {
        if (typeof threeObject.quaternion.set === 'function') {
            threeObject.quaternion.set(
                cleanPlayer.quaternion.x,
                cleanPlayer.quaternion.y,
                cleanPlayer.quaternion.z,
                cleanPlayer.quaternion.w
            );
        } else {
            threeObject.quaternion.x = cleanPlayer.quaternion.x;
            threeObject.quaternion.y = cleanPlayer.quaternion.y;
            threeObject.quaternion.z = cleanPlayer.quaternion.z;
            threeObject.quaternion.w = cleanPlayer.quaternion.w;
        }
    }

    // Update MatrixWorld if method exists
    if (typeof threeObject.updateMatrixWorld === 'function') {
        threeObject.updateMatrixWorld(true);
    }

    return true;
}
