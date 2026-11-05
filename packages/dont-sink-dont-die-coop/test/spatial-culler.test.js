import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    createSpatialRiverIndex,
    getBucketIndexForZ,
    getEntityZBounds,
    SPATIAL_CULLER_CONSTANTS,
} from '../shared/spatial-culler.js';

describe('Spatial River Culler — Bucket Indexing & Z-Bounds Math', () => {
    test('constants are frozen and have expected defaults', () => {
        assert.equal(SPATIAL_CULLER_CONSTANTS.DEFAULT_BUCKET_SIZE, 50);
        assert.equal(SPATIAL_CULLER_CONSTANTS.DEFAULT_BACKWARD_MARGIN, 160);
        assert.equal(SPATIAL_CULLER_CONSTANTS.DEFAULT_FORWARD_MARGIN, 55);
        assert.equal(SPATIAL_CULLER_CONSTANTS.COURSE_START_Z, 0);
        assert.equal(SPATIAL_CULLER_CONSTANTS.COURSE_FINISH_Z, -1500);
        assert.throws(() => {
            SPATIAL_CULLER_CONSTANTS.DEFAULT_BUCKET_SIZE = 100;
        });
    });

    test('getBucketIndexForZ maps positive, zero, and negative Z coordinates accurately', () => {
        assert.equal(getBucketIndexForZ(0, 50), 0);
        assert.equal(getBucketIndexForZ(49.9, 50), 0);
        assert.equal(getBucketIndexForZ(50, 50), 1);
        assert.equal(getBucketIndexForZ(125, 50), 2);

        // Negative coordinates (downriver in Don't Sink, Don't Die)
        assert.equal(getBucketIndexForZ(-0.1, 50), -1);
        assert.equal(getBucketIndexForZ(-50, 50), -1);
        assert.equal(getBucketIndexForZ(-50.1, 50), -2);
        assert.equal(getBucketIndexForZ(-100, 50), -2);
        assert.equal(getBucketIndexForZ(-375, 50), -8); // Act I checkpoint
        assert.equal(getBucketIndexForZ(-1500, 50), -30); // finish line
    });

    test('getEntityZBounds resolves minZ/maxZ bounds from point and span entities', () => {
        // Explicit minZ / maxZ
        const b1 = getEntityZBounds({ minZ: -120, maxZ: -80 });
        assert.deepEqual(b1, { minZ: -120, maxZ: -80 });

        // Point entity with z
        const b2 = getEntityZBounds({ z: -250 });
        assert.deepEqual(b2, { minZ: -250, maxZ: -250 });

        // Point entity with position.z and radius
        const b3 = getEntityZBounds({ position: { x: 5, y: 0, z: -300 }, radius: 10 });
        assert.deepEqual(b3, { minZ: -310, maxZ: -290 });

        // Rapids / ramps with length
        const b4 = getEntityZBounds({ z: -500, length: 24 });
        assert.deepEqual(b4, { minZ: -512, maxZ: -488 });

        // Barricade with depth
        const b5 = getEntityZBounds({ z: -700, depth: 4 });
        assert.deepEqual(b5, { minZ: -702, maxZ: -698 });

        // Mine with collisionRadius
        const b6 = getEntityZBounds({ z: -900, collisionRadius: 3.5 });
        assert.deepEqual(b6, { minZ: -903.5, maxZ: -896.5 });
    });

    test('getEntityZBounds throws on invalid inputs', () => {
        assert.throws(() => getEntityZBounds(null), TypeError);
        assert.throws(() => getEntityZBounds({}), Error);
        assert.throws(() => getEntityZBounds('not an object'), TypeError);
    });
});

describe('Spatial River Culler — Insert, Remove, Update & Query', () => {
    test('createSpatialRiverIndex initializes with default 50m bucketSize and zero entities', () => {
        const index = createSpatialRiverIndex();
        assert.equal(index.bucketSize, 50);
        const stats = index.getStats();
        assert.equal(stats.totalEntities, 0);
        assert.equal(stats.activeBucketsCount, 0);
        assert.equal(stats.backwardMargin, 160);
        assert.equal(stats.forwardMargin, 55);
    });

    test('insert places entity into single bucket when bounds are contained', () => {
        const index = createSpatialRiverIndex(50);
        const mine = { id: 'mine_1', z: -120, radius: 2 }; // bounds [-122, -118], bucket -3
        index.insert(mine);

        const stats = index.getStats();
        assert.equal(stats.totalEntities, 1);
        assert.equal(stats.activeBucketsCount, 1);

        const bucketMinus3 = index._buckets.get(-3);
        assert.ok(bucketMinus3);
        assert.ok(bucketMinus3.has(mine));
    });

    test('insert places entity across multiple buckets when entity spans boundaries', () => {
        const index = createSpatialRiverIndex(50);
        // Suspension bridge spanning z = -110 to -40 (spans buckets -3, -2, -1)
        const bridge = { id: 'bridge_1', minZ: -110, maxZ: -40 };
        index.insert(bridge);

        assert.equal(index.getStats().activeBucketsCount, 3);
        assert.ok(index._buckets.get(-3).has(bridge));
        assert.ok(index._buckets.get(-2).has(bridge));
        assert.ok(index._buckets.get(-1).has(bridge));
    });

    test('insert auto-generates ID if entity lacks id property', () => {
        const index = createSpatialRiverIndex(50);
        const obstacle = { z: -80 };
        index.insert(obstacle);

        assert.ok(obstacle._spatialCullerId);
        assert.equal(index.getStats().totalEntities, 1);
    });

    test('queryRange returns entities within range without duplicates', () => {
        const index = createSpatialRiverIndex(50);
        const e1 = { id: 'e1', z: -20 };
        const e2 = { id: 'e2', z: -80 };
        const spanning = { id: 'span', minZ: -120, maxZ: -30 };
        const farAway = { id: 'far', z: -800 };

        index.insert(e1);
        index.insert(e2);
        index.insert(spanning);
        index.insert(farAway);

        const results = index.queryRange(-100, 0);
        const ids = results.map((e) => e.id).sort();

        // Should find e1, e2, spanning, but NOT farAway
        assert.deepEqual(ids, ['e1', 'e2', 'span']);

        // Verify spanning only appears once in results
        const spanCount = results.filter((e) => e.id === 'span').length;
        assert.equal(spanCount, 1);
    });

    test('queryRange respects minZ > maxZ order seamlessly', () => {
        const index = createSpatialRiverIndex(50);
        const item = { id: 'item', z: -150 };
        index.insert(item);

        const res1 = index.queryRange(-200, -100);
        const res2 = index.queryRange(-100, -200);

        assert.equal(res1.length, 1);
        assert.equal(res2.length, 1);
        assert.equal(res1[0].id, 'item');
        assert.equal(res2[0].id, 'item');
    });

    test('remove deletes entity cleanly from all associated buckets and registry', () => {
        const index = createSpatialRiverIndex(50);
        const spanning = { id: 'span', minZ: -110, maxZ: -40 };
        index.insert(spanning);

        assert.equal(index.getStats().totalEntities, 1);
        assert.equal(index.getStats().activeBucketsCount, 3);

        const removed = index.remove('span');
        assert.equal(removed, true);
        assert.equal(index.getStats().totalEntities, 0);
        assert.equal(index.getStats().activeBucketsCount, 0);

        const queryRes = index.queryRange(-150, 0);
        assert.equal(queryRes.length, 0);

        // Removing non-existent returns false
        assert.equal(index.remove('non_existent'), false);
    });

    test('update re-indexes entity when bounds change', () => {
        const index = createSpatialRiverIndex(50);
        const craft = { id: 'craft_1', z: -50 };
        index.insert(craft);

        assert.ok(index._buckets.get(-1).has(craft));

        craft.z = -350; // moved downriver into bucket -7
        index.update(craft);

        assert.equal(index._buckets.get(-1), undefined);
        assert.ok(index._buckets.get(-7).has(craft));

        const res = index.queryRange(-360, -340);
        assert.equal(res.length, 1);
        assert.equal(res[0].id, 'craft_1');
    });

    test('clear resets all internal buckets and entries', () => {
        const index = createSpatialRiverIndex(50);
        index.insert({ id: '1', z: -10 });
        index.insert({ id: '2', z: -20 });
        assert.equal(index.getStats().totalEntities, 2);

        index.clear();
        assert.equal(index.getStats().totalEntities, 0);
        assert.equal(index.getStats().activeBucketsCount, 0);
    });
});

describe('Spatial River Culler — Visibility Window & >80% Work Reduction', () => {
    test('updateVisibilityWindow computes correct [leadZ - 160, leadZ + 55] active window', () => {
        const index = createSpatialRiverIndex(50);

        // Lead raft is at z = -400
        // Window should be [-400 - 160, -400 + 55] = [-560, -345]
        const eBehind = { id: 'behind', z: -300 };     // outside window (> -345)
        const eNearBehind = { id: 'near_b', z: -350 }; // inside window
        const eCenter = { id: 'center', z: -400 };     // inside window
        const eNearAhead = { id: 'near_a', z: -550 };  // inside window
        const eFarAhead = { id: 'ahead', z: -600 };    // outside window (< -560)

        index.insert(eBehind);
        index.insert(eNearBehind);
        index.insert(eCenter);
        index.insert(eNearAhead);
        index.insert(eFarAhead);

        const summary = index.updateVisibilityWindow(-400);

        assert.equal(summary.leadZ, -400);
        assert.equal(summary.windowMinZ, -560);
        assert.equal(summary.windowMaxZ, -345);
        assert.equal(summary.activeCount, 3);
        assert.equal(summary.culledCount, 2);
        assert.equal(summary.totalCount, 5);

        const activeIds = summary.activeEntities.map((e) => e.id).sort();
        assert.deepEqual(activeIds, ['center', 'near_a', 'near_b']);

        // Check visibility property mutates
        assert.equal(eBehind.visible, false);
        assert.equal(eNearBehind.visible, true);
        assert.equal(eCenter.visible, true);
        assert.equal(eNearAhead.visible, true);
        assert.equal(eFarAhead.visible, false);
    });

    test('updateVisibilityWindow toggles Three.js mesh.visible property', () => {
        const index = createSpatialRiverIndex(50);
        const meshIn = { visible: false };
        const meshOut = { visible: true };

        const eActive = { id: 'active', z: -100, mesh: meshIn };
        const eCulled = { id: 'culled', z: -800, mesh: meshOut };

        index.insert(eActive);
        index.insert(eCulled);

        index.updateVisibilityWindow(-100);

        assert.equal(eActive.visible, true);
        assert.equal(meshIn.visible, true);

        assert.equal(eCulled.visible, false);
        assert.equal(meshOut.visible, false);
    });

    test('updateVisibilityWindow invokes onVisibilityChange callback on state transition', () => {
        const index = createSpatialRiverIndex(50);
        const entity = { id: 'mine', z: -200, visible: true };
        index.insert(entity);

        const transitions = [];
        const onVisibilityChange = (ent, isVisible) => {
            transitions.push({ id: ent.id, isVisible });
        };

        // When leadZ = 0, entity at -200 is outside window [-160, 55] -> transitions to false
        index.updateVisibilityWindow(0, { onVisibilityChange });
        assert.equal(transitions.length, 1);
        assert.deepEqual(transitions[0], { id: 'mine', isVisible: false });

        // Calling again at leadZ = 0 without change does not re-invoke
        index.updateVisibilityWindow(0, { onVisibilityChange });
        assert.equal(transitions.length, 1);

        // Moving leadZ down to -200 brings mine into window -> transitions to true
        index.updateVisibilityWindow(-200, { onVisibilityChange });
        assert.equal(transitions.length, 2);
        assert.deepEqual(transitions[1], { id: 'mine', isVisible: true });
    });

    test('achieves >80% reduction in evaluated CPU work across the 1500m river course', () => {
        const index = createSpatialRiverIndex(50);

        // Populate a realistic river course of 1500m (z = 0 down to -1500m)
        // with hazards, destructibles, and scenery placed every 10 meters (150 total entities)
        const totalEntities = 150;
        for (let i = 0; i < totalEntities; i++) {
            const z = -i * 10;
            index.insert({
                id: `hazard_${i}`,
                z,
                radius: 2,
                visible: true,
            });
        }

        assert.equal(index.getStats().totalEntities, totalEntities);

        // Sample lead raft positions along the entire river course (z = 0, -375, -750, -1125, -1500)
        const sampleCheckpoints = [0, -375, -750, -1125, -1500];
        const efficiencies = [];

        for (const leadZ of sampleCheckpoints) {
            const summary = index.updateVisibilityWindow(leadZ);
            efficiencies.push(summary.cullingEfficiency);

            // Per requirement: only evaluate entities within [leadZ - 160, leadZ + 55],
            // reducing per-frame CPU work by >80% (cullingEfficiency > 0.80)
            assert.ok(
                summary.cullingEfficiency > 0.80,
                `Expected culling efficiency > 0.80 at leadZ = ${leadZ}, got ${(summary.cullingEfficiency * 100).toFixed(1)}%`
            );

            // Active count should be approximately 215m span / 10m spacing ≈ 21-23 entities out of 150
            assert.ok(summary.activeCount < 26);
            assert.ok(summary.activeCount > 0);
        }

        const avgEfficiency = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;
        assert.ok(avgEfficiency > 0.84, `Average efficiency across river was ${(avgEfficiency * 100).toFixed(1)}%`);
    });
});
