/**
 * biomes-mesh.js — Physical Realism & World Pushback for Biomes and Foliage
 * Videogame Helmet 06: Synthetic José World-Believability & Immersion Director
 *
 * Implements physically reactive riverbank vegetation, shore trees, and foliage:
 * - Foliage shudder/sway physics on physical contact (raft brush, monster collision, projectile impact)
 * - Spring-damper restorative oscillation (stiffness, damping, decay)
 * - Directional bending away from impact source
 * - Ambient wind breeze modulation with zero per-frame heap allocations
 */

export const TREE_PHYSICS_CONFIG = {
    maxDeflectionRad: 0.28,        // Max trunk/canopy tilt angle (~16 degrees)
    springStiffness: 42.0,         // Restorative spring constant (rad/s^2)
    springDamping: 6.8,            // Damping ratio to settle oscillation cleanly
    brushImpulseForce: 0.18,       // Impulse strength on glancing raft/monster contact
    directHitImpulseForce: 0.38,   // Impulse strength on direct high-speed collision
    contactRadiusBuffer: 0.65,     // Distance outside collision radius where foliage brushes
    decayEpsilon: 0.0005,          // Cutoff below which vibration ceases
};

/**
 * Initializes physical reactivity metadata on a tree or vegetation mesh group.
 * @param {object} group - THREE.Group containing trunk and foliage canopy
 * @param {object} [options={}] - Custom physics parameters
 * @returns {object} The group with initialized userData.treePhysics
 */
export function initTreePhysics(group, options = {}) {
    if (!group) return null;
    const config = { ...TREE_PHYSICS_CONFIG, ...options };
    group.userData = group.userData || {};
    group.userData.treePhysics = {
        config,
        // Angular deflection in X and Z
        angleX: 0,
        angleZ: 0,
        velX: 0,
        velZ: 0,
        // Shudder vibration high-frequency oscillation
        shudderAmp: 0,
        shudderFreq: 28.0,
        shudderDecay: 7.5,
        lastImpulseTime: 0,
        isResting: true,
    };
    return group;
}

/**
 * Applies a physical impulse to a tree group (e.g. from raft collision or monster brushing past).
 * @param {object} group - THREE.Group with initialized treePhysics
 * @param {number} dirX - Normalized impact direction X (from collider toward tree or collider velocity)
 * @param {number} dirZ - Normalized impact direction Z
 * @param {number} strength - Impulse magnitude (0.0 to 1.0+)
 * @param {number} [timeNow=0] - Current simulation time in milliseconds
 */
export function applyTreeImpulse(group, dirX, dirZ, strength = 1.0, timeNow = 0) {
    if (!group || !group.userData || !group.userData.treePhysics) return;
    const phys = group.userData.treePhysics;
    const cfg = phys.config;

    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;

    const mag = Math.min(cfg.maxDeflectionRad * 1.5, strength * cfg.directHitImpulseForce);
    // Tree bends in the direction of the force
    phys.velX += nx * mag * 18.0;
    phys.velZ += nz * mag * 18.0;
    phys.shudderAmp = Math.min(0.24, phys.shudderAmp + strength * 0.16);
    phys.lastImpulseTime = timeNow;
    phys.isResting = false;
}

/**
 * Updates the physical spring-damper step and ambient wind sway of the tree.
 * @param {object} group - THREE.Group with treePhysics
 * @param {number} dt - Delta time in seconds (clamped to <= 0.1s)
 * @param {number} [time=0] - Elapsed time in seconds
 */
export function stepTreePhysics(group, dt, time = 0) {
    if (!group || !group.userData || !group.userData.treePhysics) return;
    const phys = group.userData.treePhysics;
    if (phys.isResting && phys.shudderAmp < phys.config.decayEpsilon) {
        // Apply ambient wind sway when resting
        const windX = Math.sin(time * 1.8 + (group.position?.x || 0) * 0.1) * 0.025;
        const windZ = Math.cos(time * 1.4 + (group.position?.z || 0) * 0.1) * 0.02;
        group.rotation.x = windX;
        group.rotation.z = windZ;
        return;
    }

    const cfg = phys.config;
    const stepDt = Math.min(dt, 0.066);

    // Spring acceleration towards 0 deflection: a = -k*x - c*v
    const accelX = -cfg.springStiffness * phys.angleX - cfg.springDamping * phys.velX;
    const accelZ = -cfg.springStiffness * phys.angleZ - cfg.springDamping * phys.velZ;

    phys.velX += accelX * stepDt;
    phys.velZ += accelZ * stepDt;

    phys.angleX += phys.velX * stepDt;
    phys.angleZ += phys.velZ * stepDt;

    // Decay high-frequency shudder
    if (phys.shudderAmp > 0) {
        phys.shudderAmp = Math.max(0, phys.shudderAmp - phys.shudderDecay * stepDt);
    }

    const shudderOffset = phys.shudderAmp > 0 ? Math.sin(time * phys.shudderFreq) * phys.shudderAmp : 0;

    // Ambient wind background
    const windX = Math.sin(time * 1.8 + (group.position?.x || 0) * 0.1) * 0.025;
    const windZ = Math.cos(time * 1.4 + (group.position?.z || 0) * 0.1) * 0.02;

    group.rotation.x = THREE_CLAMP(phys.angleX + shudderOffset + windX, -cfg.maxDeflectionRad, cfg.maxDeflectionRad);
    group.rotation.z = THREE_CLAMP(phys.angleZ - shudderOffset * 0.7 + windZ, -cfg.maxDeflectionRad, cfg.maxDeflectionRad);

    // If canopy / sub-cones exist, add secondary flex to upper tiers
    if (group.userData.canopyTiers && Array.isArray(group.userData.canopyTiers)) {
        for (let i = 0; i < group.userData.canopyTiers.length; i++) {
            const tier = group.userData.canopyTiers[i];
            const tierMultiplier = 1.0 + (i + 1) * 0.45;
            tier.rotation.x = group.rotation.x * tierMultiplier * 0.35;
            tier.rotation.z = group.rotation.z * tierMultiplier * 0.35;
        }
    }

    if (
        Math.abs(phys.angleX) < cfg.decayEpsilon &&
        Math.abs(phys.angleZ) < cfg.decayEpsilon &&
        Math.abs(phys.velX) < cfg.decayEpsilon &&
        Math.abs(phys.velZ) < cfg.decayEpsilon &&
        phys.shudderAmp < cfg.decayEpsilon
    ) {
        phys.angleX = 0;
        phys.angleZ = 0;
        phys.velX = 0;
        phys.velZ = 0;
        phys.shudderAmp = 0;
        phys.isResting = true;
    }
}

/**
 * Checks proximity of moving entities (craft, enemies) against a tree and applies brush/impact shudder.
 * @param {object} treeObstacle - Obstacle entry with { mesh, x, z, radius }
 * @param {object} entity - Moving entity with { position: {x, z}, velocity: {x, z} }
 * @param {number} [timeNow=0] - Current simulation time in milliseconds
 * @returns {boolean} True if brush or collision occurred
 */
export function checkTreeEntityBrush(treeObstacle, entity, timeNow = 0) {
    if (!treeObstacle || !treeObstacle.mesh || !entity || !entity.position) return false;
    const mesh = treeObstacle.mesh;
    if (!mesh.userData || !mesh.userData.treePhysics) {
        initTreePhysics(mesh);
    }

    const dx = entity.position.x - treeObstacle.x;
    const dz = entity.position.z - treeObstacle.z;
    const distSq = dx * dx + dz * dz;

    const treeRadius = treeObstacle.radius || 0.85;
    const brushThreshold = treeRadius + 1.6; // Brush perimeter

    if (distSq < brushThreshold * brushThreshold && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const vel = entity.velocity || { x: 0, z: 0 };
        const speed = Math.hypot(vel.x, vel.z) || 1.0;

        // Vector away from entity or along entity velocity
        let fx = -dx / dist;
        let fz = -dz / dist;
        if (speed > 0.5) {
            fx = fx * 0.4 + (vel.x / speed) * 0.6;
            fz = fz * 0.4 + (vel.z / speed) * 0.6;
        }

        const isDirectHit = dist < treeRadius + 1.0;
        const impulseStrength = isDirectHit ? Math.min(1.5, 0.6 + speed * 0.08) : 0.4;

        // Prevent spamming impulse on every single frame if already heavily shuddering
        const phys = mesh.userData.treePhysics;
        if (timeNow - phys.lastImpulseTime > 140) {
            applyTreeImpulse(mesh, fx, fz, impulseStrength, timeNow);
            return true;
        }
    }
    return false;
}

function THREE_CLAMP(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
