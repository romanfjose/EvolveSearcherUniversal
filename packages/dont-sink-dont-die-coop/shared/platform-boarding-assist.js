/**
 * Don't Sink, Don't Die — Platform Boarding Assist & Soft-Docking Magnetism
 * (`shared/platform-boarding-assist.js`)
 *
 * Sovereign Core & Helmet 01 Directive (The Cockpit Pilot):
 * - Eliminates frustration and pilot micro-correction fatigue when boarding sanctuary platforms.
 * - Gently guides a jumping or coasting raft onto nearby Sanctuary Platforms.
 * - Provides magnetic ramp capture and soft-docking stabilization to hold the raft steady
 *   on the center of the deck without slipping off the edges into hazardous waters.
 * - Respects active pilot inputs (paddling forward/backward/turning) so players retain full agency
 *   and can disembark seamlessly when ready.
 *
 * Zero external dependencies. Zero timers, zero I/O, no global leaks (window/document/THREE).
 */

export const BOARDING_ASSIST_CONFIG = {
    // Spatial thresholds
    CAPTURE_RADIUS_XZ: 18.0,         // Detection ceiling around platform center
    RAMP_CAPTURE_DISTANCE_Z: 14.0,   // Longitudinal reach for upriver approach ramp
    RAMP_CAPTURE_WIDTH_X: 9.0,       // Lateral tolerance for ramp alignment
    DOCKING_STABILIZE_RADIUS: 4.5,   // Distance from deck center where steady hold engages
    DECK_MARGIN_BUFFER: 1.0,         // Safety margin inside platform perimeter

    // Force & damping gains
    APPROACH_PULL_ACCEL: 24.0,       // Max lateral/longitudinal guidance accel towards ramp/deck (m/s^2)
    RAMP_ALIGN_ACCEL: 32.0,          // Snappy lateral funneling toward ramp center
    JUMP_LANDING_BIAS_ACCEL: 28.0,   // Airborne bias guiding a jump to clear platform edge safely
    DECK_DOCKING_DAMPING: 8.5,       // Linear drag/damping holding docked raft steady
    CENTERING_SPRING_K: 4.2,         // Restoring spring pulling raft toward deck center

    // Edge protection
    EDGE_REPULSION_FORCE: 35.0,      // Repulsion keeping raft from sliding off deck boundary
    EDGE_REPULSION_DIST: 1.8,        // Distance from perimeter where edge repulsion kicks in

    // Thresholds & states
    MAX_ASSIST_SPEED: 18.0,          // Velocity ceiling for assist forces
    MAX_CAPTURE_RELATIVE_SPEED: 26.0,// Ignore if player is blasting past at extreme hypersonic speed
    MIN_AIRBORNE_Y: 0.15,            // Height above water/surface considered airborne
    INPUT_OVERRIDE_THRESHOLD: 0.25,  // Controller input magnitude to break out of docking hold
};

/**
 * Pure 2D/3D math helpers
 */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function distXZ(p1, p2) {
    const dx = (p1.x ?? p1[0] ?? 0) - (p2.x ?? p2[0] ?? 0);
    const dz = (p1.z ?? p1[2] ?? 0) - (p2.z ?? p2[2] ?? 0);
    return Math.hypot(dx, dz);
}

/**
 * Normalizes platform object into standard rectangular format.
 * Supports varied shapes: { x, z, width, length/depth, height/deckY, ramp }
 */
export function normalizePlatform(raw) {
    if (!raw) return null;
    const x = raw.x ?? raw.position?.x ?? 0;
    const z = raw.z ?? raw.position?.z ?? 0;
    const y = raw.y ?? raw.position?.y ?? raw.deckY ?? 0.75;
    const width = raw.width ?? raw.w ?? 12.0;
    const length = raw.length ?? raw.depth ?? raw.l ?? raw.d ?? 16.0;
    const halfW = width * 0.5;
    const halfL = length * 0.5;

    // Upriver boarding ramp is typically on the positive-z side (incoming river flow towards negative-z)
    // or defined explicitly.
    const rampLength = raw.rampLength ?? 6.0;
    const rampWidth = raw.rampWidth ?? (width * 0.8);
    const rampCenterZ = raw.rampZ ?? (z + halfL + rampLength * 0.5);
    const rampCenterX = raw.rampX ?? x;

    return {
        id: raw.id ?? `platform_${Math.round(x)}_${Math.round(z)}`,
        x,
        y,
        z,
        width,
        length,
        halfW,
        halfL,
        bounds: {
            minX: x - halfW,
            maxX: x + halfW,
            minZ: z - halfL,
            maxZ: z + halfL,
        },
        ramp: {
            x: rampCenterX,
            z: rampCenterZ,
            width: rampWidth,
            length: rampLength,
            halfW: rampWidth * 0.5,
            halfL: rampLength * 0.5,
        },
        raw,
    };
}

/**
 * Tests if player position is within the perimeter bounds of the platform deck.
 */
export function isPositionOnDeck(pos, platform, margin = 0) {
    if (!pos || !platform) return false;
    const p = normalizePlatform(platform);
    const px = pos.x ?? pos[0] ?? 0;
    const pz = pos.z ?? pos[2] ?? 0;

    return (
        px >= p.bounds.minX + margin &&
        px <= p.bounds.maxX - margin &&
        pz >= p.bounds.minZ + margin &&
        pz <= p.bounds.maxZ - margin
    );
}

/**
 * Finds the most relevant platform for assist based on distance and travel direction.
 */
export function findTargetPlatform(playerPos, platforms, searchRadius = BOARDING_ASSIST_CONFIG.CAPTURE_RADIUS_XZ) {
    if (!playerPos || !platforms || !platforms.length) return null;

    let bestPlatform = null;
    let closestDist = Infinity;

    for (let i = 0; i < platforms.length; i++) {
        const plat = normalizePlatform(platforms[i]);
        if (!plat) continue;

        const d = distXZ(playerPos, plat);
        if (d < searchRadius && d < closestDist) {
            closestDist = d;
            bestPlatform = plat;
        }
    }

    return bestPlatform;
}

/**
 * Checks if player is actively inputting movement (WASD, steer, paddle).
 */
export function getActiveInputMagnitude(input) {
    if (!input) return 0;
    let mag = 0;
    if (input.w) mag += 1;
    if (input.s) mag += 0.8;
    if (input.a) mag += 0.5;
    if (input.d) mag += 0.5;
    if (typeof input.forward === 'number') mag = Math.max(mag, Math.abs(input.forward));
    if (typeof input.turn === 'number') mag = Math.max(mag, Math.abs(input.turn) * 0.5);
    return Math.min(1.0, mag);
}

/**
 * Computes Platform Boarding Assist & Soft-Docking Magnetism forces for a player raft.
 *
 * @param {object} player - Watercraft/player state: { position: {x,y,z}, velocity: {x,y,z}, isDead?: boolean }
 * @param {Array<object>|object} platforms - Sanctuary Platform list or single platform
 * @param {object} [input] - Pilot input controls: { w, a, s, d, space, forward, turn }
 * @param {object} [options] - Custom configuration overrides
 * @returns {{
 *   force: { x: number, y: number, z: number },
 *   state: 'none' | 'ramp-guide' | 'jump-assist' | 'deck-docking' | 'edge-guard',
 *   targetPlatform: object | null,
 *   assistActive: boolean,
 *   docked: boolean,
 *   centeringRatio: number
 * }}
 */
export function computeBoardingAssistForce(player, platforms, input = {}, options = {}) {
    const zeroResult = {
        force: { x: 0, y: 0, z: 0 },
        state: 'none',
        targetPlatform: null,
        assistActive: false,
        docked: false,
        centeringRatio: 0,
    };

    if (!player || player.isDead || player.health <= 0) {
        return zeroResult;
    }

    // Resolve player position and velocity
    const pos = player.position || (typeof player.x === 'number' ? player : null);
    if (!pos) return zeroResult;
    const vel = player.velocity || { x: 0, y: 0, z: 0 };

    const platformList = Array.isArray(platforms)
        ? platforms
        : (platforms ? [platforms] : []);

    if (platformList.length === 0) {
        return zeroResult;
    }

    const cfg = { ...BOARDING_ASSIST_CONFIG, ...options };
    const targetPlat = findTargetPlatform(pos, platformList, cfg.CAPTURE_RADIUS_XZ);

    if (!targetPlat) {
        return zeroResult;
    }

    const inputMag = getActiveInputMagnitude(input);
    const isAirborne = (pos.y ?? 0) > (targetPlat.y + cfg.MIN_AIRBORNE_Y) || (vel.y ?? 0) > 0.5;
    const onDeck = isPositionOnDeck(pos, targetPlat);
    const onDeckInner = isPositionOnDeck(pos, targetPlat, cfg.DECK_MARGIN_BUFFER);

    const fx = { x: 0, y: 0, z: 0 };
    let state = 'none';
    let assistActive = false;
    let docked = false;
    let centeringRatio = 0;

    // Relative offsets to platform deck center
    const dxCenter = targetPlat.x - pos.x;
    const dzCenter = targetPlat.z - pos.z;
    const distToCenter = Math.hypot(dxCenter, dzCenter);

    // Centering ratio: 1.0 at center, 0.0 at edge
    const maxDeckRadius = Math.hypot(targetPlat.halfW, targetPlat.halfL);
    centeringRatio = clamp(1.0 - (distToCenter / Math.max(1, maxDeckRadius)), 0.0, 1.0);

    // ─── Scenario 1: On-Deck Soft-Docking Stabilization & Edge Guard ────────
    if (onDeck) {
        docked = true;
        assistActive = true;

        // If player is giving strong inputs (e.g. actively paddling to leave dock), reduce assist hold
        const inputSuppression = clamp(1.0 - inputMag * 0.85, 0.15, 1.0);

        if (onDeckInner) {
            // Well inside deck: hold steady on center of deck without drifting
            state = 'deck-docking';

            // Spring force towards center
            const springForceX = dxCenter * cfg.CENTERING_SPRING_K;
            const springForceZ = dzCenter * cfg.CENTERING_SPRING_K;

            // Soft-docking damping against current velocity (cancels drift and sliding)
            const dampForceX = -vel.x * cfg.DECK_DOCKING_DAMPING;
            const dampForceZ = -vel.z * cfg.DECK_DOCKING_DAMPING;

            fx.x = (springForceX + dampForceX) * inputSuppression;
            fx.z = (springForceZ + dampForceZ) * inputSuppression;

            // Small vertical settling if slightly hovering
            if (pos.y > targetPlat.y) {
                fx.y = -(pos.y - targetPlat.y) * 4.0;
            }
        } else {
            // Near perimeter edge: apply edge-guard repulsion inward to prevent slipping off
            state = 'edge-guard';

            // Compute distance to each of the 4 deck edges
            const distLeft = pos.x - targetPlat.bounds.minX;
            const distRight = targetPlat.bounds.maxX - pos.x;
            const distBack = pos.z - targetPlat.bounds.minZ;
            const distFront = targetPlat.bounds.maxZ - pos.z;

            let repelX = 0;
            let repelZ = 0;

            if (distLeft < cfg.EDGE_REPULSION_DIST) {
                const push = (cfg.EDGE_REPULSION_DIST - distLeft) / cfg.EDGE_REPULSION_DIST;
                repelX += push * cfg.EDGE_REPULSION_FORCE;
            }
            if (distRight < cfg.EDGE_REPULSION_DIST) {
                const push = (cfg.EDGE_REPULSION_DIST - distRight) / cfg.EDGE_REPULSION_DIST;
                repelX -= push * cfg.EDGE_REPULSION_FORCE;
            }
            if (distBack < cfg.EDGE_REPULSION_DIST) {
                const push = (cfg.EDGE_REPULSION_DIST - distBack) / cfg.EDGE_REPULSION_DIST;
                repelZ += push * cfg.EDGE_REPULSION_FORCE;
            }
            if (distFront < cfg.EDGE_REPULSION_DIST) {
                const push = (cfg.EDGE_REPULSION_DIST - distFront) / cfg.EDGE_REPULSION_DIST;
                repelZ -= push * cfg.EDGE_REPULSION_FORCE;
            }

            // Combine edge repulsion with damping
            fx.x = (repelX - vel.x * (cfg.DECK_DOCKING_DAMPING * 0.75)) * inputSuppression;
            fx.z = (repelZ - vel.z * (cfg.DECK_DOCKING_DAMPING * 0.75)) * inputSuppression;
        }
    }
    // ─── Scenario 2: Airborne Jumping Towards Platform Deck ─────────────────
    else if (isAirborne && distToCenter <= (cfg.CAPTURE_RADIUS_XZ * 0.95)) {
        state = 'jump-assist';
        assistActive = true;

        // Airborne guidance vectors: draw raft toward center of deck
        const pullDirX = distToCenter > 1e-4 ? (dxCenter / distToCenter) : 0;
        const pullDirZ = distToCenter > 1e-4 ? (dzCenter / distToCenter) : 0;

        // Scale by proximity to platform
        const prox = 1.0 - clamp(distToCenter / cfg.CAPTURE_RADIUS_XZ, 0, 1);
        const jumpGuidance = cfg.JUMP_LANDING_BIAS_ACCEL * (0.4 + 0.6 * prox);

        fx.x = pullDirX * jumpGuidance;
        fx.z = pullDirZ * jumpGuidance;

        // If raft is dropping fast towards platform height, dampen extreme horizontal velocity
        if (vel.y < 0) {
            fx.x -= vel.x * 2.0;
            fx.z -= vel.z * 1.5;
        }
    }
    // ─── Scenario 3: Approach Ramp Funneling / Coasting Magnetism ───────────
    else {
        // Check if player is positioned in the upriver approach ramp zone
        const ramp = targetPlat.ramp;
        const dxRamp = ramp.x - pos.x;
        const dzRamp = ramp.z - pos.z;

        const isAheadOfRamp = pos.z >= targetPlat.bounds.maxZ &&
            pos.z <= (targetPlat.bounds.maxZ + cfg.RAMP_CAPTURE_DISTANCE_Z);
        const isAlignedWithRamp = Math.abs(pos.x - ramp.x) <= cfg.RAMP_CAPTURE_WIDTH_X;

        // Approach condition: coasting downriver towards the sanctuary platform
        if (isAheadOfRamp && isAlignedWithRamp && vel.z <= 1.0) {
            state = 'ramp-guide';
            assistActive = true;

            // Lateral funneling toward ramp center line
            const lateralOffset = ramp.x - pos.x;
            const lateralGuidance = clamp(lateralOffset * 4.5, -cfg.RAMP_ALIGN_ACCEL, cfg.RAMP_ALIGN_ACCEL);

            // Longitudinal soft guide pulling onto boarding ramp towards platform center
            const downriverPull = clamp((targetPlat.z - pos.z) * 1.2, -cfg.APPROACH_PULL_ACCEL, 0);

            fx.x = lateralGuidance - vel.x * 3.0;
            fx.z = downriverPull;
        } else if (distToCenter <= cfg.CAPTURE_RADIUS_XZ * 0.65 && vel.z <= 0.5) {
            // General coasting proximity assist
            state = 'ramp-guide';
            assistActive = true;

            const pullStrength = (1.0 - distToCenter / (cfg.CAPTURE_RADIUS_XZ * 0.65)) * cfg.APPROACH_PULL_ACCEL * 0.5;
            fx.x = (dxCenter / (distToCenter || 1)) * pullStrength - vel.x * 1.5;
            fx.z = (dzCenter / (distToCenter || 1)) * pullStrength;
        }
    }

    // Safety clamp to prevent physics explosion
    const fMag = Math.hypot(fx.x, fx.z);
    const maxAllowedForce = 80.0;
    if (fMag > maxAllowedForce) {
        const scale = maxAllowedForce / fMag;
        fx.x *= scale;
        fx.z *= scale;
    }

    return {
        force: fx,
        state,
        targetPlatform: targetPlat,
        assistActive,
        docked,
        centeringRatio,
    };
}
