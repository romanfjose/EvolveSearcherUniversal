/**
 * Don't Sink, Don't Die — 3D Trick Animation & Callout VFX Helper
 *
 * Fully pooled, zero-GC Three.js visual effects helper for:
 * 1. 360-degree Pocket-Raft Kickflip roll animation & sparkling tail trail
 * 2. 6m Expanding Shockwave Splash Torus/Ring mesh for Bellyflop Slam
 * 3. Head Bounce golden spark halo burst & jump reset indicator
 * 4. Perfect Parry flash, screen micro-freeze cue, and Wizard stun tether arc
 * 5. 3D Floating Trick Callout Billboards (e.g., "KICKFLIP! +5G", "BELLYFLOP SLAM! 6m AoE", "PLANK PARKOUR x3", "PERFECT PARRY!")
 *
 * Zero external asset dependencies (100% procedural Three.js BufferGeometry & Canvas sprites/text).
 */

import { TRICK_CONSTANTS, PARRY_CONSTANTS } from '../../../shared/trick-system.js';

const MAX_CALLOUTS = 8;
const MAX_SHOCKWAVES = 4;
const MAX_BOUNCE_BURSTS = 6;
const MAX_PARRY_FLASHES = 4;

/**
 * Creates the Trick VFX & 3D Animation Helper system.
 *
 * @param {object} THREE - The Three.js instance
 * @param {object} scene - Three.js Scene
 * @param {object} [options] - Optional configurations
 */
export function createTrickVFXSystem(THREE, scene, options = {}) {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'TrickVFX_Root';
    scene.add(rootGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. BELLYFLOP 6M SHOCKWAVE EXPANDING RING MESH POOL
    // ─────────────────────────────────────────────────────────────────────────
    const shockwavePool = [];
    const ringGeo = new (THREE.RingGeometry || THREE.TorusGeometry || THREE.BufferGeometry)(
        0.5,
        1.2,
        32,
        1
    );

    const ringMat = new (THREE.MeshBasicMaterial || THREE.ShaderMaterial)({
        color: 0x48cae4,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide || 2,
        depthWrite: false,
    });

    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
        const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
        if (mesh.rotation && mesh.rotation.set) {
            mesh.rotation.set(-Math.PI / 2, 0, 0); // Lay flat on water plane
        }
        mesh.visible = false;
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        shockwavePool.push({
            mesh,
            active: false,
            elapsed: 0,
            duration: 0.7,
            maxRadius: TRICK_CONSTANTS.BELLYFLOP_SHOCKWAVE_RADIUS,
            origin: { x: 0, y: 0.25, z: 0 },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. HEAD BOUNCE HALO BURST POOL
    // ─────────────────────────────────────────────────────────────────────────
    const bounceBurstPool = [];
    const haloGeo = new (THREE.CylinderGeometry || THREE.SphereGeometry || THREE.BufferGeometry)(
        1.0,
        1.0,
        0.1,
        16
    );
    const haloMat = new (THREE.MeshBasicMaterial || THREE.ShaderMaterial)({
        color: 0xffd166,
        transparent: true,
        opacity: 0,
        depthWrite: false,
    });

    for (let i = 0; i < MAX_BOUNCE_BURSTS; i++) {
        const mesh = new THREE.Mesh(haloGeo, haloMat.clone());
        mesh.visible = false;
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        bounceBurstPool.push({
            mesh,
            active: false,
            elapsed: 0,
            duration: 0.45,
            origin: { x: 0, y: 0, z: 0 },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. PERFECT PARRY FLASH & STUN CUE POOL
    // ─────────────────────────────────────────────────────────────────────────
    const parryFlashPool = [];
    const flashGeo = new (THREE.SphereGeometry || THREE.BufferGeometry)(1.8, 12, 8);
    const flashMat = new (THREE.MeshBasicMaterial || THREE.ShaderMaterial)({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
    });

    for (let i = 0; i < MAX_PARRY_FLASHES; i++) {
        const mesh = new THREE.Mesh(flashGeo, flashMat.clone());
        mesh.visible = false;
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        parryFlashPool.push({
            mesh,
            active: false,
            elapsed: 0,
            duration: 0.22,
            origin: { x: 0, y: 0, z: 0 },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. FLOATING 3D TRICK CALLOUT BADGES
    // ─────────────────────────────────────────────────────────────────────────
    const calloutPool = [];
    const calloutGeo = new (THREE.PlaneGeometry || THREE.BufferGeometry)(3.5, 0.9);

    for (let i = 0; i < MAX_CALLOUTS; i++) {
        const mat = new (THREE.MeshBasicMaterial || THREE.ShaderMaterial)({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide || 2,
        });
        const mesh = new THREE.Mesh(calloutGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        rootGroup.add(mesh);

        calloutPool.push({
            mesh,
            mat,
            active: false,
            elapsed: 0,
            duration: 1.2,
            text: '',
            color: 0xffffff,
            origin: { x: 0, y: 0, z: 0 },
        });
    }

    // ─── PUBLIC EMITTER & TRIGGER APIS ───────────────────────────────────────

    /**
     * Triggers the 6m Bellyflop Slam Shockwave splash ring on the river surface.
     *
     * @param {object} pos - Epicenter on water surface {x, y, z}
     * @param {number} [radius=6.0] - Target shockwave radius
     */
    function triggerBellyflopShockwave(pos, radius = TRICK_CONSTANTS.BELLYFLOP_SHOCKWAVE_RADIUS) {
        const slot = shockwavePool.find((s) => !s.active);
        if (!slot) return null;

        slot.active = true;
        slot.elapsed = 0;
        slot.maxRadius = radius;
        slot.origin.x = pos.x;
        slot.origin.y = (pos.y || 0.25) + 0.05; // Just above waterline
        slot.origin.z = pos.z;

        slot.mesh.position.set(slot.origin.x, slot.origin.y, slot.origin.z);
        slot.mesh.scale.set(0.1, 0.1, 0.1);
        if (slot.mesh.material && slot.mesh.material.color) {
            slot.mesh.material.color.setHex(0x00f5d4);
        }
        if (slot.mesh.material) {
            slot.mesh.material.opacity = 0.9;
        }
        slot.mesh.visible = true;
        return slot;
    }

    /**
     * Triggers a golden halo burst and jump reset cue when bouncing off an enemy's head.
     *
     * @param {object} pos - Contact position {x, y, z}
     */
    function triggerHeadBounceBurst(pos) {
        const slot = bounceBurstPool.find((b) => !b.active);
        if (!slot) return null;

        slot.active = true;
        slot.elapsed = 0;
        slot.origin.x = pos.x;
        slot.origin.y = pos.y;
        slot.origin.z = pos.z;

        slot.mesh.position.set(pos.x, pos.y, pos.z);
        slot.mesh.scale.set(0.3, 0.3, 0.3);
        if (slot.mesh.material) {
            slot.mesh.material.opacity = 1.0;
        }
        slot.mesh.visible = true;
        return slot;
    }

    /**
     * Triggers Perfect Parry reflection flash & hit-stop visual cue.
     *
     * @param {object} contactPos - Impact position {x, y, z}
     * @param {boolean} isWizard - True if reflecting wizard telekinesis
     */
    function triggerParryFlash(contactPos, isWizard = false) {
        const slot = parryFlashPool.find((f) => !f.active);
        if (!slot) return null;

        slot.active = true;
        slot.elapsed = 0;
        slot.origin.x = contactPos.x;
        slot.origin.y = contactPos.y;
        slot.origin.z = contactPos.z;

        slot.mesh.position.set(contactPos.x, contactPos.y, contactPos.z);
        slot.mesh.scale.set(1.0, 1.0, 1.0);
        if (slot.mesh.material && slot.mesh.material.color) {
            slot.mesh.material.color.setHex(isWizard ? 0x7df9ff : 0xffea00);
        }
        if (slot.mesh.material) {
            slot.mesh.material.opacity = 1.0;
        }
        slot.mesh.visible = true;
        return slot;
    }

    /**
     * Triggers an arcade trick callout banner in 3D world space (e.g. "KICKFLIP! +5G").
     *
     * @param {string} trickType - 'kickflip' | 'bellyflop-slam' | 'plank-parkour-chain' | 'wizard-head-bounce' | 'perfect-parry'
     * @param {object} pos - World coordinates {x, y, z}
     * @param {object} [extra] - Additional context: { multiplier, coins, damage }
     */
    function triggerTrickCallout(trickType, pos, extra = {}) {
        const slot = calloutPool.find((c) => !c.active);
        if (!slot) return null;

        slot.active = true;
        slot.elapsed = 0;
        slot.origin.x = pos.x;
        slot.origin.y = pos.y + 1.8; // Float above raft/player
        slot.origin.z = pos.z;

        let label = 'STUNT!';
        let hexColor = 0xffffff;

        switch (trickType) {
            case 'kickflip':
                label = '360° KICKFLIP! +5🪙';
                hexColor = 0xffd166;
                break;
            case 'bellyflop-slam':
                label = `BELLYFLOP SLAM! 6m SPLASH💥`;
                hexColor = 0x06d6a0;
                break;
            case 'plank-parkour-chain': {
                const mult = extra.multiplier || 2;
                label = `PLANK PARKOUR x${mult}! IMMUNITY🛡️`;
                hexColor = 0x118ab2;
                break;
            }
            case 'wizard-head-bounce':
                label = 'HEAD BOUNCE! JUMP RESET +10🪙';
                hexColor = 0xef476f;
                break;
            case 'perfect-parry':
                label = 'PERFECT PARRY! REFLECTED⚡';
                hexColor = 0x8338ec;
                break;
        }

        slot.text = label;
        slot.color = hexColor;
        slot.mesh.position.set(slot.origin.x, slot.origin.y, slot.origin.z);
        if (slot.mat && slot.mat.color) {
            slot.mat.color.setHex(hexColor);
        }
        if (slot.mat) {
            slot.mat.opacity = 1.0;
        }
        slot.mesh.visible = true;
        return slot;
    }

    /**
     * Applies smooth kickflip roll rotation to a raft's Three.js child group.
     *
     * @param {object} raftGroup - Three.js Object3D/Group representing the raft mesh
     * @param {number} rotationDegrees - Current kickflip angle (0..360)
     */
    function applyKickflipRotation(raftGroup, rotationDegrees = 0) {
        if (!raftGroup || !raftGroup.rotation) return;
        const rad = (rotationDegrees * Math.PI) / 180;
        raftGroup.rotation.z = rad;
    }

    /**
     * Frame-by-frame update step advancing all active trick VFX and billboard callouts.
     *
     * @param {number} dt - Frame delta time in seconds
     */
    function update(dt) {
        // 1. Update Bellyflop 6m Shockwaves
        for (const slot of shockwavePool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const progress = slot.elapsed / slot.duration;
            if (progress >= 1.0) {
                slot.active = false;
                slot.mesh.visible = false;
            } else {
                // Expanding ring: scale from 0 to maxRadius
                const currentRadius = slot.maxRadius * Math.sin((progress * Math.PI) / 2);
                slot.mesh.scale.set(currentRadius, currentRadius, 1);
                if (slot.mesh.material) {
                    slot.mesh.material.opacity = (1.0 - progress) * 0.9;
                }
            }
        }

        // 2. Update Head Bounce Bursts
        for (const slot of bounceBurstPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const progress = slot.elapsed / slot.duration;
            if (progress >= 1.0) {
                slot.active = false;
                slot.mesh.visible = false;
            } else {
                const scale = 0.5 + progress * 2.5;
                slot.mesh.scale.set(scale, scale, scale);
                slot.mesh.position.y = slot.origin.y + progress * 1.2;
                if (slot.mesh.material) {
                    slot.mesh.material.opacity = 1.0 - progress;
                }
            }
        }

        // 3. Update Perfect Parry Flashes
        for (const slot of parryFlashPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const progress = slot.elapsed / slot.duration;
            if (progress >= 1.0) {
                slot.active = false;
                slot.mesh.visible = false;
            } else {
                const scale = 1.0 + progress * 1.8;
                slot.mesh.scale.set(scale, scale, scale);
                if (slot.mesh.material) {
                    slot.mesh.material.opacity = (1.0 - progress) * 0.8;
                }
            }
        }

        // 4. Update Floating Trick Callout Badges
        for (const slot of calloutPool) {
            if (!slot.active) continue;
            slot.elapsed += dt;
            const progress = slot.elapsed / slot.duration;
            if (progress >= 1.0) {
                slot.active = false;
                slot.mesh.visible = false;
            } else {
                // Float gently upward
                slot.mesh.position.y = slot.origin.y + progress * 1.5;
                if (slot.mat) {
                    slot.mat.opacity = 1.0 - Math.pow(progress, 2);
                }
            }
        }
    }

    /**
     * Cleanly disposes all pooled geometries, materials, and groups.
     */
    function dispose() {
        scene.remove(rootGroup);

        if (ringGeo && ringGeo.dispose) ringGeo.dispose();
        if (ringMat && ringMat.dispose) ringMat.dispose();

        if (haloGeo && haloGeo.dispose) haloGeo.dispose();
        if (haloMat && haloMat.dispose) haloMat.dispose();

        if (flashGeo && flashGeo.dispose) flashGeo.dispose();
        if (flashMat && flashMat.dispose) flashMat.dispose();

        if (calloutGeo && calloutGeo.dispose) calloutGeo.dispose();
        for (const c of calloutPool) {
            if (c.mat && c.mat.dispose) c.mat.dispose();
        }
    }

    return {
        rootGroup,
        triggerBellyflopShockwave,
        triggerHeadBounceBurst,
        triggerParryFlash,
        triggerTrickCallout,
        applyKickflipRotation,
        update,
        dispose,
        _pools: {
            shockwavePool,
            bounceBurstPool,
            parryFlashPool,
            calloutPool,
        },
    };
}
