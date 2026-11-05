import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHEVRON_CONFIG,
    CHEVRON_THREAT_TYPES,
    clamp,
    getRelativeOffset,
    transformToHeadingSpace,
    calculateScreenSpaceAngle,
    computeUrgencyWeight,
    evaluateThreatChevron,
    calculateThreatChevrons,
    formatChevronRenderSpec,
} from '../shared/threat-chevrons.js';

describe('Threat Chevrons — Reticle Threat & Whirlpool Warning Chevrons', () => {

    describe('Constants and Configurations', () => {
        it('exports correct sensory range, reticle circle dimensions, and chevron caps', () => {
            assert.equal(CHEVRON_CONFIG.MAX_RANGE_METERS, 45.0);
            assert.equal(CHEVRON_CONFIG.CENTER_CIRCLE_DIAMETER_PX, 160.0);
            assert.equal(CHEVRON_CONFIG.CENTER_CIRCLE_RADIUS_PX, 80.0);
            assert.equal(CHEVRON_CONFIG.MAX_ACTIVE_CHEVRONS, 4);
        });

        it('defines distinct threat profiles for enemies, fireballs, whirlpools, and waterfalls', () => {
            const types = ['ENEMY', 'FIREBALL', 'WHIRLPOOL', 'WATERFALL'];
            for (const t of types) {
                const p = CHEVRON_THREAT_TYPES[t];
                assert.ok(p, `Missing threat profile for ${t}`);
                assert.ok(typeof p.type === 'string');
                assert.ok(typeof p.color === 'string');
                assert.ok(p.basePriority > 0);
            }
        });
    });

    describe('Pure Coordinate & Angle Transformations', () => {
        it('clamp handles normal numbers, NaN, and boundary values', () => {
            assert.equal(clamp(5, 0, 10), 5);
            assert.equal(clamp(-2, 0, 10), 0);
            assert.equal(clamp(15, 0, 10), 10);
            assert.equal(clamp(NaN, 0, 10), 0);
        });

        it('getRelativeOffset computes dx, dz, and euclidean distance correctly', () => {
            const obs = { x: 10, z: -100 };
            const tgt = { x: 40, z: -60 }; // dx = 30, dz = 40, dist = 50
            const res = getRelativeOffset(obs, tgt);
            assert.equal(res.dx, 30);
            assert.equal(res.dz, 40);
            assert.equal(res.distance, 50);
        });

        it('transformToHeadingSpace transforms offsets relative to player yaw', () => {
            // Yaw = 0 (heading downriver along -z)
            // Target directly ahead at dz = -20
            let t = transformToHeadingSpace(0, -20, 0);
            assert.ok(Math.abs(t.right) < 1e-4);
            assert.ok(Math.abs(t.forward - 20) < 1e-4);

            // Target directly to starboard at dx = +15
            t = transformToHeadingSpace(15, 0, 0);
            assert.ok(Math.abs(t.right - 15) < 1e-4);
            assert.ok(Math.abs(t.forward) < 1e-4);

            // Target behind at dz = +30
            t = transformToHeadingSpace(0, 30, 0);
            assert.ok(Math.abs(t.right) < 1e-4);
            assert.ok(Math.abs(t.forward + 30) < 1e-4);

            // Yaw = PI/2 (turned 90 deg left, heading along -x)
            // Target at dx = -20 (now straight ahead of craft)
            t = transformToHeadingSpace(-20, 0, Math.PI / 2);
            assert.ok(Math.abs(t.right) < 1e-4);
            assert.ok(Math.abs(t.forward - 20) < 1e-4);
        });

        it('calculateScreenSpaceAngle computes 0 for ahead, PI/2 for right, PI for behind, -PI/2 for left', () => {
            // Ahead: dz = -10, yaw = 0 -> angleRad = 0, angleDeg = 0
            const ahead = calculateScreenSpaceAngle(0, -10, 0);
            assert.ok(Math.abs(ahead.angleRad) < 1e-4);
            assert.ok(Math.abs(ahead.angleDeg) < 1e-4);
            assert.ok(Math.abs(ahead.dirX) < 1e-4);
            assert.ok(Math.abs(ahead.dirY - (-1)) < 1e-4); // Screen -Y is up

            // Starboard/Right: dx = 10, yaw = 0 -> angleRad = PI/2, angleDeg = 90
            const right = calculateScreenSpaceAngle(10, 0, 0);
            assert.ok(Math.abs(right.angleRad - Math.PI / 2) < 1e-4);
            assert.ok(Math.abs(right.angleDeg - 90) < 1e-4);
            assert.ok(Math.abs(right.dirX - 1) < 1e-4);
            assert.ok(Math.abs(right.dirY) < 1e-4);

            // Stern/Behind: dz = 10, yaw = 0 -> angleRad = PI or -PI, angleDeg = 180
            const behind = calculateScreenSpaceAngle(0, 10, 0);
            assert.ok(Math.abs(Math.abs(behind.angleRad) - Math.PI) < 1e-4);
            assert.ok(Math.abs(behind.angleDeg - 180) < 1e-4);
            assert.ok(Math.abs(behind.dirX) < 1e-4);
            assert.ok(Math.abs(behind.dirY - 1) < 1e-4);

            // Port/Left: dx = -10, yaw = 0 -> angleRad = -PI/2, angleDeg = 270
            const left = calculateScreenSpaceAngle(-10, 0, 0);
            assert.ok(Math.abs(left.angleRad - (-Math.PI / 2)) < 1e-4);
            assert.ok(Math.abs(left.angleDeg - 270) < 1e-4);
            assert.ok(Math.abs(left.dirX - (-1)) < 1e-4);
            assert.ok(Math.abs(left.dirY) < 1e-4);
        });
    });

    describe('Urgency Weight Computations', () => {
        it('returns 0.0 when distance exceeds 45m max range or is negative/NaN', () => {
            const enemy = { type: 'enemy' };
            assert.equal(computeUrgencyWeight(enemy, 50.0), 0.0);
            assert.equal(computeUrgencyWeight(enemy, 45.1), 0.0);
            assert.equal(computeUrgencyWeight(enemy, -5.0), 0.0);
            assert.equal(computeUrgencyWeight(enemy, NaN), 0.0);
        });

        it('scales linearly with distance for standard enemies', () => {
            const enemy = { type: 'enemy' };
            // At 45m -> factor 0 -> urgency 0
            assert.equal(computeUrgencyWeight(enemy, 45.0), 0.0);
            // At 22.5m (halfway) -> factor 0.5
            const half = computeUrgencyWeight(enemy, 22.5);
            assert.ok(Math.abs(half - 0.5) < 1e-4);
            // At 0m -> factor 1.0
            assert.equal(computeUrgencyWeight(enemy, 0.0), 1.0);
        });

        it('boosts urgency for fireballs approaching raft', () => {
            const fireballFar = { type: 'fireball' };
            const fireballClose = { type: 'fireball', speed: 15 };
            const uFar = computeUrgencyWeight(fireballFar, 30);
            const uClose = computeUrgencyWeight(fireballClose, 10);
            assert.ok(uClose > uFar);
            assert.ok(uClose >= 0.8);
        });

        it('boosts urgency for whirlpools based on vortex radius', () => {
            const wp = { type: 'whirlpool', radius: 15 };
            const uInside = computeUrgencyWeight(wp, 10);
            const uOutside = computeUrgencyWeight(wp, 35);
            assert.ok(uInside > uOutside);
        });

        it('boosts urgency for waterfalls when within 20m', () => {
            const wf = { type: 'waterfall' };
            const uNear = computeUrgencyWeight(wf, 12);
            const uFar = computeUrgencyWeight(wf, 35);
            assert.ok(uNear > uFar);
        });
    });

    describe('evaluateThreatChevron (Single Candidate Evaluation)', () => {
        it('returns null if threat is outside 45m range', () => {
            const raft = { x: 0, z: -100 };
            const threat = { x: 50, z: -100, type: 'enemy' };
            const res = evaluateThreatChevron(raft, threat, 0);
            assert.equal(res, null);
        });

        it('projects threat on 160px diameter (80px radius) center reticle circle', () => {
            const raft = { x: 0, z: -100 };
            // Starboard threat 20m away: dx = 20, dz = 0
            const threat = { id: 'starboard_foe', x: 20, z: -100, type: 'enemy' };
            const res = evaluateThreatChevron(raft, threat, 0);

            assert.ok(res);
            assert.equal(res.id, 'starboard_foe');
            assert.equal(res.type, 'enemy');
            assert.equal(res.distance, 20);
            assert.equal(res.radiusPx, 80);
            // On reticle circle: x = +80, y = 0
            assert.equal(res.reticleX, 80);
            assert.equal(res.reticleY, 0);
            assert.equal(res.isFlank, true);
            assert.equal(res.isBehind, false);
            assert.ok(res.urgency > 0.5);
        });

        it('detects rear threats accurately', () => {
            const raft = { x: 0, z: -100 };
            // Rear threat at dz = -80 (20m upriver/behind)
            const threat = { id: 'rear_wizard', x: 0, z: -80, type: 'enemy' };
            const res = evaluateThreatChevron(raft, threat, 0);

            assert.ok(res);
            assert.equal(res.isBehind, true);
            assert.equal(res.isFlank, false);
            assert.equal(res.reticleX, 0);
            assert.equal(res.reticleY, 80); // Screen +Y is down/behind
        });
    });

    describe('calculateThreatChevrons (Ingestion, Multi-Threat Ranking, Top 4 Selection)', () => {
        it('returns empty array if raft or positions are missing', () => {
            assert.deepEqual(calculateThreatChevrons(null), []);
            assert.deepEqual(calculateThreatChevrons({}), []);
        });

        it('ingests enemies, fireballs, whirlpools, and waterfalls and selects top 4 by urgency', () => {
            const raft = { position: { x: 0, y: 0, z: -200 }, yaw: 0 };
            const hazards = {
                enemies: [
                    { id: 'far_alien', x: 10, z: -160 },   // 41.2m away (low urgency)
                    { id: 'charging_worm', x: -15, z: -205, isCharging: true }, // ~15.8m flank left
                ],
                fireballs: [
                    { id: 'incoming_fireball', x: 5, z: -190, speed: 18 }, // ~11.1m ahead-right (very high urgency)
                ],
                whirlpools: [
                    { id: 'deadly_vortex', x: 8, z: -212, radius: 20 }, // ~14.4m ahead-right
                ],
                waterfalls: [
                    { id: 'cataract_drop', x: 0, z: -215 }, // 15m ahead
                    { id: 'distant_waterfall', x: 0, z: -260 }, // 60m away (out of range > 45m)
                ],
            };

            const chevrons = calculateThreatChevrons(raft, hazards);

            // Distant waterfall > 45m is discarded
            // Total in range: far_alien, charging_worm, incoming_fireball, deadly_vortex, cataract_drop (5 threats)
            // Output must cap at at most 4
            assert.ok(chevrons.length <= 4);
            assert.equal(chevrons.length, 4);

            // Verifies sort order is strictly descending by urgency
            for (let i = 0; i < chevrons.length - 1; i++) {
                assert.ok(chevrons[i].urgency >= chevrons[i + 1].urgency);
            }

            // Every chevron sits on the 160px reticle circle (distance from center = 80px)
            for (const c of chevrons) {
                const distOnCircle = Math.hypot(c.reticleX, c.reticleY);
                assert.ok(Math.abs(distOnCircle - 80) < 0.2, `Expected radius ~80, got ${distOnCircle}`);
            }
        });

        it('merges/deduplicates threats coming from the exact same bearing', () => {
            const raft = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
            const hazards = {
                enemies: [
                    { id: 'foe_front_close', x: 0, z: -10 }, // 10m ahead (angle ~0 rad)
                    { id: 'foe_front_mid', x: 0, z: -25 },   // 25m ahead (angle ~0 rad)
                ],
            };

            const chevrons = calculateThreatChevrons(raft, hazards);
            // Both are straight ahead; deduplication should keep only the most urgent one
            assert.equal(chevrons.length, 1);
            assert.equal(chevrons[0].id, 'foe_front_close');
        });

        it('respects custom reticle radius and max chevron overrides', () => {
            const raft = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
            const hazards = {
                enemies: [
                    { id: 'e1', x: 10, z: 0 },
                    { id: 'e2', x: -10, z: 0 },
                    { id: 'e3', x: 0, z: 10 },
                    { id: 'e4', x: 0, z: -10 },
                ],
            };

            // Limit to max 2 chevrons with 100px radius
            const chevrons = calculateThreatChevrons(raft, hazards, 0, {
                maxChevrons: 2,
                reticleRadiusPx: 100,
            });

            assert.equal(chevrons.length, 2);
            for (const c of chevrons) {
                const dist = Math.hypot(c.reticleX, c.reticleY);
                assert.ok(Math.abs(dist - 100) < 0.2);
            }
        });
    });

    describe('formatChevronRenderSpec (Canvas/SVG Spec Generator)', () => {
        it('returns null on falsy chevron', () => {
            assert.equal(formatChevronRenderSpec(null), null);
        });

        it('produces valid SVG path, opacity, scale, and rotationDeg', () => {
            const chevron = {
                id: 'test_c',
                type: 'fireball',
                angleDeg: 45.0,
                urgency: 0.9,
            };

            const spec = formatChevronRenderSpec(chevron, 1000);
            assert.ok(spec.render);
            assert.ok(typeof spec.render.svgPath === 'string');
            assert.ok(spec.render.opacity >= 0.4 && spec.render.opacity <= 1.0);
            assert.ok(spec.render.scale >= 0.8 && spec.render.scale <= 1.3);
            assert.equal(spec.render.rotationDeg, 45.0);
        });
    });

    describe('Edge Cases & Sovereign QA Invariants', () => {
        it('handles 0m distance without NaN or division by zero', () => {
            const raft = { position: { x: 10, y: 0, z: -50 } };
            const threat = { x: 10, z: -50, type: 'whirlpool' };
            const evaluated = evaluateThreatChevron(raft.position, threat, 0);

            assert.ok(evaluated);
            assert.equal(Number.isNaN(evaluated.reticleX), false);
            assert.equal(Number.isNaN(evaluated.reticleY), false);
            assert.equal(Number.isNaN(evaluated.urgency), false);
            assert.equal(evaluated.urgency, 1.0);
        });

        it('handles missing or malformed inputs without crashing', () => {
            assert.doesNotThrow(() => {
                evaluateThreatChevron(null, null);
                calculateThreatChevrons({ position: {} }, { enemies: [null, undefined, {}] });
            });
        });
    });

});
