/**
 * Comprehensive Unit Tests for High-Angle Tactical Co-Op Diorama Camera & Teammate Tether Controller
 * (`test/coop-camera-and-tether.test.js`)
 *
 * Verifies:
 * - Module exports and configuration invariants (pitch ~47 deg / 0.82 rad, baseDistance 28m, maxDistance 44m, 80m river span)
 * - 65% local player / 35% crewmate centroid weighting
 * - Dynamic zoom scaling from 28m up to 44m as players spread across the 80m river
 * - Single player fallback (100% local player weighting when crew is absent or dead)
 * - Downriver look-ahead along negative Z and high elevation positioning
 * - Temporal damping with previousState smoothing
 * - Teammate tether tension calculation, warning thresholds (70%), critical breaks (90%), direction vectors, and cohesion flags
 * - Diverse input representations (Array, Map, Object dictionary) and robustness to null/undefined/dead units
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_COOP_CAMERA_CONFIG,
    computeCoopCameraFrame,
    computeTeammateTetherState,
    computeCoopCentroid,
    computeDynamicCameraDistance,
    extractActiveCrew,
    clamp,
    distXZ,
} from '../shared/coop-camera-and-tether.js';

describe('High-Angle Tactical Co-Op Diorama Camera & Tether System', () => {

    describe('Configuration & Default Constants', () => {
        it('exports immutable DEFAULT_COOP_CAMERA_CONFIG with required mission parameters', () => {
            assert.ok(DEFAULT_COOP_CAMERA_CONFIG);
            assert.equal(typeof DEFAULT_COOP_CAMERA_CONFIG, 'object');

            // Default pitch ~0.82 rad (~47 degrees)
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.defaultPitch, 0.82);
            assert.ok(Math.abs(DEFAULT_COOP_CAMERA_CONFIG.defaultPitch * (180 / Math.PI) - 47) < 0.2);

            // Base distance 28m, max dynamic distance 44m, river span 80m
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.baseDistance, 28.0);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.maxDistance, 44.0);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.riverSpanReference, 80.0);

            // Centroid weights: 65% local, 35% crew
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.localPlayerWeight, 0.65);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.crewWeight, 0.35);

            // Tether limits
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.maxCohesionDist, 40.0);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.warningCohesionDist, 28.0);
            assert.equal(DEFAULT_COOP_CAMERA_CONFIG.criticalCohesionDist, 36.0);
        });

        it('pure helper clamp and distXZ work correctly', () => {
            assert.equal(clamp(15, 0, 10), 10);
            assert.equal(clamp(-5, 0, 10), 0);
            assert.equal(clamp(5, 0, 10), 5);
            assert.equal(clamp(NaN, 0, 10), 0);

            const p1 = { x: 3, z: 4 };
            const p2 = { x: 0, z: 0 };
            assert.equal(distXZ(p1, p2), 5);
        });
    });

    describe('Active Crew Extraction & Filtering', () => {
        it('handles null, undefined, and empty collections cleanly', () => {
            assert.deepEqual(extractActiveCrew(null), []);
            assert.deepEqual(extractActiveCrew(undefined), []);
            assert.deepEqual(extractActiveCrew([]), []);
            assert.deepEqual(extractActiveCrew({}), []);
            assert.deepEqual(extractActiveCrew(new Map()), []);
        });

        it('filters out dead crewmates across different health/dead flags', () => {
            const raw = [
                { id: 'bot-1', x: 10, y: 0, z: -50, health: 100, alive: true },
                { id: 'bot-dead-hp', x: 20, y: 0, z: -50, health: 0 },
                { id: 'bot-dead-flag', x: 30, y: 0, z: -50, isDead: true },
                { id: 'bot-dead-alive-flag', x: 40, y: 0, z: -50, alive: false },
                { id: 'bot-invalid-pos', x: NaN, y: 0, z: -50 },
                { id: 'bot-2', position: { x: -10, y: 0, z: -70 }, health: 80 },
            ];

            const active = extractActiveCrew(raw);
            assert.equal(active.length, 2);
            assert.equal(active[0].id, 'bot-1');
            assert.equal(active[1].id, 'bot-2');
            assert.equal(active[1].x, -10);
            assert.equal(active[1].z, -70);
        });

        it('extracts correctly from Map and Object dictionaries', () => {
            const map = new Map([
                ['p1', { id: 'p1', x: 5, z: -10 }],
                ['p2', { id: 'p2', x: 15, z: -20, health: 50 }],
            ]);
            assert.equal(extractActiveCrew(map).length, 2);

            const dict = {
                c1: { id: 'c1', x: -5, z: -15, health: 100 },
                c2: { id: 'c2', x: -15, z: -25, isDead: true },
            };
            const extracted = extractActiveCrew(dict);
            assert.equal(extracted.length, 1);
            assert.equal(extracted[0].id, 'c1');
        });
    });

    describe('Weighted Tactical Centroid (65% Local / 35% Crew)', () => {
        it('snaps 100% to local player when no crewmates are active', () => {
            const local = { x: 14.5, y: 1.0, z: -120.0 };
            const centroid = computeCoopCentroid({ localPlayer: local, crewPlayers: [] });

            assert.equal(centroid.x, 14.5);
            assert.equal(centroid.y, 1.0);
            assert.equal(centroid.z, -120.0);
            assert.equal(centroid.activeCrewCount, 0);
            assert.equal(centroid.localWeight, 1.0);
            assert.equal(centroid.crewWeight, 0.0);
            assert.equal(centroid.spreadRadius, 0);
            assert.equal(centroid.maxSpreadSpan, 0);
        });

        it('calculates exact 65% local / 35% crew weighted position with single teammate', () => {
            // Local player at x: 0, z: 0
            // Teammate at x: 100, z: 200
            // Expected centroid: x = 0 * 0.65 + 100 * 0.35 = 35
            // Expected centroid: z = 0 * 0.65 + 200 * 0.35 = 70
            const local = { x: 0, y: 0, z: 0 };
            const crew = [{ id: 'bot-1', x: 100, y: 0, z: 200 }];

            const centroid = computeCoopCentroid({ localPlayer: local, crewPlayers: crew });
            assert.equal(centroid.activeCrewCount, 1);
            assert.ok(Math.abs(centroid.x - 35) < 1e-6);
            assert.ok(Math.abs(centroid.z - 70) < 1e-6);
            assert.equal(centroid.localWeight, 0.65);
            assert.equal(centroid.crewWeight, 0.35);

            // Spread span between (0,0) and (100,200) = sqrt(100^2 + 200^2) = sqrt(50000) ~ 223.606
            assert.ok(Math.abs(centroid.maxSpreadSpan - Math.hypot(100, 200)) < 1e-5);
        });

        it('averages multiple crewmates into the 35% pool', () => {
            const local = { x: 0, y: 0, z: 0 };
            // Two crewmates: x=10 and x=30 -> avgCrewX = 20
            // Expected centroid X = 0 * 0.65 + 20 * 0.35 = 7.0
            const crew = [
                { id: 'bot-1', x: 10, y: 0, z: 100 },
                { id: 'bot-2', x: 30, y: 0, z: 200 },
            ];

            const centroid = computeCoopCentroid({ localPlayer: local, crewPlayers: crew });
            assert.equal(centroid.activeCrewCount, 2);
            assert.ok(Math.abs(centroid.x - 7.0) < 1e-6);
            // avgCrewZ = 150 -> 0 * 0.65 + 150 * 0.35 = 52.5
            assert.ok(Math.abs(centroid.z - 52.5) < 1e-6);
        });
    });

    describe('Dynamic Camera Zoom Scaling Across 80m River Span', () => {
        it('returns base distance (28m) when player spread is zero', () => {
            const zoom = computeDynamicCameraDistance(0.0);
            assert.equal(zoom.distance, 28.0);
            assert.equal(zoom.zoomRatio, 0.0);
        });

        it('scales to max distance (44m) when spread reaches 80m river span reference', () => {
            const zoom = computeDynamicCameraDistance(80.0);
            assert.equal(zoom.distance, 44.0);
            assert.equal(zoom.zoomRatio, 1.0);
        });

        it('clamps distance at maxDistance even if spread exceeds 80m', () => {
            const zoom = computeDynamicCameraDistance(150.0);
            assert.equal(zoom.distance, 44.0);
            assert.equal(zoom.zoomRatio, 1.0);
        });

        it('smoothly scales intermediate spreads between 28m and 44m', () => {
            const zoomMid = computeDynamicCameraDistance(40.0); // 50% spread
            assert.ok(zoomMid.distance > 28.0 && zoomMid.distance < 44.0);
            assert.equal(zoomMid.zoomRatio, 0.5);
            // With quadratic ease: ratio * (2 - ratio) = 0.5 * 1.5 = 0.75
            // distance = 28 + (44 - 28) * 0.75 = 28 + 12 = 40m
            assert.ok(Math.abs(zoomMid.distance - 40.0) < 1e-5);
        });
    });

    describe('computeCoopCameraFrame Transform & Projections', () => {
        it('computes high-angle tactical frame with default ~47 deg pitch and base distance', () => {
            const local = { x: 0, y: 0, z: -100, vx: 0, vz: 0 };
            const frame = computeCoopCameraFrame({ localPlayer: local });

            assert.ok(frame.position);
            assert.ok(frame.lookAt);
            assert.equal(frame.pitch, 0.82);
            assert.equal(frame.distance, 28.0);

            // Look target is downriver (negative Z) from local player
            assert.equal(frame.lookAt.x, 0);
            assert.equal(frame.lookAt.z, -106.0); // -100 - lookAheadDownriverZ(6)
            assert.equal(frame.lookAt.y, 1.2); // lookElevationY

            // Camera is elevated above water and offset behind along positive Z
            const expectedHoriz = 28.0 * Math.cos(0.82);
            const expectedVert = 28.0 * Math.sin(0.82);

            assert.ok(Math.abs(frame.position.x - 0) < 1e-5);
            assert.ok(Math.abs(frame.position.y - (expectedVert + 2.0)) < 1e-5);
            assert.ok(Math.abs(frame.position.z - (-100 + expectedHoriz)) < 1e-5);
            assert.ok(frame.position.y > 20.0, 'tactical high-angle elevation should be > 20m high');
        });

        it('expands camera distance and adjusts centroid when teammates spread laterally', () => {
            const local = { x: -20, y: 0, z: -200 };
            const crew = [{ id: 'bot-east', x: 20, y: 0, z: -200 }]; // 40m lateral spread across river

            const frame = computeCoopCameraFrame({
                localPlayer: local,
                crewPlayers: crew,
            });

            // Centroid: -20 * 0.65 + 20 * 0.35 = -13 + 7 = -6
            assert.ok(Math.abs(frame.centroid.x - (-6)) < 1e-5);
            assert.equal(frame.centroid.z, -200);

            // Camera distance widened past base 28m
            assert.ok(frame.distance > 35.0, `Expected distance > 35m, got ${frame.distance}`);
            assert.ok(frame.distance <= 44.0);

            // Camera tracks centroid X
            assert.ok(Math.abs(frame.position.x - (-6)) < 1e-5);
            assert.ok(Math.abs(frame.lookAt.x - (-6)) < 1e-5);
        });

        it('widens FOV dynamically when raft surges at high speed downriver', () => {
            const stationary = computeCoopCameraFrame({
                localPlayer: { x: 0, y: 0, z: 0, vx: 0, vz: 0 },
            });
            const speeding = computeCoopCameraFrame({
                localPlayer: { x: 0, y: 0, z: 0, vx: 0, vz: -18 }, // fast speed 18 m/s
            });

            assert.equal(stationary.fov, 65.0);
            assert.ok(speeding.fov > 65.0, `Speeding FOV (${speeding.fov}) should exceed base (65.0)`);
            assert.ok(speeding.fov <= 78.0, 'FOV should clamp at maxFov 78.0');
        });

        it('applies temporal exponential damping when previousState is provided', () => {
            const localTarget = { x: 50, y: 0, z: 0 };
            const prevState = {
                position: { x: 0, y: 20, z: 20 },
                lookAt: { x: 0, y: 1.2, z: -6 },
                fov: 65.0,
                distance: 28.0,
            };

            const dampedFrame = computeCoopCameraFrame({
                localPlayer: localTarget,
                previousState: prevState,
                dt: 1 / 60,
            });

            // Camera position should have moved towards target but smoothed (not snapped immediately to 50)
            assert.ok(dampedFrame.position.x > 0);
            assert.ok(dampedFrame.position.x < 50);
            assert.ok(dampedFrame.lookAt.x > 0);
            assert.ok(dampedFrame.lookAt.x < 50);
        });
    });

    describe('Teammate Tether & Cohesion Metrics', () => {
        it('returns zero violation and inCohesion=true when alone or crew empty', () => {
            const state = computeTeammateTetherState({
                localPlayer: { x: 0, z: -100 },
                crewPlayers: [],
            });

            assert.equal(state.inCohesion, true);
            assert.equal(state.maxDistanceToTeammate, 0);
            assert.equal(state.avgDistanceToTeammates, 0);
            assert.equal(state.maxTension, 0);
            assert.equal(state.warningCount, 0);
            assert.equal(state.criticalCount, 0);
            assert.deepEqual(state.teammates, []);
        });

        it('accurately evaluates green / normal tether status under warning distance (<28m)', () => {
            const local = { x: 0, z: -100 };
            const crew = [{ id: 'bot-1', name: 'Bot One', x: 0, z: -120 }]; // 20m ahead downriver

            const state = computeTeammateTetherState({
                localPlayer: local,
                crewPlayers: crew,
                maxCohesionDist: 40.0,
            });

            assert.equal(state.inCohesion, true);
            assert.equal(state.maxDistanceToTeammate, 20.0);
            assert.equal(state.maxTension, 0.5); // 20 / 40
            assert.equal(state.warningCount, 0);
            assert.equal(state.criticalCount, 0);

            const tm = state.teammates[0];
            assert.equal(tm.id, 'bot-1');
            assert.equal(tm.isWarning, false);
            assert.equal(tm.isCritical, false);
            assert.equal(tm.isAhead, true, 'dz < 0 indicates teammate is ahead downriver');
            assert.equal(tm.isBehind, false);
            assert.equal(tm.directionZ, -1);
        });

        it('triggers amber warning status between 70% and 90% tether limit (28m - 36m)', () => {
            const local = { x: 0, z: -100 };
            const crew = [{ id: 'bot-lag', name: 'Laggard', x: 0, z: -70 }]; // 30m behind (dz = +30)

            const state = computeTeammateTetherState({
                localPlayer: local,
                crewPlayers: crew,
                maxCohesionDist: 40.0,
            });

            assert.equal(state.inCohesion, true);
            assert.equal(state.maxDistanceToTeammate, 30.0);
            assert.equal(state.maxTension, 0.75); // 30 / 40
            assert.equal(state.warningCount, 1);
            assert.equal(state.criticalCount, 0);

            const tm = state.teammates[0];
            assert.equal(tm.isWarning, true);
            assert.equal(tm.isCritical, false);
            assert.equal(tm.isAhead, false);
            assert.equal(tm.isBehind, true, 'dz > 0 indicates teammate is falling behind');
            assert.equal(tm.directionZ, 1);
        });

        it('triggers crimson critical status and breaks cohesion beyond max distance (>40m)', () => {
            const local = { x: 0, z: -100 };
            const crew = [
                { id: 'bot-1', x: 5, z: -110 },   // ~11.18m (fine)
                { id: 'bot-lost', x: 0, z: -55 },  // 45m behind (critical & break!)
            ];

            const state = computeTeammateTetherState({
                localPlayer: local,
                crewPlayers: crew,
                maxCohesionDist: 40.0,
            });

            assert.equal(state.inCohesion, false, 'Distance 45m exceeds maxCohesionDist 40m');
            assert.equal(state.maxDistanceToTeammate, 45.0);
            assert.ok(state.maxTension > 1.0);
            assert.equal(state.criticalCount, 1);

            const lostTeammate = state.teammates.find((t) => t.id === 'bot-lost');
            assert.ok(lostTeammate);
            assert.equal(lostTeammate.isCritical, true);
            assert.equal(lostTeammate.isBehind, true);
        });

        it('handles dead crewmates by excluding them from active tether calculation', () => {
            const local = { x: 0, z: -100 };
            const crew = [
                { id: 'bot-dead', x: 0, z: 0, health: 0 }, // 100m away but dead
                { id: 'bot-alive', x: 0, z: -115, health: 100 }, // 15m away and alive
            ];

            const state = computeTeammateTetherState({
                localPlayer: local,
                crewPlayers: crew,
                maxCohesionDist: 40.0,
            });

            assert.equal(state.teammates.length, 1);
            assert.equal(state.teammates[0].id, 'bot-alive');
            assert.equal(state.inCohesion, true);
            assert.equal(state.maxDistanceToTeammate, 15.0);
        });
    });
});
