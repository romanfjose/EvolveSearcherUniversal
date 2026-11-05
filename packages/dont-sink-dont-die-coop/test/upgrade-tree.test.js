import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    UPGRADE_SLOTS,
    BASE_PLAYER_STATS,
    STAT_BAR_MAX,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    UPGRADE_LOOKUP_BY_TYPE,
    getSlotCurrentTier,
    getNextSlotUpgrade,
    calculateCumulativeStats,
    calculateStatComparison,
    normalizeStatBars,
    canPurchaseArmoryUpgrade,
    resolveArmoryHotkey,
    evaluateBotAutoEquip,
    getCrewBotsAutoEquipSummary,
} from '../shared/upgrade-tree.js';
import { createArmoryShopUI } from '../public/js/ui/armory-shop.js';

describe('Armory Upgrade Tree Slot & Tier Architecture', () => {
    it('defines 3 primary upgrade slots: motor, weapon, armor', () => {
        assert.deepEqual(Object.values(UPGRADE_SLOTS), ['motor', 'weapon', 'armor']);
    });

    it('each slot has exactly 3 progressive tiers', () => {
        for (const slot of Object.values(UPGRADE_SLOTS)) {
            const tiers = ARMORY_UPGRADE_TREE[slot];
            assert.ok(Array.isArray(tiers));
            assert.equal(tiers.length, 3);
            tiers.forEach((item, idx) => {
                assert.equal(item.tier, idx + 1);
                assert.equal(item.slot, slot);
                assert.ok(item.cost > 0);
                assert.ok(item.name.length > 0);
                assert.ok(item.description.length > 0);
            });
        }
    });

    it('Motor slot progression matches Motor Mk I -> Motor Mk II -> Motor Mk III', () => {
        const motorTiers = ARMORY_UPGRADE_TREE.motor;
        assert.equal(motorTiers[0].name, 'Motor Mk I');
        assert.equal(motorTiers[1].name, 'Motor Mk II');
        assert.equal(motorTiers[2].name, 'Motor Mk III');

        assert.equal(motorTiers[0].cost, 10);
        assert.equal(motorTiers[1].cost, 25);
        assert.equal(motorTiers[2].cost, 45);

        // Speed increases with tier
        assert.ok(motorTiers[1].stats.speedDelta > motorTiers[0].stats.speedDelta);
        assert.ok(motorTiers[2].stats.speedDelta > motorTiers[1].stats.speedDelta);
    });

    it('Weapon slot progression matches Squeaky Mallet -> Thunder Gavel -> Leviathan Breaker', () => {
        const weaponTiers = ARMORY_UPGRADE_TREE.weapon;
        assert.equal(weaponTiers[0].name, 'Squeaky Mallet');
        assert.equal(weaponTiers[1].name, 'Thunder Gavel');
        assert.equal(weaponTiers[2].name, 'Leviathan Breaker');

        assert.equal(weaponTiers[0].cost, 15);
        assert.equal(weaponTiers[1].cost, 30);
        assert.equal(weaponTiers[2].cost, 55);

        // DPS bonus increases with tier
        assert.equal(weaponTiers[0].stats.dpsDelta, 20);
        assert.equal(weaponTiers[1].stats.dpsDelta, 35);
        assert.equal(weaponTiers[2].stats.dpsDelta, 55);
    });

    it('Armor slot progression matches Hull Armor -> Riveted Ironclad -> Aegis Plating', () => {
        const armorTiers = ARMORY_UPGRADE_TREE.armor;
        assert.equal(armorTiers[0].name, 'Hull Armor');
        assert.equal(armorTiers[1].name, 'Riveted Ironclad');
        assert.equal(armorTiers[2].name, 'Aegis Plating');

        assert.equal(armorTiers[0].cost, 20);
        assert.equal(armorTiers[1].cost, 35);
        assert.equal(armorTiers[2].cost, 60);

        // Max HP increases with tier
        assert.equal(armorTiers[0].stats.maxHpDelta, 50);
        assert.equal(armorTiers[1].stats.maxHpDelta, 90);
        assert.equal(armorTiers[2].stats.maxHpDelta, 140);
    });

    it('ALL_UPGRADES and UPGRADE_LOOKUP_BY_TYPE index all 9 upgrade items', () => {
        assert.equal(Object.keys(ALL_UPGRADES).length, 9);
        assert.equal(Object.keys(UPGRADE_LOOKUP_BY_TYPE).length, 9);

        assert.ok(ALL_UPGRADES['motor_1']);
        assert.ok(ALL_UPGRADES['weapon_2']);
        assert.ok(ALL_UPGRADES['armor_3']);

        assert.ok(UPGRADE_LOOKUP_BY_TYPE['motor']);
        assert.ok(UPGRADE_LOOKUP_BY_TYPE['weapon_mk2']);
        assert.ok(UPGRADE_LOOKUP_BY_TYPE['armor_mk3']);
    });
});

describe('Slot Tier Resolution & Next Upgrade Discovery', () => {
    it('returns tier 0 for slots when player has no upgrades', () => {
        assert.equal(getSlotCurrentTier([], 'motor'), 0);
        assert.equal(getSlotCurrentTier([], 'weapon'), 0);
        assert.equal(getSlotCurrentTier([], 'armor'), 0);
    });

    it('resolves legacy upgrade keys (motor, weapon, armor) to tier 1', () => {
        const legacyUpgrades = ['motor', 'weapon', 'armor'];
        assert.equal(getSlotCurrentTier(legacyUpgrades, 'motor'), 1);
        assert.equal(getSlotCurrentTier(legacyUpgrades, 'weapon'), 1);
        assert.equal(getSlotCurrentTier(legacyUpgrades, 'armor'), 1);
    });

    it('resolves multi-tier ID keys accurately up to tier 3', () => {
        assert.equal(getSlotCurrentTier(['motor_2'], 'motor'), 2);
        assert.equal(getSlotCurrentTier(['weapon_3'], 'weapon'), 3);
        assert.equal(getSlotCurrentTier(['armor_1', 'armor_2'], 'armor'), 2);
    });

    it('getNextSlotUpgrade returns the next sequential tier item', () => {
        assert.equal(getNextSlotUpgrade([], 'motor')?.id, 'motor_1');
        assert.equal(getNextSlotUpgrade(['motor_1'], 'motor')?.id, 'motor_2');
        assert.equal(getNextSlotUpgrade(['motor_2'], 'motor')?.id, 'motor_3');
    });

    it('getNextSlotUpgrade returns null when slot is max tier', () => {
        assert.equal(getNextSlotUpgrade(['motor_3'], 'motor'), null);
        assert.equal(getNextSlotUpgrade(['weapon_3'], 'weapon'), null);
        assert.equal(getNextSlotUpgrade(['armor_3'], 'armor'), null);
    });
});

describe('Cumulative Stat Evaluation', () => {
    it('returns base player stats when no upgrades are owned', () => {
        const stats = calculateCumulativeStats([]);
        assert.equal(stats.speed, BASE_PLAYER_STATS.speed);
        assert.equal(stats.turnRate, BASE_PLAYER_STATS.turnRate);
        assert.equal(stats.dps, BASE_PLAYER_STATS.dps);
        assert.equal(stats.maxHp, BASE_PLAYER_STATS.maxHp);
    });

    it('accurately compounds stats with Tier 1 upgrades across all slots', () => {
        const stats = calculateCumulativeStats(['motor_1', 'weapon_1', 'armor_1']);
        assert.equal(stats.speed, 20.0);       // 15 + 5
        assert.equal(stats.turnRate, 1.54);    // 2.2 - 0.66
        assert.equal(stats.dps, 30.0);         // 10 + 20
        assert.equal(stats.maxHp, 150);        // 100 + 50
    });

    it('accurately compounds stats with Tier 2 upgrades', () => {
        const stats = calculateCumulativeStats(['motor_2', 'weapon_2', 'armor_2']);
        assert.equal(stats.speed, 24.0);       // 15 + 9
        assert.equal(stats.turnRate, 1.80);    // 2.2 - 0.40
        assert.equal(stats.dps, 45.0);         // 10 + 35
        assert.equal(stats.maxHp, 190);        // 100 + 90
    });

    it('accurately compounds stats with Tier 3 max upgrades', () => {
        const stats = calculateCumulativeStats(['motor_3', 'weapon_3', 'armor_3']);
        assert.equal(stats.speed, 28.5);       // 15 + 13.5
        assert.equal(stats.turnRate, 2.0);     // 2.2 - 0.20
        assert.equal(stats.dps, 65.0);         // 10 + 55
        assert.equal(stats.maxHp, 240);        // 100 + 140
    });

    it('gracefully handles unknown keys or invalid slot values', () => {
        const stats = calculateCumulativeStats(['unknown_item', null, undefined]);
        assert.equal(stats.speed, BASE_PLAYER_STATS.speed);
        assert.equal(stats.maxHp, BASE_PLAYER_STATS.maxHp);
    });
});

describe('Stat Comparison & Bar Normalization', () => {
    it('returns zero deltas when candidate upgrade is null or empty', () => {
        const comp = calculateStatComparison(['motor_1'], null);
        assert.deepEqual(comp.deltas, { speed: 0, turnRate: 0, dps: 0, maxHp: 0 });
        assert.deepEqual(comp.current, comp.projected);
    });

    it('calculates positive deltas when upgrading Weapon from Tier 1 to Tier 2', () => {
        const comp = calculateStatComparison(['weapon_1'], ALL_UPGRADES['weapon_2']);
        assert.equal(comp.deltas.dps, 15); // 45 - 30
        assert.equal(comp.deltas.speed, 0);
        assert.equal(comp.deltas.maxHp, 0);
        assert.ok(comp.projectedBars.dpsPct > comp.currentBars.dpsPct);
    });

    it('calculates trade-off deltas (speed gain, turn penalty delta) when upgrading Motor', () => {
        const comp = calculateStatComparison([], ALL_UPGRADES['motor_1']);
        assert.equal(comp.deltas.speed, 5.0);
        assert.equal(comp.deltas.turnRate, -0.66);
        assert.ok(comp.projectedBars.speedPct > comp.currentBars.speedPct);
        assert.ok(comp.projectedBars.turnRatePct < comp.currentBars.turnRatePct);
    });

    it('normalizeStatBars maps values within [0, 100] percent', () => {
        const bars = normalizeStatBars({ speed: 15, turnRate: 2.2, dps: 35, maxHp: 150 });
        assert.ok(bars.speedPct >= 0 && bars.speedPct <= 100);
        assert.ok(bars.turnRatePct >= 0 && bars.turnRatePct <= 100);
        assert.ok(bars.dpsPct >= 0 && bars.dpsPct <= 100);
        assert.ok(bars.maxHpPct >= 0 && bars.maxHpPct <= 100);
    });

    it('normalizeStatBars clamps values exceeding reference max to 100%', () => {
        const bars = normalizeStatBars({ speed: 999, turnRate: 999, dps: 999, maxHp: 999 });
        assert.equal(bars.speedPct, 100);
        assert.equal(bars.turnRatePct, 100);
        assert.equal(bars.dpsPct, 100);
        assert.equal(bars.maxHpPct, 100);
    });
});

describe('Purchase Validation & Rules', () => {
    it('allows buying Tier 1 item when player has sufficient coins', () => {
        const player = { coins: 50, upgrades: [] };
        const result = canPurchaseArmoryUpgrade(player, 'motor_1');
        assert.equal(result.ok, true);
        assert.equal(result.reason, null);
    });

    it('rejects purchase when player has insufficient coins', () => {
        const player = { coins: 5, upgrades: [] };
        const result = canPurchaseArmoryUpgrade(player, 'motor_1'); // cost 10
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'insufficient-coins');
    });

    it('rejects buying an upgrade tier already owned or lower', () => {
        const player = { coins: 100, upgrades: ['weapon_2'] };
        const res1 = canPurchaseArmoryUpgrade(player, 'weapon_1');
        const res2 = canPurchaseArmoryUpgrade(player, 'weapon_2');
        assert.equal(res1.ok, false);
        assert.equal(res1.reason, 'already-owned-or-higher');
        assert.equal(res2.ok, false);
        assert.equal(res2.reason, 'already-owned-or-higher');
    });

    it('rejects skipping tiers without buying prerequisites (e.g. Tier 1 -> Tier 3)', () => {
        const player = { coins: 200, upgrades: [] };
        const result = canPurchaseArmoryUpgrade(player, 'armor_3');
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'prerequisite-tier-locked');
    });

    it('rejects invalid player or unknown upgrade IDs', () => {
        assert.equal(canPurchaseArmoryUpgrade(null, 'motor_1').ok, false);
        assert.equal(canPurchaseArmoryUpgrade({ coins: 100, upgrades: [] }, 'nonexistent').ok, false);
    });
});

describe('Hotkey Buy Resolution (1, 2, 3, 4)', () => {
    it('hotkey 1 resolves next Motor upgrade', () => {
        const player = { coins: 50, upgrades: [] };
        const res = resolveArmoryHotkey('1', player);
        assert.equal(res.action, 'buy');
        assert.equal(res.slot, 'motor');
        assert.equal(res.item.id, 'motor_1');
        assert.equal(res.ok, true);
    });

    it('hotkey 2 resolves next Weapon upgrade', () => {
        const player = { coins: 50, upgrades: ['weapon_1'] };
        const res = resolveArmoryHotkey('2', player);
        assert.equal(res.action, 'buy');
        assert.equal(res.slot, 'weapon');
        assert.equal(res.item.id, 'weapon_2');
        assert.equal(res.ok, true);
    });

    it('hotkey 3 resolves next Armor upgrade', () => {
        const player = { coins: 50, upgrades: [] };
        const res = resolveArmoryHotkey('3', player);
        assert.equal(res.action, 'buy');
        assert.equal(res.slot, 'armor');
        assert.equal(res.item.id, 'armor_1');
        assert.equal(res.ok, true);
    });

    it('hotkey returns slot_maxed when a slot is at Tier 3', () => {
        const player = { coins: 500, upgrades: ['armor_3'] };
        const res = resolveArmoryHotkey('3', player);
        assert.equal(res.action, 'slot_maxed');
        assert.equal(res.slot, 'armor');
    });

    it('hotkey 4 resolves quick auto-equip to highest priority affordable item', () => {
        const player = { coins: 20, upgrades: [] };
        // Priority: weapon (15c) -> armor (20c) -> motor (10c)
        const res = resolveArmoryHotkey('4', player);
        assert.equal(res.action, 'auto_equip');
        assert.equal(res.item.id, 'weapon_1');
    });

    it('returns null for unhandled keys or null player', () => {
        assert.equal(resolveArmoryHotkey('x', { coins: 50, upgrades: [] }), null);
        assert.equal(resolveArmoryHotkey('1', null), null);
    });
});

describe('Crew Bot Auto-Equip Evaluation & Team Summary', () => {
    it('prioritizes weapon over armor and motor when bot has enough coins', () => {
        const bot = { id: 'bot_1', coins: 100, upgrades: [], isBot: true, isDead: false };
        const pick = evaluateBotAutoEquip(bot);
        assert.equal(pick?.id, 'weapon_1');
    });

    it('falls back to armor or motor when weapon is too expensive', () => {
        // Weapon 1 costs 15c, Motor 1 costs 10c. Bot has 12c.
        const bot = { id: 'bot_1', coins: 12, upgrades: [], isBot: true, isDead: false };
        const pick = evaluateBotAutoEquip(bot);
        assert.equal(pick?.id, 'motor_1');
    });

    it('returns null when bot has insufficient coins for any upgrade', () => {
        const bot = { id: 'bot_1', coins: 4, upgrades: [], isBot: true, isDead: false };
        assert.equal(evaluateBotAutoEquip(bot), null);
    });

    it('returns null when bot is dead', () => {
        const bot = { id: 'bot_1', coins: 100, upgrades: [], isBot: true, isDead: true };
        assert.equal(evaluateBotAutoEquip(bot), null);
    });

    it('getCrewBotsAutoEquipSummary builds complete status for active bots', () => {
        const players = {
            human: { id: 'p1', name: 'Captain', isBot: false, coins: 50, upgrades: [] },
            bot1: { id: 'b1', name: 'Rusty', isBot: true, coins: 30, upgrades: ['weapon_1'] },
            bot2: { id: 'b2', name: 'Bolt', isBot: true, coins: 5, upgrades: [] },
            bot3: { id: 'b3', name: 'Pip', isBot: true, coins: 200, upgrades: ['motor_3', 'weapon_3', 'armor_3'] },
        };

        const summary = getCrewBotsAutoEquipSummary(players);
        assert.equal(summary.length, 3);

        const rusty = summary.find((b) => b.name === 'Rusty');
        assert.equal(rusty.tiers.weapon, 1);
        assert.equal(rusty.readyToUpgrade, true);
        assert.ok(rusty.statusLabel.includes('Queued'));

        const bolt = summary.find((b) => b.name === 'Bolt');
        assert.equal(bolt.readyToUpgrade, false);
        assert.equal(bolt.statusLabel, 'Saving Coins');

        const pip = summary.find((b) => b.name === 'Pip');
        assert.equal(pip.maxed, true);
        assert.equal(pip.statusLabel, 'Fully Armed');
    });
});

describe('Interactive Armory Shop UI Component Lifecycle', () => {
    it('creates UI instance with complete public controller interface', () => {
        const ui = createArmoryShopUI();
        assert.equal(typeof ui.open, 'function');
        assert.equal(typeof ui.close, 'function');
        assert.equal(typeof ui.toggle, 'function');
        assert.equal(typeof ui.updatePlayerData, 'function');
        assert.equal(typeof ui.updateCrewPlayers, 'function');
        assert.equal(typeof ui.isOpen, 'function');
        assert.equal(typeof ui.executePurchase, 'function');
        assert.equal(typeof ui.dispose, 'function');
        assert.equal(ui.isOpen(), false);
        ui.dispose();
    });

    it('toggles open/close state without errors', () => {
        const ui = createArmoryShopUI();
        ui.open({ coins: 50, upgrades: [] });
        assert.equal(ui.isOpen(), true);
        ui.close();
        assert.equal(ui.isOpen(), false);
        ui.toggle({ coins: 50, upgrades: [] });
        assert.equal(ui.isOpen(), true);
        ui.dispose();
    });

    it('invokes onPurchase callback and emits socket events on valid purchase', () => {
        let purchasedItem = null;
        let socketEvent = null;
        let socketPayload = null;

        const fakeSocket = {
            emit: (event, data) => {
                socketEvent = event;
                socketPayload = data;
            },
        };

        const ui = createArmoryShopUI({
            socket: fakeSocket,
            onPurchase: (item) => {
                purchasedItem = item;
            },
        });

        ui.open({ coins: 50, upgrades: [] });
        ui.executePurchase('weapon_1');

        assert.ok(purchasedItem);
        assert.equal(purchasedItem.id, 'weapon_1');
        assert.equal(socketEvent, 'buyUpgrade');
        assert.equal(socketPayload, 'weapon'); // legacyType for server compatibility
        ui.dispose();
    });
});
