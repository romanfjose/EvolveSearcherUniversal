import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    GADGET_TYPES,
    createRaftGadgetState,
    activateShieldDome,
} from '../shared/raft-gadgets.js';

import {
    normalizeGadgetId,
    installGadgetForArmoryPurchase,
    stepAndApplyRaftGadgets,
} from '../shared/gadget-live-resolver.js';

describe('Raft Gadgets Live Resolver — Videogame Helmet 05 & Sovereign Core', () => {
    describe('normalizeGadgetId', () => {
        it('normalizes legacy underscore strings to hyphenated GADGET_TYPES', () => {
            assert.equal(normalizeGadgetId('shield_dome'), GADGET_TYPES.SHIELD_DOME);
            assert.equal(normalizeGadgetId('nitro_keg'), GADGET_TYPES.NITRO_KEG);
            assert.equal(normalizeGadgetId('repair_drone'), GADGET_TYPES.REPAIR_DRONE);
            assert.equal(normalizeGadgetId('harpoon'), GADGET_TYPES.HARPOON);
        });

        it('normalizes already hyphenated GADGET_TYPES', () => {
            assert.equal(normalizeGadgetId('shield-dome'), GADGET_TYPES.SHIELD_DOME);
            assert.equal(normalizeGadgetId('nitro-keg'), GADGET_TYPES.NITRO_KEG);
            assert.equal(normalizeGadgetId('repair-drone'), GADGET_TYPES.REPAIR_DRONE);
            assert.equal(normalizeGadgetId('harpoon'), GADGET_TYPES.HARPOON);
        });

        it('handles mixed casing and whitespace', () => {
            assert.equal(normalizeGadgetId('  SHIELD_DOME  '), GADGET_TYPES.SHIELD_DOME);
            assert.equal(normalizeGadgetId('Nitro_Keg'), GADGET_TYPES.NITRO_KEG);
            assert.equal(normalizeGadgetId('Repair-Drone'), GADGET_TYPES.REPAIR_DRONE);
        });

        it('returns null for unknown, empty, or non-string IDs', () => {
            assert.equal(normalizeGadgetId(''), null);
            assert.equal(normalizeGadgetId(null), null);
            assert.equal(normalizeGadgetId(undefined), null);
            assert.equal(normalizeGadgetId(12345), null);
            assert.equal(normalizeGadgetId('mega_blaster'), null);
        });
    });

    describe('installGadgetForArmoryPurchase', () => {
        it('maps slot === "weapon" to "harpoon" and guarantees installation in gadgetState', () => {
            const gadgetState = createRaftGadgetState();
            const res = installGadgetForArmoryPurchase(gadgetState, 'weapon', 'weapon_1');
            assert.equal(res.success, true);
            assert.deepEqual(res.installed, [GADGET_TYPES.HARPOON]);
            assert.ok(gadgetState.installed[GADGET_TYPES.HARPOON]);
            assert.equal(gadgetState.installed[GADGET_TYPES.HARPOON].active, true);
        });

        it('maps slot === "armor" to "shield-dome"', () => {
            const gadgetState = createRaftGadgetState();
            const res = installGadgetForArmoryPurchase(gadgetState, 'armor', 'armor_1');
            assert.equal(res.success, true);
            assert.deepEqual(res.installed, [GADGET_TYPES.SHIELD_DOME]);
            assert.ok(gadgetState.installed[GADGET_TYPES.SHIELD_DOME]);
        });

        it('maps slot === "motor" to "nitro-keg"', () => {
            const gadgetState = createRaftGadgetState();
            const res = installGadgetForArmoryPurchase(gadgetState, 'motor', 'motor_1');
            assert.equal(res.success, true);
            assert.deepEqual(res.installed, [GADGET_TYPES.NITRO_KEG]);
            assert.ok(gadgetState.installed[GADGET_TYPES.NITRO_KEG]);
        });

        it('also installs "repair-drone" if upgradeId ends with "_2" or "_3"', () => {
            const stateTier2 = createRaftGadgetState();
            const res2 = installGadgetForArmoryPurchase(stateTier2, 'motor', 'motor_2');
            assert.equal(res2.success, true);
            assert.deepEqual(res2.installed, [GADGET_TYPES.NITRO_KEG, GADGET_TYPES.REPAIR_DRONE]);
            assert.ok(stateTier2.installed[GADGET_TYPES.NITRO_KEG]);
            assert.ok(stateTier2.installed[GADGET_TYPES.REPAIR_DRONE]);

            const stateTier3 = createRaftGadgetState();
            const res3 = installGadgetForArmoryPurchase(stateTier3, 'weapon', 'weapon_3');
            assert.equal(res3.success, true);
            assert.deepEqual(res3.installed, [GADGET_TYPES.HARPOON, GADGET_TYPES.REPAIR_DRONE]);
            assert.ok(stateTier3.installed[GADGET_TYPES.HARPOON]);
            assert.ok(stateTier3.installed[GADGET_TYPES.REPAIR_DRONE]);
        });

        it('handles uninitialized gadgetState cleanly', () => {
            const resNull = installGadgetForArmoryPurchase(null, 'weapon');
            assert.equal(resNull.success, false);
            assert.deepEqual(resNull.installed, []);

            const uninitState = {};
            const resUninit = installGadgetForArmoryPurchase(uninitState, 'armor', 'armor_1');
            assert.equal(resUninit.success, true);
            assert.ok(uninitState.installed[GADGET_TYPES.SHIELD_DOME]);
        });
    });

    describe('stepAndApplyRaftGadgets', () => {
        it('returns zero deltas when no gadgets are installed or inputs are empty', () => {
            const gadgetState = createRaftGadgetState();
            const craft = {
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, z: 0 },
                yaw: 0,
            };

            const result = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                now: 1000,
                dt: 1 / 60,
            });

            assert.deepEqual(result.enemyHits, []);
            assert.deepEqual(result.velocityDelta, { x: 0, z: 0 });
            assert.equal(result.healedHp, 0);
            assert.equal(result.shockwaveTriggered, false);
        });

        it('steps Harpoon and converts harpoon_fire into enemyHits with pull knockback', () => {
            const gadgetState = createRaftGadgetState();
            installGadgetForArmoryPurchase(gadgetState, 'weapon');

            const craft = {
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, z: 0 },
                yaw: 0,
            };
            const enemies = {
                e1: {
                    id: 'e1',
                    position: { x: 10, y: 0.5, z: 0 },
                    health: 100,
                },
            };

            const result = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                enemies,
                now: 2000,
                dt: 1 / 60,
            });

            assert.equal(result.enemyHits.length, 1);
            assert.equal(result.enemyHits[0].enemyId, 'e1');
            assert.equal(result.enemyHits[0].damage, 28);
            // Pull vector points from enemy (10, 0) toward raft (0, 0) => negative X
            assert.ok(result.enemyHits[0].knockback.x < 0);
        });

        it('steps Shockwave Bell and converts shockwave_hit into enemyHits with physical knockback', () => {
            const gadgetState = createRaftGadgetState();
            installGadgetForArmoryPurchase(gadgetState, 'armor');

            const craft = {
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, z: 0 },
                yaw: 0,
            };
            const enemies = {
                closeAlien: {
                    id: 'closeAlien',
                    position: { x: 2, y: 0.5, z: 0 },
                    health: 80,
                    mass: 10,
                },
            };

            // Trigger shockwave bell
            activateShieldDome(gadgetState, 1000);

            const result = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                enemies,
                now: 1100,
                dt: 0.3,
            });

            assert.equal(result.enemyHits.length, 1);
            assert.equal(result.enemyHits[0].enemyId, 'closeAlien');
            assert.equal(result.enemyHits[0].damage, 15);
            // Push vector away from raft (0, 0) to enemy (2, 0) => positive X knockback
            assert.ok(result.enemyHits[0].knockback.x > 0);
        });

        it('detects shockwaveTriggered when shockwave becomes newly active', () => {
            const gadgetState = createRaftGadgetState();
            installGadgetForArmoryPurchase(gadgetState, 'armor');

            const craft = {
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, z: 0 },
                yaw: 0,
            };

            // Prior to activation, shockwaveTriggered is false
            const resBefore = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                now: 500,
                dt: 1 / 60,
            });
            assert.equal(resBefore.shockwaveTriggered, false);

            // Activate shield dome and step
            activateShieldDome(gadgetState, 1000);
            const resTrigger = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                now: 1000,
                dt: 1 / 60,
            });
            assert.equal(resTrigger.shockwaveTriggered, true);

            // Next step, shockwave is already active, not newly triggered
            const resNext = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                now: 1050,
                dt: 1 / 60,
            });
            assert.equal(resNext.shockwaveTriggered, false);
        });

        it('steps Nitro Hydro-Jets and translates boost into directional velocityDelta', () => {
            const gadgetState = createRaftGadgetState();
            installGadgetForArmoryPurchase(gadgetState, 'motor');

            const craft = {
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, z: 0 },
                yaw: 0, // facing downriver -Z (heading = (0, -1))
                mass: 35,
            };

            // When isBoosting is false, no propulsion
            const resNoBoost = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                isBoosting: false,
                now: 1000,
                dt: 1 / 60,
            });
            assert.equal(resNoBoost.velocityDelta.z, 0);

            // When isBoosting is true, thrust pushes downriver (-Z)
            const resBoost = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                isBoosting: true,
                now: 1016,
                dt: 1 / 60,
            });
            assert.ok(resBoost.velocityDelta.z < 0, 'Should accelerate along heading (-Z)');
            assert.equal(craft.velocity.z, resBoost.velocityDelta.z);
        });

        it('steps Repair Drone companion and restores craft health within aura', () => {
            const gadgetState = createRaftGadgetState();
            installGadgetForArmoryPurchase(gadgetState, 'motor', 'motor_2'); // unlocks repair-drone

            const craft = {
                id: 'player_raft',
                position: { x: 0, y: 0.25, z: 0 },
                velocity: { x: 0, z: 0 },
                yaw: 0,
                health: 50,
                maxHealth: 100,
            };

            const result = stepAndApplyRaftGadgets({
                gadgetState,
                craft,
                now: 1000,
                dt: 0.5,
            });

            assert.ok(result.healedHp > 0);
            assert.ok(craft.health > 50);
            assert.equal(craft.health, 50 + result.healedHp);
        });

        it('handles null or missing parameters gracefully without throwing or NaN', () => {
            const result1 = stepAndApplyRaftGadgets();
            assert.deepEqual(result1.enemyHits, []);
            assert.deepEqual(result1.velocityDelta, { x: 0, z: 0 });
            assert.equal(result1.healedHp, 0);
            assert.equal(result1.shockwaveTriggered, false);

            const result2 = stepAndApplyRaftGadgets({
                gadgetState: null,
                craft: null,
            });
            assert.deepEqual(result2.enemyHits, []);
        });
    });
});
