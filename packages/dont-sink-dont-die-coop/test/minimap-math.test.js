import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    RADAR_CONFIG,
    projectRiverProgress,
    riverProgressToPixel,
    projectToVerticalMap,
    getRelativeVector,
    transformToRadarCoords,
    projectToRadar,
    calculateOffscreenArrow,
    THREAT_PROFILES,
    getThreatProfile,
    calculateChargingVector,
    calculateBossHealthPhases,
    getLandmarksInView,
} from '../shared/minimap-math.js';

describe('minimap & radar configuration constants', () => {
    it('defines sensible default radar config values', () => {
        assert.equal(typeof RADAR_CONFIG.defaultRadarRadius, 'number');
        assert.ok(RADAR_CONFIG.defaultRadarRadius > 0);
        assert.ok(RADAR_CONFIG.maxOffscreenIndicatorDist > RADAR_CONFIG.defaultRadarRadius);
        assert.ok(RADAR_CONFIG.radarUiRadius > 0);
        assert.equal(RADAR_CONFIG.channelHalfWidth, 15);
        assert.equal(RADAR_CONFIG.finishZ, -1500);
        assert.equal(RADAR_CONFIG.checkpoints.length, 8);
    });

    it('contains valid shop zone coordinates', () => {
        assert.equal(RADAR_CONFIG.shopZone.minX, 10);
        assert.equal(RADAR_CONFIG.shopZone.minZ, -250);
        assert.equal(RADAR_CONFIG.shopZone.maxZ, -150);
    });
});

describe('river progress normalization (projectRiverProgress & riverProgressToPixel)', () => {
    it('projects start (z = 0) to 0.0', () => {
        assert.equal(projectRiverProgress(0, -1500), 0.0);
    });

    it('projects halfway (z = -750) to 0.5', () => {
        assert.equal(projectRiverProgress(-750, -1500), 0.5);
    });

    it('projects finish (z = -1500) to 1.0', () => {
        assert.equal(projectRiverProgress(-1500, -1500), 1.0);
    });

    it('clamps positive z (behind start) to 0.0 when clamped', () => {
        assert.equal(projectRiverProgress(50, -1500, true), 0.0);
    });

    it('allows negative progress when clampToFinish is false', () => {
        assert.equal(projectRiverProgress(150, -1500, false), -0.1);
    });

    it('clamps beyond finish (z = -2000) to 1.0 when clamped', () => {
        assert.equal(projectRiverProgress(-2000, -1500, true), 1.0);
    });

    it('allows progress > 1.0 when clampToFinish is false for endless mode', () => {
        assert.equal(projectRiverProgress(-3000, -1500, false), 2.0);
    });

    it('converts river progress to pixel on inverted vertical map (bottom to top)', () => {
        const height = 300;
        // At progress 0 (start), inverted y is at bottom (height = 300)
        assert.equal(riverProgressToPixel(0.0, height, true), 300);
        // At progress 1 (finish), inverted y is at top (0)
        assert.equal(riverProgressToPixel(1.0, height, true), 0);
        // Halfway
        assert.equal(riverProgressToPixel(0.5, height, true), 150);
    });

    it('converts river progress to pixel on standard vertical map (top to bottom)', () => {
        const height = 400;
        assert.equal(riverProgressToPixel(0.0, height, false), 0);
        assert.equal(riverProgressToPixel(1.0, height, false), 400);
        assert.equal(riverProgressToPixel(0.25, height, false), 100);
    });
});

describe('vertical canyon progress map projection (projectToVerticalMap)', () => {
    it('projects center river at halfway point correctly', () => {
        const res = projectToVerticalMap({ x: 0, z: -750 }, 60, 300);
        // x is center (0 in [-15, 15] is 0.5 ratio -> 30px)
        assert.equal(res.x, 30);
        // z = -750 is 0.5 progress -> inverted y is 150px
        assert.equal(res.y, 150);
        assert.equal(res.progress, 0.5);
        assert.equal(res.isWithinBounds, true);
    });

    it('projects left and right river banks within bounds', () => {
        const left = projectToVerticalMap({ x: -15, z: 0 }, 100, 500);
        assert.equal(left.x, 0);
        assert.equal(left.y, 500);

        const right = projectToVerticalMap({ x: 15, z: -1500 }, 100, 500);
        assert.equal(right.x, 100);
        assert.equal(right.y, 0);
    });

    it('flags out of bounds when raft goes past canyon walls', () => {
        const res = projectToVerticalMap({ x: 25, z: -200 }, 60, 300);
        assert.equal(res.isWithinBounds, false);
    });
});

describe('relative displacement & radar coordinates (getRelativeVector & transformToRadarCoords)', () => {
    it('computes relative displacement and distance correctly', () => {
        const player = { x: 0, z: -200 };
        const target = { x: 30, z: -160 };
        const rel = getRelativeVector(player, target);
        assert.equal(rel.dx, 30);
        assert.equal(rel.dz, 40);
        assert.equal(rel.distance, 50);
    });

    it('transforms world offset when player yaw is 0 (facing downriver along -z)', () => {
        // Yaw 0: forward is -z, right is +x
        // Threat at dx = 10 (east), dz = -20 (ahead/downriver)
        const coords = transformToRadarCoords(10, -20, 0);
        assert.equal(Math.round(coords.x), 10); // right
        assert.equal(Math.round(coords.y), 20); // ahead
    });

    it('threat behind player has negative y in radar coordinates', () => {
        // Yaw 0: threat at dz = +30 (upriver/behind)
        const coords = transformToRadarCoords(0, 30, 0);
        assert.equal(Math.round(coords.x), 0);
        assert.equal(Math.round(coords.y), -30);
    });

    it('rotates radar coordinates when player turns left (yaw = PI/2)', () => {
        // Player yaw = PI/2 (turned 90 deg left, now pointing along -x)
        // Threat at dx = -20 (straight ahead of player heading)
        const coords = transformToRadarCoords(-20, 0, Math.PI / 2);
        assert.ok(Math.abs(coords.x) < 1e-4);
        assert.ok(Math.abs(coords.y - 20) < 1e-4);
    });

    it('rotates radar coordinates when player turns 180 degrees (yaw = PI)', () => {
        // Player yaw = PI (facing upriver along +z)
        // Threat at dz = +40 (ahead in front of player)
        const coords = transformToRadarCoords(0, 40, Math.PI);
        assert.ok(Math.abs(coords.x) < 1e-4);
        assert.ok(Math.abs(coords.y - 40) < 1e-4);
    });
});

describe('radar screen projection (projectToRadar)', () => {
    it('maps an in-range threat ahead of the raft to upper radar quadrant', () => {
        const player = { x: 0, z: -100 };
        const threat = { x: 0, z: -150 }; // 50m ahead
        const proj = projectToRadar(player, threat, 0, { worldRadarRadius: 100, uiRadius: 80 });

        assert.equal(proj.worldDistance, 50);
        assert.equal(proj.normalizedDist, 0.5);
        assert.equal(proj.isInside, true);
        assert.equal(Math.round(proj.x), 0);
        // Ahead is screen -Y
        assert.equal(Math.round(proj.y), -40);
        // Angle 0 rad = straight ahead (up on screen)
        assert.ok(Math.abs(proj.angle) < 1e-4);
    });

    it('maps a rear threat behind raft to lower radar quadrant', () => {
        const player = { x: 0, z: -100 };
        const threat = { x: 0, z: -50 }; // 50m behind (+z)
        const proj = projectToRadar(player, threat, 0, { worldRadarRadius: 100, uiRadius: 80 });

        assert.equal(proj.worldDistance, 50);
        assert.equal(proj.isInside, true);
        assert.equal(Math.round(proj.x), 0);
        // Behind is screen +Y
        assert.equal(Math.round(proj.y), 40);
        // Angle PI or -PI
        assert.ok(Math.abs(Math.abs(proj.angle) - Math.PI) < 1e-4);
    });

    it('identifies threats outside radar circle', () => {
        const player = { x: 0, z: -100 };
        const threat = { x: 80, z: -100 }; // 80m right (radius = 50m)
        const proj = projectToRadar(player, threat, 0, { worldRadarRadius: 50, uiRadius: 80 });

        assert.equal(proj.worldDistance, 80);
        assert.equal(proj.isInside, false);
        assert.equal(proj.normalizedDist, 1.6);
        assert.ok(proj.x > 80); // Scaled beyond UI radius
    });
});

describe('off-screen threat indicators (calculateOffscreenArrow)', () => {
    it('calculates off-screen arrow clamped to radar perimeter for rear threat', () => {
        const player = { x: 0, z: -300 };
        const threat = { x: 0, z: -120 }; // 180m behind (radius = 100m)
        const arrow = calculateOffscreenArrow(player, threat, 0, {
            worldRadarRadius: 100,
            maxDetectionDist: 250,
            uiRadius: 80,
            rimPadding: 5,
        });

        assert.equal(arrow.isOffscreen, true);
        assert.equal(arrow.isBehind, true);
        assert.equal(arrow.inDetectionRange, true);
        assert.equal(arrow.distance, 180);
        // Perimeter clamped: radius = 75px, pointing straight down (+y)
        assert.ok(Math.abs(arrow.edgeX) < 1e-4);
        assert.ok(Math.abs(arrow.edgeY - 75) < 1e-4);
        // Fade ratio: excess = 80, threatRange = 150 -> fadeRatio = 1 - 80/150 ≈ 0.466
        assert.ok(arrow.fadeRatio > 0.4 && arrow.fadeRatio < 0.5);
    });

    it('detects off-screen threat to the starboard (right)', () => {
        const player = { x: 0, z: -500 };
        const threat = { x: 150, z: -500 }; // 150m to the right
        const arrow = calculateOffscreenArrow(player, threat, 0, {
            worldRadarRadius: 100,
            uiRadius: 80,
            rimPadding: 0,
        });

        assert.equal(arrow.isOffscreen, true);
        assert.equal(arrow.isBehind, false); // Exactly to the side (cos(angle) == 0)
        assert.ok(Math.abs(arrow.edgeX - 80) < 1e-4);
        assert.ok(Math.abs(arrow.edgeY) < 1e-4);
    });

    it('flags threats beyond max detection range', () => {
        const player = { x: 0, z: -100 };
        const threat = { x: 0, z: 250 }; // 350m away (> 250m max)
        const arrow = calculateOffscreenArrow(player, threat, 0, {
            worldRadarRadius: 100,
            maxDetectionDist: 250,
        });

        assert.equal(arrow.inDetectionRange, false);
        assert.equal(arrow.fadeRatio, 0);
    });
});

describe('threat profiles and classifications', () => {
    it('defines distinct profiles for all enemy types', () => {
        const expected = ['whiteGuy', 'mudAlien', 'longWorm', 'kraken', 'police'];
        for (const type of expected) {
            const profile = getThreatProfile(type);
            assert.ok(profile);
            assert.equal(profile.id, type);
            assert.equal(typeof profile.name, 'string');
            assert.equal(typeof profile.color, 'string');
            assert.ok(profile.priority > 0);
        }
    });

    it('marks River Wizard, Mud Alien, and Long Worm as rear threats', () => {
        assert.equal(getThreatProfile('whiteGuy').isRearThreat, true);
        assert.equal(getThreatProfile('mudAlien').isRearThreat, true);
        assert.equal(getThreatProfile('longWorm').isRearThreat, true);
        assert.equal(getThreatProfile('kraken').isRearThreat, false);
    });

    it('falls back gracefully to default profile for unknown threats', () => {
        const def = getThreatProfile('unknownMonster');
        assert.equal(def.id, 'unknown');
        assert.equal(typeof def.color, 'string');
    });
});

describe('charging vector strike calculations (calculateChargingVector)', () => {
    it('returns null when no strike target is provided', () => {
        const res = calculateChargingVector({ x: 0, z: 0 }, { x: 0, z: 50 }, null);
        assert.equal(res, null);
    });

    it('calculates 2D radar vector line for charging worm', () => {
        const player = { x: 0, z: -200 };
        const worm = { x: -10, z: -150 }; // 50m behind and 10m left
        const strikeTarget = { x: 0, z: -205 }; // Striking towards player
        const vec = calculateChargingVector(player, worm, strikeTarget, 0, {
            worldRadarRadius: 100,
            uiRadius: 80,
        });

        assert.ok(vec);
        assert.ok(vec.strikeDist > 50);
        assert.equal(vec.startInside, true);
        assert.equal(vec.endInside, true);
        assert.ok(Number.isFinite(vec.startX));
        assert.ok(Number.isFinite(vec.startY));
        assert.ok(Number.isFinite(vec.endX));
        assert.ok(Number.isFinite(vec.endY));
    });
});

describe('boss health bar phases (calculateBossHealthPhases)', () => {
    it('computes 3-phase full health state correctly', () => {
        const boss = calculateBossHealthPhases(300, 300, { phases: 3 });
        assert.equal(boss.health, 300);
        assert.equal(boss.maxHealth, 300);
        assert.equal(boss.healthRatio, 1.0);
        assert.equal(boss.healthPercent, 100);
        assert.equal(boss.currentPhase, 1);
        assert.deepEqual(boss.dividers, [1 / 3, 2 / 3]);
        assert.deepEqual(boss.segmentFills, [1, 1, 1]);
        assert.equal(boss.isEnraged, false);
        assert.equal(boss.isDefeated, false);
    });

    it('computes phase 2 transitions accurately', () => {
        // 150 / 300 = 50% health (middle of phase 2)
        const boss = calculateBossHealthPhases(150, 300, { phases: 3 });
        assert.equal(boss.healthRatio, 0.5);
        assert.equal(boss.currentPhase, 2);
        // Phase 1 is [0, 1/3] -> full (1)
        // Phase 2 is [1/3, 2/3] -> halfway ((0.5 - 0.333) / 0.333 ≈ 0.5)
        // Phase 3 is [2/3, 1] -> empty (0)
        assert.equal(boss.segmentFills[0], 1);
        assert.ok(Math.abs(boss.segmentFills[1] - 0.5) < 1e-4);
        assert.equal(boss.segmentFills[2], 0);
        assert.equal(boss.isEnraged, false);
    });

    it('detects enrage state when health falls below threshold', () => {
        // 60 / 300 = 20% (< 25% default enrage threshold)
        const boss = calculateBossHealthPhases(60, 300, { phases: 3, enrageThreshold: 0.25 });
        assert.equal(boss.currentPhase, 3);
        assert.equal(boss.isEnraged, true);
        assert.equal(boss.isDefeated, false);
    });

    it('handles zero and negative health (boss defeated)', () => {
        const boss = calculateBossHealthPhases(0, 300, { phases: 3 });
        assert.equal(boss.health, 0);
        assert.equal(boss.healthRatio, 0);
        assert.equal(boss.isDefeated, true);
        assert.deepEqual(boss.segmentFills, [0, 0, 0]);
    });
});

describe('landmarks in view (getLandmarksInView)', () => {
    it('returns upcoming checkpoints within view distance', () => {
        const playerZ = -100;
        const view = getLandmarksInView(playerZ, 300);

        // Checkpoints at -150, -300 are within 300m of -100
        assert.ok(view.checkpoints.length >= 2);
        const cp1 = view.checkpoints.find((c) => c.z === -150);
        assert.ok(cp1);
        assert.equal(cp1.passed, false);
        assert.equal(cp1.distance, -50); // 50m ahead
    });

    it('identifies shop zone status when inside or approaching', () => {
        // Approaching shop (player at -100, shop zone maxZ is -150)
        const approaching = getLandmarksInView(-100, 200);
        assert.equal(approaching.shop.inZone, false);
        assert.equal(approaching.shop.approaching, true);

        // Inside shop (player at -200)
        const inside = getLandmarksInView(-200, 200);
        assert.equal(inside.shop.inZone, true);
    });

    it('detects proximity to finish line', () => {
        const near = getLandmarksInView(-1400, 200);
        assert.equal(near.finish.near, true);
        assert.equal(near.finish.distance, -100);

        const far = getLandmarksInView(-500, 200);
        assert.equal(far.finish.near, false);
    });
});
