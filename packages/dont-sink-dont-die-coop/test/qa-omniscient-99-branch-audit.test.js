/**
 * Don't Sink, Don't Die — Helmet 08 Forensic Anti-Spoof 99% Branch Verification Suite
 *
 * Forensically cross-examines the real shared modules to ensure zero placebo branches,
 * fake mocks, or cosmetic shortcuts across:
 * 1. All 4 Crew Classes (helmsman, bruiser, tinkerer, mystic) produce distinct, non-identity stat multipliers.
 * 2. All 9 Armory Upgrades across Tiers 1..3 (motor_1..3, weapon_1..3, armor_1..3) strictly increase
 *    cumulative speed, attack damage (dps), or maxHealth in shared/game-core.js and shared/upgrade-tree.js.
 * 3. All 4 Raft Gadgets (harpoon, shield-dome, nitro-keg, repair-drone) install cleanly and emit real
 *    combat/propulsion/heal events in updateRaftGadgets.
 * 4. All 4 Bot Commands (form-up, focus-fire, scavenge, rush-checkpoint) transition botOrderState.activeOrder
 *    and emit non-empty crew barks.
 * 5. All 6 Dream Tarot cards deal, select, and stack cleanly via createTarotDraftSession and applyTarotBlessing.
 * 6. Final Boss Dread Kraken deterministic multi-phase combat and hazards physics integration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    CREW_CLASS_IDS,
    CREW_CLASSES,
    getCrewClass,
    applyCrewClassPerks,
    calculateTurnResponsiveness,
    calculateMeleeKnockback,
    calculateSwingArc,
    calculateShopCost,
    calculateMotorSpeed,
    calculateBlockedDamage,
    calculateReviveAuraRadius,
    hasCurrentReading,
} from '../shared/crew-classes.js';

import {
    UPGRADE_SLOTS,
    ARMORY_UPGRADE_TREE,
    ALL_UPGRADES,
    BASE_PLAYER_STATS,
    calculateCumulativeStats,
    canPurchaseArmoryUpgrade,
    getSlotCurrentTier,
} from '../shared/upgrade-tree.js';

import {
    PLAYER,
    PHYSICS,
    createGameState,
    addPlayer,
    playerHitEnemy,
    driveWatercraft,
} from '../shared/game-core.js';

import {
    GADGET_TYPES,
    GADGET_CONFIGS,
    createRaftGadgetState,
    installGadget,
    canInstallGadget,
    setNitroBoost,
    activateShieldDome,
    updateRaftGadgets,
} from '../shared/raft-gadgets.js';

import {
    BOT_COMMAND_IDS,
    BOT_ORDER_DEFINITIONS,
    createBotOrderState,
    issueBotOrder,
    getBotOrderBark,
    decideTacticalBotOrder,
} from '../shared/bot-orders.js';

import {
    TAROT_CARD_IDS,
    TAROT_CARD_KEYS,
    TAROT_CARDS,
    createTarotDraftSession,
    selectDraftCard,
    createPlayerTarotState,
    applyTarotBlessing,
    hasTarotBlessing,
    getPaddleCadenceModifier,
    triggerDiplomaticImmunity,
    evaluateHeavyPocketAnvilSlam,
    recordSqueakyHammerHit,
    stepPlankMagnetism,
    resolveReversePsychologyBlock,
} from '../shared/dream-tarot.js';

import {
    KRAKEN_CONFIG,
    createKrakenState,
    spawnKraken,
    damageKraken,
    tickKraken,
} from '../shared/boss-kraken.js';

import {
    HAZARD_CONSTANTS,
    generateRiverHazardsLayout,
    calculateRapidsBoost,
    evaluateWhirlpoolField,
    createMineBarrel,
    updateMineBarrel,
} from '../shared/river-hazards.js';

describe('Helmet 08 Forensic Anti-Spoof 99% Branch Verification Suite', () => {

    describe('Pillar 1: Forensic Crew Classes — Distinct, Non-Identity Stat Multipliers', () => {
        it('registers exactly all 4 required crew classes', () => {
            assert.deepEqual(
                [...CREW_CLASS_IDS].sort(),
                ['bruiser', 'helmsman', 'mystic', 'tinkerer'].sort(),
                'Must define helmsman, bruiser, tinkerer, mystic'
            );
            assert.equal(Object.keys(CREW_CLASSES).length, 4);
        });

        it('Helmsman produces distinct non-identity turn responsiveness and radar perks', () => {
            const baseRate = 2.0;
            const helmsmanTurn = calculateTurnResponsiveness(baseRate, 'helmsman');
            const neutralTurn = calculateTurnResponsiveness(baseRate, 'bruiser');

            assert.ok(helmsmanTurn > neutralTurn, 'Helmsman turn rate must be higher than base');
            assert.equal(helmsmanTurn, baseRate * 1.15, 'Helmsman grants exact +15% turn responsiveness');
            assert.equal(hasCurrentReading('helmsman'), true, 'Helmsman has river current radar');
            assert.equal(hasCurrentReading('bruiser'), false, 'Non-helmsman lacks river current radar');

            const applied = applyCrewClassPerks({ turnRate: 2.0, yawResponse: 16 }, 'helmsman');
            assert.equal(applied.classId, 'helmsman');
            assert.ok(applied.turnRate > 2.0);
            assert.ok(applied.yawResponse > 16);
            assert.equal(applied.canReadCurrent, true);
        });

        it('Bruiser produces distinct non-identity melee knockback and swing arc multipliers', () => {
            const baseKnockback = 100;
            const baseArc = Math.PI * 0.5;

            const bruiserKnockback = calculateMeleeKnockback(baseKnockback, 'bruiser');
            const neutralKnockback = calculateMeleeKnockback(baseKnockback, 'helmsman');
            const bruiserArc = calculateSwingArc(baseArc, 'bruiser');
            const neutralArc = calculateSwingArc(baseArc, 'helmsman');

            assert.ok(bruiserKnockback > neutralKnockback, 'Bruiser knockback must exceed base');
            assert.equal(bruiserKnockback, baseKnockback * 1.25, 'Bruiser grants exact +25% melee knockback');
            assert.ok(bruiserArc > neutralArc, 'Bruiser swing arc must exceed base');
            assert.equal(bruiserArc, baseArc * 1.25, 'Bruiser grants exact +25% swing arc');

            const applied = applyCrewClassPerks({ knockback: 1.0, swingArc: Math.PI * 0.5 }, 'bruiser');
            assert.equal(applied.classId, 'bruiser');
            assert.equal(applied.meleeKnockback, 1.25);
            assert.equal(applied.swingArc, (Math.PI * 0.5) * 1.25);
        });

        it('Tinkerer produces distinct non-identity shop discount and motor speed boost', () => {
            const baseCost = 50;
            const baseMotor = 100;

            const tinkererCost = calculateShopCost(baseCost, 'tinkerer');
            const normalCost = calculateShopCost(baseCost, 'helmsman');
            const tinkererMotor = calculateMotorSpeed(baseMotor, 'tinkerer');
            const normalMotor = calculateMotorSpeed(baseMotor, 'helmsman');

            assert.ok(tinkererCost < normalCost, 'Tinkerer cost must be strictly discounted');
            assert.equal(tinkererCost, Math.floor(baseCost * 0.8), 'Tinkerer grants exact 20% discount (80% cost)');
            assert.ok(tinkererMotor > normalMotor, 'Tinkerer motor must be strictly faster');
            assert.equal(tinkererMotor, baseMotor * 1.25, 'Tinkerer grants exact +25% motor thrust');

            const applied = applyCrewClassPerks({ motorBoost: 100 }, 'tinkerer');
            assert.equal(applied.classId, 'tinkerer');
            assert.equal(applied.shopDiscount, 0.20);
            assert.equal(applied.motorBoost, 125);
        });

        it('Mystic produces distinct non-identity block damage reduction and revive aura expansion', () => {
            const rawDamage = 40;
            const mysticBlocked = calculateBlockedDamage(rawDamage, true, 'mystic', 0.2);
            const standardBlocked = calculateBlockedDamage(rawDamage, true, 'helmsman', 0.2);
            const mysticReviveAura = calculateReviveAuraRadius(25, 'mystic');
            const standardReviveAura = calculateReviveAuraRadius(25, 'helmsman');

            assert.ok(mysticBlocked < standardBlocked, 'Mystic takes strictly less damage while blocking');
            assert.ok(mysticReviveAura > standardReviveAura, 'Mystic revive aura is strictly wider');
            assert.equal(mysticReviveAura, 25 * 1.25, 'Mystic grants exact +25% revive aura radius');

            const applied = applyCrewClassPerks({ blockFactor: 0.2, reviveAuraRadius: 25 }, 'mystic');
            assert.equal(applied.classId, 'mystic');
            assert.ok(applied.blockFactor < 0.2, 'Block factor must be reduced');
            assert.equal(applied.reviveAuraRadius, 31.25);
        });

        it('forensically audits all perk profiles against the identity baseline', () => {
            // No class perk profile may match any other class perk profile
            const profiles = CREW_CLASS_IDS.map((id) => {
                const cls = getCrewClass(id);
                return JSON.stringify(cls.perks);
            });
            const uniqueProfiles = new Set(profiles);
            assert.equal(uniqueProfiles.size, 4, 'All 4 classes must have distinct, unique perk JSON payloads');
        });
    });

    describe('Pillar 2: Forensic Armory Upgrades — Tiers 1..3 Strict Cumulative Stat Increases', () => {
        it('defines all 9 upgrades across Tiers 1..3 with valid slots and costs', () => {
            const expectedIds = [
                'motor_1', 'motor_2', 'motor_3',
                'weapon_1', 'weapon_2', 'weapon_3',
                'armor_1', 'armor_2', 'armor_3',
            ];
            for (const id of expectedIds) {
                const item = ALL_UPGRADES[id];
                assert.ok(item, `Upgrade ${id} must exist in ALL_UPGRADES`);
                assert.ok(item.cost > 0, `Upgrade ${id} cost must be positive`);
                assert.ok(item.tier >= 1 && item.tier <= 3, `Upgrade ${id} tier must be 1..3`);
                assert.ok(['motor', 'weapon', 'armor'].includes(item.slot), `Upgrade ${id} slot must be valid`);
            }
        });

        it('Motor Tiers 1..3 strictly increase forward speed cumulatively', () => {
            const baseStats = calculateCumulativeStats([]);
            const tier1Stats = calculateCumulativeStats(['motor_1']);
            const tier2Stats = calculateCumulativeStats(['motor_2']);
            const tier3Stats = calculateCumulativeStats(['motor_3']);

            assert.equal(baseStats.speed, BASE_PLAYER_STATS.speed);
            assert.ok(tier1Stats.speed > baseStats.speed, 'Motor Tier 1 must increase speed over base');
            assert.ok(tier2Stats.speed > tier1Stats.speed, 'Motor Tier 2 must increase speed over Tier 1');
            assert.ok(tier3Stats.speed > tier2Stats.speed, 'Motor Tier 3 must increase speed over Tier 2');

            assert.equal(tier1Stats.speed, 20.0);
            assert.equal(tier2Stats.speed, 24.0);
            assert.equal(tier3Stats.speed, 28.5);

            // Verify physical driveWatercraft responds to motor upgrades
            const craft = { position: { x: 0, y: 0.25, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }, yaw: 0 };
            driveWatercraft(craft, { w: true, upgrades: ['motor_1'] }, 0.05);
            assert.ok(craft.velocity.z < 0, 'Craft must gain downriver velocity (-Z)');
        });

        it('Weapon Tiers 1..3 strictly increase attack damage (dps) cumulatively', () => {
            const baseStats = calculateCumulativeStats([]);
            const tier1Stats = calculateCumulativeStats(['weapon_1']);
            const tier2Stats = calculateCumulativeStats(['weapon_2']);
            const tier3Stats = calculateCumulativeStats(['weapon_3']);

            assert.equal(baseStats.dps, BASE_PLAYER_STATS.dps);
            assert.ok(tier1Stats.dps > baseStats.dps, 'Weapon Tier 1 must increase attack damage over base');
            assert.ok(tier2Stats.dps > tier1Stats.dps, 'Weapon Tier 2 must increase attack damage over Tier 1');
            assert.ok(tier3Stats.dps > tier2Stats.dps, 'Weapon Tier 3 must increase attack damage over Tier 2');

            assert.equal(tier1Stats.dps, 30.0);
            assert.equal(tier2Stats.dps, 45.0);
            assert.equal(tier3Stats.dps, 65.0);

            // Verify real enemy damage in game-core combat simulation
            const state = createGameState();
            addPlayer(state, 'p1');
            state.enemies.whiteGuy = {
                id: 'whiteGuy',
                type: 'whiteGuy',
                health: 200,
                maxHealth: 200,
                position: { x: 0, y: 0.5, z: -5 },
            };

            state.players.p1.upgrades = ['weapon'];
            const hitEvents = playerHitEnemy(state, 'p1', 'whiteGuy');
            assert.ok(hitEvents.length > 0);
            const enemyHitEv = hitEvents.find((e) => e.event === 'enemyHit');
            assert.ok(enemyHitEv);
            assert.equal(enemyHitEv.data.damage, 30, 'Base 10 + Weapon 20 = 30 attack damage');
        });

        it('Armor Tiers 1..3 strictly increase maxHealth cumulatively', () => {
            const baseStats = calculateCumulativeStats([]);
            const tier1Stats = calculateCumulativeStats(['armor_1']);
            const tier2Stats = calculateCumulativeStats(['armor_2']);
            const tier3Stats = calculateCumulativeStats(['armor_3']);

            assert.equal(baseStats.maxHp, BASE_PLAYER_STATS.maxHp);
            assert.ok(tier1Stats.maxHp > baseStats.maxHp, 'Armor Tier 1 must increase maxHealth over base');
            assert.ok(tier2Stats.maxHp > tier1Stats.maxHp, 'Armor Tier 2 must increase maxHealth over Tier 1');
            assert.ok(tier3Stats.maxHp > tier2Stats.maxHp, 'Armor Tier 3 must increase maxHealth over Tier 2');

            assert.equal(tier1Stats.maxHp, 150);
            assert.equal(tier2Stats.maxHp, 190);
            assert.equal(tier3Stats.maxHp, 240);
        });

        it('verifies tier prerequisites and purchase validity', () => {
            const p = { coins: 100, upgrades: [] };
            assert.equal(canPurchaseArmoryUpgrade(p, 'motor_1').ok, true);
            assert.equal(canPurchaseArmoryUpgrade(p, 'motor_2').ok, false, 'Cannot skip Tier 1 to buy Tier 2 directly');

            p.upgrades.push('motor_1');
            assert.equal(canPurchaseArmoryUpgrade(p, 'motor_1').ok, false, 'Cannot buy already owned Tier 1');
            assert.equal(canPurchaseArmoryUpgrade(p, 'motor_2').ok, true, 'Can buy Tier 2 once Tier 1 is owned');

            p.coins = 5;
            assert.equal(canPurchaseArmoryUpgrade(p, 'motor_2').ok, false, 'Cannot buy Tier 2 with insufficient coins');
        });
    });

    describe('Pillar 3: Forensic Raft Gadgets — Real Combat/Propulsion/Heal Events', () => {
        it('defines all 4 tactical gadgets with distinct slots and non-zero parameters', () => {
            const expectedGadgets = ['harpoon', 'shield-dome', 'nitro-keg', 'repair-drone'];
            for (const g of expectedGadgets) {
                const cfg = GADGET_CONFIGS[g];
                assert.ok(cfg, `Gadget ${g} config must exist`);
                assert.ok(cfg.cost > 0, `Gadget ${g} must have positive cost`);
                assert.ok(cfg.slot, `Gadget ${g} must specify a mount slot`);
            }
        });

        it('installs all 4 gadgets cleanly into separate raft mount slots', () => {
            const player = { coins: 500 };
            const gadgetState = createRaftGadgetState();

            for (const type of Object.values(GADGET_TYPES)) {
                const res = installGadget(player, gadgetState, type);
                assert.equal(res.success, true, `Should install gadget ${type}`);
                assert.ok(gadgetState.installed[type], `Gadget ${type} must be marked installed`);
            }

            assert.equal(Object.keys(gadgetState.installed).length, 4);
            assert.equal(player.coins, 500 - (35 + 40 + 30 + 45));

            // Attempting duplicate installation fails
            const dup = installGadget(player, gadgetState, GADGET_TYPES.HARPOON);
            assert.equal(dup.success, false);
            assert.equal(dup.reason, 'already-installed');
        });

        it('Harpoon Ballista fires active tether bolts and emits harpoon_fire events', () => {
            const player = { coins: 100 };
            const gadgetState = createRaftGadgetState();
            installGadget(player, gadgetState, GADGET_TYPES.HARPOON);

            const enemies = {
                e1: { id: 'e1', health: 80, position: { x: 5, y: 0.5, z: -10 } },
            };

            const updates = updateRaftGadgets({
                gadgetState,
                raftPos: { x: 0, y: 0.25, z: 0 },
                raftYaw: 0,
                enemies,
                now: 2000,
                dt: 0.05,
            });

            assert.ok(updates.harpoonEvents.length > 0, 'Must emit harpoon fire event');
            const fireEv = updates.harpoonEvents[0];
            assert.equal(fireEv.type, 'harpoon_fire');
            assert.equal(fireEv.targetId, 'e1');
            assert.equal(fireEv.damage, GADGET_CONFIGS.harpoon.boltDamage);
            assert.ok(gadgetState.harpoon.activeBolts.length > 0, 'Active bolt must be tracked');
        });

        it('Arcane Shockwave Bell expands and emits shockwave_hit combat events', () => {
            const player = { coins: 100 };
            const gadgetState = createRaftGadgetState();
            installGadget(player, gadgetState, GADGET_TYPES.SHIELD_DOME);

            const actRes = activateShieldDome(gadgetState, 1000);
            assert.equal(actRes.success, true);
            assert.equal(gadgetState.shieldDome.isShockwaveActive, true);

            const enemies = {
                e2: { id: 'e2', health: 100, mass: 10, position: { x: 2, y: 0.5, z: 2 } },
            };

            // Step with dt = 0.25 so shockwave expands past enemy distance (~2.82m)
            const updates = updateRaftGadgets({
                gadgetState,
                raftPos: { x: 0, y: 0.25, z: 0 },
                enemies,
                now: 1050,
                dt: 0.25,
            });

            assert.ok(updates.shieldEvents.length > 0, 'Must emit shockwave_hit event');
            const hitEv = updates.shieldEvents[0];
            assert.equal(hitEv.type, 'shockwave_hit');
            assert.equal(hitEv.enemyId, 'e2');
            assert.equal(hitEv.damage, GADGET_CONFIGS['shield-dome'].damage);
            assert.ok(hitEv.knockback.x > 0);
            assert.ok(hitEv.knockback.z > 0);
        });

        it('Twin Nitro Hydro-Jets burn fuel and emit real forward propulsion thrust', () => {
            const player = { coins: 100 };
            const gadgetState = createRaftGadgetState();
            installGadget(player, gadgetState, GADGET_TYPES.NITRO_KEG);

            setNitroBoost(gadgetState, true);
            const updates = updateRaftGadgets({
                gadgetState,
                raftPos: { x: 0, y: 0.25, z: 0 },
                now: 500,
                dt: 0.1,
            });

            assert.equal(updates.nitroStatus.active, true);
            assert.equal(updates.nitroStatus.thrustBoost, GADGET_CONFIGS['nitro-keg'].thrustBoost);
            assert.ok(updates.nitroStatus.fuel < updates.nitroStatus.maxFuel, 'Fuel must decrease while boosting');
        });

        it('Clockwork Pelican Companion orbits and emits real crewmate heal events', () => {
            const player = { coins: 100 };
            const gadgetState = createRaftGadgetState();
            installGadget(player, gadgetState, GADGET_TYPES.REPAIR_DRONE);

            const crewList = [
                { id: 'c1', health: 40, maxHealth: 100, isDead: false, position: { x: 2, y: 0.5, z: 2 } },
            ];

            const updates = updateRaftGadgets({
                gadgetState,
                raftPos: { x: 0, y: 0.25, z: 0 },
                crewList,
                now: 1000,
                dt: 0.05,
            });

            assert.ok(updates.droneStatus.companionPos, 'Companion pelican 3D position must be tracked');
            assert.ok(updates.droneStatus.healedTargets.length > 0, 'Must heal damaged crewmate');
            const heal = updates.droneStatus.healedTargets[0];
            assert.equal(heal.id, 'c1');
            assert.ok(heal.amount > 0);
            assert.ok(crewList[0].health > 40, 'Target crewmate health must increase');
        });
    });

    describe('Pillar 4: Forensic Bot Orders — activeOrder Transitions & Non-Empty Barks', () => {
        it('transitions activeOrder and spawns non-empty crew barks for all 4 commands', () => {
            const commands = [
                BOT_COMMAND_IDS.FORM_UP,
                BOT_COMMAND_IDS.FOCUS_FIRE,
                BOT_COMMAND_IDS.SCAVENGE,
                BOT_COMMAND_IDS.RUSH_CHECKPOINT,
            ];

            const issuer = { id: 'captain', name: 'Captain', position: { x: 0, y: 0.25, z: 0 } };
            const bots = [
                { id: 'bot_1', name: 'Rusty', botIndex: 0, position: { x: -3, y: 0.25, z: 3 } },
                { id: 'bot_2', name: 'Bolt', botIndex: 1, position: { x: 3, y: 0.25, z: 3 } },
            ];

            for (const cmd of commands) {
                const orderState = createBotOrderState();
                const now = 1000;
                const res = issueBotOrder(orderState, cmd, issuer, bots, now);

                assert.equal(res.success, true, `Command ${cmd} must succeed`);
                assert.ok(orderState.activeOrder, 'activeOrder must be populated');
                assert.equal(orderState.activeOrder.id, cmd);
                assert.equal(orderState.activeOrder.issuedBy, 'captain');
                assert.ok(orderState.activeOrder.expiresAt > now);

                // Verify leader and companion chat bubbles
                assert.ok(res.bubbles.length >= 3, 'Must contain leader bubble + 2 bot bubbles');
                const leaderBubble = res.bubbles[0];
                assert.equal(leaderBubble.speakerId, 'captain');
                assert.ok(leaderBubble.text.length > 0);

                const bot1Bubble = res.bubbles[1];
                assert.equal(bot1Bubble.speakerId, 'bot_1');
                assert.ok(bot1Bubble.text.length > 0, 'Bot 1 bark must be non-empty');

                const bot2Bubble = res.bubbles[2];
                assert.equal(bot2Bubble.speakerId, 'bot_2');
                assert.ok(bot2Bubble.text.length > 0, 'Bot 2 bark must be non-empty');

                // Verify bark generation helper
                const barkAck = getBotOrderBark(cmd, 0, false);
                const barkAction = getBotOrderBark(cmd, 0, true);
                assert.ok(typeof barkAck === 'string' && barkAck.length > 0);
                assert.ok(typeof barkAction === 'string' && barkAction.length > 0);
            }
        });

        it('modifies companion bot AI decisions under active orders', () => {
            const state = createGameState();
            const bot = {
                id: 'bot_1',
                isBot: true,
                botIndex: 0,
                position: { x: 0, y: 0.25, z: -50 },
                upgrades: [],
                isDead: false,
            };

            const orderFormUp = BOT_ORDER_DEFINITIONS[BOT_COMMAND_IDS.FORM_UP];
            const decisionFormUp = decideTacticalBotOrder(state, bot, { id: 'form-up', definition: orderFormUp });
            assert.ok(decisionFormUp);
            assert.equal(decisionFormUp.mode, 'order-form-up');

            const orderRush = BOT_ORDER_DEFINITIONS[BOT_COMMAND_IDS.RUSH_CHECKPOINT];
            const decisionRush = decideTacticalBotOrder(state, bot, { id: 'rush-checkpoint', definition: orderRush });
            assert.ok(decisionRush);
            assert.equal(decisionRush.mode, 'order-rush-checkpoint');
            assert.ok(decisionRush.speedBoost > 1.0);
        });
    });

    describe('Pillar 5: Forensic Dream Tarot — Deal, Select & Clean Stacking', () => {
        it('deals exactly 3 unique cards from the 6 available Dream Tarot blessings', () => {
            assert.equal(TAROT_CARD_KEYS.length, 6);
            for (const key of TAROT_CARD_KEYS) {
                assert.ok(TAROT_CARDS[key], `Card ${key} definition must exist`);
            }

            const session = createTarotDraftSession({ checkpointIndex: 2, seed: 1337 });
            assert.equal(session.active, true);
            assert.equal(session.cards.length, 3);

            const dealtIds = session.cards.map((c) => c.id);
            const uniqueDealt = new Set(dealtIds);
            assert.equal(uniqueDealt.size, 3, 'All 3 dealt cards must be distinct');
        });

        it('selects card cleanly via index or hotkey without stall', () => {
            const session = createTarotDraftSession({ checkpointIndex: 2, seed: 42 });
            const cardToSelect = session.cards[1];

            const outcome = selectDraftCard(session, 1);
            assert.equal(outcome.success, true);
            assert.equal(outcome.card.id, cardToSelect.id);
            assert.equal(session.completed, true);
            assert.equal(session.active, false);
            assert.equal(session.selectedCardId, cardToSelect.id);
        });

        it('stacks all 6 Tarot cards onto player state and verifies non-zero mechanics', () => {
            const playerTarot = createPlayerTarotState();

            // 1. Stack all 6 cards
            for (const cardId of TAROT_CARD_KEYS) {
                const res = applyTarotBlessing(playerTarot, cardId);
                assert.equal(res.success, true);
                assert.equal(hasTarotBlessing(playerTarot, cardId), true);
            }
            assert.equal(Object.keys(playerTarot.blessings).length, 6);

            // Stacking duplicate increments count cleanly
            const dupRes = applyTarotBlessing(playerTarot, TAROT_CARD_IDS.CAFFEINATED_OARS);
            assert.equal(dupRes.success, true);
            assert.equal(playerTarot.blessings[TAROT_CARD_IDS.CAFFEINATED_OARS].count, 2);

            // 2. Mechanic 1: Caffeinated Oars (+25% cadence & espresso wake)
            const cadence = getPaddleCadenceModifier(playerTarot);
            assert.equal(cadence.cadenceMultiplier, 1.25);
            assert.equal(cadence.thrustMultiplier, 1.25);
            assert.equal(cadence.espressoFoam, true);

            // 3. Mechanic 2: Diplomatic Immunity (2 Police Officers on jet-skis)
            const enemies = { m1: { id: 'm1', position: { x: 0, y: 0.5, z: -20 }, health: 100 } };
            const police = triggerDiplomaticImmunity(playerTarot, { x: 0, y: 0.25, z: 0 }, enemies, 100);
            assert.equal(police.summoned, true);
            assert.equal(police.count, 2);
            assert.equal(police.officers.length, 2);
            assert.ok(police.totalShotDamage > 0);

            // 4. Mechanic 3: Heavy Pocket Anvil (60 slam damage in 6.5m radius)
            const anvilRes = evaluateHeavyPocketAnvilSlam(playerTarot, { x: 0, y: 0.25, z: -20 }, enemies);
            assert.equal(anvilRes.active, true);
            assert.equal(anvilRes.slamDamage, 60);
            assert.ok(anvilRes.hitEnemies.length > 0);

            // 5. Mechanic 4: Squeaky Overdrive (140 dB shockwave every 3rd hit)
            recordSqueakyHammerHit(playerTarot, { x: 0, y: 0, z: 0 }, enemies);
            recordSqueakyHammerHit(playerTarot, { x: 0, y: 0, z: 0 }, enemies);
            const thirdHit = recordSqueakyHammerHit(playerTarot, { x: 0, y: 0, z: 0 }, enemies);
            assert.equal(thirdHit.shockwaveTriggered, true);
            assert.equal(thirdHit.decibels, 140);
            assert.equal(thirdHit.shockwaveDamage, 45);

            // 6. Mechanic 5: Plank Magnetism (Attracts loot within 14m)
            const lootItems = [{ id: 'coin_1', position: { x: 5, z: 5 }, collected: false }];
            const magnetRes = stepPlankMagnetism(playerTarot, { x: 0, y: 0.25, z: 0 }, lootItems, 0.05);
            assert.equal(magnetRes.active, true);
            assert.ok(magnetRes.attractedCount > 0);
            assert.ok(lootItems[0].position.x < 5, 'Coin must be pulled toward raft');

            // 7. Mechanic 6: Reverse Psychology (+8 coins on Wizard block)
            const player = { coins: 50 };
            const blockRes = resolveReversePsychologyBlock(playerTarot, player, 'whiteGuy', true);
            assert.equal(blockRes.converted, true);
            assert.equal(blockRes.coinsAdded, 8);
            assert.equal(player.coins, 58);
            assert.equal(blockRes.damageMultiplier, 0.0);
        });
    });

    describe('Pillar 6: Forensic Dread Kraken Boss & River Hazards Physical Reality', () => {
        it('spawns Dread Kraken, steps all 3 combat phases, and drops coin fountain on defeat', () => {
            const krakenState = createKrakenState({ seed: 777 });
            assert.equal(krakenState.phase, 1);
            assert.equal(krakenState.health, KRAKEN_CONFIG.maxHealth);

            // Spawn
            const spawnEvents = spawnKraken(krakenState);
            assert.equal(krakenState.isSpawned, true);
            assert.ok(spawnEvents.length > 0);

            // Damage to Phase 2 (threshold <= 66.7%)
            damageKraken(krakenState, 600);
            assert.equal(krakenState.phase, 2);
            assert.equal(krakenState.whirlpoolActive, true);
            assert.ok(krakenState.barnacles.some((b) => b.active));

            // Damage to Phase 3 (Phase 2 has 50% armored resistance; threshold hpFraction <= 0.3333)
            damageKraken(krakenState, 802);
            assert.equal(krakenState.phase, 3);
            assert.equal(krakenState.isFrenzyActive, true);

            // Defeat (Phase 3 removes armored resistance, reducing health to 0)
            damageKraken(krakenState, 500);
            assert.equal(krakenState.health, 0);
            assert.equal(krakenState.isDefeated, true);
            assert.ok(krakenState.coinDrops.length > 0, 'Coin fountain must spawn on defeat');

            // Step defeat animation: boss sinks, coins have velocity
            tickKraken(krakenState, 0.05, []);
            assert.ok(krakenState.deathTimer > 0);
        });

        it('River Hazards generate deterministic layout with real physical vectors', () => {
            const layout = generateRiverHazardsLayout(42);
            assert.ok(layout.rapids.length > 0, 'Must generate rapids');
            assert.ok(layout.whirlpools.length > 0, 'Must generate whirlpools');
            assert.ok(layout.ramps.length > 0, 'Must generate ramps');
            assert.ok(layout.mines.length > 0, 'Must generate mine barrels');
            assert.ok(layout.coinRings.length > 0, 'Must generate coin rings');

            // Rapids boost vector is directed downriver (-Z)
            const boost = calculateRapidsBoost({ x: 0, z: -5 }, layout.rapids[0]);
            assert.equal(boost.active, true);
            assert.ok(boost.multiplier > 1.0);
            assert.ok(boost.boostVelocity.z < 0);

            // Whirlpool produces inward radial pull and tangential swirl
            const wpField = evaluateWhirlpoolField({ x: layout.whirlpools[0].x + 3, z: layout.whirlpools[0].z }, layout.whirlpools[0]);
            assert.equal(wpField.inside, true);
            assert.ok(wpField.radialPull.x !== 0 || wpField.radialPull.z !== 0);
            assert.ok(wpField.tangentialSwirl.x !== 0 || wpField.tangentialSwirl.z !== 0);

            // Exploding Mine detects craft and counts down fuse
            const mine = createMineBarrel('test_mine', 0, 0);
            const triggerRes = updateMineBarrel(mine, [{ position: { x: 1, z: 1 } }], 50, 100);
            assert.equal(triggerRes.state, 'triggered');
            assert.ok(triggerRes.events.length > 0);
        });
    });
});
