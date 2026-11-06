/**
 * Don't Sink, Don't Die — Combat Rig & Physical Melee Clash Controller
 *
 * Provides physical recoil translation, clash spark particle bursts,
 * and River Mage wizard hat spin rig articulation under Videogame Helmet 06:
 * - When blocking or parrying, applies bodily recoil impulses to the player and attacker.
 * - Manages River Mage wizard hat sub-group with high-speed rotation and wobble during 2v1 stagger.
 */

import {
    COMBAT_CONSTANTS,
    calculateClashImpulse,
    createMageCombatState,
    registerMageMeleeHit,
    stepMageCombatState,
} from '../../../shared/combat-system.js';

/**
 * Creates a Combat Rig controller that interfaces with Three.js rafts, enemy meshes, and VFX systems.
 *
 * @param {object} options
 * @param {object} [options.combatVFX] - Combat VFX manager (triggerParryShield, emitSparks)
 * @param {object} [options.sfx] - Sound effects manager
 * @returns {object} Combat rig controller instance
 */
export function createCombatRig(options = {}) {
    const combatVFX = options.combatVFX;
    const sfx = options.sfx;

    const mageCombatState = createMageCombatState();

    /**
     * Applies a physical clash recoil and knockback between player raft and enemy.
     *
     * @param {object} playerCraft - Player raft kinematic craft state ({ position, velocity, etc. })
     * @param {object} enemyMesh - Attacking enemy Three.js mesh or object ({ position })
     * @param {object} enemyData - Enemy state object ({ position })
     * @param {boolean} isParry - Whether this was a Perfect Parry
     * @returns {object} Clash impulse resolution
     */
    function applyClashRecoil(playerCraft, enemyMesh, enemyData, isParry = false) {
        if (!playerCraft?.position || !enemyMesh?.position) {
            return null;
        }

        const impulse = calculateClashImpulse(playerCraft.position, enemyMesh.position, isParry);

        // 1. Physically recoil player velocity/position
        if (playerCraft.velocity) {
            playerCraft.velocity.x += impulse.playerRecoil.vx;
            playerCraft.velocity.z += impulse.playerRecoil.vz;
        } else {
            playerCraft.position.x += impulse.playerRecoil.vx * 0.15;
            playerCraft.position.z += impulse.playerRecoil.vz * 0.15;
        }

        // 2. Physically knock back the enemy
        const enemyKnockbackScale = isParry ? 0.35 : 0.22;
        enemyMesh.position.x += impulse.enemyKnockback.vx * enemyKnockbackScale;
        enemyMesh.position.z += impulse.enemyKnockback.vz * enemyKnockbackScale;

        if (enemyData?.position) {
            enemyData.position.x = enemyMesh.position.x;
            enemyData.position.z = enemyMesh.position.z;
        }

        // 3. Trigger clash spark burst & visual parry dome if available
        if (combatVFX) {
            const sparkColor = isParry ? 0x38bdf8 : 0xffb703;
            combatVFX.triggerParryShield(
                impulse.clashPoint,
                impulse.sparkNormal,
                {
                    domeColor: sparkColor,
                    duration: isParry ? 0.42 : 0.28,
                    sparkCount: isParry ? 32 : 18,
                    sparkSpeed: isParry ? 16.0 : 11.0,
                }
            );
        }

        // 4. Play tactile impact audio
        if (sfx) {
            if (isParry) {
                sfx.upgrade?.();
            } else {
                sfx.hit?.();
            }
        }

        return impulse;
    }

    /**
     * Attaches wizard hat spin nodes to a River Mage mesh group if present.
     *
     * @param {object} mageMesh - The whiteGuy Three.js group
     * @param {object} THREE - Three.js instance
     * @returns {object|null} The hat spin group
     */
    function attachMageHatSpinRig(mageMesh, THREE) {
        if (!mageMesh || !THREE) return null;

        // If already attached, return existing
        if (mageMesh.userData?.hatSpinGroup) {
            return mageMesh.userData.hatSpinGroup;
        }

        const hatBrim = mageMesh.children?.find?.((c) => c.name === 'hatBrim') || mageMesh.userData?.hatBrim;
        const hatBand = mageMesh.children?.find?.((c) => c.name === 'hatBand') || mageMesh.userData?.hatBand;
        const hatCone = mageMesh.children?.find?.((c) => c.name === 'hatCone') || mageMesh.userData?.hatCone;

        // If hat parts are direct children of mageMesh, group them
        const spinGroup = new THREE.Group();
        spinGroup.name = 'MageHatSpinGroup';
        spinGroup.position.set(0, 2.86, 0);

        const partsToReparent = [];
        if (hatBrim) partsToReparent.push(hatBrim);
        if (hatBand) partsToReparent.push(hatBand);
        if (hatCone) partsToReparent.push(hatCone);

        for (const p of partsToReparent) {
            if (p.parent) p.parent.remove(p);
            p.position.y -= 2.86; // Relative to spinGroup origin
            spinGroup.add(p);
        }

        mageMesh.add(spinGroup);
        mageMesh.userData.hatSpinGroup = spinGroup;
        mageMesh.userData.hatBrim = hatBrim;
        mageMesh.userData.hatBand = hatBand;
        mageMesh.userData.hatCone = hatCone;

        return spinGroup;
    }

    /**
     * Triggers 2v1 double-team hit on the River Mage, escalating stagger and spinning the wizard hat.
     *
     * @param {number} currentTimeSec
     * @param {boolean} is2v1
     * @returns {object} Stagger outcome
     */
    function onMageHit(currentTimeSec, is2v1 = false) {
        return registerMageMeleeHit(mageCombatState, currentTimeSec, is2v1);
    }

    /**
     * Updates combat rig animations each frame.
     *
     * @param {number} dt
     * @param {object} [mageMesh]
     */
    function update(dt, mageMesh = null) {
        stepMageCombatState(mageCombatState, dt);

        if (mageMesh) {
            // Apply stagger state to mesh userData
            mageMesh.userData.staggered = mageCombatState.isStaggerLocked;
            mageMesh.userData.mageCombatState = mageCombatState;

            // Apply hat spin rotation and wobble tilt
            const hatGroup = mageMesh.userData?.hatSpinGroup;
            if (hatGroup) {
                hatGroup.rotation.y = mageCombatState.hatSpinAngle;
                // Wobble tilt proportional to spin velocity
                const wobbleIntensity = Math.min(0.45, Math.abs(mageCombatState.hatSpinVelocity) * 0.015);
                hatGroup.rotation.z = Math.sin(mageCombatState.hatWobblePhase) * wobbleIntensity + 0.08;
                hatGroup.rotation.x = Math.cos(mageCombatState.hatWobblePhase * 0.8) * wobbleIntensity;
            }
        }
    }

    return {
        COMBAT_CONSTANTS,
        mageCombatState,
        applyClashRecoil,
        attachMageHatSpinRig,
        onMageHit,
        update,
    };
}
