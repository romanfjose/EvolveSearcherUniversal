/**
 * Sovereign QA Breaker: Co-Op Camera Zoom, Aspect Ratios & River Bank Framing
 * (`test/qa-wave5c-camera-aspect-ratios.test.js`)
 *
 * Enforces Helmet 03 ("Where's the Bathroom?" QA Breaker) standards:
 * - Never trust mock theatre; stress test against raw mathematical realities and live viewport geometries.
 * - Multi-resolution validation: Ultrawide (21:9, 32:9), Standard Widescreen (16:9, 16:10),
 *   Square (1:1), Tablet (4:3), and Mobile Portrait (9:16, 390x844).
 * - Verifies the High-Angle Diorama Camera (~47° / 0.82 rad pitch) preserves continuous line of sight
 *   on the player's raft and river banks (-40 <= x <= 40) without clipping out of frustum (|NDC x| <= 0.85).
 * - Verifies 65% human / 35% teammate weighted centroid tracking and dynamic zoom scaling.
 * - Adversarial fuzzing: tests NaN/Infinity coordinates, missing parameters, negative aspect ratios,
 *   extreme speeds, and teammate disconnects/severed tethers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_COOP_CAMERA_CONFIG,
    isFiniteNumber,
    computeCoopCentroid,
    computeAspectFramingFactor,
    computeTeammateTetherState,
    projectWorldPoint,
    computeCoopCameraFrame,
} from '../shared/coop-camera-and-tether.js';

import {
    checkFrustumProjection,
} from '../shared/scene-watchdog.js';

describe('Helmet 03: Co-Op Camera Framing & Aspect Ratio Breaker', () => {

    const CANONICAL_VIEWPORTS = [
        { name: 'Ultrawide 32:9 (Superwide Monitor)', width: 5120, height: 1440, aspect: 5120 / 1440 },
        { name: 'Ultrawide 21:9 (Gaming Display)', width: 3440, height: 1440, aspect: 3440 / 1440 },
        { name: 'Standard 16:9 FHD (Canonical Desktop)', width: 1920, height: 1080, aspect: 1920 / 1080 },
        { name: 'Standard 16:9 Laptop (1366x768)', width: 1366, height: 768, aspect: 1366 / 768 },
        { name: 'Standard 16:10 (MacBook Pro)', width: 1920, height: 1200, aspect: 1920 / 1200 },
        { name: 'Tablet 4:3 (iPad Landscape)', width: 1024, height: 768, aspect: 1024 / 768 },
        { name: 'Square 1:1 (Split/Windowed Viewport)', width: 1000, height: 1000, aspect: 1.0 },
        { name: 'Mobile Portrait 9:16 (Standard Phone)', width: 1080, height: 1920, aspect: 1080 / 1920 },
        { name: 'Mobile Portrait iPhone 13 (390x844)', width: 390, height: 844, aspect: 390 / 844 },
    ];

    describe('1. Configuration & Mathematical Constants Invariants', () => {
        it('exports frozen default configuration with correct high-angle diorama pitch and bounds', () => {
            assert.ok(DEFAULT_COOP_CAMERA_CONFIG);
            assert.ok(Object.isFrozen(DEFAULT_COOP_CAMERA_CONFIG));
            assert.ok(Math.abs(DEFAULT_COOP_CAMERA_CONFIG.pitch - 0.8203) < 0.01, 'Expected ~47 deg / 0.82 rad diorama pitch');
            assert.ok(DEFAULT_COOP_CAMERA_CONFIG.baseFov === 60 || DEFAULT_COOP_CAMERA_CONFIG.baseFov === 65);
            assert.ok(DEFAULT_COOP_CAMERA_CONFIG.baseDistance === 32.0 || DEFAULT_COOP_CAMERA_CONFIG.baseDistance === 28.0);
            assert.ok(DEFAULT_COOP_CAMERA_CONFIG.minDistance === 24.0 || DEFAULT_COOP_CAMERA_CONFIG.minDistance === 20.0);
            assert.ok(DEFAULT_COOP_CAMERA_CONFIG.maxDistance === 48.0 || DEFAULT_COOP_CAMERA_CONFIG.maxDistance === 44.0);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.riverWidth, 80.0);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.localPlayerWeight, 0.65);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.crewmateWeight, 0.35);
        });

        it('isFiniteNumber correctly differentiates numbers from corruptions', () => {
            assert.equal(isFiniteNumber(42), true);
            assert.equal(isFiniteNumber(0), true);
            assert.equal(isFiniteNumber(-12.5), true);
            assert.equal(isFiniteNumber(NaN), false);
            assert.equal(isFiniteNumber(Infinity), false);
            assert.equal(isFiniteNumber(-Infinity), false);
            assert.equal(isFiniteNumber('100'), false);
            assert.equal(isFiniteNumber(null), false);
            assert.equal(isFiniteNumber(undefined), false);
        });
    });

    describe('2. Weighted Centroid & Teammate Tracking Math', () => {
        it('focuses 100% on local player when teammates array is empty or undefined', () => {
            const localPos = { x: 5, y: 0.25, z: -150 };
            const c1 = computeCoopCentroid(localPos, []);
            assert.equal(c1.x, 5);
            assert.equal(c1.y, 0.25);
            assert.equal(c1.z, -150);
            assert.equal(c1.separation, 0);
            assert.equal(c1.teammateCount, 0);

            const c2 = computeCoopCentroid(localPos, null);
            assert.equal(c2.x, 5);
            assert.equal(c2.separation, 0);
        });

        it('applies 65% human / 35% teammate weighted centroid with single active companion', () => {
            const localPos = { x: 0, y: 0, z: -100 };
            const teammates = [{ x: 20, y: 0, z: -100, alive: true }];

            const c = computeCoopCentroid(localPos, teammates);
            // 0 * 0.65 + 20 * 0.35 = 7.0
            assert.ok(Math.abs(c.x - 7.0) < 1e-6);
            assert.ok(Math.abs(c.z - (-100)) < 1e-6);
            assert.equal(c.separation, 20);
            assert.equal(c.teammateCount, 1);
        });

        it('averages multiple teammates before applying the 35% group weight', () => {
            const localPos = { x: 0, y: 0, z: 0 };
            const teammates = [
                { x: 10, y: 0, z: 10, alive: true },
                { x: 30, y: 0, z: 30, alive: true },
            ]; // average = (20, 0, 20)
            const c = computeCoopCentroid(localPos, teammates);
            // 0 * 0.65 + 20 * 0.35 = 7.0
            assert.ok(Math.abs(c.x - 7.0) < 1e-6);
            assert.ok(Math.abs(c.z - 7.0) < 1e-6);
            assert.ok(Math.abs(c.separation - Math.hypot(30, 30)) < 1e-6);
            assert.equal(c.teammateCount, 2);
        });

        it('ignores dead or invalid teammate records during centroid computation', () => {
            const localPos = { x: 0, y: 0, z: 0 };
            const teammates = [
                { x: 10, y: 0, z: 0, alive: false }, // dead
                { x: NaN, y: 0, z: 0, alive: true },  // corrupted NaN
                { x: 20, y: 0, z: 0, alive: true },   // valid alive
            ];
            const c = computeCoopCentroid(localPos, teammates);
            // Only mate 3 counts: 20 * 0.35 = 7.0
            assert.ok(Math.abs(c.x - 7.0) < 1e-6);
            assert.equal(c.teammateCount, 1);
        });
    });

    describe('3. Dynamic Aspect Framing Adaptation (Ultrawide vs 16:9 vs Mobile Portrait)', () => {
        it('detects isUltrawide on 21:9 and 32:9 and provides optimal distance scaling', () => {
            const factor21x9 = computeAspectFramingFactor(21 / 9);
            assert.equal(factor21x9.isUltrawide, true);
            assert.equal(factor21x9.isPortrait, false);
            assert.ok(factor21x9.distanceMultiplier <= 1.0);

            const factor32x9 = computeAspectFramingFactor(32 / 9);
            assert.equal(factor32x9.isUltrawide, true);
            assert.equal(factor32x9.isPortrait, false);
            assert.ok(factor32x9.distanceMultiplier < factor21x9.distanceMultiplier);
        });

        it('preserves exact 1.0 distanceMultiplier and base 60 FOV on canonical 16:9 widescreen', () => {
            const factor = computeAspectFramingFactor(16 / 9);
            assert.equal(factor.isUltrawide, false);
            assert.equal(factor.isPortrait, false);
            assert.equal(factor.distanceMultiplier, 1.0);
            assert.equal(factor.adaptiveFov, 60);
        });

        it('dynamically adapts distance multiplier and FOV for narrower aspect ratios (16:10, 4:3, 1:1)', () => {
            const f16x10 = computeAspectFramingFactor(16 / 10);
            const f4x3 = computeAspectFramingFactor(4 / 3);
            const f1x1 = computeAspectFramingFactor(1.0);

            assert.ok(f16x10.distanceMultiplier > 1.0);
            assert.ok(f4x3.distanceMultiplier > f16x10.distanceMultiplier);
            assert.ok(f1x1.distanceMultiplier > f4x3.distanceMultiplier);
            assert.ok(f1x1.adaptiveFov > 60 && f1x1.adaptiveFov <= 95);
        });

        it('detects isPortrait on 9:16 mobile viewports and scales distance to preserve corridor framing', () => {
            const fPortrait = computeAspectFramingFactor(9 / 16);
            assert.equal(fPortrait.isPortrait, true);
            assert.equal(fPortrait.isUltrawide, false);
            assert.ok(fPortrait.distanceMultiplier >= 2.0, 'Mobile portrait requires at least 2x distance multiplier');
            assert.ok(fPortrait.adaptiveFov >= 70, 'Mobile portrait expands vertical FOV to preserve horizontal width');
        });

        it('handles non-finite or degenerate aspect ratios safely with fallback to 16:9', () => {
            const fZero = computeAspectFramingFactor(0);
            assert.equal(fZero.distanceMultiplier, 1.0);
            assert.equal(fZero.adaptiveFov, 60);

            const fNaN = computeAspectFramingFactor(NaN);
            assert.equal(fNaN.distanceMultiplier, 1.0);
        });
    });

    describe('4. Teammate Tether Strain & Warning State Machine', () => {
        it('reports TETHERED when distance <= 15m with zero alert', () => {
            const t = computeTeammateTetherState(10.0);
            assert.equal(t.state, 'TETHERED');
            assert.equal(t.isAlert, false);
            assert.ok(t.tension <= 0.25);
            assert.ok(t.message.includes('In Formation'));
        });

        it('reports EXTENDED when distance is between 15m and 22m', () => {
            const t = computeTeammateTetherState(18.0);
            assert.equal(t.state, 'EXTENDED');
            assert.equal(t.isAlert, false);
            assert.ok(t.tension > 0.25 && t.tension <= 0.60);
        });

        it('triggers WARNING alert when distance is between 22m and 35m', () => {
            const t = computeTeammateTetherState(28.0);
            assert.equal(t.state, 'WARNING');
            assert.equal(t.isAlert, true);
            assert.ok(t.message.includes('Drop Anchor [S]'));
        });

        it('triggers CRITICAL alert when distance is between 35m and 50m', () => {
            const t = computeTeammateTetherState(42.0);
            assert.equal(t.state, 'CRITICAL');
            assert.equal(t.isAlert, true);
            assert.ok(t.tension >= 0.90);
        });

        it('reports SEVERED when distance exceeds 50m', () => {
            const t = computeTeammateTetherState(65.0);
            assert.equal(t.state, 'SEVERED');
            assert.equal(t.isAlert, true);
            assert.equal(t.tension, 1.0);
        });

        it('handles negative or NaN distance inputs safely', () => {
            const tNeg = computeTeammateTetherState(-10);
            assert.equal(tNeg.distance, 0);
            assert.equal(tNeg.state, 'TETHERED');

            const tNaN = computeTeammateTetherState(NaN);
            assert.equal(tNaN.distance, 0);
            assert.equal(tNaN.state, 'TETHERED');
        });
    });

    describe('5. Pure 3D World-to-Frustum Projection & Screen Mapping (projectWorldPoint)', () => {
        it('accurately projects point centered along lookAt ray to NDC (0, 0)', () => {
            const camPos = { x: 0, y: 20, z: 20 };
            const lookAt = { x: 0, y: 0, z: 0 };
            const pt = { x: 0, y: 0, z: 0 };

            const proj = projectWorldPoint(pt, camPos, lookAt, 60, 16 / 9, { width: 1920, height: 1080 });
            assert.equal(proj.inFront, true);
            assert.equal(proj.inFrustum, true);
            assert.ok(Math.abs(proj.ndc.x) < 1e-4);
            assert.ok(Math.abs(proj.ndc.y) < 1e-4);
            assert.equal(proj.screenPx.x, 960);
            assert.equal(proj.screenPx.y, 540);
        });

        it('correctly rejects points behind the camera', () => {
            const camPos = { x: 0, y: 20, z: 20 };
            const lookAt = { x: 0, y: 0, z: 0 }; // forward is towards -Y and -Z
            const behindPt = { x: 0, y: 40, z: 40 }; // behind the camera position

            const proj = projectWorldPoint(behindPt, camPos, lookAt, 60, 16 / 9);
            assert.equal(proj.inFront, false);
            assert.equal(proj.inFrustum, false);
            assert.equal(proj.screenPx, null);
        });

        it('returns safe failure object on corrupted or NaN coordinates', () => {
            const res = projectWorldPoint({ x: NaN, y: 0, z: 0 }, { x: 0, y: 10, z: 10 }, { x: 0, y: 0, z: 0 }, 60, 16 / 9);
            assert.equal(res.inFront, false);
            assert.equal(res.inFrustum, false);
            assert.ok(Number.isNaN(res.ndc.x));
        });
    });

    describe('6. Multi-Resolution Aspect Ratio Framing Suite (All 9 Canonical Viewports)', () => {
        for (const vp of CANONICAL_VIEWPORTS) {
            it(`guarantees player raft and river corridor are properly framed on ${vp.name} (${vp.width}x${vp.height}, aspect=${vp.aspect.toFixed(2)})`, () => {
                const raftState = {
                    position: { x: 0, y: 0.25, z: -250 },
                    velocity: { x: 0, y: 0, z: -10 },
                };

                const frame = computeCoopCameraFrame({
                    localRaft: raftState,
                    aspect: vp.aspect,
                    viewport: { width: vp.width, height: vp.height },
                });

                // 1. Camera orientation invariants
                assert.ok(Number.isFinite(frame.cameraPosition.x));
                assert.ok(Number.isFinite(frame.cameraPosition.y));
                assert.ok(Number.isFinite(frame.cameraPosition.z));
                assert.ok(frame.cameraPosition.y > frame.lookAt.y, 'Camera must be elevated above lookAt target');
                assert.ok(frame.cameraPosition.z > frame.lookAt.z, 'Camera must be positioned upriver (+Z relative to target -Z)');

                // 2. High-angle pitch invariant (~47 degrees)
                assert.ok(Math.abs(frame.pitch - 0.8203) < 0.05);

                // 3. Raft is centered laterally and positioned in lower-middle vertical screen
                const raftNdc = frame.framing.localRaftNdc;
                assert.ok(Math.abs(raftNdc.x) <= 0.05, `Raft X should be centered (NDC x close to 0), got ${raftNdc.x}`);
                assert.ok(raftNdc.y >= -0.75 && raftNdc.y <= 0.25, `Raft Y must be in lower/middle half, got ${raftNdc.y}`);
                assert.equal(frame.framing.raftInFrustum, true, 'Raft must be inside camera frustum');

                // 4. Raft screen pixel coordinates within canvas bounds
                const screenPx = frame.framing.localRaftScreenPx;
                assert.ok(screenPx, 'Screen pixel position must be computed');
                assert.ok(screenPx.x > 0 && screenPx.x < vp.width, `Screen X (${screenPx.x}) must be within width (${vp.width})`);
                assert.ok(screenPx.y > 0 && screenPx.y < vp.height, `Screen Y (${screenPx.y}) must be within height (${vp.height})`);

                // 5. River corridor visibility check (both bank points in front of camera)
                assert.equal(frame.framing.corridorVisible, true, 'Corridor bank points must be in front of camera');
                assert.ok(frame.framing.leftBankNdcX < 0, 'Left bank (-40) must project to negative NDC X');
                assert.ok(frame.framing.rightBankNdcX > 0, 'Right bank (+40) must project to positive NDC X');
                assert.ok(Math.abs(frame.framing.leftBankNdcX + frame.framing.rightBankNdcX) < 1e-4, 'Bank projections must be symmetric around river center');

                // 6. Tether sanity
                assert.equal(frame.tether.state, 'TETHERED');
            });
        }
    });

    describe('7. Lateral Raft Maneuver & River Boundary Framing', () => {
        it('keeps raft inside frustum (|NDC x| <= 0.85) when player navigates towards far left bank (x = -32)', () => {
            const frame = computeCoopCameraFrame({
                localRaft: { position: { x: -32, y: 0.25, z: -100 }, velocity: { x: -4, y: 0, z: -10 } },
                aspect: 16 / 9,
                viewport: { width: 1920, height: 1080 },
            });

            assert.equal(frame.framing.raftInFrustum, true);
            assert.ok(Math.abs(frame.framing.localRaftNdc.x) <= 0.85);
            assert.ok(frame.framing.localRaftScreenPx.x >= 0 && frame.framing.localRaftScreenPx.x <= 1920);
        });

        it('keeps raft inside frustum (|NDC x| <= 0.85) when player navigates towards far right bank (x = +32)', () => {
            const frame = computeCoopCameraFrame({
                localRaft: { position: { x: 32, y: 0.25, z: -100 }, velocity: { x: 4, y: 0, z: -10 } },
                aspect: 16 / 9,
                viewport: { width: 1920, height: 1080 },
            });

            assert.equal(frame.framing.raftInFrustum, true);
            assert.ok(Math.abs(frame.framing.localRaftNdc.x) <= 0.85);
            assert.ok(frame.framing.localRaftScreenPx.x >= 0 && frame.framing.localRaftScreenPx.x <= 1920);
        });

        it('on mobile portrait (390x844), keeps raft at x = -20 and x = +20 inside frustum', () => {
            for (const x of [-20, 20]) {
                const frame = computeCoopCameraFrame({
                    localRaft: { position: { x, y: 0.25, z: -100 }, velocity: { x: 0, y: 0, z: -10 } },
                    aspect: 390 / 844,
                    viewport: { width: 390, height: 844 },
                });

                assert.equal(frame.framing.raftInFrustum, true);
                assert.ok(Math.abs(frame.framing.localRaftNdc.x) <= 0.85, `Mobile portrait NDC x out of bounds: ${frame.framing.localRaftNdc.x}`);
                assert.ok(frame.framing.localRaftScreenPx.x >= 0 && frame.framing.localRaftScreenPx.x <= 390);
            }
        });
    });

    describe('8. Co-Op Centroid Dynamics & Separation Zoom Scaling', () => {
        it('dynamically expands camera distance when teammates separate across 25m', () => {
            const localRaft = { position: { x: 0, y: 0.25, z: -100 }, velocity: { x: 0, y: 0, z: -10 } };
            const frameClose = computeCoopCameraFrame({
                localRaft,
                teammates: [{ x: 2, y: 0.25, z: -102, alive: true }],
                aspect: 16 / 9,
            });

            const frameSeparated = computeCoopCameraFrame({
                localRaft,
                teammates: [{ x: 20, y: 0.25, z: -115, alive: true }],
                aspect: 16 / 9,
            });

            assert.ok(frameSeparated.distance > frameClose.distance, 'Camera must zoom back when teammates separate');
            assert.ok(frameSeparated.centroid.separation > frameClose.centroid.separation);
            assert.equal(frameSeparated.tether.isAlert, true, 'Separated teammates should trigger tether warning');
        });

        it('zooms back slightly when raft reaches high downriver speed (25 m/s)', () => {
            const frameSlow = computeCoopCameraFrame({
                localRaft: { position: { x: 0, y: 0.25, z: -100 }, velocity: { x: 0, y: 0, z: -5 } },
                aspect: 16 / 9,
            });
            const frameFast = computeCoopCameraFrame({
                localRaft: { position: { x: 0, y: 0.25, z: -100 }, velocity: { x: 0, y: 0, z: -25 } },
                aspect: 16 / 9,
            });

            assert.ok(frameFast.distance > frameSlow.distance, 'High speed must slightly zoom back to expand look-ahead horizon');
        });
    });

    describe('9. Interoperability with Scene-Watchdog checkFrustumProjection', () => {
        it('validates raft projection against Three.js style camera mock using scene-watchdog', () => {
            const frame = computeCoopCameraFrame({
                localRaft: { position: { x: 0, y: 0.25, z: -100 }, velocity: { x: 0, y: 0, z: -10 } },
                aspect: 16 / 9,
                viewport: { width: 1920, height: 1080 },
            });

            // Construct mock camera that implements camera.project() using projectWorldPoint
            const mockCamera = {
                position: frame.cameraPosition,
                project(vec) {
                    const res = projectWorldPoint(
                        vec,
                        frame.cameraPosition,
                        frame.lookAt,
                        frame.fov,
                        frame.aspect,
                        { width: 1920, height: 1080 }
                    );
                    vec.x = res.ndc.x;
                    vec.y = res.ndc.y;
                    vec.z = res.ndc.z;
                    return vec;
                },
                updateMatrixWorld() {},
            };

            const watchdogResult = checkFrustumProjection(
                { x: 0, y: 0.25, z: -100 },
                mockCamera,
                { width: 1920, height: 1080 }
            );

            assert.equal(watchdogResult.ok, true);
            assert.equal(watchdogResult.inFront, true);
            assert.equal(watchdogResult.inFrustum, true);
            assert.ok(watchdogResult.screenPx);
            assert.equal(watchdogResult.screenPx.x, 960);
        });
    });

    describe('10. Adversarial Human Fuzzing & Degenerate Input Immunity', () => {
        it('handles null/undefined localRaft cleanly without throwing', () => {
            const frame = computeCoopCameraFrame({ localRaft: null });
            assert.ok(frame);
            assert.ok(Number.isFinite(frame.cameraPosition.x));
            assert.ok(Number.isFinite(frame.distance));
        });

        it('handles corrupted NaN velocities and positions without leaking NaNs', () => {
            const frame = computeCoopCameraFrame({
                localRaft: {
                    position: { x: NaN, y: NaN, z: NaN },
                    velocity: { x: Infinity, y: -Infinity, z: NaN },
                },
                teammates: [{ x: NaN, y: NaN, z: NaN }],
                aspect: NaN,
            });

            assert.ok(Number.isFinite(frame.cameraPosition.x));
            assert.ok(Number.isFinite(frame.cameraPosition.y));
            assert.ok(Number.isFinite(frame.cameraPosition.z));
            assert.ok(Number.isFinite(frame.distance));
            assert.ok(Number.isFinite(frame.fov));
        });

        it('handles negative or absurd aspect ratios (e.g. -1, 0, 1000) gracefully', () => {
            const frameNeg = computeCoopCameraFrame({
                localRaft: { position: { x: 0, y: 0, z: 0 } },
                aspect: -1.5,
            });
            assert.ok(Number.isFinite(frameNeg.aspect));
            assert.ok(frameNeg.aspect > 0);

            const frameBig = computeCoopCameraFrame({
                localRaft: { position: { x: 0, y: 0, z: 0 } },
                aspect: 9999,
            });
            assert.ok(Number.isFinite(frameBig.cameraPosition.y));
        });
    });
});
