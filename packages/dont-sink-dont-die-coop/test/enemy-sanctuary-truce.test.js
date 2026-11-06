import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_SAFE_HEIGHT,
    DEFAULT_HARBOR_BOUNDS,
    DEFAULT_LEASH_RANGES,
    SANCTUARY_REPULSION_CONFIG,
    isPointInBounds,
    isPointInHarbor,
    isPointInPlatform,
    isPointInSanctuary,
    distXZ,
    shouldEnemyIgnoreTarget,
    computeSanctuaryRepulsionVector,
} from '../shared/enemy-sanctuary-truce.js';

describe('Enemy Aggro Leash, Sanctuary Repulsion & Harbor Truce Controller', () => {

    describe('Geometry & Bounds Helpers', () => {
        it('isPointInBounds correctly checks 2D and 3D containment', () => {
            const box = { minX: 10, maxX: 30, minZ: -100, maxZ: -50 };
            assert.equal(isPointInBounds({ x: 20, z: -75 }, box), true);
            assert.equal(isPointInBounds({ x: 5, z: -75 }, box), false);
            assert.equal(isPointInBounds({ x: 20, z: -40 }, box), false);

            const box3D = { minX: 0, maxX: 10, minY: 0, maxY: 5, minZ: 0, maxZ: 10 };
            assert.equal(isPointInBounds({ x: 5, y: 3, z: 5 }, box3D), true);
            assert.equal(isPointInBounds({ x: 5, y: 7, z: 5 }, box3D), false);
            assert.equal(isPointInBounds(null, box), false);
            assert.equal(isPointInBounds({ x: 0, z: 0 }, null), false);
        });

        it('isPointInHarbor identifies points inside Harbor City dock basin', () => {
            // Default Harbor bounds: minX: 10, maxX: 35, minZ: -270, maxZ: -140
            assert.equal(isPointInHarbor({ x: 20, z: -200 }), true);
            assert.equal(isPointInHarbor({ x: 0, z: -200 }), false); // Main river channel
            assert.equal(isPointInHarbor({ x: 20, z: -50 }), false); // Upriver
            assert.equal(isPointInHarbor(null), false);
        });

        it('isPointInPlatform supports dimensions, half-extents, circular radius, and direct bounds', () => {
            // Center + dimensions
            const p1 = { x: 0, z: -300, width: 20, length: 20 };
            assert.equal(isPointInPlatform({ x: 5, z: -305 }, p1), true);
            assert.equal(isPointInPlatform({ x: 15, z: -300 }, p1), false);
            // Margin buffer expansion
            assert.equal(isPointInPlatform({ x: 12, z: -300 }, p1, 4), true);

            // Radius
            const p2 = { x: 10, z: -400, radius: 10 };
            assert.equal(isPointInPlatform({ x: 15, z: -400 }, p2), true);
            assert.equal(isPointInPlatform({ x: 25, z: -400 }, p2), false);

            // Direct bounds
            const p3 = { minX: -10, maxX: 10, minZ: -600, maxZ: -580 };
            assert.equal(isPointInPlatform({ x: 0, z: -590 }, p3), true);
            assert.equal(isPointInPlatform({ x: 12, z: -590 }, p3), false);

            assert.equal(isPointInPlatform(null, p1), false);
            assert.equal(isPointInPlatform({ x: 0, z: 0 }, null), false);
        });

        it('isPointInSanctuary handles arrays and object dictionaries of platforms', () => {
            const platforms = [
                { x: 0, z: -100, width: 10, length: 10 },
                { x: -5, z: -500, radius: 8 },
            ];
            assert.equal(isPointInSanctuary({ x: 1, z: -102 }, platforms), true);
            assert.equal(isPointInSanctuary({ x: -5, z: -498 }, platforms), true);
            assert.equal(isPointInSanctuary({ x: 20, z: -200 }, platforms), false);
            assert.equal(isPointInSanctuary(null, platforms), false);
            assert.equal(isPointInSanctuary({ x: 0, z: -100 }, null), false);
        });

        it('distXZ calculates horizontal distance accurately', () => {
            assert.equal(distXZ({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
            assert.equal(distXZ(null, { x: 0, z: 0 }), Infinity);
        });
    });

    describe('Aggro Leash & Truce Evaluation (shouldEnemyIgnoreTarget)', () => {
        const defaultEnemy = { type: 'whiteGuy', position: { x: 0, y: 0.5, z: -50 } };
        const defaultPlayer = { id: 'p1', health: 100, isDead: false, position: { x: 0, y: 0.25, z: -60 } };

        it('ignores null, dead, or zero-health targets', () => {
            assert.equal(shouldEnemyIgnoreTarget(defaultEnemy, null), true);
            assert.equal(shouldEnemyIgnoreTarget(defaultEnemy, { ...defaultPlayer, isDead: true }), true);
            assert.equal(shouldEnemyIgnoreTarget(defaultEnemy, { ...defaultPlayer, health: 0 }), true);
            assert.equal(shouldEnemyIgnoreTarget(defaultEnemy, { ...defaultPlayer, health: -15 }), true);
        });

        it('ignores targets standing at safe heights (elevated planks/docks)', () => {
            const targetOnHighPlank = {
                ...defaultPlayer,
                position: { x: 0, y: 1.8, z: -60 },
            };
            assert.equal(shouldEnemyIgnoreTarget(defaultEnemy, targetOnHighPlank), true);

            const targetFloatingOnRaft = {
                ...defaultPlayer,
                position: { x: 0, y: 0.25, z: -60 },
            };
            assert.equal(shouldEnemyIgnoreTarget(defaultEnemy, targetFloatingOnRaft), false);
        });

        it('enforces Harbor City Basin Truce: enemies disengage when target is in harbor basin', () => {
            const harborPlayer = {
                ...defaultPlayer,
                position: { x: 22, y: 0.25, z: -210 }, // Inside default harbor
            };
            const pursuingEnemy = {
                type: 'mudAlien',
                position: { x: 5, y: 0.5, z: -200 }, // In main river
            };

            assert.equal(shouldEnemyIgnoreTarget(pursuingEnemy, harborPlayer), true);
        });

        it('enforces Sanctuary Platform Immunity: enemies disengage when target is docked at sanctuary', () => {
            const platforms = [
                { id: 'sanctuary_act1', x: -8, z: -350, width: 14, length: 18 },
            ];
            const playerAtSanctuary = {
                ...defaultPlayer,
                position: { x: -8, y: 0.5, z: -350 },
            };
            const wormEnemy = {
                type: 'longWorm',
                position: { x: -8, y: 0.5, z: -330 },
            };

            assert.equal(shouldEnemyIgnoreTarget(wormEnemy, playerAtSanctuary, { platforms }), true);
        });

        it('applies Sanctuary Platform margin buffer: gives breathing room around dock edges', () => {
            const enemyNearby = { type: 'whiteGuy', position: { x: 0, y: 0.5, z: -290 } };
            const platforms = [
                { x: 0, z: -300, width: 10, length: 10 }, // halfW = 5, halfL = 5
            ];
            // Player is 1.5 meters outside physical deck (at x=6.5), within marginBuffer (4m)
            const playerNearSanctuary = {
                ...defaultPlayer,
                position: { x: 6.5, y: 0.25, z: -300 },
            };
            assert.equal(shouldEnemyIgnoreTarget(enemyNearby, playerNearSanctuary, { platforms }), true);

            // Player is 15 meters away from dock (outside margin buffer) but within 65m leash of enemyNearby
            const playerDistant = {
                ...defaultPlayer,
                position: { x: 15, y: 0.25, z: -300 },
            };
            assert.equal(shouldEnemyIgnoreTarget(enemyNearby, playerDistant, { platforms }), false);
        });

        it('enforces Aggro Leash bounds across whiteGuy, mudAlien, and longWorm', () => {
            // whiteGuy leash: 65m
            const wizard = { type: 'whiteGuy', position: { x: 0, z: -100 } };
            const targetWithinWizardLeash = { ...defaultPlayer, position: { x: 0, z: -150 } }; // 50m
            const targetBeyondWizardLeash = { ...defaultPlayer, position: { x: 0, z: -170 } }; // 70m
            assert.equal(shouldEnemyIgnoreTarget(wizard, targetWithinWizardLeash), false);
            assert.equal(shouldEnemyIgnoreTarget(wizard, targetBeyondWizardLeash), true);

            // mudAlien leash: 100m
            const mud = { type: 'mudAlien', position: { x: 0, z: -100 } };
            const targetWithinMudLeash = { ...defaultPlayer, position: { x: 0, z: -180 } }; // 80m
            const targetBeyondMudLeash = { ...defaultPlayer, position: { x: 0, z: -210 } }; // 110m
            assert.equal(shouldEnemyIgnoreTarget(mud, targetWithinMudLeash), false);
            assert.equal(shouldEnemyIgnoreTarget(mud, targetBeyondMudLeash), true);

            // longWorm leash: 200m
            const worm = { type: 'longWorm', position: { x: 0, z: -100 } };
            const targetWithinWormLeash = { ...defaultPlayer, position: { x: 0, z: -250 } }; // 150m
            const targetBeyondWormLeash = { ...defaultPlayer, position: { x: 0, z: -310 } }; // 210m
            assert.equal(shouldEnemyIgnoreTarget(worm, targetWithinWormLeash), false);
            assert.equal(shouldEnemyIgnoreTarget(worm, targetBeyondWormLeash), true);
        });

        it('respects custom leashRange override in options', () => {
            const wizard = { type: 'whiteGuy', position: { x: 0, z: -100 } };
            const target = { ...defaultPlayer, position: { x: 0, z: -130 } }; // 30m away
            // Normally 30m is within whiteGuy's 65m leash
            assert.equal(shouldEnemyIgnoreTarget(wizard, target), false);
            // With custom tighter leash (25m), target is ignored
            assert.equal(shouldEnemyIgnoreTarget(wizard, target, { leashRange: 25 }), true);
        });
    });

    describe('Sanctuary Repulsion Vector (computeSanctuaryRepulsionVector)', () => {
        it('returns zero vector when no platforms or no enemy is passed', () => {
            const res1 = computeSanctuaryRepulsionVector(null, []);
            assert.deepEqual(res1, { x: 0, y: 0, z: 0, magnitude: 0 });

            const res2 = computeSanctuaryRepulsionVector({ position: { x: 0, z: -100 } }, []);
            assert.deepEqual(res2, { x: 0, y: 0, z: 0, magnitude: 0 });
        });

        it('returns zero vector when enemy is far outside platform radius + buffer', () => {
            const enemy = { position: { x: 0, z: 0 } };
            const platforms = [{ x: 0, z: -300, radius: 10 }];
            const res = computeSanctuaryRepulsionVector(enemy, platforms);
            assert.equal(res.magnitude, 0);
            assert.equal(res.x, 0);
            assert.equal(res.z, 0);
        });

        it('repels enemy pushing directly away from platform center when within radius', () => {
            const platform = { x: 0, z: -200, radius: 15 };
            // Enemy positioned at x = 10, z = -200 (directly to the right of platform)
            const enemy = { position: { x: 10, z: -200 } };
            const res = computeSanctuaryRepulsionVector(enemy, [platform]);

            assert.ok(res.magnitude > 0);
            assert.ok(res.x > 0, 'Repulsion force x should point positive (away from center at x=0)');
            assert.equal(res.z, 0, 'Repulsion force z should be 0 since deltaZ is 0');
            assert.equal(res.y, 0, 'Repulsion vector remains planar on the water surface');
        });

        it('magnitude scales smoothly with penetration depth and clamps to maxRepulsionForce', () => {
            const platform = { x: 0, z: -100, radius: 20 };
            const margin = SANCTUARY_REPULSION_CONFIG.marginBuffer; // 4m -> effectiveRadius = 24m

            // Enemy close to edge (dist = 22m out of 24m)
            const nearEdge = computeSanctuaryRepulsionVector({ position: { x: 22, z: -100 } }, [platform]);
            // Enemy deep inside (dist = 6m out of 24m)
            const deepInside = computeSanctuaryRepulsionVector({ position: { x: 6, z: -100 } }, [platform]);

            assert.ok(nearEdge.magnitude > 0);
            assert.ok(deepInside.magnitude > nearEdge.magnitude, 'Deeper penetration must yield stronger repulsion force');
            assert.ok(deepInside.magnitude <= SANCTUARY_REPULSION_CONFIG.maxRepulsionForce);
        });

        it('breaks symmetry deterministically toward downstream channel if enemy is exactly at platform center', () => {
            const platform = { x: 5, z: -150, radius: 12 };
            const enemy = { position: { x: 5, z: -150 } };
            const res = computeSanctuaryRepulsionVector(enemy, [platform]);

            assert.ok(res.magnitude > 0);
            assert.ok(res.z < 0, 'Pushes downstream (negative z) away from sanctuary dock');
        });

        it('combines repulsive vectors from multiple nearby platforms smoothly', () => {
            const platforms = [
                { x: -5, z: -200, radius: 15 },
                { x: 5, z: -200, radius: 15 },
            ];
            // Enemy between both platforms but slightly to the left (x = -1, z = -200)
            const enemy = { position: { x: -1, z: -200 } };
            const res = computeSanctuaryRepulsionVector(enemy, platforms);

            assert.ok(Number.isFinite(res.magnitude));
            assert.ok(Number.isFinite(res.x));
            assert.ok(Number.isFinite(res.z));
            assert.ok(res.magnitude <= SANCTUARY_REPULSION_CONFIG.maxRepulsionForce);
        });

        it('accepts options to override maxForce and marginBuffer', () => {
            const platform = { x: 0, z: -100, radius: 10 };
            const enemy = { position: { x: 5, z: -100 } };
            const customMax = 120.0;
            const res = computeSanctuaryRepulsionVector(enemy, [platform], { maxForce: customMax });

            assert.ok(res.magnitude > SANCTUARY_REPULSION_CONFIG.maxRepulsionForce);
            assert.ok(res.magnitude <= customMax);
        });
    });
});
