/**
 * Sovereign Core & Helmet 02 — Multiplayer Snapshot Sanitization & Defensive Invariant Shield
 * (`shared/snapshot-sanitizer.js`)
 *
 * Enforces Helmet 02 (The RTS Flight Engineer) & Sovereign Core Architecture:
 * 1. Truth & The High Ground:
 *    - Never allow corrupt, malformed, or hostile network snapshots to poison local client state.
 *    - Validate and self-heal rowing, combat, kinematics, and inventory states across online Socket.io
 *      and offline loopback packets.
 *    - Check the payload math coldly: NaN/Infinity coordinates, out-of-range floats, invalid swingSide,
 *      or prototype pollution must be intercepted and healed with loud diagnostic counters rather than
 *      silent failure or crashing the game loop.
 * 2. Attention Is the Only Non-Renewable Fuel:
 *    - Zero-dead-touch defensive validation: if the network or loopback drops garbage, the engine self-heals
 *      in <1ms and keeps flying at 60 FPS without crashing or DDOSing the pilot with broken UI.
 * 3. Strict Boundary Isolation:
 *    - Pure, zero-dependency ES module. Headless and Node:test compatible.
 *    - Sanitizes state snapshots, player bags, transforms, HUD models, 3D object bindings, and oar/combat state.
 */

import {
    SNAPSHOT_SANITIZER_LIMITS,
    sanitizeCoins,
    sanitizeHealth,
    sanitizeUpgrades,
    sanitizePosition,
    sanitizeVelocity,
    sanitizeQuaternion,
    sanitizePlayerSnapshot,
    auditSnapshotIntegrity,
    sanitizeNetworkSnapshot,
    applySanitizedSnapshotToHUD,
    applySanitizedSnapshotToThreeObject,
} from './qa-snapshot-sanitizer.js';

// Re-export all core snapshot sanitizer functions and limits
export {
    SNAPSHOT_SANITIZER_LIMITS,
    sanitizeCoins,
    sanitizeHealth,
    sanitizeUpgrades,
    sanitizePosition,
    sanitizeVelocity,
    sanitizeQuaternion,
    sanitizePlayerSnapshot,
    auditSnapshotIntegrity,
    sanitizeNetworkSnapshot,
    applySanitizedSnapshotToHUD,
    applySanitizedSnapshotToThreeObject,
};

/**
 * Diagnostic tracking counters for combat/oar payload sanitization.
 */
export const COMBAT_SANITIZER_COUNTERS = {
    totalCalls: 0,
    healedSwingSide: 0,
    clampedStrokePhase: 0,
    clampedStrokeChoked: 0,
    clampedSwing: 0,
    healedPosition: 0,
    healedVelocity: 0,
    healedQuaternion: 0,
    resetDiagnostics() {
        this.totalCalls = 0;
        this.healedSwingSide = 0;
        this.clampedStrokePhase = 0;
        this.clampedStrokeChoked = 0;
        this.clampedSwing = 0;
        this.healedPosition = 0;
        this.healedVelocity = 0;
        this.healedQuaternion = 0;
    },
};

/**
 * Helper to test if a number is safe and finite.
 *
 * @param {*} val
 * @returns {boolean}
 */
export function isSafeFinite(val) {
    return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
}

/**
 * Validates and self-heals player rowing/combat state across online Socket.io and offline loopback packets.
 *
 * Guarantees:
 * - swingSide is strictly 'left' or 'right' (defaulting to 'right' on invalid input).
 * - strokePhase clamped to [0, 1].
 * - strokeChoked clamped to [0, 1].
 * - swing clamped to [0, 1].
 * - strips any NaN/Infinity from position, velocity, and quaternion fields with loud diagnostic counters.
 *
 * @param {*} raw - Untrusted oar/combat payload or snapshot object
 * @returns {object} Sanitized oar and combat state
 */
export function sanitizeOarAndCombatPayload(raw = {}) {
    COMBAT_SANITIZER_COUNTERS.totalCalls++;

    const src = (raw && typeof raw === 'object') ? raw : {};
    const diagnostics = {
        healedSwingSide: false,
        clampedStrokePhase: false,
        clampedStrokeChoked: false,
        clampedSwing: false,
        healedPosition: false,
        healedVelocity: false,
        healedQuaternion: false,
    };

    // 1. swingSide: strictly 'left' | 'right', defaulting to 'right'
    let swingSide = 'right';
    if (src.swingSide === 'left' || src.swingSide === 'right') {
        swingSide = src.swingSide;
    } else {
        diagnostics.healedSwingSide = true;
        COMBAT_SANITIZER_COUNTERS.healedSwingSide++;
        swingSide = 'right';
    }

    // Helper to clamp in [min, max] and track clamping / NaN healing
    const clampUnitInterval = (val, counterKey, diagKey) => {
        if (!isSafeFinite(val)) {
            diagnostics[diagKey] = true;
            COMBAT_SANITIZER_COUNTERS[counterKey]++;
            return 0;
        }
        if (val < 0) {
            diagnostics[diagKey] = true;
            COMBAT_SANITIZER_COUNTERS[counterKey]++;
            return 0;
        }
        if (val > 1) {
            diagnostics[diagKey] = true;
            COMBAT_SANITIZER_COUNTERS[counterKey]++;
            return 1;
        }
        return val;
    };

    // 2. strokePhase: clamped to [0, 1]
    const strokePhase = clampUnitInterval(src.strokePhase, 'clampedStrokePhase', 'clampedStrokePhase');

    // 3. strokeChoked: clamped to [0, 1]
    const strokeChoked = clampUnitInterval(src.strokeChoked, 'clampedStrokeChoked', 'clampedStrokeChoked');

    // 4. swing: clamped to [0, 1]
    const swing = clampUnitInterval(src.swing, 'clampedSwing', 'clampedSwing');

    // 5. Position: strip NaN / Infinity
    const hasCorruptPos = src.position && (
        !isSafeFinite(src.position.x) ||
        !isSafeFinite(src.position.y) ||
        !isSafeFinite(src.position.z)
    );
    if (!src.position || typeof src.position !== 'object' || hasCorruptPos) {
        if (src.position !== undefined) {
            diagnostics.healedPosition = true;
            COMBAT_SANITIZER_COUNTERS.healedPosition++;
        }
    }
    const position = sanitizePosition(src.position);

    // 6. Velocity: strip NaN / Infinity
    const hasCorruptVel = src.velocity && (
        !isSafeFinite(src.velocity.x) ||
        !isSafeFinite(src.velocity.y) ||
        !isSafeFinite(src.velocity.z)
    );
    if (!src.velocity || typeof src.velocity !== 'object' || hasCorruptVel) {
        if (src.velocity !== undefined) {
            diagnostics.healedVelocity = true;
            COMBAT_SANITIZER_COUNTERS.healedVelocity++;
        }
    }
    const velocity = sanitizeVelocity(src.velocity);

    // 7. Quaternion: strip NaN / Infinity / zero-length
    const hasCorruptQuat = src.quaternion && (
        !isSafeFinite(src.quaternion.x) ||
        !isSafeFinite(src.quaternion.y) ||
        !isSafeFinite(src.quaternion.z) ||
        !isSafeFinite(src.quaternion.w)
    );
    if (!src.quaternion || typeof src.quaternion !== 'object' || hasCorruptQuat) {
        if (src.quaternion !== undefined) {
            diagnostics.healedQuaternion = true;
            COMBAT_SANITIZER_COUNTERS.healedQuaternion++;
        }
    }
    const quaternion = sanitizeQuaternion(src.quaternion);

    return {
        swingSide,
        strokePhase,
        strokeChoked,
        swing,
        position,
        velocity,
        quaternion,
        diagnostics,
    };
}
