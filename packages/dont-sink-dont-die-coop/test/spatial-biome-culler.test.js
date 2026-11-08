import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ACT_Z_BOUNDS,
    CULLER_DEFAULTS,
    extractZ,
    isWithinRenderHorizon,
    intervalsIntersect,
    resolveActBounds,
    cullSceneByRaftZ,
} from '../shared/spatial-biome-culler.js';

describe('Helmet 06 Horizon Z-Band Spatial Scene Culler', () => {
    describe('1. ACT_Z_BOUNDS Definitions', () => {
        it('exports frozen ACT_Z_BOUNDS for Act I to Act IV', () => {
            assert.ok(Object.isFrozen(ACT_Z_BOUNDS));
            assert.deepEqual(ACT_Z_BOUNDS.ACT_1, { minZ: -390, maxZ: 0, startZ: 0, endZ: -390 });
            assert.deepEqual(ACT_Z_BOUNDS.ACT_2, { minZ: -740, maxZ: -130, startZ: -130, endZ: -740 });
            assert.deepEqual(ACT_Z_BOUNDS.ACT_3, { minZ: -1160, maxZ: -680, startZ: -680, endZ: -1160 });
            assert.deepEqual(ACT_Z_BOUNDS.ACT_4, { minZ: -1650, maxZ: -1100, startZ: -1100, endZ: -1650 });
        });

        it('supports Roman numeral, numeric, and lowercase aliases', () => {
            assert.equal(resolveActBounds(1), ACT_Z_BOUNDS.ACT_1);
            assert.equal(resolveActBounds('act1'), ACT_Z_BOUNDS.ACT_1);
            assert.equal(resolveActBounds('ACT_I'), ACT_Z_BOUNDS.ACT_1);
            assert.equal(resolveActBounds('i'), ACT_Z_BOUNDS.ACT_1);

            assert.equal(resolveActBounds(2), ACT_Z_BOUNDS.ACT_2);
            assert.equal(resolveActBounds('act2'), ACT_Z_BOUNDS.ACT_2);
            assert.equal(resolveActBounds('ACT_II'), ACT_Z_BOUNDS.ACT_2);

            assert.equal(resolveActBounds(3), ACT_Z_BOUNDS.ACT_3);
            assert.equal(resolveActBounds('act3'), ACT_Z_BOUNDS.ACT_3);
            assert.equal(resolveActBounds('ACT_III'), ACT_Z_BOUNDS.ACT_3);

            assert.equal(resolveActBounds(4), ACT_Z_BOUNDS.ACT_4);
            assert.equal(resolveActBounds('act4'), ACT_Z_BOUNDS.ACT_4);
            assert.equal(resolveActBounds('ACT_IV'), ACT_Z_BOUNDS.ACT_4);
        });
    });

    describe('2. isWithinRenderHorizon & extractZ', () => {
        it('extracts z from numbers, entity.z, entity.position.z, and entity.mesh.position.z', () => {
            assert.equal(extractZ(-50), -50);
            assert.equal(extractZ({ z: -120 }), -120);
            assert.equal(extractZ({ position: { z: -250 } }), -250);
            assert.equal(extractZ({ mesh: { position: { z: -380 } } }), -380);
            assert.equal(extractZ(null), null);
            assert.equal(extractZ(undefined), null);
            assert.equal(extractZ({}), null);
            assert.equal(extractZ('invalid'), null);
        });

        it('evaluates horizon window [raftZ - aheadRange, raftZ + behindRange]', () => {
            // Default ahead = 260 (downriver: -Z), behind = 90 (upriver: +Z)
            // raftZ = 0 => window [-260, 90]
            assert.equal(isWithinRenderHorizon(0, 0), true);
            assert.equal(isWithinRenderHorizon(-100, 0), true);
            assert.equal(isWithinRenderHorizon(-260, 0), true); // exactly on ahead horizon
            assert.equal(isWithinRenderHorizon(90, 0), true);   // exactly on behind horizon
            assert.equal(isWithinRenderHorizon(-260.1, 0), false); // beyond ahead horizon
            assert.equal(isWithinRenderHorizon(90.1, 0), false);  // beyond behind horizon

            // raftZ = -500 => window [-760, -410]
            assert.equal(isWithinRenderHorizon(-500, -500), true);
            assert.equal(isWithinRenderHorizon(-760, -500), true);
            assert.equal(isWithinRenderHorizon(-410, -500), true);
            assert.equal(isWithinRenderHorizon(-761, -500), false);
            assert.equal(isWithinRenderHorizon(-409, -500), false);
        });

        it('supports custom aheadRange and behindRange parameters', () => {
            // raftZ = -100, ahead = 300, behind = 50 => window [-400, -50]
            assert.equal(isWithinRenderHorizon(-350, -100, 300, 50), true);
            assert.equal(isWithinRenderHorizon(-401, -100, 300, 50), false);
            assert.equal(isWithinRenderHorizon(-49, -100, 300, 50), false);
        });

        it('handles non-numeric or invalid inputs cleanly returning false', () => {
            assert.equal(isWithinRenderHorizon(null, 0), false);
            assert.equal(isWithinRenderHorizon(NaN, 0), false);
            assert.equal(isWithinRenderHorizon(100, NaN), false);
            assert.equal(isWithinRenderHorizon({}, 0), false);
        });
    });

    describe('3. intervalsIntersect', () => {
        it('detects overlapping intervals properly', () => {
            assert.equal(intervalsIntersect(-390, 0, -260, 90), true); // Act I with window at z=0
            assert.equal(intervalsIntersect(-740, -130, -260, 90), true); // Act II with window at z=0
            assert.equal(intervalsIntersect(-1160, -680, -260, 90), false); // Act III with window at z=0
            assert.equal(intervalsIntersect(-1650, -1100, -260, 90), false); // Act IV with window at z=0
        });
    });

    describe('4. cullSceneByRaftZ functionality', () => {
        it('toggles Act 1-4 architectural group visibility based on horizon window', () => {
            const actGroups = {
                act1: { visible: false },
                act2: { visible: false },
                act3: { visible: false },
                act4: { visible: false },
            };

            // At river start (raftZ = 0), window is [-260, 90]
            // Act 1 (-390..0) and Act 2 (-740..-130) intersect window
            // Act 3 (-1160..-680) and Act 4 (-1650..-1100) are far downriver
            const res0 = cullSceneByRaftZ({ raftZ: 0, actGroups });
            assert.equal(actGroups.act1.visible, true);
            assert.equal(actGroups.act2.visible, true);
            assert.equal(actGroups.act3.visible, false);
            assert.equal(actGroups.act4.visible, false);
            assert.equal(res0.acts.visible, 2);
            assert.equal(res0.acts.culled, 2);

            // Deep in Act 4 (raftZ = -1400), window is [-1660, -1310]
            // Only Act 4 (-1650..-1100) intersects window
            const resEnd = cullSceneByRaftZ({ raftZ: -1400, actGroups });
            assert.equal(actGroups.act1.visible, false);
            assert.equal(actGroups.act2.visible, false);
            assert.equal(actGroups.act3.visible, false);
            assert.equal(actGroups.act4.visible, true);
            assert.equal(resEnd.acts.visible, 1);
            assert.equal(resEnd.acts.culled, 3);
        });

        it('works with actGroups supplied as an Array', () => {
            const actGroups = [
                { visible: false }, // Act 1
                { visible: false }, // Act 2
                { visible: false }, // Act 3
                { visible: false }, // Act 4
            ];

            cullSceneByRaftZ({ raftZ: -900, actGroups });
            // At raftZ = -900, window is [-1160, -810]
            // Act 1 (-390..0) => false
            // Act 2 (-740..-130) => false
            // Act 3 (-1160..-680) => true
            // Act 4 (-1650..-1100) => true (intersects at -1100..-1160)
            assert.equal(actGroups[0].visible, false);
            assert.equal(actGroups[1].visible, false);
            assert.equal(actGroups[2].visible, true);
            assert.equal(actGroups[3].visible, true);
        });

        it('toggles visibility on individual obstacles and obstacle meshes', () => {
            const obstacles = [
                { id: 'near_spawn', z: -10, mesh: { visible: false } },
                { id: 'mid_act1', z: -200, mesh: { visible: false } },
                { id: 'start_act2', z: -350, mesh: { visible: false } },
                { id: 'deep_act3', z: -800, mesh: { visible: true } },
                { id: 'end_act4', z: -1500, mesh: { visible: true } },
            ];

            const res = cullSceneByRaftZ({ raftZ: 0, obstacles });
            // Window [-260, 90]
            assert.equal(obstacles[0].visible, true);
            assert.equal(obstacles[0].mesh.visible, true);

            assert.equal(obstacles[1].visible, true);
            assert.equal(obstacles[1].mesh.visible, true);

            assert.equal(obstacles[2].visible, false);
            assert.equal(obstacles[2].mesh.visible, false);

            assert.equal(obstacles[3].visible, false);
            assert.equal(obstacles[3].mesh.visible, false);

            assert.equal(obstacles[4].visible, false);
            assert.equal(obstacles[4].mesh.visible, false);

            assert.equal(res.obstacles.visible, 2);
            assert.equal(res.obstacles.culled, 3);
        });

        it('culls shoreline and biome prop group children properly', () => {
            const shorelineGroup = {
                children: [
                    { position: { z: -30 }, visible: true },
                    { position: { z: -120 }, visible: true },
                    { position: { z: -500 }, visible: true },
                ],
            };

            const biomePropsGroup = {
                children: [
                    { z: -80, visible: true },
                    { z: -220, visible: true },
                    { z: -900, visible: true },
                ],
            };

            const res = cullSceneByRaftZ({
                raftZ: -50,
                shorelineGroup,
                biomePropsGroup,
            });

            // Window: [-50 - 260, -50 + 90] = [-310, 40]
            // Shoreline:
            // -30 => visible
            // -120 => visible
            // -500 => culled
            assert.equal(shorelineGroup.children[0].visible, true);
            assert.equal(shorelineGroup.children[1].visible, true);
            assert.equal(shorelineGroup.children[2].visible, false);
            assert.equal(res.shoreline.visible, 2);
            assert.equal(res.shoreline.culled, 1);

            // Biome props:
            // -80 => visible
            // -220 => visible
            // -900 => culled
            assert.equal(biomePropsGroup.children[0].visible, true);
            assert.equal(biomePropsGroup.children[1].visible, true);
            assert.equal(biomePropsGroup.children[2].visible, false);
            assert.equal(res.biomeProps.visible, 2);
            assert.equal(res.biomeProps.culled, 1);
        });
    });

    describe('5. High Scale Test: ~7,600 Meshes drop to < 2,200 Active Meshes', () => {
        it('reduces ~7,600 scene meshes to < 2,200 across all points of the 1650m river', () => {
            // Generate realistic representation of ~7,600 scene objects across 0 to -1650m
            // 1. 2,000 river obstacles (planks, islands, destructibles, rocks, buoys)
            const obstacles = [];
            for (let i = 0; i < 2000; i++) {
                const z = -(i / 2000) * 1650;
                obstacles.push({
                    id: `obs_${i}`,
                    z,
                    mesh: { visible: true, position: { z } },
                });
            }

            // 2. 3,600 shoreline landmarks & trees
            const shorelineChildren = [];
            for (let i = 0; i < 3600; i++) {
                const z = -(i / 3600) * 1650;
                shorelineChildren.push({
                    name: `shoreline_${i}`,
                    position: { z },
                    visible: true,
                });
            }
            const shorelineGroup = { children: shorelineChildren };

            // 3. 2,000 miscellaneous biome props (crystals, lanterns, foliage, rubble)
            const biomePropsChildren = [];
            for (let i = 0; i < 2000; i++) {
                const z = -(i / 2000) * 1650;
                biomePropsChildren.push({
                    name: `prop_${i}`,
                    position: { z },
                    visible: true,
                });
            }
            const biomePropsGroup = { children: biomePropsChildren };

            const totalMeshes = obstacles.length + shorelineChildren.length + biomePropsChildren.length;
            assert.equal(totalMeshes, 7600);

            // Test across 10 sample positions down the river
            const testPositions = [0, -100, -250, -400, -600, -800, -1000, -1250, -1450, -1600];

            for (const raftZ of testPositions) {
                const result = cullSceneByRaftZ({
                    raftZ,
                    obstacles,
                    shorelineGroup,
                    biomePropsGroup,
                });

                assert.equal(result.totalEvaluatedMeshes, 7600);
                // Requirement: Total active meshes drop from ~7,600 to < 2,200 at any point on the river
                assert.ok(
                    result.totalVisibleMeshes < 2200,
                    `Expected < 2200 visible meshes at raftZ=${raftZ}, got ${result.totalVisibleMeshes}`
                );

                // Near-camera objects (within [raftZ - 20, raftZ + 20]) must be 100% visible
                const nearObstacles = obstacles.filter((o) => o.z <= raftZ + 20 && o.z >= raftZ - 20);
                for (const o of nearObstacles) {
                    assert.equal(o.visible, true, `Near-camera obstacle at z=${o.z} should be visible at raftZ=${raftZ}`);
                }

                // Culling efficiency should be > 70%
                assert.ok(result.cullingEfficiency > 0.70, `Efficiency should be > 70%, got ${result.cullingEfficiency}`);
            }
        });
    });
});
