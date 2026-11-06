/**
 * island-mesh.js — Physical Plank & Safe Dock Flex/Dip Physics
 * Videogame Helmet 06: Synthetic José World-Believability & Immersion Director
 *
 * Implements physical pushback for wooden dock planks, safe platforms, and vegetation borders:
 * - Visibly dips and flexes under the weight of stepping/landing players or monsters
 * - Local board deflection along z-axis plank segments
 * - Creak audio trigger when stepping onto fresh dry boards or heavy landing
 * - Spring-damper restorative oscillation settling back to equilibrium
 */

export const PLANK_PHYSICS_CONFIG = {
    maxDipMeters: 0.18,            // Max vertical dip under heavy impact
    stepDipMeters: 0.075,          // Vertical dip on gentle footstep
    springStiffness: 64.0,         // Snappy restorative spring constant
    springDamping: 8.5,            // Natural wood damping ratio
    decayEpsilon: 0.0004,          // Threshold for zeroing motion
    creakCooldownMs: 380,          // Cooldown between creak triggers per platform
};

/**
 * Initializes physical flex data on a wooden dock or vegetation plank group.
 * @param {object} group - THREE.Group containing individual plank boards
 * @param {object} [options={}] - Custom configuration
 * @returns {object} The group with initialized userData.plankPhysics
 */
export function initPlankPhysics(group, options = {}) {
    if (!group) return null;
    const config = { ...PLANK_PHYSICS_CONFIG, ...options };
    group.userData = group.userData || {};
    group.userData.plankPhysics = {
        config,
        dipY: 0,                   // Whole group vertical depression (m)
        velY: 0,                   // Vertical velocity (m/s)
        tiltPitch: 0,              // Pitch deflection (rotation about X)
        tiltRoll: 0,               // Roll deflection (rotation about Z)
        velPitch: 0,
        velRoll: 0,
        lastCreakTime: -Infinity,
        occupantCount: 0,
        isResting: true,
    };
    return group;
}

/**
 * Triggers a physical dip and flex on a dock platform from a player or monster step/landing.
 * @param {object} group - THREE.Group with plankPhysics
 * @param {object} contact - { relX: number, relZ: number, impactSpeed: number, isMonster: boolean }
 * @param {number} [timeNow=0] - Current simulation time in milliseconds
 * @param {function} [onCreak=null] - Callback invoked when a distinct creak is produced
 */
export function triggerPlankDip(group, contact = {}, timeNow = 0, onCreak = null) {
    if (!group || !group.userData || !group.userData.plankPhysics) return;
    const phys = group.userData.plankPhysics;
    const cfg = phys.config;

    const impactSpeed = typeof contact.impactSpeed === 'number' ? Math.abs(contact.impactSpeed) : 1.0;
    const isHeavy = impactSpeed > 2.5 || contact.isMonster;

    // Vertical dip impulse
    const dipImpulse = isHeavy
        ? Math.min(cfg.maxDipMeters, cfg.stepDipMeters + impactSpeed * 0.025)
        : cfg.stepDipMeters;

    phys.velY -= dipImpulse * 35.0;

    // Pitch & roll tilt depending on where the occupant stepped relative to center
    const relX = typeof contact.relX === 'number' ? contact.relX : 0;
    const relZ = typeof contact.relZ === 'number' ? contact.relZ : 0;

    phys.velPitch += (relZ > 0 ? 1 : -1) * Math.min(0.2, Math.abs(relZ) * 0.04) * 8.0;
    phys.velRoll += (relX > 0 ? -1 : 1) * Math.min(0.2, Math.abs(relX) * 0.04) * 8.0;

    phys.isResting = false;

    // Individual boards localized deflection if present
    if (group.userData.plankBoards && Array.isArray(group.userData.plankBoards)) {
        const boards = group.userData.plankBoards;
        for (let i = 0; i < boards.length; i++) {
            const b = boards[i];
            const distZ = Math.abs(b.position.z - relZ);
            const boardDip = Math.max(0, 1.0 - distZ / 2.5) * dipImpulse * 0.75;
            b.userData = b.userData || {};
            b.userData.localDip = (b.userData.localDip || 0) - boardDip;
        }
    }

    // Trigger wood creak audio if cooldown elapsed
    if (timeNow - phys.lastCreakTime > cfg.creakCooldownMs) {
        phys.lastCreakTime = timeNow;
        if (typeof onCreak === 'function') {
            const creakVol = isHeavy ? 0.95 : 0.55;
            onCreak(creakVol);
        }
    }
}

/**
 * Updates the physical spring-damper step of the plank/dock platform.
 * @param {object} group - THREE.Group with plankPhysics
 * @param {number} dt - Delta time in seconds (clamped <= 0.066)
 */
export function stepPlankPhysics(group, dt) {
    if (!group || !group.userData || !group.userData.plankPhysics) return;
    const phys = group.userData.plankPhysics;
    if (phys.isResting) return;

    const cfg = phys.config;
    const stepDt = Math.min(dt, 0.066);

    // Spring equations: F = -k * x - c * v
    const accelY = -cfg.springStiffness * phys.dipY - cfg.springDamping * phys.velY;
    const accelPitch = -cfg.springStiffness * 0.8 * phys.tiltPitch - cfg.springDamping * phys.velPitch;
    const accelRoll = -cfg.springStiffness * 0.8 * phys.tiltRoll - cfg.springDamping * phys.velRoll;

    phys.velY += accelY * stepDt;
    phys.velPitch += accelPitch * stepDt;
    phys.velRoll += accelRoll * stepDt;

    phys.dipY += phys.velY * stepDt;
    phys.tiltPitch += phys.velPitch * stepDt;
    phys.tiltRoll += phys.velRoll * stepDt;

    // Apply to mesh transform
    const baseY = group.userData.baseY !== undefined ? group.userData.baseY : 0;
    group.position.y = baseY + Math.max(-cfg.maxDipMeters * 1.5, Math.min(0.06, phys.dipY));
    group.rotation.x = Math.max(-0.15, Math.min(0.15, phys.tiltPitch));
    group.rotation.z = Math.max(-0.15, Math.min(0.15, phys.tiltRoll));

    // Update individual boards
    if (group.userData.plankBoards && Array.isArray(group.userData.plankBoards)) {
        const boards = group.userData.plankBoards;
        for (let i = 0; i < boards.length; i++) {
            const b = boards[i];
            if (b.userData && b.userData.localDip) {
                b.userData.localDip *= Math.max(0, 1 - cfg.springDamping * stepDt * 1.5);
                b.position.y = (b.userData.baseY || 0) + b.userData.localDip;
                if (Math.abs(b.userData.localDip) < cfg.decayEpsilon) {
                    b.userData.localDip = 0;
                    b.position.y = b.userData.baseY || 0;
                }
            }
        }
    }

    if (
        Math.abs(phys.dipY) < cfg.decayEpsilon &&
        Math.abs(phys.velY) < cfg.decayEpsilon &&
        Math.abs(phys.tiltPitch) < cfg.decayEpsilon &&
        Math.abs(phys.velPitch) < cfg.decayEpsilon &&
        Math.abs(phys.tiltRoll) < cfg.decayEpsilon &&
        Math.abs(phys.velRoll) < cfg.decayEpsilon
    ) {
        phys.dipY = 0;
        phys.velY = 0;
        phys.tiltPitch = 0;
        phys.velPitch = 0;
        phys.tiltRoll = 0;
        phys.velRoll = 0;
        group.position.y = baseY;
        group.rotation.x = 0;
        group.rotation.z = 0;
        phys.isResting = true;
    }
}
