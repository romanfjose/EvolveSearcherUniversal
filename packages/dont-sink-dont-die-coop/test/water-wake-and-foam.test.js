import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeTwinOarBladeWake,
    computeOarAttackWaterSlap,
    getRaftOrientationVectors,
    transformLocalToWorld,
    OAR_WAKE_CONFIG,
    clamp,
    lerp,
    normalize2D,
} from '../shared/water-wake-and-foam.js';

describe('Videogame Helmet 06 — Water Wake, Foam Bursts & Oar Blade Physical Realism', () => {
    describe('Pure Vector & Math Helpers', () => {
        it('clamps values cleanly with finite invariants', () => {
            assert.equal(clamp(5, 0, 10), 5);
            assert.equal(clamp(-1, 0, 10), 0);
            assert.equal(clamp(15, 0, 10), 10);
            assert.equal(clamp(NaN, 0, 10), 0);
        });

        it('linearly interpolates within range', () => {
            assert.equal(lerp(10, 20, 0), 10);
            assert.equal(lerp(10, 20, 0.5), 15);
            assert.equal(lerp(10, 20, 1.0), 20);
        });

        it('normalizes 2D vectors and handles zero-length gracefully', () => {
            const v = normalize2D(3, 4);
            assert.equal(v.x, 0.6);
            assert.equal(v.z, 0.8);

            const zero = normalize2D(0, 0);
            assert.equal(zero.x, 0);
            assert.equal(zero.z, 0);
        });

        it('computes raft orientation vectors matching downriver -Z forward heading', () => {
            // Heading yaw = 0: forward is (0, -1), right is (1, 0)
            const o0 = getRaftOrientationVectors(0);
            assert.equal(Math.round(o0.forward.x * 100), 0);
            assert.equal(Math.round(o0.forward.z * 100), -100);
            assert.equal(Math.round(o0.right.x * 100), 100);
            assert.equal(Math.round(o0.right.z * 100), 0);

            // Heading yaw = PI/2 (turned 90 deg left): forward is (-1, 0), right is (0, -1)
            const o90 = getRaftOrientationVectors(Math.PI / 2);
            assert.equal(Math.round(o90.forward.x * 100), -100);
            assert.equal(Math.abs(Math.round(o90.forward.z * 100)), 0);
            assert.equal(Math.abs(Math.round(o90.right.x * 100)), 0);
            assert.equal(Math.round(o90.right.z * 100), -100);
        });

        it('transforms local points to world coordinates given raft position and yaw', () => {
            const raftPos = { x: 10, y: 0.25, z: -50 };
            const localPoint = { x: 1.35, y: 0, z: 0 }; // Right side offset

            // Yaw = 0
            const worldPos0 = transformLocalToWorld(localPoint, raftPos, 0);
            assert.equal(worldPos0.x, 11.35);
            assert.equal(worldPos0.y, 0.25);
            assert.equal(worldPos0.z, -50);

            // Yaw = PI/2 (turned left)
            const worldPos90 = transformLocalToWorld(localPoint, raftPos, Math.PI / 2);
            assert.equal(worldPos90.x, 10);
            assert.equal(worldPos90.y, 0.25);
            assert.equal(worldPos90.z, -51.35);
        });
    });

    describe('computeTwinOarBladeWake: Rhythmic Twin-Oar Blade Positions & Wake Hydrodynamics', () => {
        it('computes exact lateral positions for port (-1.35m) and starboard (+1.35m) blades', () => {
            const raftPos = { x: 0, y: 0.25, z: -100 };
            const wake = computeTwinOarBladeWake({
                raftPos,
                raftYaw: 0,
                strokeElapsed: 0,
            });

            assert.ok(wake);
            assert.equal(wake.portOffset, -1.35);
            assert.equal(wake.starboardOffset, 1.35);

            // Port is to the left (-X at yaw=0)
            assert.equal(wake.leftPaddle.x, -1.35);
            // Starboard is to the right (+X at yaw=0)
            assert.equal(wake.rightPaddle.x, 1.35);
            assert.equal(wake.leftPaddle.z, raftPos.z + wake.localZ);
            assert.equal(wake.rightPaddle.z, raftPos.z + wake.localZ);
        });

        it('transforms twin oar blade world positions when raft has non-zero yaw', () => {
            const raftPos = { x: 20, y: 0.25, z: -200 };
            const yaw = Math.PI / 2; // Raft rotated 90 deg
            const wake = computeTwinOarBladeWake({
                raftPos,
                raftYaw: yaw,
                strokeElapsed: 0.35,
            });

            // At yaw = PI/2, local +X points to -Z, local -X points to +Z
            // Starboard blade (+X) should be displaced along -Z
            assert.ok(wake.rightPaddle.z < raftPos.z);
            // Port blade (-X) should be displaced along +Z
            assert.ok(wake.leftPaddle.z > raftPos.z);
        });

        it('detects Catch phase and immerses blade downward into the water column', () => {
            const wake = computeTwinOarBladeWake({
                raftPos: { x: 0, y: 0.25, z: 0 },
                strokeElapsed: 0.02, // Within Catch phase (< pullStart 0.05)
                pullStart: 0.05,
                pullEnd: 0.62,
            });

            assert.equal(wake.inPowerPull, false);
            assert.ok(wake.localDipY < 0, 'Blade must dip into water during catch');
            assert.ok(wake.bladeImmersion > 0 && wake.bladeImmersion < 1.0);
            assert.equal(wake.pairedFoamBursts, null, 'No full power burst during entry catch');
        });

        it('generates paired left/right churning foam bursts and vortex rings during Power Pull phase', () => {
            const wake = computeTwinOarBladeWake({
                raftPos: { x: 5, y: 0.25, z: -60 },
                raftYaw: 0,
                strokeElapsed: 0.30, // Well within Power Pull (0.05 to 0.62)
                pullStart: 0.05,
                pullEnd: 0.62,
                raftSpeed: 8.5,
            });

            assert.equal(wake.inPowerPull, true);
            assert.equal(wake.bladeImmersion, 1.0, 'Blade is fully immersed during power pull');
            assert.ok(wake.pairedFoamBursts, 'Paired foam bursts must be active');
            assert.equal(wake.pairedFoamBursts.active, true);
            assert.ok(wake.pairedFoamBursts.intensity >= 0.7);

            // Left (port) foam burst
            const leftFoam = wake.pairedFoamBursts.left;
            assert.equal(leftFoam.lateralSide, 'port');
            assert.ok(leftFoam.foamRadius > 0.4);
            assert.ok(leftFoam.churnNormal.x < 0, 'Port churn normal pushes outward to left');

            // Right (starboard) foam burst
            const rightFoam = wake.pairedFoamBursts.right;
            assert.equal(rightFoam.lateralSide, 'starboard');
            assert.ok(rightFoam.foamRadius > 0.4);
            assert.ok(rightFoam.churnNormal.x > 0, 'Starboard churn normal pushes outward to right');

            // Vortex rings
            assert.ok(Array.isArray(wake.vortexRings));
            assert.equal(wake.vortexRings.length, 2);

            const [portVortex, stbdVortex] = wake.vortexRings;
            assert.equal(portVortex.side, 'port');
            assert.equal(portVortex.swirlDirection, 1, 'Counter-clockwise vortex for port');
            assert.equal(stbdVortex.side, 'starboard');
            assert.equal(stbdVortex.swirlDirection, -1, 'Clockwise vortex for starboard');
            assert.ok(portVortex.strength > 0.7);
        });

        it('transitions to Recovery phase when pullEnd is exceeded, lifting blades', () => {
            const wake = computeTwinOarBladeWake({
                raftPos: { x: 0, y: 0.25, z: 0 },
                strokeElapsed: 0.75, // Past pullEnd 0.62
                pullStart: 0.05,
                pullEnd: 0.62,
            });

            assert.equal(wake.inPowerPull, false);
            assert.equal(wake.bladeImmersion, 0.0, 'Blade lifted above water in recovery');
            assert.ok(wake.localDipY > 0, 'Blade feathered upward above baseline');
            assert.equal(wake.pairedFoamBursts, null);
            assert.equal(wake.vortexRings, null);
        });

        it('generates an upward turbulent back-splash burst when stroke is choked', () => {
            const wake = computeTwinOarBladeWake({
                raftPos: { x: 12, y: 0.25, z: -150 },
                raftYaw: 0,
                strokeElapsed: 0.20,
                choked: true, // Stroke cancelled prematurely by fast [W] tap
            });

            assert.equal(wake.choked, true);
            assert.equal(wake.inPowerPull, false);
            assert.equal(wake.pairedFoamBursts, null);

            assert.ok(wake.backSplash, 'Back-splash burst descriptor must be generated');
            assert.equal(wake.backSplash.active, true);
            assert.equal(wake.backSplash.reason, 'fast_press_cancel');
            assert.ok(wake.backSplash.particleCount >= 10);
            assert.ok(wake.backSplash.velocity.y > 3.0, 'Upward violent back-splash velocity');
            assert.ok(wake.backSplash.spraySpreadRadius > 1.0);
            assert.ok(wake.backSplash.leftOrigin);
            assert.ok(wake.backSplash.rightOrigin);
        });

        it('handles boundary and corrupted inputs without throwing or returning NaNs', () => {
            const badInputs = [
                {},
                { raftPos: null, raftYaw: NaN, strokeElapsed: -5 },
                { strokeElapsed: Infinity, pullStart: NaN, pullEnd: undefined },
                { raftPos: { x: undefined, y: null, z: NaN }, duration: -1 },
            ];

            for (const input of badInputs) {
                assert.doesNotThrow(() => {
                    const res = computeTwinOarBladeWake(input);
                    assert.ok(Number.isFinite(res.leftPaddle.x));
                    assert.ok(Number.isFinite(res.leftPaddle.y));
                    assert.ok(Number.isFinite(res.leftPaddle.z));
                    assert.ok(Number.isFinite(res.rightPaddle.x));
                    assert.ok(Number.isFinite(res.rightPaddle.y));
                    assert.ok(Number.isFinite(res.rightPaddle.z));
                });
            }
        });
    });

    describe('computeOarAttackWaterSlap: Directional Lateral Oar Attack Water Slap', () => {
        it('computes right-side water slap arc and directional spray fan', () => {
            const slap = computeOarAttackWaterSlap({
                raftPos: { x: 0, y: 0.25, z: -50 },
                raftYaw: 0,
                swingSide: 'right',
                swingProgress: 0.5, // Impact apex
            });

            assert.ok(slap);
            assert.equal(slap.side, 'right');
            assert.equal(slap.touchesWater, true);
            assert.ok(slap.slapIntensity > 0.9, 'Peak slap intensity at progress 0.5');

            // Impact point should be on the starboard (+X) side
            assert.ok(slap.impactPoint.x > 0);
            assert.ok(slap.sprayImpulseVector.x > 0, 'Impulse vector points outward to right (+X)');

            // Spray particles
            assert.ok(slap.sprayParticleCount > 0);
            assert.equal(slap.sprayParticles.length, OAR_WAKE_CONFIG.SWING_SPRAY_SECTORS);

            // Verify upward vertical velocity on spray particles
            for (const p of slap.sprayParticles) {
                assert.ok(p.velocity.y > 1.5);
                assert.ok(p.size > 0.1);
            }
        });

        it('computes left-side water slap arc with opposite lateral impulse vector', () => {
            const slap = computeOarAttackWaterSlap({
                raftPos: { x: 0, y: 0.25, z: -50 },
                raftYaw: 0,
                swingSide: 'left',
                swingProgress: 0.5,
            });

            assert.equal(slap.side, 'left');
            assert.equal(slap.touchesWater, true);

            // Impact point on the port (-X) side
            assert.ok(slap.impactPoint.x < 0);
            assert.ok(slap.sprayImpulseVector.x < 0, 'Impulse vector points outward to left (-X)');
        });

        it('does not touch water at start (progress 0) or finish (progress 1.0) of swing', () => {
            const startSlap = computeOarAttackWaterSlap({
                swingSide: 'right',
                swingProgress: 0.05,
            });
            assert.equal(startSlap.touchesWater, false);
            assert.equal(startSlap.sprayParticleCount, 0);

            const endSlap = computeOarAttackWaterSlap({
                swingSide: 'right',
                swingProgress: 0.98,
            });
            assert.equal(endSlap.touchesWater, false);
            assert.equal(endSlap.sprayParticleCount, 0);
        });

        it('rotates attack slap spray coordinates with non-zero yaw', () => {
            const slap0 = computeOarAttackWaterSlap({
                raftPos: { x: 0, y: 0.25, z: 0 },
                raftYaw: 0,
                swingSide: 'right',
                swingProgress: 0.5,
            });

            const slap90 = computeOarAttackWaterSlap({
                raftPos: { x: 0, y: 0.25, z: 0 },
                raftYaw: Math.PI / 2,
                swingSide: 'right',
                swingProgress: 0.5,
            });

            // At yaw = 0, right spray is +X. At yaw = 90 deg, right spray is -Z.
            assert.ok(slap0.sprayImpulseVector.x > 0.5);
            assert.ok(slap90.sprayImpulseVector.z < -0.5);
        });

        it('handles null, undefined and corrupted input parameters gracefully', () => {
            assert.doesNotThrow(() => {
                const slap = computeOarAttackWaterSlap(null);
                assert.ok(slap);
                assert.ok(Number.isFinite(slap.impactPoint.x));
                assert.ok(Number.isFinite(slap.impactPoint.y));
                assert.ok(Number.isFinite(slap.impactPoint.z));
            });

            assert.doesNotThrow(() => {
                const slap = computeOarAttackWaterSlap({
                    raftPos: { x: NaN, y: Infinity, z: 'invalid' },
                    raftYaw: 'wrong',
                    swingSide: 1234,
                    swingProgress: -10,
                });
                assert.ok(slap);
                assert.ok(Number.isFinite(slap.impactPoint.x));
            });
        });
    });
});
