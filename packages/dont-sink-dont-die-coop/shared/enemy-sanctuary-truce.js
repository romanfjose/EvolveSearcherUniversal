/**
 * Enemy Aggro Leash, Sanctuary Repulsion & Harbor Truce Controller
 * (`shared/enemy-sanctuary-truce.js`)
 *
 * Architectural Intent:
 * Enforces territorial boundaries and sanctuary safe havens for player rafts:
 *   1. Evaluates whether enemies ('whiteGuy', 'mudAlien', 'longWorm', or generic monsters)
 *      should ignore their target due to Sanctuary Platforms, Harbor City basin truce,
 *      safe height advantages (elevated planks/piers), or aggro leash thresholds.
 *   2. Computes smooth, deterministic 2D/3D repulsion force vectors pushing enemies away
 *      from Sanctuary Platforms and Harbor borders to prevent clipping, camping, or harassment.
 *   3. Guarantees players true breathing room at docks, shops, and resting waypoints
 *      without breaking 60Hz physics determinism or causing NaN coordinate blowups.
 *
 * Zero external dependencies. Pure mathematical module compatible with Node.js and browser.
 */

export const DEFAULT_SAFE_HEIGHT = 1.0;

export const DEFAULT_HARBOR_BOUNDS = Object.freeze({
    minX: 10,
    maxX: 35,
    minZ: -270,
    maxZ: -140,
});

export const DEFAULT_LEASH_RANGES = Object.freeze({
    whiteGuy: 65,
    mudAlien: 100, // Aligned with ENEMY_TYPES.mudAlien.chaseMax
    longWorm: 200, // Aligned with ENEMY_TYPES.longWorm.aggroRange
    default: 80,
});

export const SANCTUARY_REPULSION_CONFIG = Object.freeze({
    defaultRadius: 16.0,
    maxRepulsionForce: 45.0,
    marginBuffer: 4.0,
    dampingFactor: 0.85,
});

/**
 * Checks if a 2D or 3D point is inside a rectangular or cuboid boundary box.
 *
 * @param {{ x: number, y?: number, z: number }} point
 * @param {{ minX: number, maxX?: number, minZ: number, maxZ: number, minY?: number, maxY?: number }} bounds
 * @returns {boolean}
 */
export function isPointInBounds(point, bounds) {
    if (!point || !bounds) return false;
    const px = point.x ?? 0;
    const pz = point.z ?? 0;

    const minX = bounds.minX ?? -Infinity;
    const maxX = bounds.maxX ?? Infinity;
    const minZ = bounds.minZ ?? -Infinity;
    const maxZ = bounds.maxZ ?? Infinity;

    const inXZ = px >= minX && px <= maxX && pz >= minZ && pz <= maxZ;
    if (!inXZ) return false;

    if (bounds.minY !== undefined || bounds.maxY !== undefined) {
        const py = point.y ?? 0;
        const minY = bounds.minY ?? -Infinity;
        const maxY = bounds.maxY ?? Infinity;
        return py >= minY && py <= maxY;
    }

    return true;
}

/**
 * Determines whether a point is within the Harbor City basin / shop dock safe zone.
 *
 * @param {{ x: number, y?: number, z: number }} point
 * @param {{ minX: number, maxX?: number, minZ: number, maxZ: number }} [harborBounds]
 * @returns {boolean}
 */
export function isPointInHarbor(point, harborBounds = DEFAULT_HARBOR_BOUNDS) {
    if (!point || !harborBounds) return false;
    return isPointInBounds(point, harborBounds);
}

/**
 * Checks if a point lies within or adjacent to a Sanctuary Platform.
 * Supports platforms defined with:
 *   - Center + width/length (or halfWidth/halfLength): { x, z, width, length, halfW, halfD, radius }
 *   - Direct bounding box: { minX, maxX, minZ, maxZ }
 *
 * @param {{ x: number, y?: number, z: number }} point
 * @param {Object} platform
 * @param {number} [margin=0] Additional buffer around the platform
 * @returns {boolean}
 */
export function isPointInPlatform(point, platform, margin = 0) {
    if (!point || !platform) return false;
    const px = point.x ?? 0;
    const pz = point.z ?? 0;

    // Direct bounds object
    if (platform.minX !== undefined && platform.maxX !== undefined) {
        return px >= (platform.minX - margin) &&
               px <= (platform.maxX + margin) &&
               pz >= (platform.minZ - margin) &&
               pz <= (platform.maxZ + margin);
    }

    // Centered platform with dimensions
    const centerX = platform.x ?? platform.position?.x ?? 0;
    const centerZ = platform.z ?? platform.position?.z ?? 0;

    if (platform.radius !== undefined) {
        const r = platform.radius + margin;
        const dx = px - centerX;
        const dz = pz - centerZ;
        return (dx * dx + dz * dz) <= (r * r);
    }

    const halfW = (platform.halfW ?? ((platform.width ?? platform.w ?? 16) / 2)) + margin;
    const halfL = (platform.halfL ?? platform.halfD ?? ((platform.length ?? platform.l ?? platform.depth ?? 16) / 2)) + margin;

    return Math.abs(px - centerX) <= halfW && Math.abs(pz - centerZ) <= halfL;
}

/**
 * Checks whether a point is protected by any platform in a collection.
 *
 * @param {{ x: number, y?: number, z: number }} point
 * @param {Array<Object>|Object} platforms
 * @param {number} [margin=0]
 * @returns {boolean}
 */
export function isPointInSanctuary(point, platforms, margin = 0) {
    if (!point || !platforms) return false;
    const platformList = Array.isArray(platforms) ? platforms : Object.values(platforms);
    for (let i = 0; i < platformList.length; i++) {
        const plat = platformList[i];
        if (isPointInPlatform(point, plat, margin)) {
            return true;
        }
    }
    return false;
}

/**
 * Calculates Euclidean 2D distance on the XZ ground plane.
 *
 * @param {{ x?: number, z?: number }} a
 * @param {{ x?: number, z?: number }} b
 * @returns {number}
 */
export function distXZ(a, b) {
    if (!a || !b) return Infinity;
    const dx = (a.x ?? 0) - (b.x ?? 0);
    const dz = (a.z ?? 0) - (b.z ?? 0);
    return Math.hypot(dx, dz);
}

/**
 * Computes whether an enemy must drop aggression and ignore its target.
 *
 * Truce / Disengage conditions:
 *   1. Target is invalid, destroyed, or marked dead (target.isDead === true or target.health <= 0).
 *   2. Target is vertically out of reach (e.g. perched on elevated planks above safeHeight).
 *   3. Target is inside the Harbor City basin / shop dock zone (harborBounds).
 *   4. Target is safely berthed on a Sanctuary Platform.
 *   5. Distance between enemy and target exceeds the enemy's maximum aggro leash range.
 *
 * @param {Object} enemy - The pursuing enemy entity { type, position, leashRange, ... }
 * @param {Object} target - The target player/raft entity { position, health, isDead, ... }
 * @param {Object} [options={}]
 * @param {number} [options.safeHeight] - Height threshold above which target is immune
 * @param {Object} [options.harborBounds] - Harbor City zone coordinates { minX, maxX, minZ, maxZ }
 * @param {Array<Object>|Object} [options.platforms] - List of active Sanctuary Platforms
 * @param {number} [options.leashRange] - Optional override for max leash distance
 * @returns {boolean} True if the enemy must ignore the target; false if aggression continues.
 */
export function shouldEnemyIgnoreTarget(enemy, target, {
    safeHeight = DEFAULT_SAFE_HEIGHT,
    harborBounds = DEFAULT_HARBOR_BOUNDS,
    platforms = [],
    leashRange = null,
} = {}) {
    // 1. Target existence and vitality check
    if (!target) return true;
    if (target.isDead) return true;
    if (typeof target.health === 'number' && target.health <= 0) return true;

    const targetPos = target.position ?? target;
    if (targetPos.x === undefined && targetPos.z === undefined) return true;

    // 2. Safe height evaluation (e.g. target standing on elevated planks/pilings)
    const targetY = targetPos.y ?? target.y ?? 0;
    if (targetY > safeHeight) {
        return true;
    }

    // 3. Harbor City Basin Truce
    if (harborBounds && isPointInHarbor(targetPos, harborBounds)) {
        return true;
    }

    // 4. Sanctuary Platform immunity
    if (platforms && isPointInSanctuary(targetPos, platforms, SANCTUARY_REPULSION_CONFIG.marginBuffer)) {
        return true;
    }

    // 5. Enemy aggro leash boundary
    if (enemy) {
        const enemyPos = enemy.position ?? enemy;
        const enemyType = enemy.type ?? enemy.id ?? 'default';

        const maxLeash = leashRange ??
                         enemy.leashRange ??
                         DEFAULT_LEASH_RANGES[enemyType] ??
                         DEFAULT_LEASH_RANGES.default;

        const distance = distXZ(enemyPos, targetPos);
        if (distance > maxLeash) {
            return true;
        }
    }

    return false;
}

/**
 * Computes a smooth repulsion vector pushing an enemy away from all overlapping
 * or nearby Sanctuary Platforms.
 *
 * Repulsion behavior:
 *   - Pushes outward along the vector from the platform center toward the enemy.
 *   - If the enemy is perfectly at the platform center (singular dx=0, dz=0),
 *     breaks symmetry deterministically toward the open river channel (e.g. x=0, z=-1).
 *   - Magnitude scales smoothly with penetration depth / proximity, clamping at maxRepulsionForce.
 *
 * @param {Object} enemy - Enemy entity or position { position: { x, y, z } }
 * @param {Array<Object>|Object} platforms - List of sanctuary platforms
 * @param {Object} [options={}]
 * @param {number} [options.maxForce] - Maximum repulsion force magnitude
 * @param {number} [options.marginBuffer] - Proximity buffer around platform perimeter
 * @returns {{ x: number, y: number, z: number, magnitude: number }} Repulsion impulse vector
 */
export function computeSanctuaryRepulsionVector(enemy, platforms, {
    maxForce = SANCTUARY_REPULSION_CONFIG.maxRepulsionForce,
    marginBuffer = SANCTUARY_REPULSION_CONFIG.marginBuffer,
} = {}) {
    const zeroVector = { x: 0, y: 0, z: 0, magnitude: 0 };
    if (!enemy || !platforms) return zeroVector;

    const enemyPos = enemy.position ?? enemy;
    const ex = enemyPos.x ?? 0;
    const ez = enemyPos.z ?? 0;

    const platformList = Array.isArray(platforms) ? platforms : Object.values(platforms);
    if (platformList.length === 0) return zeroVector;

    let totalFx = 0;
    let totalFz = 0;

    for (let i = 0; i < platformList.length; i++) {
        const plat = platformList[i];
        if (!plat) continue;

        const cx = plat.x ?? plat.position?.x ?? ((plat.minX !== undefined && plat.maxX !== undefined) ? (plat.minX + plat.maxX) / 2 : 0);
        const cz = plat.z ?? plat.position?.z ?? ((plat.minZ !== undefined && plat.maxZ !== undefined) ? (plat.minZ + plat.maxZ) / 2 : 0);

        const radius = plat.radius ?? (
            (plat.width !== undefined && plat.length !== undefined)
                ? Math.hypot(plat.width / 2, plat.length / 2)
                : ((plat.minX !== undefined) ? Math.hypot((plat.maxX - plat.minX) / 2, (plat.maxZ - plat.minZ) / 2) : SANCTUARY_REPULSION_CONFIG.defaultRadius)
        );

        const effectiveRadius = radius + marginBuffer;

        const dx = ex - cx;
        const dz = ez - cz;
        const dist = Math.hypot(dx, dz);

        // Enemy is within the sanctuary repulsion envelope
        if (dist < effectiveRadius) {
            // Factor goes from 1.0 (at center) to 0.0 (at effective boundary edge)
            const penetration = Math.max(0, 1.0 - (dist / effectiveRadius));
            const force = maxForce * penetration;

            if (dist > 1e-4) {
                totalFx += (dx / dist) * force;
                totalFz += (dz / dist) * force;
            } else {
                // Singular center point: push toward downstream river channel (negative z)
                totalFz += -force;
            }
        }
    }

    const totalMag = Math.hypot(totalFx, totalFz);
    if (totalMag === 0) return zeroVector;

    // Clamp cumulative magnitude to maxForce
    const clampedMag = Math.min(totalMag, maxForce);
    const scale = clampedMag / totalMag;

    return {
        x: totalFx * scale,
        y: 0,
        z: totalFz * scale,
        magnitude: clampedMag,
    };
}
