import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    LOOKOUT_SCOUT_CONFIG,
    computeScoutOverviewCamera,
    classifyRiverLane,
    scanDownriverHazards,
} from '../shared/sanctuary-lookout-scout.js';
import { generateRiverHazardsLayout } from '../shared/river-hazards.js';
import { auditGlobalLeaks, extractIntentHeader } from '../shared/architecture-validator.js';

describe('Sanctuary Platform Lookout & Tactical Scout Camera Module', () => {
    describe('Architectural Integrity & Intent Header', () => {
        it('has architectural intent header explaining why this exists', () => {
            const code = fs.readFileSync('shared/sanctuary-lookout-scout.js', 'utf8');
            const intent = extractIntentHeader(code);
            assert.equal(intent.hasIntentHeader, true);
            assert.ok(intent.intentSummary.includes('Sanctuary Platform Lookout'));
        });

        it('contains zero DOM, window, document, or Three.js global leaks', () => {
            const code = fs.readFileSync('shared/sanctuary-lookout-scout.js', 'utf8');
            const leaks = auditGlobalLeaks(code);
            assert.deepEqual(leaks, [], 'Module must have zero un-guarded global leaks');
        });

        it('exports required configuration constants', () => {
            assert.equal(typeof LOOKOUT_SCOUT_CONFIG.DEFAULT_SCOUT_RANGE, 'number');
            assert.equal(LOOKOUT_SCOUT_CONFIG.DEFAULT_SCOUT_RANGE, 200.0);
            assert.equal(LOOKOUT_SCOUT_CONFIG.DEFAULT_RIVER_WIDTH, 30.0);
            assert.ok(LOOKOUT_SCOUT_CONFIG.OVERVIEW_CAMERA_ELEVATION > 0);
            assert.ok(LOOKOUT_SCOUT_CONFIG.OVERVIEW_LOOKAHEAD_Z > 0);
        });
    });

    describe('computeScoutOverviewCamera', () => {
        it('computes valid camera posture from platform position', () => {
            const platformPos = { x: 12.0, y: 1.0, z: -150.0 };
            const cam = computeScoutOverviewCamera(platformPos, 30);

            assert.ok(Number.isFinite(cam.position.x));
            assert.ok(Number.isFinite(cam.position.y));
            assert.ok(Number.isFinite(cam.position.z));
            assert.ok(Number.isFinite(cam.target.x));
            assert.ok(Number.isFinite(cam.target.y));
            assert.ok(Number.isFinite(cam.target.z));
            assert.ok(Number.isFinite(cam.pitchRad));
            assert.ok(Number.isFinite(cam.yawRad));
            assert.equal(cam.fov, LOOKOUT_SCOUT_CONFIG.OVERVIEW_FOV);

            // Camera is elevated and upriver (+Z relative to target)
            assert.ok(cam.position.y >= LOOKOUT_SCOUT_CONFIG.OVERVIEW_CAMERA_ELEVATION);
            assert.ok(cam.position.z > platformPos.z);
            assert.ok(cam.target.z < platformPos.z);
        });

        it('handles null/missing platformPos gracefully with sensible defaults', () => {
            const cam = computeScoutOverviewCamera(null);
            assert.equal(cam.position.x, 0);
            assert.equal(cam.position.y, LOOKOUT_SCOUT_CONFIG.OVERVIEW_CAMERA_ELEVATION);
            assert.equal(cam.position.z, LOOKOUT_SCOUT_CONFIG.OVERVIEW_CAMERA_Z_BACK);
            assert.equal(cam.target.z, -LOOKOUT_SCOUT_CONFIG.OVERVIEW_LOOKAHEAD_Z);
        });

        it('supports nested position object ({ position: { x, y, z } })', () => {
            const platform = { position: { x: -8.0, y: 0.5, z: -300.0 } };
            const cam = computeScoutOverviewCamera(platform, 40);
            assert.ok(cam.target.z < -300.0);
            assert.equal(cam.riverWidth, 40);
        });

        it('accepts custom camera options for elevation, lookahead, and fov', () => {
            const platformPos = { x: 0, y: 0, z: -50 };
            const customOptions = {
                elevation: 40.0,
                zBack: 25.0,
                lookAheadZ: 100.0,
                fov: 75.0,
                centerLateral: 1.0, // center perfectly
            };
            const cam = computeScoutOverviewCamera(platformPos, 30, customOptions);
            assert.equal(cam.position.x, 0);
            assert.equal(cam.position.y, 40.0);
            assert.equal(cam.position.z, -25.0); // -50 + 25 = -25
            assert.equal(cam.target.z, -150.0);  // -50 - 100 = -150
            assert.equal(cam.fov, 75.0);
            assert.equal(cam.elevation, 40.0);
            assert.equal(cam.lookAheadDistance, 100.0);
        });
    });

    describe('classifyRiverLane', () => {
        it('classifies port, center, and starboard correctly', () => {
            const halfWidth = 15.0; // Corridor spans [-15, +15]
            assert.equal(classifyRiverLane(-10, halfWidth), 'port');
            assert.equal(classifyRiverLane(0, halfWidth), 'center');
            assert.equal(classifyRiverLane(10, halfWidth), 'starboard');
        });
    });

    describe('scanDownriverHazards', () => {
        it('scans empty river hazards when no entities provided', () => {
            const result = scanDownriverHazards({ zPos: -100 });
            assert.equal(result.scanOriginZ, -100);
            assert.equal(result.scanRangeMeters, 200.0);
            assert.deepEqual(result.scannedWindow, { minZ: -300, maxZ: -100 });
            assert.equal(result.summary.hazardsCount, 0);
            assert.equal(result.summary.enemiesCount, 0);
            assert.equal(result.summary.coinRingsCount, 0);
            assert.equal(result.summary.platformsCount, 0);
            assert.equal(result.summary.totalCoinsAvailable, 0);
            assert.equal(result.nextSafeDock, null);
        });

        it('detects upcoming hazards, coin rings, and platforms within 200m range', () => {
            const obstacles = [
                { id: 'w1', type: 'whirlpool', x: -5, y: 0, z: -120 },
                { id: 'm1', type: 'mine', x: 2, y: 0, z: -180 },
                { id: 'far', type: 'rock', x: 0, y: 0, z: -350 }, // out of 200m range
                { id: 'behind', type: 'whirlpool', x: 0, y: 0, z: -50 }, // behind raft
            ];
            const coinRings = [
                { id: 'coin_1', x: 0, y: 2, z: -140, value: 10 },
                { id: 'coin_2', x: 5, y: 2, z: -210, value: 5 },
            ];
            const enemies = [
                { id: 'e1', type: 'mudAlien', name: 'Mud Alien', x: -6, y: 0, z: -160, hp: 40 },
            ];
            const platforms = [
                { id: 'plat_current', name: 'Current Platform', x: 10, y: 0, z: -100 }, // at raft
                { id: 'plat_next', name: 'Upcoming Safe Dock', x: -10, y: 0, z: -220, isShop: true },
            ];

            const scan = scanDownriverHazards({
                zPos: -100,
                range: 200,
                obstacles,
                coinRings,
                enemies,
                platforms,
            });

            // Hazards inside [-300, -100]: w1 (dist 20), m1 (dist 80)
            assert.equal(scan.hazards.length, 2);
            assert.equal(scan.hazards[0].id, 'w1');
            assert.equal(scan.hazards[0].distanceDownriver, 20);
            assert.equal(scan.hazards[1].id, 'm1');
            assert.equal(scan.hazards[1].distanceDownriver, 80);

            // Coin rings: coin_1 (dist 40), coin_2 (dist 110)
            assert.equal(scan.coinRings.length, 2);
            assert.equal(scan.summary.totalCoinsAvailable, 15);

            // Enemies: e1 (dist 60)
            assert.equal(scan.enemies.length, 1);
            assert.equal(scan.enemies[0].id, 'e1');
            assert.equal(scan.enemies[0].distanceDownriver, 60);

            // Platforms: plat_next (dist 120), plat_current ignored because at raft
            assert.equal(scan.platforms.length, 1);
            assert.equal(scan.platforms[0].id, 'plat_next');
            assert.equal(scan.platforms[0].distanceDownriver, 120);
            assert.equal(scan.platforms[0].isShop, true);
            assert.equal(scan.nextSafeDock.id, 'plat_next');
        });

        it('integrates seamlessly with river-hazards layout container object', () => {
            const hazardsLayout = generateRiverHazardsLayout(42, -1500, 30);
            const scan = scanDownriverHazards({
                zPos: -100,
                range: 200,
                obstacles: hazardsLayout,
                platforms: [
                    { id: 'dock_1', name: 'Mid-River Dock', x: 8, z: -250 },
                ],
            });

            assert.ok(scan.hazards.length > 0, 'Should find procedural river hazards within 200m');
            assert.ok(scan.coinRings.length >= 0);
            assert.ok(Number.isFinite(scan.summary.hazardsCount));
            assert.ok(['port', 'center', 'starboard'].includes(scan.summary.recommendedLane));
            assert.equal(scan.nextSafeDock?.id, 'dock_1');
            assert.equal(scan.nextSafeDock?.distanceDownriver, 150);

            // Verify hazard distances are sorted ascending
            for (let i = 1; i < scan.hazards.length; i++) {
                assert.ok(scan.hazards[i].distanceDownriver >= scan.hazards[i - 1].distanceDownriver);
            }
        });

        it('calculates lane threat scores and recommends the safest navigation lane', () => {
            // Place heavy hazards in port lane and center lane, leave starboard open
            const obstacles = [
                { id: 'w1', type: 'whirlpool', x: -10, z: -130 },
                { id: 'm1', type: 'mine', x: -9, z: -150 },
                { id: 'w2', type: 'whirlpool', x: 0, z: -140 },
            ];
            const scan = scanDownriverHazards({
                zPos: -100,
                obstacles,
                riverWidth: 30,
            });

            assert.equal(scan.summary.recommendedLane, 'starboard');
            assert.equal(scan.summary.laneThreatScores.starboard, 0);
            assert.ok(scan.summary.laneThreatScores.port > 0);
        });

        it('handles boundary edges exactly (zPos and zPos - range)', () => {
            const obstacles = [
                { id: 'at_origin', x: 0, z: -100 },
                { id: 'at_limit', x: 0, z: -300 },
                { id: 'just_past_limit', x: 0, z: -300.1 },
                { id: 'just_upriver', x: 0, z: -99.9 },
            ];
            const scan = scanDownriverHazards({
                zPos: -100,
                range: 200,
                obstacles,
            });

            const ids = scan.hazards.map((h) => h.id);
            assert.ok(ids.includes('at_origin'));
            assert.ok(ids.includes('at_limit'));
            assert.ok(!ids.includes('just_past_limit'));
            assert.ok(!ids.includes('just_upriver'));
        });
    });
});
