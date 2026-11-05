import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    TRICK_CONSTANTS,
    PARRY_CONSTANTS,
    createPlayerTrickState,
    recordBlockInput,
    isWithinParryWindow,
    resolveIncomingHitWithParry,
    checkAirborneTrickInput,
    checkWizardHeadBounce,
    resolveLanding,
    stepPlayerTricksAndParry,
} from '../shared/trick-system.js';

import { createTrickVFXSystem } from '../public/js/vfx/trick-vfx.js';

// ─── Deterministic Mock Three.js Suite for Trick VFX Testing ──────────────
function createMockThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }

    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }

    class Color {
        constructor(hex = 0) { this.hex = hex; }
        setHex(hex) { this.hex = hex; return this; }
    }

    class BufferGeometry {
        dispose() {}
    }

    class RingGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }
    class CylinderGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }
    class SphereGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }
    class PlaneGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }

    class Material {
        constructor(opts = {}) {
            this.color = opts.color ? new Color(opts.color) : new Color(0);
            this.opacity = opts.opacity ?? 1.0;
            this.transparent = opts.transparent ?? false;
        }
        clone() {
            return new Material({ color: this.color.hex, opacity: this.opacity, transparent: this.transparent });
        }
        dispose() {}
    }

    class MeshBasicMaterial extends Material {}

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.visible = true;
            this.frustumCulled = true;
            this.children = [];
            this.name = '';
        }
        add(...objs) {
            for (const o of objs) if (o) this.children.push(o);
            return this;
        }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx !== -1) this.children.splice(idx, 1);
        }
    }

    class Group extends Object3D {}
    class Mesh extends Object3D {
        constructor(geo, mat) {
            super();
            this.geometry = geo;
            this.material = mat;
        }
    }

    return {
        Vector3,
        Euler,
        Color,
        RingGeometry,
        CylinderGeometry,
        SphereGeometry,
        PlaneGeometry,
        MeshBasicMaterial,
        Group,
        Mesh,
        DoubleSide: 2,
    };
}

function createMockScene() {
    const children = [];
    return {
        children,
        add(obj) { children.push(obj); },
        remove(obj) {
            const idx = children.indexOf(obj);
            if (idx !== -1) children.splice(idx, 1);
        },
    };
}

// ─── 1. Constants and Initial State Verification ───────────────────────────
describe('Pocket-Raft Trick Constants & State Initialization', () => {
    it('defines expected trick system constants', () => {
        assert.equal(TRICK_CONSTANTS.KICKFLIP_COINS, 5);
        assert.equal(TRICK_CONSTANTS.KICKFLIP_BOOST_DURATION, 2.5);
        assert.equal(TRICK_CONSTANTS.BELLYFLOP_SHOCKWAVE_RADIUS, 6.0);
        assert.equal(TRICK_CONSTANTS.HEAD_BOUNCE_COINS, 10);
        assert.deepEqual(TRICK_CONSTANTS.PLANK_CHAIN_MULTIPLIERS, [1, 2, 3, 4]);
    });

    it('defines expected perfect parry constants', () => {
        assert.equal(PARRY_CONSTANTS.PERFECT_PARRY_WINDOW_MS, 220);
        assert.equal(PARRY_CONSTANTS.HIT_STOP_MS, 60);
        assert.equal(PARRY_CONSTANTS.WIZARD_STUN_DURATION_MS, 2500);
    });

    it('createPlayerTrickState initializes with default clean state', () => {
        const state = createPlayerTrickState();
        assert.equal(state.airborne, false);
        assert.equal(state.activeTrick, null);
        assert.equal(state.plankChainCount, 0);
        assert.equal(state.wizardImmunity, false);
        assert.equal(state.hydroplaningTimer, 0);
        assert.equal(state.trickCoinsEarned, 0);
    });
});

// ─── 2. Perfect Parry (220ms window, 60ms hit-stop, wizard stun) ───────────
describe('Perfect Parry Reflection Engine', () => {
    it('recordBlockInput updates timestamp on rising edge', () => {
        const state = createPlayerTrickState();
        recordBlockInput(state, true, 1000);
        assert.equal(state.isBlocking, true);
        assert.equal(state.lastBlockPressTime, 1000);

        // Holding block does not overwrite press timestamp
        recordBlockInput(state, true, 1100);
        assert.equal(state.lastBlockPressTime, 1000);

        // Release block
        recordBlockInput(state, false, 1200);
        assert.equal(state.isBlocking, false);
    });

    it('isWithinParryWindow returns true strictly within 220ms of block press', () => {
        const state = createPlayerTrickState();
        recordBlockInput(state, true, 1000);

        assert.equal(isWithinParryWindow(state, 1000), true);
        assert.equal(isWithinParryWindow(state, 1150), true);
        assert.equal(isWithinParryWindow(state, 1220), true); // 220ms boundary
        assert.equal(isWithinParryWindow(state, 1221), false); // expired window
    });

    it('isWithinParryWindow returns false if block is not held', () => {
        const state = createPlayerTrickState();
        recordBlockInput(state, true, 1000);
        recordBlockInput(state, false, 1050); // released

        assert.equal(isWithinParryWindow(state, 1100), false);
    });

    it('resolveIncomingHitWithParry reduces damage to 0 and triggers 60ms hit-stop on parry', () => {
        const state = createPlayerTrickState();
        recordBlockInput(state, true, 500);

        const res = resolveIncomingHitWithParry(state, 30, 'mudAlien', { nowMs: 600 });
        assert.equal(res.parried, true);
        assert.equal(res.damageTaken, 0);
        assert.equal(res.hitStopMs, 60);
        assert.equal(state.hitStopTimerMs, 60);
        assert.equal(state.tricksPerformed.perfectParries, 1);
    });

    it('resolveIncomingHitWithParry applies standard 80% damage reduction when parry window expires', () => {
        const state = createPlayerTrickState();
        recordBlockInput(state, true, 500);

        // 300ms later (outside 220ms window)
        const res = resolveIncomingHitWithParry(state, 30, 'mudAlien', { nowMs: 800 });
        assert.equal(res.parried, false);
        assert.equal(res.damageTaken, 6); // 30 * 0.2 = 6
        assert.equal(res.hitStopMs, 0);
    });

    it('resolveIncomingHitWithParry takes full damage when not blocking', () => {
        const state = createPlayerTrickState();
        const res = resolveIncomingHitWithParry(state, 30, 'mudAlien', { nowMs: 800 });
        assert.equal(res.parried, false);
        assert.equal(res.damageTaken, 30);
    });

    it('resolveIncomingHitWithParry reflects telekinetic impulse and stuns wizard for 2.5s', () => {
        const state = createPlayerTrickState();
        recordBlockInput(state, true, 2000);

        const wizard = { id: 'whiteGuy', type: 'whiteGuy', health: 50 };
        const incomingForce = { x: 100, y: 500, z: -200 };

        const res = resolveIncomingHitWithParry(state, 15, 'whiteGuy', {
            nowMs: 2100,
            enemyRef: wizard,
            attackForce: incomingForce,
        });

        assert.equal(res.parried, true);
        assert.equal(res.damageTaken, 0);
        assert.equal(res.wizardStunned, true);
        assert.ok(res.reflectedImpulse);
        assert.equal(res.reflectedImpulse.x, -100);
        assert.equal(res.reflectedImpulse.z, 200);
        assert.equal(res.reflectedImpulse.stunDurationMs, 2500);

        // Wizard health reduced by counter damage and stunned until 2100 + 2500
        assert.equal(wizard.stunnedUntil, 4600);
        assert.equal(wizard.health, 30); // 50 - 20 = 30
    });
});

// ─── 3. Mid-Air Stunt Tricks (Kickflip, Bellyflop Slam) ─────────────────────
describe('Pocket-Raft Mid-Air Stunt Tricks (Kickflip & Bellyflop Slam)', () => {
    it('checkAirborneTrickInput triggers kickflip on steer input while airborne', () => {
        const state = createPlayerTrickState();
        state.airborne = true;
        const craft = { position: { x: 0, y: 2.0, z: -50 }, velocity: { x: 0, y: 5, z: -10 } };

        const trick = checkAirborneTrickInput(state, craft, { a: true });
        assert.equal(trick, 'kickflip');
        assert.equal(state.activeTrick, 'kickflip');
        assert.equal(state.kickflipRotation, 0);
    });

    it('checkAirborneTrickInput triggers kickflip on attack input at moderate altitude', () => {
        const state = createPlayerTrickState();
        state.airborne = true;
        const craft = { position: { x: 0, y: 1.5, z: -50 }, velocity: { x: 0, y: 2, z: -10 } };

        const trick = checkAirborneTrickInput(state, craft, { attack: true });
        assert.equal(trick, 'kickflip');
    });

    it('checkAirborneTrickInput triggers bellyflop slam on attack at high altitude', () => {
        const state = createPlayerTrickState();
        state.airborne = true;
        // High altitude (y >= 3.0)
        const craft = { position: { x: 0, y: 4.5, z: -50 }, velocity: { x: 0, y: 1, z: -10 } };

        const trick = checkAirborneTrickInput(state, craft, { attack: true });
        assert.equal(trick, 'bellyflop-slam');
        assert.equal(state.activeTrick, 'bellyflop-slam');
    });

    it('checkAirborneTrickInput triggers bellyflop slam when falling rapidly', () => {
        const state = createPlayerTrickState();
        state.airborne = true;
        const craft = { position: { x: 0, y: 2.5, z: -50 }, velocity: { x: 0, y: -6.0, z: -10 } };

        const trick = checkAirborneTrickInput(state, craft, { attack: true });
        assert.equal(trick, 'bellyflop-slam');
    });

    it('checkAirborneTrickInput returns null when not airborne', () => {
        const state = createPlayerTrickState();
        state.airborne = false;
        const craft = { position: { x: 0, y: 0.25, z: -50 }, velocity: { x: 0, y: 0, z: -10 } };

        const trick = checkAirborneTrickInput(state, craft, { steer: true });
        assert.equal(trick, null);
    });

    it('resolveLanding completes kickflip, grants +5 coins and 2.5s hydroplaning speed boost', () => {
        const state = createPlayerTrickState();
        state.activeTrick = 'kickflip';
        const craft = { position: { x: 0, y: 0.25, z: -50 }, velocity: { x: 0, y: 0, z: -15 } };
        const landingInfo = { onWater: true, onPlank: false, impactSpeed: 10 };

        const res = resolveLanding(state, craft, landingInfo, []);
        assert.equal(res.coinsEarned, 5);
        assert.equal(res.speedBoostDuration, 2.5);
        assert.equal(state.trickCoinsEarned, 5);
        assert.equal(state.hydroplaningTimer, 2.5);
        assert.equal(state.hydroplaningMultiplier, 1.6);
        assert.equal(state.tricksPerformed.kickflip, 1);
        assert.equal(state.activeTrick, null);
    });

    it('resolveLanding executes bellyflop slam on water with 6m shockwave AoE damaging nearby enemies', () => {
        const state = createPlayerTrickState();
        state.activeTrick = 'bellyflop-slam';
        const craft = { position: { x: 0, y: 0.25, z: -100 }, velocity: { x: 0, y: 0, z: 0 } };
        const landingInfo = { onWater: true, onPlank: false, impactSpeed: 14 };

        const enemies = [
            { id: 'near_enemy', type: 'mudAlien', position: { x: 2, y: 0.5, z: -100 }, health: 50 }, // 2m away (within 6m)
            { id: 'mid_enemy', type: 'whiteGuy', position: { x: 5, y: 0.5, z: -100 }, health: 40 }, // 5m away (within 6m)
            { id: 'far_enemy', type: 'longWorm', position: { x: 10, y: 0.5, z: -100 }, health: 100 }, // 10m away (out of 6m range)
        ];

        const res = resolveLanding(state, craft, landingInfo, enemies);
        assert.equal(res.shockwaveRadius, 6.0);
        assert.equal(res.shockwaveHits.length, 2);

        // Near enemy takes significant damage
        const nearHit = res.shockwaveHits.find((h) => h.enemyId === 'near_enemy');
        assert.ok(nearHit);
        assert.ok(nearHit.damage > 20);
        assert.ok(enemies[0].health < 50);

        // Far enemy takes 0 damage
        assert.equal(enemies[2].health, 100);
        assert.equal(state.tricksPerformed.bellyflopSlam, 1);
    });
});

// ─── 4. Plank Parkour Chain & Wizard Immunity ──────────────────────────────
describe('Plank Parkour Chain & Wizard Immunity', () => {
    it('resolveLanding on elevated plank increments chain count and grants wizard immunity', () => {
        const state = createPlayerTrickState();
        const craft = { position: { x: 0, y: 1.5, z: -80 }, velocity: { x: 0, y: 0, z: -10 } };
        const landingInfo = { onWater: false, onPlank: true, impactSpeed: 5 };

        const res1 = resolveLanding(state, craft, landingInfo, [], 1000);
        assert.equal(res1.plankChainCount, 1);
        assert.equal(res1.plankMultiplier, 1);
        assert.equal(res1.wizardImmunity, true);
        assert.equal(state.wizardImmunity, true);
    });

    it('consecutive plank landings advance multipliers up to x4', () => {
        const state = createPlayerTrickState();
        const craft = { position: { x: 0, y: 1.5, z: -80 }, velocity: { x: 0, y: 0, z: -10 } };
        const landingInfo = { onWater: false, onPlank: true, impactSpeed: 5 };

        // 1st plank
        resolveLanding(state, craft, landingInfo, [], 1000);
        assert.equal(state.plankChainCount, 1);

        // 2nd plank within 3s
        const res2 = resolveLanding(state, craft, landingInfo, [], 2000);
        assert.equal(res2.plankChainCount, 2);
        assert.equal(res2.plankMultiplier, 2);

        // 3rd plank within 3s
        const res3 = resolveLanding(state, craft, landingInfo, [], 3500);
        assert.equal(res3.plankChainCount, 3);
        assert.equal(res3.plankMultiplier, 3);

        // 4th plank within 3s
        const res4 = resolveLanding(state, craft, landingInfo, [], 4500);
        assert.equal(res4.plankChainCount, 4);
        assert.equal(res4.plankMultiplier, 4);

        // 5th plank caps at x4 multiplier
        const res5 = resolveLanding(state, craft, landingInfo, [], 5500);
        assert.equal(res5.plankChainCount, 4);
        assert.equal(res5.plankMultiplier, 4);
    });

    it('landing on water resets plank parkour chain and wizard immunity', () => {
        const state = createPlayerTrickState();
        state.plankChainCount = 3;
        state.wizardImmunity = true;

        const craft = { position: { x: 0, y: 0.25, z: -120 }, velocity: { x: 0, y: 0, z: -10 } };
        const waterLanding = { onWater: true, onPlank: false, impactSpeed: 6 };

        const res = resolveLanding(state, craft, waterLanding, []);
        assert.equal(res.plankChainCount, 0);
        assert.equal(res.wizardImmunity, false);
        assert.equal(state.plankChainCount, 0);
        assert.equal(state.wizardImmunity, false);
    });
});

// ─── 5. Wizard Head Bounce ─────────────────────────────────────────────────
describe('Wizard Head Bounce (mid-air jump reset & style coins)', () => {
    it('checkWizardHeadBounce bounces player upward, resets jump, and awards +10 coins', () => {
        const state = createPlayerTrickState();
        state.airborne = true;

        const craft = {
            position: { x: 2.0, y: 2.0, z: -40 },
            velocity: { x: 0, y: -3.0, z: -5 }, // Falling toward wizard head
        };

        const enemies = [
            { id: 'whiteGuy', type: 'whiteGuy', position: { x: 2.0, y: 0.5, z: -40 }, health: 50 },
        ];

        const bounce = checkWizardHeadBounce(craft, state, enemies);
        assert.ok(bounce);
        assert.equal(bounce.enemyId, 'whiteGuy');
        assert.equal(bounce.coinsAwarded, 10);
        assert.equal(state.jumpCooldownReset, true);
        assert.equal(state.trickCoinsEarned, 10);
        assert.equal(state.tricksPerformed.wizardHeadBounce, 1);
        assert.equal(craft.velocity.y, 18.0); // Rebounded upward
    });

    it('checkWizardHeadBounce does not bounce if player is rising upward', () => {
        const state = createPlayerTrickState();
        state.airborne = true;

        const craft = {
            position: { x: 2.0, y: 2.0, z: -40 },
            velocity: { x: 0, y: 10.0, z: -5 }, // Rising rapidly
        };

        const enemies = [
            { id: 'whiteGuy', type: 'whiteGuy', position: { x: 2.0, y: 0.5, z: -40 }, health: 50 },
        ];

        const bounce = checkWizardHeadBounce(craft, state, enemies);
        assert.equal(bounce, null);
    });

    it('checkWizardHeadBounce ignores dead enemies', () => {
        const state = createPlayerTrickState();
        state.airborne = true;

        const craft = {
            position: { x: 2.0, y: 2.0, z: -40 },
            velocity: { x: 0, y: -2.0, z: -5 },
        };

        const enemies = [
            { id: 'whiteGuy', type: 'whiteGuy', position: { x: 2.0, y: 0.5, z: -40 }, health: 0 },
        ];

        const bounce = checkWizardHeadBounce(craft, state, enemies);
        assert.equal(bounce, null);
    });
});

// ─── 6. Full Simulation Step Integration ───────────────────────────────────
describe('stepPlayerTricksAndParry Continuous Simulation', () => {
    it('steps airborne state and advances kickflip 360 rotation', () => {
        const state = createPlayerTrickState();
        const craft = { position: { x: 0, y: 2.5, z: -50 }, velocity: { x: 0, y: 5, z: -10 } };
        const inputs = { a: true, block: false };

        // Step 1: Detects air and begins kickflip
        stepPlayerTricksAndParry(state, craft, inputs, 0.1, 100);
        assert.equal(state.airborne, true);
        assert.equal(state.activeTrick, 'kickflip');
        assert.ok(state.kickflipRotation > 0);

        // Step 2: Advances rotation
        const prevRot = state.kickflipRotation;
        stepPlayerTricksAndParry(state, craft, inputs, 0.2, 300);
        assert.ok(state.kickflipRotation > prevRot);
    });

    it('hydroplaning timer decrements and resets multiplier upon reaching 0', () => {
        const state = createPlayerTrickState();
        state.hydroplaningTimer = 0.5;
        state.hydroplaningMultiplier = 1.6;

        const craft = { position: { x: 0, y: 0.25, z: -50 }, velocity: { x: 0, y: 0, z: -15 } };
        stepPlayerTricksAndParry(state, craft, {}, 0.3, 100);
        assert.ok(Math.abs(state.hydroplaningTimer - 0.2) < 1e-4);
        assert.equal(state.hydroplaningMultiplier, 1.6);

        stepPlayerTricksAndParry(state, craft, {}, 0.3, 400);
        assert.equal(state.hydroplaningTimer, 0);
        assert.equal(state.hydroplaningMultiplier, 1.0);
    });

    it('plank chain expires after 3 seconds of inactivity', () => {
        const state = createPlayerTrickState();
        state.plankChainCount = 2;
        state.lastPlankLandingTime = 1000;
        state.wizardImmunity = true;

        const craft = { position: { x: 0, y: 1.5, z: -50 }, velocity: { x: 0, y: 0, z: 0 } };

        // At 3500ms (gap 2500ms <= 3000ms), still active
        stepPlayerTricksAndParry(state, craft, {}, 0.1, 3500);
        assert.equal(state.plankChainCount, 2);

        // At 4500ms (gap 3500ms > 3000ms), expires
        stepPlayerTricksAndParry(state, craft, {}, 0.1, 4500);
        assert.equal(state.plankChainCount, 0);
        assert.equal(state.wizardImmunity, false);
    });
});

// ─── 7. Three.js Trick VFX System Lifecycle & Visual Helpers ───────────────
describe('Trick VFX & 3D Animation Helper Lifecycle', () => {
    it('initializes TrickVFXSystem, pools meshes, and adds rootGroup to scene', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createTrickVFXSystem(THREE, scene);

        assert.ok(scene.children.includes(vfx.rootGroup));
        assert.equal(vfx._pools.shockwavePool.length, 4);
        assert.equal(vfx._pools.bounceBurstPool.length, 6);
        assert.equal(vfx._pools.parryFlashPool.length, 4);
        assert.equal(vfx._pools.calloutPool.length, 8);
    });

    it('triggerBellyflopShockwave expands 6m ring on river surface and recycles on expiry', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createTrickVFXSystem(THREE, scene);

        const slot = vfx.triggerBellyflopShockwave({ x: 0, y: 0.25, z: -100 }, 6.0);
        assert.ok(slot);
        assert.equal(slot.active, true);
        assert.equal(slot.mesh.visible, true);

        // Advance 0.3s
        vfx.update(0.3);
        assert.ok(slot.mesh.scale.x > 1.0);

        // Advance past duration (0.7s)
        vfx.update(0.5);
        assert.equal(slot.active, false);
        assert.equal(slot.mesh.visible, false);
    });

    it('triggerHeadBounceBurst activates halo burst and recycles', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createTrickVFXSystem(THREE, scene);

        const slot = vfx.triggerHeadBounceBurst({ x: 1, y: 2, z: -50 });
        assert.ok(slot);
        assert.equal(slot.active, true);

        vfx.update(0.6);
        assert.equal(slot.active, false);
    });

    it('triggerParryFlash creates flash mesh with distinctive wizard cyan color', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createTrickVFXSystem(THREE, scene);

        const slot = vfx.triggerParryFlash({ x: 0, y: 1, z: -20 }, true);
        assert.ok(slot);
        assert.equal(slot.mesh.material.color.hex, 0x7df9ff);

        vfx.update(0.3);
        assert.equal(slot.active, false);
    });

    it('triggerTrickCallout activates 3D floating billboard callouts', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createTrickVFXSystem(THREE, scene);

        const slot = vfx.triggerTrickCallout('kickflip', { x: 0, y: 1, z: -30 });
        assert.ok(slot);
        assert.ok(slot.text.includes('KICKFLIP'));
        assert.equal(slot.mesh.visible, true);

        const initialY = slot.mesh.position.y;
        vfx.update(0.4);
        assert.ok(slot.mesh.position.y > initialY, 'Callout badge floats upward');

        vfx.update(1.0);
        assert.equal(slot.active, false);
    });

    it('applyKickflipRotation sets raft mesh roll angle in radians', () => {
        const mockRaft = { rotation: { z: 0 } };
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createTrickVFXSystem(THREE, scene);

        vfx.applyKickflipRotation(mockRaft, 180);
        assert.ok(Math.abs(mockRaft.rotation.z - Math.PI) < 1e-4);

        vfx.applyKickflipRotation(mockRaft, 360);
        assert.ok(Math.abs(mockRaft.rotation.z - Math.PI * 2) < 1e-4);
    });

    it('dispose cleanly removes rootGroup and disposes resources', () => {
        const THREE = createMockThree();
        const scene = createMockScene();
        const vfx = createTrickVFXSystem(THREE, scene);

        assert.equal(scene.children.length, 1);
        vfx.dispose();
        assert.equal(scene.children.length, 0);
    });
});
