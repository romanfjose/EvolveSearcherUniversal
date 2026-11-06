import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SANCTUARY_PLATFORMS_CONFIG,
    generateSanctuaryPlatforms,
    isPlayerProtectedBySanctuary,
    evaluateSanctuaryState,
} from '../shared/sanctuary-platforms.js';

describe('Sanctuary Platforms & Mooring Physics Engine', () => {

    describe('Configuration Invariants', () => {
        test('dimensions match tactical specs (10m to 16m wide, 12m to 20m long)', () => {
            const { DIMENSIONS, PROTECTION, PHYSICS } = SANCTUARY_PLATFORMS_CONFIG;
            assert.strictEqual(DIMENSIONS.MIN_WIDTH, 10.0);
            assert.strictEqual(DIMENSIONS.MAX_WIDTH, 16.0);
            assert.strictEqual(DIMENSIONS.MIN_LENGTH, 12.0);
            assert.strictEqual(DIMENSIONS.MAX_LENGTH, 20.0);

            assert.strictEqual(PROTECTION.REPAIR_RATE_HP_PER_SEC, 2.0);
            assert.strictEqual(PROTECTION.ENEMY_IMMUNITY, true);
            assert.deepStrictEqual(PROTECTION.PROTECTED_ENEMY_TYPES, ['whiteGuy', 'mudAlien', 'longWorm']);

            assert.ok(PHYSICS.MOORING_DAMPING_RATE > 0);
            assert.ok(PHYSICS.MAX_STATIONARY_SPEED > 0);
        });
    });

    describe('Procedural Generation', () => {
        test('generates sanctuary platforms deterministically with seed', () => {
            const run1 = generateSanctuaryPlatforms({ seed: 1337, riverWidth: 30, finishZ: -1500 });
            const run2 = generateSanctuaryPlatforms({ seed: 1337, riverWidth: 30, finishZ: -1500 });

            assert.strictEqual(run1.length, run2.length);
            assert.ok(run1.length >= 4, 'Should generate multiple tactical sanctuaries along river');

            for (let i = 0; i < run1.length; i++) {
                assert.strictEqual(run1[i].id, run2[i].id);
                assert.strictEqual(run1[i].x, run2[i].x);
                assert.strictEqual(run1[i].z, run2[i].z);
                assert.strictEqual(run1[i].width, run2[i].width);
                assert.strictEqual(run1[i].length, run2[i].length);

                // Check dimension bounds (10m to 16m wide, 12m to 20m long)
                assert.ok(run1[i].width >= 10.0 && run1[i].width <= 16.0, `Width ${run1[i].width} outside [10, 16]`);
                assert.ok(run1[i].length >= 12.0 && run1[i].length <= 20.0, `Length ${run1[i].length} outside [12, 20]`);

                // Check bollards & ramps
                assert.ok(Array.isArray(run1[i].bollards));
                assert.strictEqual(run1[i].bollards.length, 4);
                assert.ok(Array.isArray(run1[i].ramps));
                assert.ok(run1[i].ramps.length >= 3); // 1 approach ramp + 2 side transition ramps
            }
        });

        test('handles custom river parameters and finishes cleanly', () => {
            const platforms = generateSanctuaryPlatforms({ seed: 42, riverWidth: 40, finishZ: -800 });
            for (const p of platforms) {
                assert.ok(p.z >= -850);
                assert.ok(Math.abs(p.x) < 20); // within riverWidth 40
            }
        });
    });

    describe('Spatial Protection & Mooring Zone Checks', () => {
        const platforms = generateSanctuaryPlatforms({ seed: 101, riverWidth: 30, finishZ: -1500 });
        const targetPlat = platforms[0];

        test('player on platform deck is protected', () => {
            const player = {
                position: { x: targetPlat.x, y: targetPlat.deckHeight, z: targetPlat.z }
            };
            assert.strictEqual(isPlayerProtectedBySanctuary(player, platforms), true);
        });

        test('player approaching on entry ramp is protected', () => {
            const ramp = targetPlat.ramps.find(r => r.type === 'approach_ramp');
            assert.ok(ramp);
            const midZ = (ramp.startZ + ramp.endZ) * 0.5;
            const midY = (ramp.startY + ramp.endY) * 0.5;
            const player = {
                position: { x: targetPlat.x, y: midY, z: midZ }
            };
            assert.strictEqual(isPlayerProtectedBySanctuary(player, platforms), true);
        });

        test('player docked in water mooring berth adjacent to bollards is protected', () => {
            const player = {
                position: {
                    x: targetPlat.mooringZone.minX + 0.5,
                    y: 0.25, // water surface
                    z: targetPlat.z
                }
            };
            assert.strictEqual(isPlayerProtectedBySanctuary(player, platforms), true);
        });

        test('player out in open water far from sanctuary is NOT protected', () => {
            const player = {
                position: { x: 0, y: 0.25, z: -50 } // No platform at -50
            };
            assert.strictEqual(isPlayerProtectedBySanctuary(player, platforms), false);
        });

        test('handles null or invalid player gracefully', () => {
            assert.strictEqual(isPlayerProtectedBySanctuary(null, platforms), false);
            assert.strictEqual(isPlayerProtectedBySanctuary({}, platforms), false);
            assert.strictEqual(isPlayerProtectedBySanctuary({ position: null }, platforms), false);
            assert.strictEqual(isPlayerProtectedBySanctuary({ position: { x: 0, y: 0, z: 0 } }, []), false);
        });
    });

    describe('Horizontal Drift Damping Physics', () => {
        const platforms = generateSanctuaryPlatforms({ seed: 777, riverWidth: 30, finishZ: -1500 });
        const plat = platforms[0];

        test('damps horizontal drift to 0 m/s when resting/docked without forward paddle', () => {
            const player = {
                position: { x: plat.x, y: plat.deckHeight, z: plat.z },
                velocity: { x: 4.5, y: 0, z: -8.0 },
                input: { w: false, a: false, s: false, d: false },
                health: 80,
                maxHealth: 100
            };

            // Step several frames
            let state;
            for (let step = 0; step < 30; step++) {
                state = evaluateSanctuaryState(player, platforms, 0.05);
            }

            assert.strictEqual(state.isProtected, true);
            assert.strictEqual(state.isDocked, true);
            assert.strictEqual(player.velocity.x, 0, 'Velocity X should damp completely to 0');
            assert.strictEqual(player.velocity.z, 0, 'Velocity Z should damp completely to 0');
            assert.strictEqual(state.isStationary, true);
        });

        test('does NOT damp horizontal velocity when player is actively paddling forward (w = true)', () => {
            const initialVx = 1.0;
            const initialVz = -12.0;
            const player = {
                position: { x: plat.x, y: plat.deckHeight, z: plat.z },
                velocity: { x: initialVx, y: 0, z: initialVz },
                input: { w: true }, // actively paddling forward
                health: 100,
                maxHealth: 100
            };

            const state = evaluateSanctuaryState(player, platforms, 0.05);

            assert.strictEqual(state.isProtected, true);
            assert.strictEqual(state.damped, false, 'Should not damp when actively paddling forward');
            assert.strictEqual(player.velocity.x, initialVx);
            assert.strictEqual(player.velocity.z, initialVz);
        });
    });

    describe('Slow Hull Repair (+2 HP/s) Dynamics', () => {
        const platforms = generateSanctuaryPlatforms({ seed: 2025, riverWidth: 30, finishZ: -1500 });
        const plat = platforms[0];

        test('heals +2 HP/s when stationary on sanctuary platform', () => {
            const player = {
                position: { x: plat.x, y: plat.deckHeight, z: plat.z },
                velocity: { x: 0, y: 0, z: 0 },
                input: {},
                health: 50,
                maxHealth: 100,
                repairAccumulator: 0,
            };

            // Simulate exactly 1.0 second (20 steps of 0.05s)
            for (let i = 0; i < 20; i++) {
                evaluateSanctuaryState(player, platforms, 0.05);
            }

            // Exactly 2 HP healed after 1.0s (+2 HP/s)
            assert.strictEqual(player.health, 52, `Expected 52 HP after 1s, got ${player.health}`);

            // Simulate another 2.0 seconds (40 steps)
            for (let i = 0; i < 40; i++) {
                evaluateSanctuaryState(player, platforms, 0.05);
            }
            assert.strictEqual(player.health, 56, `Expected 56 HP after 3s, got ${player.health}`);
        });

        test('clamps repair cleanly at maxHealth', () => {
            const player = {
                position: { x: plat.x, y: plat.deckHeight, z: plat.z },
                velocity: { x: 0, y: 0, z: 0 },
                input: {},
                health: 99,
                maxHealth: 100,
                repairAccumulator: 0,
            };

            for (let i = 0; i < 30; i++) {
                evaluateSanctuaryState(player, platforms, 0.05);
            }

            assert.strictEqual(player.health, 100);
            assert.strictEqual(player.repairAccumulator, 0);
        });

        test('does NOT repair if moving at high speed (> MAX_STATIONARY_SPEED)', () => {
            const player = {
                position: { x: plat.x, y: plat.deckHeight, z: plat.z },
                velocity: { x: 5.0, y: 0, z: -5.0 }, // Moving fast
                input: { w: true }, // Not damped
                health: 50,
                maxHealth: 100,
                repairAccumulator: 0,
            };

            for (let i = 0; i < 20; i++) {
                evaluateSanctuaryState(player, platforms, 0.05);
            }

            assert.strictEqual(player.health, 50, 'Fast moving player should not receive stationary hull repair');
        });

        test('does NOT repair dead player (health <= 0)', () => {
            const player = {
                position: { x: plat.x, y: plat.deckHeight, z: plat.z },
                velocity: { x: 0, y: 0, z: 0 },
                input: {},
                health: 0,
                maxHealth: 100,
            };

            evaluateSanctuaryState(player, platforms, 0.05);
            assert.strictEqual(player.health, 0);
        });
    });

    describe('Enemy Attack Immunity Validation', () => {
        const platforms = generateSanctuaryPlatforms({ seed: 888, riverWidth: 30, finishZ: -1500 });
        const plat = platforms[0];

        test('grants 100% attack immunity for whiteGuy, mudAlien, and longWorm', () => {
            const player = {
                position: { x: plat.x, y: plat.deckHeight, z: plat.z },
                velocity: { x: 0, y: 0, z: 0 },
                health: 80,
                maxHealth: 100,
            };

            const evalResult = evaluateSanctuaryState(player, platforms, 0.05);
            assert.strictEqual(evalResult.enemyImmunity, true);
            assert.strictEqual(evalResult.isProtected, true);

            // Verify each enemy type is blocked
            for (const enemyType of SANCTUARY_PLATFORMS_CONFIG.PROTECTION.PROTECTED_ENEMY_TYPES) {
                // If protected, player cannot be damaged
                const isImmune = isPlayerProtectedBySanctuary(player, platforms) &&
                    SANCTUARY_PLATFORMS_CONFIG.PROTECTION.PROTECTED_ENEMY_TYPES.includes(enemyType);
                assert.strictEqual(isImmune, true, `Player must be immune to ${enemyType}`);
            }
        });

        test('player outside sanctuary does not have immunity', () => {
            const player = {
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                health: 80,
                maxHealth: 100,
            };

            const evalResult = evaluateSanctuaryState(player, platforms, 0.05);
            assert.strictEqual(evalResult.enemyImmunity, false);
            assert.strictEqual(evalResult.isProtected, false);
        });
    });
});
