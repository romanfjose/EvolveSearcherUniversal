import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    CAMERA_FEEL_LIMITS,
    MODE_CAMERA_PROFILES,
    VALID_GAME_MODES,
    getModeCameraProfile,
    computeKickflipAndLandingCameraImpulse,
} from '../shared/camera-modes-and-kickflip-feel.js';

describe('VG Helmet 01 — Multi-Mode Camera Profiles & Kickflip Landing Feel Bridge', () => {
    describe('MODE_CAMERA_PROFILES requirements', () => {
        const requiredModes = ['campaign', 'daily', 'endless', 'boss_rush', 'splitscreen'];

        it('exports profiles for all 5 official game modes', () => {
            assert.deepEqual(VALID_GAME_MODES.slice().sort(), requiredModes.slice().sort());
            for (const mode of requiredModes) {
                assert.ok(MODE_CAMERA_PROFILES[mode], `Profile missing for mode: ${mode}`);
            }
        });

        it('enforces low over-the-shoulder pitch (0.24..0.28 rad) across all modes', () => {
            for (const mode of requiredModes) {
                const profile = MODE_CAMERA_PROFILES[mode];
                assert.ok(
                    profile.pitch >= 0.24 && profile.pitch <= 0.28,
                    `Mode ${mode} pitch ${profile.pitch} is outside [0.24, 0.28] rad`
                );
            }
        });

        it('enforces base distance (10.0..11.5m) across all modes', () => {
            for (const mode of requiredModes) {
                const profile = MODE_CAMERA_PROFILES[mode];
                assert.ok(
                    profile.distance >= 10.0 && profile.distance <= 11.5,
                    `Mode ${mode} distance ${profile.distance} is outside [10.0, 11.5]m`
                );
            }
        });

        it('enforces look-ahead downriver (14..18m) across all modes', () => {
            for (const mode of requiredModes) {
                const profile = MODE_CAMERA_PROFILES[mode];
                assert.ok(
                    profile.lookAhead >= 14.0 && profile.lookAhead <= 18.0,
                    `Mode ${mode} lookAhead ${profile.lookAhead} is outside [14.0, 18.0]m`
                );
            }
        });

        it('profile objects and sub-objects are deeply frozen', () => {
            assert.ok(Object.isFrozen(MODE_CAMERA_PROFILES));
            for (const mode of requiredModes) {
                assert.ok(Object.isFrozen(MODE_CAMERA_PROFILES[mode]));
            }
        });

        it('getModeCameraProfile retrieves correct mode and falls back safely to campaign', () => {
            assert.equal(getModeCameraProfile('daily').id, 'daily');
            assert.equal(getModeCameraProfile('boss_rush').id, 'boss_rush');
            assert.equal(getModeCameraProfile('SPLITSCREEN').id, 'splitscreen');
            assert.equal(getModeCameraProfile('endless ').id, 'endless');

            // Fallback cases
            assert.equal(getModeCameraProfile(null).id, 'campaign');
            assert.equal(getModeCameraProfile(undefined).id, 'campaign');
            assert.equal(getModeCameraProfile('unknown_mode').id, 'campaign');
            assert.equal(getModeCameraProfile(12345).id, 'campaign');
        });
    });

    describe('computeKickflipAndLandingCameraImpulse requirements', () => {
        it('returns finite neutral impulse for empty arguments or defaults', () => {
            const impulse1 = computeKickflipAndLandingCameraImpulse();
            assert.deepEqual(impulse1, {
                rollOffset: 0,
                pitchImpulse: 0,
                fovPulse: 0,
                shakeBoost: 0,
            });

            const impulse2 = computeKickflipAndLandingCameraImpulse({});
            assert.deepEqual(impulse2, {
                rollOffset: 0,
                pitchImpulse: 0,
                fovPulse: 0,
                shakeBoost: 0,
            });
        });

        it('produces dynamic Dutch roll offset during mid-air kickflip rotation without NaN', () => {
            // Quarter rotation (0.25 -> 90 deg)
            const quarter = computeKickflipAndLandingCameraImpulse({ airborne: true, kickflipProgress: 0.25 });
            assert.ok(quarter.rollOffset > 0, 'Quarter kickflip rolls right');
            assert.ok(quarter.pitchImpulse >= 0, 'Airborne pitch float is non-negative');
            assert.ok(quarter.fovPulse > 0, 'Kickflip expands FOV slightly');

            // Three-quarter rotation (0.75 -> 270 deg)
            const threeQuarter = computeKickflipAndLandingCameraImpulse({ airborne: true, kickflipProgress: 0.75 });
            assert.ok(threeQuarter.rollOffset < 0, 'Three-quarter kickflip rolls left');

            // Supports degree input (e.g. 180 degrees)
            const halfDeg = computeKickflipAndLandingCameraImpulse({ airborne: true, kickflipProgress: 180 });
            assert.ok(Number.isFinite(halfDeg.rollOffset));
            assert.ok(Math.abs(halfDeg.rollOffset) < 0.01, 'Halfway through roll sine returns close to zero');

            // Stays strictly within CAMERA_FEEL_LIMITS.maxRollOffset
            assert.ok(Math.abs(quarter.rollOffset) <= CAMERA_FEEL_LIMITS.maxRollOffset);
            assert.ok(Math.abs(threeQuarter.rollOffset) <= CAMERA_FEEL_LIMITS.maxRollOffset);
        });

        it('produces physical landing compression and shake boost on touchdown', () => {
            const softTouch = computeKickflipAndLandingCameraImpulse({ airborne: false, landingImpact: 0.3 });
            assert.ok(softTouch.pitchImpulse < 0, 'Landing dips pitch downward');
            assert.ok(softTouch.fovPulse > 0, 'Landing produces cushioning FOV pulse');
            assert.ok(softTouch.shakeBoost > 0, 'Landing provides camera shake');

            const hardTouch = computeKickflipAndLandingCameraImpulse({ airborne: false, landingImpact: 1.0 });
            assert.ok(hardTouch.pitchImpulse <= softTouch.pitchImpulse, 'Harder landing creates stronger pitch compression');
            assert.ok(hardTouch.shakeBoost > softTouch.shakeBoost, 'Harder landing gives higher shake');

            // Severe impact remains bounded and never yanks horizon out of view
            const extremeTouch = computeKickflipAndLandingCameraImpulse({ airborne: false, landingImpact: 50.0 });
            assert.ok(extremeTouch.pitchImpulse >= CAMERA_FEEL_LIMITS.minPitchImpulse, 'Pitch does not exceed max downward compression');
            assert.ok(extremeTouch.shakeBoost <= CAMERA_FEEL_LIMITS.maxShakeBoost, 'Shake remains within limits');
            assert.ok(extremeTouch.fovPulse <= CAMERA_FEEL_LIMITS.maxFovPulse, 'FOV pulse remains within limits');
        });

        it('handles headBounce ceiling obstacle collision with sharp jolt and roll', () => {
            const headHit = computeKickflipAndLandingCameraImpulse({
                airborne: true,
                kickflipProgress: 0.5,
                headBounce: true,
            });

            assert.ok(headHit.pitchImpulse < 0, 'Head bounce jolts pitch downward');
            assert.ok(headHit.shakeBoost >= 0.32, 'Head bounce triggers substantial camera shake');
            assert.ok(headHit.fovPulse >= 3.0, 'Head bounce creates jarring FOV pulse');
            assert.ok(Number.isFinite(headHit.rollOffset));
        });

        it('handles corrupt, negative, NaN and extreme inputs with 100% numerical safety', () => {
            const garbageInputs = [
                { airborne: 'yes', kickflipProgress: NaN, landingImpact: Infinity, headBounce: null },
                { airborne: null, kickflipProgress: -999, landingImpact: -50, headBounce: undefined },
                { airborne: false, kickflipProgress: 'halfway', landingImpact: 'huge', headBounce: 1 },
                null,
                undefined,
                1234,
                'invalid',
            ];

            for (const input of garbageInputs) {
                const res = computeKickflipAndLandingCameraImpulse(input);
                assert.ok(Number.isFinite(res.rollOffset), `rollOffset was not finite: ${res.rollOffset}`);
                assert.ok(Number.isFinite(res.pitchImpulse), `pitchImpulse was not finite: ${res.pitchImpulse}`);
                assert.ok(Number.isFinite(res.fovPulse), `fovPulse was not finite: ${res.fovPulse}`);
                assert.ok(Number.isFinite(res.shakeBoost), `shakeBoost was not finite: ${res.shakeBoost}`);

                // Horizon preservation check:
                assert.ok(Math.abs(res.rollOffset) <= CAMERA_FEEL_LIMITS.maxRollOffset);
                assert.ok(res.pitchImpulse >= CAMERA_FEEL_LIMITS.minPitchImpulse && res.pitchImpulse <= CAMERA_FEEL_LIMITS.maxPitchImpulse);
                assert.ok(res.fovPulse <= CAMERA_FEEL_LIMITS.maxFovPulse);
                assert.ok(res.shakeBoost <= CAMERA_FEEL_LIMITS.maxShakeBoost);
            }
        });
    });
});
