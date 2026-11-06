import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    DREAM_ENTITIES,
    DEATH_ANIMATION_TYPES,
    ENEMY_COMBAT_CONFIG,
    createEnemyCombatState,
    applyEnemyHitReaction,
    stepEnemyCombatState,
    startEnemyDeathAnimation,
    stepEnemyDeathAnimation,
    applyEnemyHazardInteraction,
} from '../shared/enemies.js';

describe('Enemy Combat Reactions & Rig Flinch (Helmet 06)', () => {
    describe('Combat State Initialization', () => {
        it('creates initial combat state with zero flinch/recoil', () => {
            const state = createEnemyCombatState(DREAM_ENTITIES.WHITE_GUY);
            assert.equal(state.type, 'whiteGuy');
            assert.equal(state.recoilTimer, 0);
            assert.equal(state.isParried, false);
            assert.equal(state.rigOffsets.hatTiltX, 0);
            assert.equal(state.rigOffsets.torsoTiltX, 0);
            assert.equal(state.rigOffsets.armFlail, 0);
        });
    });

    describe('River Mage (White Guy in Wizard Hat) Rig Recoil', () => {
        it('drives wizard hat and torso whip-back on normal hit', () => {
            const state = createEnemyCombatState(DREAM_ENTITIES.WHITE_GUY);
            applyEnemyHitReaction(state, {
                damage: 10,
                hitDirection: { x: 0, z: -1 },
                isHeavy: false,
            });

            assert.equal(state.recoilDuration, ENEMY_COMBAT_CONFIG.RECOIL.NORMAL_HIT_DURATION);
            assert.ok(state.rigOffsets.hatTiltX > 0, 'Hat tilts backward opposite to hit direction');
            assert.ok(state.rigOffsets.torsoTiltX > 0, 'Torso tilts backward');
            assert.ok(state.rigOffsets.armFlail > 0, 'Arms flail upward');
            assert.equal(state.rigOffsets.dizzySpin, 0);
        });

        it('triggers dazed spin and hat disarray on perfect parry', () => {
            const state = createEnemyCombatState(DREAM_ENTITIES.WHITE_GUY);
            applyEnemyHitReaction(state, { isParry: true });

            assert.equal(state.isParried, true);
            assert.equal(state.recoilDuration, ENEMY_COMBAT_CONFIG.RECOIL.PARRY_STAGGER_DURATION);

            // Step slightly into the stagger
            stepEnemyCombatState(state, 0.2);
            assert.ok(state.rigOffsets.dizzySpin > 0, 'Spins while parried');
            assert.notEqual(state.rigOffsets.hatTiltZ, 0, 'Hat wobbles sideways');
        });

        it('smoothly recovers to neutral once recoil timer elapses', () => {
            const state = createEnemyCombatState(DREAM_ENTITIES.WHITE_GUY);
            applyEnemyHitReaction(state, { damage: 15 });

            stepEnemyCombatState(state, ENEMY_COMBAT_CONFIG.RECOIL.NORMAL_HIT_DURATION + 0.1);
            assert.equal(state.recoilTimer, 0);
            assert.equal(state.rigOffsets.hatTiltX, 0);
            assert.equal(state.rigOffsets.torsoTiltX, 0);
            assert.equal(state.rigOffsets.armFlail, 0);
        });
    });

    describe('3-Legged Headless Mud Alien Rig Recoil', () => {
        it('squashes body and unbalances tripod legs on melee hit', () => {
            const state = createEnemyCombatState(DREAM_ENTITIES.MUD_ALIEN);
            applyEnemyHitReaction(state, {
                damage: 20,
                hitDirection: { x: 1, z: 0 },
            });

            assert.ok(state.rigOffsets.bodySquash > 0, 'Jelly body squashes down');
            assert.notEqual(state.rigOffsets.bodyTiltZ, 0, 'Body tilts sideways away from hit');
            assert.ok(state.rigOffsets.legStumble.some((v) => v !== 0), 'Legs unbalance');
        });

        it('induces multi-legged stumble wobble during parry stagger', () => {
            const state = createEnemyCombatState(DREAM_ENTITIES.MUD_ALIEN);
            applyEnemyHitReaction(state, { isParry: true });

            stepEnemyCombatState(state, 0.3);
            const [l0, l1, l2] = state.rigOffsets.legStumble;
            assert.ok(l0 !== 0 || l1 !== 0 || l2 !== 0, 'Tripod legs wobble out of phase');
        });
    });

    describe('Nokia-Vector Long Worm Rig Recoil', () => {
        it('compresses head segment into accordion shockwave on hit', () => {
            const state = createEnemyCombatState(DREAM_ENTITIES.LONG_WORM);
            applyEnemyHitReaction(state, { damage: 30, isHeavy: true });

            assert.ok(state.rigOffsets.headRecoilZ > 0, 'Head knocked back');
            assert.ok(state.rigOffsets.accordionFactor > 0, 'Body segments compress');
        });
    });
});

describe('Physical Death Trajectories (No Dead Vacuums)', () => {
    describe('Comedic Skyward Spin Launch', () => {
        it('launches enemy into spinning parabolic arc and triggers water splash', () => {
            const startPos = { x: 2.0, y: 0.5, z: -100 };
            const death = startEnemyDeathAnimation(DREAM_ENTITIES.WHITE_GUY, startPos, {
                killerVelocity: { x: 4.0, z: -8.0 },
            });

            assert.equal(death.animationType, DEATH_ANIMATION_TYPES.SKYWARD_SPIN);
            assert.ok(death.velocity.y > 10.0, 'Positive upward launch velocity');
            assert.equal(death.hasSplashed, false);
            assert.equal(death.isDespawned, false);

            // Step 0.5s in: enemy should be high in the air
            stepEnemyDeathAnimation(death, 0.5);
            assert.ok(death.position.y > 3.0, 'Airborne at arc apex');
            assert.ok(death.rotation.x > 0 || death.rotation.y > 0, 'Tumbling in 3D');

            // Step forward until descending past water surface
            stepEnemyDeathAnimation(death, 0.6);
            stepEnemyDeathAnimation(death, 0.4);

            assert.equal(death.hasSplashed, true, 'Splashes down into river');
            assert.equal(death.position.y, ENEMY_COMBAT_CONFIG.DEATH.WATER_SURFACE_Y);

            // Step until fully elapsed
            stepEnemyDeathAnimation(death, 1.0);
            assert.equal(death.isDespawned, true);
            assert.equal(death.scale, 0);
        });
    });

    describe('Whirlpool Vortex Spiral Sink', () => {
        it('drags defeated enemy downward into spinning vortex and shrinks', () => {
            const startPos = { x: -5.0, y: 0.5, z: -150 };
            const death = startEnemyDeathAnimation(DREAM_ENTITIES.MUD_ALIEN, startPos, {
                inWhirlpool: true,
            });

            assert.equal(death.animationType, DEATH_ANIMATION_TYPES.WHIRLPOOL_SINK);

            // Step downward
            stepEnemyDeathAnimation(death, 0.6);
            assert.ok(death.position.y < startPos.y, 'Sinks below river surface');
            assert.ok(death.rotation.y > 0, 'Spins with vortex current');
            assert.ok(death.scale < 1.0, 'Shrinks toward singularity');

            // Complete lifetime
            stepEnemyDeathAnimation(death, 1.5);
            assert.equal(death.isDespawned, true);
        });
    });
});

describe('Emergent Hazard Interactivity (Protect Happy Accidents)', () => {
    it('boosts enemy airborne when propelled into a stunt jump ramp', () => {
        const enemy = {
            position: { x: 2.0, y: 0.5, z: -50 },
            velocity: { x: 0, y: 0, z: -12.0 },
        };
        const ramp = {
            type: 'ramp',
            x: 2.0,
            z: -50,
            width: 8.0,
            length: 10.0,
            launchLift: 16.0,
            boostFactor: 1.4,
        };

        const res = applyEnemyHazardInteraction(enemy, ramp);
        assert.equal(res.interacted, true);
        assert.equal(res.type, 'ramp_launch');
        assert.equal(res.boostApplied, true);
        assert.equal(enemy.velocity.y, 16.0);
        assert.ok(enemy.velocity.z < -12.0, 'Boosted forward along ramp');
    });

    it('sucks enemy into whirlpool vortex with radial pull and tangential swirl', () => {
        const enemy = {
            position: { x: 5.0, y: 0.5, z: -80 },
            velocity: { x: 0, y: 0, z: 0 },
        };
        const whirlpool = {
            type: 'whirlpool',
            x: 0,
            z: -80,
            radius: 10.0,
            pullStrength: 20.0,
            swirlSpeed: 25.0,
        };

        const res = applyEnemyHazardInteraction(enemy, whirlpool, 0.1);
        assert.equal(res.interacted, true);
        assert.equal(res.type, 'whirlpool_pull');
        assert.ok(enemy.velocity.x < 0, 'Radial pull toward whirlpool center at x=0');
        assert.notEqual(enemy.velocity.z, 0, 'Tangential swirl angular velocity applied');
    });

    it('ignores hazards outside interaction bounds', () => {
        const enemy = {
            position: { x: 30.0, y: 0.5, z: -200 },
            velocity: { x: 0, y: 0, z: 0 },
        };
        const ramp = {
            type: 'ramp',
            x: 0,
            z: -50,
            width: 8.0,
            length: 10.0,
        };

        const res = applyEnemyHazardInteraction(enemy, ramp);
        assert.equal(res.interacted, false);
        assert.equal(res.boostApplied, false);
    });
});
