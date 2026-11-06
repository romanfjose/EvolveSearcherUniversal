import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    HARBOR_SERVICES,
    CRANE_LOOT_TABLE,
    isPlayerInHarborBasin,
    isPlayerMoored,
    evaluateDrydockRepair,
    triggerHarborCraneDrop,
    claimHarborSupplyCrate,
    inspectHarborUpgrades,
} from '../shared/harbor-drydock-service.js';

import { UPGRADE_SLOTS } from '../shared/upgrade-tree.js';

describe('Act II Interactive Harbor Drydock & Cargo Crane Service', () => {
    describe('HARBOR_SERVICES Configuration Invariants', () => {
        it('exports required HARBOR_SERVICES structures and boundaries', () => {
            assert.ok(HARBOR_SERVICES, 'HARBOR_SERVICES should be exported');
            assert.ok(HARBOR_SERVICES.basin, 'HARBOR_SERVICES.basin defined');
            assert.ok(HARBOR_SERVICES.drydock, 'HARBOR_SERVICES.drydock defined');
            assert.ok(HARBOR_SERVICES.crane, 'HARBOR_SERVICES.crane defined');
            assert.ok(HARBOR_SERVICES.inspection, 'HARBOR_SERVICES.inspection defined');

            assert.equal(HARBOR_SERVICES.drydock.fullRepairCostCoins, 0, 'Repair service is 100% free');
            assert.ok(HARBOR_SERVICES.drydock.repairRateHpPerSec > 0, 'Continuous repair rate is positive');
            assert.equal(HARBOR_SERVICES.crane.id, 'harbor_cargo_crane');
            assert.equal(HARBOR_SERVICES.inspection.timePressureSuspended, true);
        });

        it('CRANE_LOOT_TABLE contains distinct rewarding loot profiles', () => {
            assert.ok(Array.isArray(CRANE_LOOT_TABLE));
            assert.ok(CRANE_LOOT_TABLE.length >= 4);
            for (const entry of CRANE_LOOT_TABLE) {
                assert.ok(entry.id);
                assert.ok(entry.label);
                assert.ok(entry.coins > 0);
                assert.ok(entry.planks > 0);
                assert.ok(entry.powerup);
            }
        });
    });

    describe('Harbor Basin & Mooring Detection', () => {
        it('identifies positions inside and outside the Harbor Basin', () => {
            // Inside basin
            assert.equal(isPlayerInHarborBasin({ x: 15, z: -200 }), true);
            assert.equal(isPlayerInHarborBasin({ position: { x: 20, z: -180 } }), true);
            assert.equal(isPlayerInHarborBasin({ position: { x: 10, z: -250 } }), true);
            assert.equal(isPlayerInHarborBasin({ position: { x: 32, z: -150 } }), true);

            // Outside basin
            assert.equal(isPlayerInHarborBasin({ x: 5, z: -200 }), false, 'Too far left');
            assert.equal(isPlayerInHarborBasin({ x: 35, z: -200 }), false, 'Too far right');
            assert.equal(isPlayerInHarborBasin({ x: 15, z: -100 }), false, 'Downstream/upstream mismatch');
            assert.equal(isPlayerInHarborBasin({ x: 15, z: -300 }), false, 'Outside Z range');
            assert.equal(isPlayerInHarborBasin(null), false);
            assert.equal(isPlayerInHarborBasin({}), false);
        });

        it('evaluates whether a player craft is safely moored based on speed or velocity', () => {
            const mooredPlayer = {
                id: 'p1',
                position: { x: 16.5, y: 0.85, z: -200 },
                velocity: { x: 0.5, z: -0.5 }, // hypot ~0.7 <= 3.5
            };
            assert.equal(isPlayerMoored(mooredPlayer), true);

            const speedingPlayer = {
                id: 'p2',
                position: { x: 16.5, y: 0.85, z: -200 },
                speed: 12.0, // > 3.5
            };
            assert.equal(isPlayerMoored(speedingPlayer), false);

            const outsidePlayer = {
                id: 'p3',
                position: { x: 0, y: 0.25, z: -50 },
                velocity: { x: 0, z: 0 },
            };
            assert.equal(isPlayerMoored(outsidePlayer), false);

            const deadPlayer = {
                id: 'p4',
                isDead: true,
                position: { x: 16.5, y: 0.85, z: -200 },
                speed: 0,
            };
            assert.equal(isPlayerMoored(deadPlayer), false);
        });
    });

    describe('Drydock Repair Engine', () => {
        it('evaluates continuous drydock repair over delta-time dt', () => {
            const player = {
                id: 'p1',
                position: { x: 18, y: 0.75, z: -190 },
                velocity: { x: 0, z: 0 },
                health: 40,
                maxHealth: 100,
            };

            const result = evaluateDrydockRepair(player, 1.0); // 1.0s @ 35 hp/s
            assert.equal(result.active, true);
            assert.equal(result.repairedHp, 35.0);
            assert.equal(result.currentHp, 75.0);
            assert.equal(result.maxHp, 100);
            assert.equal(result.isFullyRepaired, false);
            assert.equal(player.health, 75.0);
        });

        it('caps continuous repair at 100% maxHealth without exceeding bounds', () => {
            const player = {
                id: 'p1',
                position: { x: 18, y: 0.75, z: -190 },
                velocity: { x: 0, z: 0 },
                health: 90,
                maxHealth: 100,
            };

            const result = evaluateDrydockRepair(player, 1.0); // 35 HP potential, but only 10 needed
            assert.equal(result.active, true);
            assert.equal(result.repairedHp, 10.0);
            assert.equal(result.currentHp, 100.0);
            assert.equal(result.isFullyRepaired, true);
            assert.equal(player.health, 100.0);
        });

        it('supports instant full repair option { instant: true } to 100%', () => {
            const player = {
                id: 'p1',
                position: { x: 20, y: 0.75, z: -210 },
                velocity: { x: 0.2, z: -0.1 },
                health: 15,
                maxHealth: 180,
            };

            const result = evaluateDrydockRepair(player, 0, { instant: true });
            assert.equal(result.active, true);
            assert.equal(result.repairedHp, 165);
            assert.equal(result.currentHp, 180);
            assert.equal(result.isFullyRepaired, true);
            assert.equal(player.health, 180);
        });

        it('rejects repair when player is outside harbor basin or unmoored', () => {
            const outsidePlayer = {
                position: { x: -5, y: 0.25, z: -100 },
                health: 50,
                maxHealth: 100,
            };
            const res1 = evaluateDrydockRepair(outsidePlayer, 1.0);
            assert.equal(res1.active, false);
            assert.equal(res1.reason, 'outside-harbor-basin');

            const unmooredPlayer = {
                position: { x: 15, y: 0.75, z: -200 },
                speed: 15.0, // fast drift through basin
                health: 50,
                maxHealth: 100,
            };
            const res2 = evaluateDrydockRepair(unmooredPlayer, 1.0);
            assert.equal(res2.active, false);
            assert.equal(res2.reason, 'craft-not-moored');
        });

        it('handles edge cases gracefully: dead player, null player, full health', () => {
            assert.equal(evaluateDrydockRepair(null).reason, 'invalid-player');
            assert.equal(evaluateDrydockRepair({ isDead: true }).reason, 'player-dead');

            const fullPlayer = {
                position: { x: 15, y: 0.75, z: -200 },
                speed: 0,
                health: 100,
                maxHealth: 100,
            };
            const res = evaluateDrydockRepair(fullPlayer, 1.0);
            assert.equal(res.active, true);
            assert.equal(res.isFullyRepaired, true);
            assert.equal(res.repairedHp, 0);
            assert.equal(res.reason, 'already-at-full-health');
        });
    });

    describe('Harbor Cargo Crane Drop Mechanics', () => {
        it('triggerHarborCraneDrop produces deterministic crate drops from seed', () => {
            const drop1 = triggerHarborCraneDrop(42);
            const drop2 = triggerHarborCraneDrop(42);
            const dropDiffSeed = triggerHarborCraneDrop(999);

            assert.deepEqual(drop1.crate, drop2.crate, 'Deterministic crate content on same seed');
            assert.deepEqual(drop1.dropPosition, drop2.dropPosition, 'Deterministic landing on same seed');
            assert.ok(drop1.dropPosition.x >= 15 && drop1.dropPosition.x <= 18);
            assert.ok(drop1.crate.coins >= 10);
            assert.ok(drop1.crate.hullRepairPlanks >= 1);
            assert.ok(drop1.fallDurationSeconds > 0);

            // Diff seed produces variance
            assert.notEqual(drop1.id, dropDiffSeed.id);
        });

        it('supports string seeds deterministically', () => {
            const dropA = triggerHarborCraneDrop('harbor-seed-xyz');
            const dropB = triggerHarborCraneDrop('harbor-seed-xyz');
            assert.deepEqual(dropA.crate, dropB.crate);
            assert.deepEqual(dropA.dropPosition, dropB.dropPosition);
        });

        it('claimHarborSupplyCrate gives free rewards and sets cooldown tracking', () => {
            const player = {
                id: 'player_alpha',
                position: { x: 16.5, y: 0.85, z: -200 },
                speed: 0,
                coins: 50,
            };

            const claim1 = claimHarborSupplyCrate(player, 777, 100);
            assert.equal(claim1.ok, true);
            assert.ok(claim1.crate);
            assert.ok(claim1.playerCoins > 50, 'Coins rewarded to player');
            assert.equal(player.lastHarborCrateClaimTime, 100);

            // Immediate repeat claim should be rejected on cooldown
            const claim2 = claimHarborSupplyCrate(player, 778, 120); // 20s later, cooldown is 60s
            assert.equal(claim2.ok, false);
            assert.equal(claim2.reason, 'cooldown-active');
            assert.equal(claim2.remainingCooldown, 40);

            // After cooldown expires
            const claim3 = claimHarborSupplyCrate(player, 779, 161);
            assert.equal(claim3.ok, true);
            assert.ok(claim3.crate);
        });

        it('claimHarborSupplyCrate rejects unmoored or out-of-harbor players', () => {
            const outPlayer = {
                position: { x: 0, z: 0 },
                speed: 0,
            };
            assert.equal(claimHarborSupplyCrate(outPlayer).reason, 'outside-harbor');

            const speedPlayer = {
                position: { x: 16.5, z: -200 },
                speed: 10,
            };
            assert.equal(claimHarborSupplyCrate(speedPlayer).reason, 'craft-not-moored');
        });
    });

    describe('Harbor Upgrade Inspection Without Time Pressure', () => {
        it('inspectHarborUpgrades provides full slot projections and affordability', () => {
            const player = {
                id: 'p1',
                position: { x: 16.5, y: 0.85, z: -200 },
                speed: 0,
                coins: 25,
                upgrades: ['motor_1'],
            };

            const inspection = inspectHarborUpgrades(player);
            assert.equal(inspection.ok, true);
            assert.equal(inspection.inBasin, true);
            assert.equal(inspection.moored, true);
            assert.equal(inspection.timePressureSuspended, true);
            assert.equal(inspection.playerCoins, 25);
            assert.equal(inspection.slots.length, 3);

            // Motor slot (has motor_1, next is motor_2 costing 25)
            const motorSlot = inspection.slots.find((s) => s.slot === UPGRADE_SLOTS.MOTOR);
            assert.ok(motorSlot);
            assert.equal(motorSlot.nextUpgrade.id, 'motor_2');
            assert.equal(motorSlot.canAfford, true);
            assert.ok(motorSlot.comparison);
            assert.ok(motorSlot.comparison.deltas.speed > 0);

            // Armor slot (tier 0, next is armor_1 costing 20)
            const armorSlot = inspection.slots.find((s) => s.slot === UPGRADE_SLOTS.ARMOR);
            assert.ok(armorSlot);
            assert.equal(armorSlot.nextUpgrade.id, 'armor_1');
            assert.equal(armorSlot.canAfford, true);

            // Weapon slot (tier 0, next is weapon_1 costing 15)
            const weaponSlot = inspection.slots.find((s) => s.slot === UPGRADE_SLOTS.WEAPON);
            assert.ok(weaponSlot);
            assert.equal(weaponSlot.nextUpgrade.id, 'weapon_1');
            assert.equal(weaponSlot.canAfford, true);
        });

        it('indicates timePressureSuspended is false when outside harbor basin', () => {
            const player = {
                position: { x: 0, z: -50 },
                speed: 10,
                coins: 100,
                upgrades: [],
            };

            const inspection = inspectHarborUpgrades(player);
            assert.equal(inspection.ok, true);
            assert.equal(inspection.timePressureSuspended, false);
            assert.equal(inspection.inBasin, false);
        });

        it('handles null player gracefully', () => {
            const res = inspectHarborUpgrades(null);
            assert.equal(res.ok, false);
            assert.equal(res.reason, 'invalid-player');
        });
    });
});
