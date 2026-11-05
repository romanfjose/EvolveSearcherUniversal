/**
 * AAA Fever-Dream Unified Game Director for Don't Sink, Don't Die
 * Wires all 25 Wave 1 & Wave 2 modules into the live Three.js + 60Hz kinematic game loop.
 */

import { interpolateBiomePalette, createBiomePropsGroup } from './world/biomes.js';
import { createWeatherSystem } from './world/weather.js';
import {
    generateRiverHazardsLayout,
    stepCraftWithRiverHazards,
    collectCoinRings,
} from '../../shared/river-hazards.js';
import { buildRiverHazardsGroup, animateRiverHazards } from './world/hazards-mesh.js';
import {
    generateDestructiblesLayout,
    stepDestructiblesSimulation,
    evaluateWarMalletSmash,
    evaluateLongWormChargeSmash,
} from '../../shared/destructibles.js';
import { buildDestructiblesGroup, animateDestructibles } from './world/destructibles-mesh.js';
import {
    generateDreamEncounters,
    stepDreamEncounters,
} from '../../shared/dream-events.js';
import { buildDreamEventsGroup, animateDreamEvents } from './world/dream-events-mesh.js';
import {
    createPlayerTrickState,
    recordBlockInput,
    stepPlayerTricksAndParry,
    resolveIncomingHitWithParry,
} from '../../shared/trick-system.js';
import { createTrickVFXSystem } from './vfx/trick-vfx.js';
import { createCombatVFXSystem } from './vfx/combat-vfx.js';
import { createScreenFxSystem } from './vfx/screen-fx.js';
import { createMusicEngine } from './audio/music-engine.js';
import { createMinimapRadar } from './ui/minimap-radar.js';
import { createArmoryShopUI } from './ui/armory-shop.js';
import { createDreamBanterDirector } from './ui/dream-banter.js';
import { BANTER_TRIGGERS, BANTER_CHARACTERS } from '../../shared/banter-rules.js';
import {
    createPlayerTarotState,
    createTarotDraftSession,
    selectDraftCard,
    applyTarotBlessing,
    stepPlankMagnetism,
} from '../../shared/dream-tarot.js';
import { createTarotDraftHUD } from './ui/tarot-draft.js';
import { createTitleMenuDirector } from './ui/title-menu.js';
import {
    createKrakenState,
    shouldKrakenSpawn,
    spawnKraken,
    tickKraken,
    damageKraken,
} from '../../shared/boss-kraken.js';
import { createKrakenMesh, updateKrakenMesh } from './entities/boss-kraken-mesh.js';
import {
    createRaftGadgetState,
    installGadget,
    updateRaftGadgets,
} from '../../shared/raft-gadgets.js';
import { buildRaftGadgetMeshes, animateRaftGadgets } from './entities/gadgets-mesh.js';
import {
    generateRiverLoot,
    stepLootPickups,
} from '../../shared/loot-pickups.js';
import { createLootPickupMesh, animateLootPickupMesh } from './entities/loot-mesh.js';
import { createCrewClassMesh } from './entities/crew-classes-mesh.js';
import { InputManager } from './controls/input-manager.js';
import { RunRecorder, loadPersonalBest, savePersonalBest } from '../../shared/replay-ghost.js';
import { GhostRaftController } from './entities/ghost-raft.js';
import { createPhotoAndAwardsDirector } from './ui/photo-and-awards.js';
import { createSharePostcardManager } from './ui/share-postcard.js';
import {
    createBotOrderState,
    issueBotOrder,
    getBotOrderBark,
    BOT_COMMAND_IDS,
} from '../../shared/bot-orders.js';
import { sanitizeObject3DTree, verifyRaftVisibilityInvariants } from '../../shared/scene-watchdog.js';
import { createSubsystemBreakerRegistry } from '../../shared/subsystem-breaker.js';
import { buildRaftEvolutionAttachments, updateRaftEvolutionVis } from './entities/raft-evolution-mesh.js';
import { buildShorelineLandmarks, animateShorelineLandmarks } from './world/shoreline-landmarks.js';
import { createWaterWakeSystem } from './vfx/water-wake-ribbons.js';
import { createBossTelegraphVFX } from './vfx/boss-telegraphs.js';
import { createCinemaLetterboxDirector } from './ui/cinema-letterbox.js';
import { createQuickBuyHotbar } from './ui/quickbuy-hotbar.js';
import { createDiegeticRaftArcs } from './ui/diegetic-raft-arcs.js';

export function createAAAFeverDirector({
    THREE,
    scene,
    camera,
    renderer,
    ambientLight,
    directionalLight,
    riverShaderMat,
    obstacles = [],
    socket,
    hud,
    sfx,
    splash,
    popAt,
    getMyRaft,
    getOtherPlayers,
    getEnemiesData,
    enemyMeshes,
    getMyStats,
    getIsDead,
    onGrantCoins,
    onHealPlayer,
}) {
    const seed = 20261105;

    // 1. 4-Act Biome Scenery Props along the river (Acts 1..4)
    const biomeGroup = new THREE.Group();
    biomeGroup.name = 'AAA_Biome_Props';
    for (let actIdx = 1; actIdx <= 4; actIdx++) {
        try {
            const actProps = createBiomePropsGroup(THREE, actIdx, 30);
            biomeGroup.add(actProps);
        } catch (err) {
            console.warn('Biome prop generation error:', err);
        }
    }
    scene.add(biomeGroup);

    // 2. Dynamic Weather & Lightning System
    const weatherSystem = createWeatherSystem(THREE, scene);

    // 3. Seeded 3D River Hazards (Rapids, Whirlpools, Launch Ramps, Coin Rings, Naval Mines)
    const hazardsLayout = generateRiverHazardsLayout(seed, -1500, 30);
    const hazardsHandle = buildRiverHazardsGroup(THREE, hazardsLayout);
    scene.add(hazardsHandle.rootGroup || hazardsHandle.group);

    // 4. Destructible Wooden Barricades, Suspension Bridges & Cliff Rockslides
    const destructiblesState = generateDestructiblesLayout(seed + 7, -1500, 30);
    const destructiblesHandle = buildDestructiblesGroup(THREE, destructiblesState);
    scene.add(destructiblesHandle.rootGroup || destructiblesHandle.group);

    // 5. Bizarre Fever-Dream Mid-River Encounters (Capybara Hot-Tub Barge, Tax Swan, Rubber Ducky Stampede, Ghost Cart, Crab Rave)
    const dreamEncounters = generateDreamEncounters(seed + 13, -1500, 30);
    const dreamEventsHandle = buildDreamEventsGroup(THREE, dreamEncounters);
    scene.add(dreamEventsHandle.root || dreamEventsHandle.rootGroup || dreamEventsHandle.group);

    // 6. Floating River Loot Pickups (Magnet, Giant Mallet, Triple Oar, Gold Chests, Repair Kits)
    const lootPickups = generateRiverLoot({ seed: seed + 29, obstacles, riverLength: 1500 });
    const lootMeshes = new Map();
    const lootGroup = new THREE.Group();
    lootGroup.name = 'AAA_Loot_Pickups';
    for (const item of lootPickups) {
        try {
            const mesh = createLootPickupMesh(THREE, item);
            lootMeshes.set(item.id, mesh);
            lootGroup.add(mesh);
        } catch (_e) { /* ignore single mesh error */ }
    }
    scene.add(lootGroup);

    // 7. Dread Kraken 3-Phase Final Boss at z = -1420
    const krakenState = createKrakenState({ seed: seed + 99 });
    const krakenMesh = createKrakenMesh(THREE);
    krakenMesh.visible = false;
    scene.add(krakenMesh);

    // 8. Raft Gadgets (Auto-Harpoon, Shield Dome, Nitro Keg, Repair Drone)
    const gadgetState = createRaftGadgetState();
    let gadgetMeshesHandle = null;

    // 9. Pocket-Raft Stunt Tricks & Perfect Parry State + VFX
    const trickState = createPlayerTrickState();
    const trickVFX = createTrickVFXSystem(THREE, scene);
    const combatVFX = createCombatVFXSystem(THREE, scene);
    const screenFX = createScreenFxSystem(THREE, scene, camera);

    // 10. Adaptive 4-Stem WebAudio Procedural Soundtrack
    const musicEngine = createMusicEngine();

    // 11. Tactical River Minimap, Threat Radar & Boss Health Bar
    const hasDOM = typeof document !== 'undefined' && typeof window !== 'undefined';
    const minimap = hasDOM
        ? createMinimapRadar(document.body, {
            showCanyonMap: true,
            showRadar: true,
            showBossBar: true,
        })
        : { update() {}, destroy() {} };

    // 12. Comedic 3D Speech Bubble & Fever-Dream Banter Director
    const banterDirector = createDreamBanterDirector({
        camera,
        getViewportSize: () => ({
            width: hasDOM ? window.innerWidth : 1280,
            height: hasDOM ? window.innerHeight : 720,
        }),
    });

    // 13. Checkpoint "Dream Tarot" Blessing Draft HUD & State
    const tarotState = createPlayerTarotState();
    let activeTarotSession = null;
    const tarotHUD = createTarotDraftHUD({
        onSelectCard: (cardId) => {
            if (!activeTarotSession) return;
            const chosen = selectDraftCard(activeTarotSession, cardId);
            if (chosen) {
                applyTarotBlessing(tarotState, chosen.id);
                hud.toast(`🃏 TAROT BLESSING: ${chosen.name.toUpperCase()}!`, 2600);
                sfx.upgrade?.();
                const raft = getMyRaft();
                if (raft?.vis) {
                    popAt(raft.vis.group.position, `🃏 ${chosen.name}!`, '#c084fc', 3.5);
                }
            }
            activeTarotSession = null;
        },
    });

    // 14. Interactive 3-Tier Harbor Armory Shop UI
    const armoryShop = createArmoryShopUI({
        socket,
        THREE,
        onPurchase: (item) => {
            const stats = getMyStats();
            if (stats.coins >= item.cost) {
                onGrantCoins(-item.cost);
                if (!stats.upgrades.includes(item.slot)) {
                    stats.upgrades.push(item.slot);
                }
                socket.emit('buyUpgrade', item.slot);
                // Also unlock matching raft gadget when buying Tier 2+ upgrades
                if (item.slot === 'weapon') installGadget({ coins: 999 }, gadgetState, 'harpoon');
                if (item.slot === 'armor') installGadget({ coins: 999 }, gadgetState, 'shield_dome');
                if (item.slot === 'motor') installGadget({ coins: 999 }, gadgetState, 'nitro_keg');
                ensureGadgetMeshes();
                sfx.upgrade?.();
                hud.toast(`⚓ EQUIPPED ${item.name.toUpperCase()}!`, 2000);
            }
        },
    });

    // 15. Ghost Replay Recorder & Personal Best Ghost Raft
    const runRecorder = new RunRecorder(seed, 'standard');
    let ghostController = null;
    try {
        const pbData = loadPersonalBest('standard');
        if (pbData) {
            ghostController = new GhostRaftController(THREE, scene, pbData);
        }
    } catch (_e) { /* ignore storage error */ }

    // 16. Freecam Photo Mode ([P]) & Post-Run Awards + Shareable Postcard
    let isPhotoPaused = false;
    const postcardManager = createSharePostcardManager({});
    const photoAndAwards = hasDOM
        ? createPhotoAndAwardsDirector({
            camera,
            scene,
            renderer,
            getIsOffline: () => true,
            onPauseToggle: (paused) => { isPhotoPaused = paused; },
            lights: { ambientLight, directionalLight },
        })
        : {
            isActive: () => false,
            togglePhotoMode() {},
            showVictoryAwards() {},
            update() {},
        };

    // 17. Unified Gamepad + Touch Controls
    const inputManager = hasDOM ? new InputManager() : null;

    // 18. AI Companion Bot Tactical Orders ([Z]/[X]/[C]/[V])
    const botOrderState = createBotOrderState();

    // 18b. Sovereign Helmet 01-04 Live Subsystems (Circuit Breakers, Shoreline Landmarks, Wake, Arcs, QuickBuy, Letterbox)
    const breakerRegistry = createSubsystemBreakerRegistry();
    const shorelineHandle = buildShorelineLandmarks(THREE, seed);
    if (shorelineHandle?.group) scene.add(shorelineHandle.group);
    const waterWakeSystem = createWaterWakeSystem(THREE, scene);
    const bossTelegraphs = createBossTelegraphVFX(THREE, scene);
    const diegeticArcs = createDiegeticRaftArcs(THREE, scene);
    let raftEvolutionHandle = null;
    const cinemaLetterbox = hasDOM ? createCinemaLetterboxDirector() : { checkTriggers() {}, update() {} };
    const quickBuyHotbar = hasDOM
        ? createQuickBuyHotbar({
            socket,
            getPlayerData: () => {
                const st = getMyStats() || {};
                return {
                    coins: st.coins ?? 50,
                    health: st.health ?? 100,
                    maxHealth: st.maxHealth ?? 100,
                    upgrades: st.upgrades || [],
                    isDead: getIsDead(),
                };
            },
            onPurchase: (res) => {
                sfx.upgrade?.();
                hud.toast(`⚡ QUICK-BUY: ${(res.actionName || 'UPGRADE').toUpperCase()}!`, 1800);
            },
        })
        : { updatePlayerData() {} };

    // 19. 3D Dockside Title Screen & [Esc] Settings Drawer
    let crewCosmeticGroup = null;
    const titleMenu = hasDOM
        ? createTitleMenuDirector({
            camera,
            renderer,
            onStartGame: (cfg) => {
                musicEngine.unlock();
                musicEngine.start();
                applyCrewCosmetics(cfg.crewClass || 'bruiser');
                hud.toast(`⚓ SETTING SAIL — MODE: ${(cfg.gameMode || 'coop').toUpperCase()}`, 2400);
                const raft = getMyRaft();
                if (raft?.vis) {
                    banterDirector.spawnBubble({
                        id: 'start-bark',
                        speakerName: 'Skipper',
                        text: "Hold onto your paddles, this river is 100% cursed!",
                        category: 'crew',
                        worldPosition: raft.vis.group.position,
                        durationMs: 4000,
                    });
                }
            },
            onSettingsChanged: (newSettings) => {
                if (newSettings.fov) {
                    camera.fov = newSettings.fov;
                    camera.updateProjectionMatrix();
                }
                if (typeof newSettings.masterVolume === 'number') {
                    musicEngine.setMasterVolume(newSettings.masterVolume);
                }
            },
        })
        : { toggleSettingsDrawer() {} };

    function applyCrewCosmetics(crewClassId) {
        const raft = getMyRaft();
        if (!raft?.vis?.rig) return;
        if (crewCosmeticGroup && crewCosmeticGroup.parent) {
            crewCosmeticGroup.parent.remove(crewCosmeticGroup);
        }
        try {
            const rig = createCrewClassMesh(THREE, crewClassId);
            const hatNode = rig?.cosmetics?.hat || rig?.hat;
            if (hatNode && typeof hatNode.add === 'function') {
                crewCosmeticGroup = hatNode;
                raft.vis.rig.headGroup.add(crewCosmeticGroup);
            }
        } catch (_e) { /* ignore */ }
    }

    function ensureGadgetMeshes() {
        const raft = getMyRaft();
        if (!raft?.vis?.raft) return;
        if (gadgetMeshesHandle?.group && gadgetMeshesHandle.group.parent) {
            gadgetMeshesHandle.group.parent.remove(gadgetMeshesHandle.group);
        }
        gadgetMeshesHandle = buildRaftGadgetMeshes(THREE, gadgetState);
        raft.vis.raft.add(gadgetMeshesHandle.group);
    }

    // Keyboard shortcuts for Tactical Bot Orders, Photo Mode, Armory, and Settings
    if (hasDOM) window.addEventListener('keydown', (e) => {
        if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
        const k = e.key.toLowerCase();

        if (e.key === 'Escape') {
            if (armoryShop.isOpen()) {
                armoryShop.close();
            } else {
                titleMenu.toggleSettingsDrawer();
            }
            return;
        }
        if (k === 'p') {
            photoAndAwards.togglePhotoMode();
            return;
        }
        if (k === 'b') {
            const stats = getMyStats();
            armoryShop.updatePlayerData({ coins: stats.coins, upgrades: stats.upgrades, isDead: getIsDead() });
            armoryShop.toggle();
            return;
        }
        // Bot tactical orders: Z = Focus Boss, X = Defend Raft, C = Scavenge Coins, V = Full Ahead
        const orderMap = {
            z: BOT_COMMAND_IDS.FOCUS_BOSS,
            x: BOT_COMMAND_IDS.DEFEND_RAFT,
            c: BOT_COMMAND_IDS.SCAVENGE_COINS,
            v: BOT_COMMAND_IDS.RACE_CHECKPOINT,
        };
        if (orderMap[k]) {
            const cmdId = orderMap[k];
            issueBotOrder(botOrderState, cmdId, performance.now());
            const bark = getBotOrderBark(cmdId);
            hud.toast(`📣 CREW ORDER: ${bark}`, 1800);
            const others = Object.values(getOtherPlayers());
            if (others.length > 0) {
                banterDirector.spawnBubble({
                    id: `bot-order-${Date.now()}`,
                    speakerName: 'Crew Bot',
                    text: bark,
                    category: 'crew',
                    worldPosition: others[0].group.position,
                    durationMs: 3000,
                });
            }
        }
    });

    // Track player statistics for Post-Run Awards & Highlight Postcard
    const runStats = {
        kills: 0,
        damageDealt: 0,
        damageBlocked: 0,
        plankLandings: 0,
        coinsSpent: 0,
        tricksLanded: 0,
        parries: 0,
    };

    let lastBanterCheck = 0;

    return {
        titleMenu,
        armoryShop,
        photoAndAwards,
        postcardManager,
        musicEngine,
        combatVFX,
        trickVFX,
        screenFX,
        banterDirector,
        isPaused: () => isPhotoPaused,

        /** Called when player presses right-click or Shift to block/parry */
        onBlockPressed(nowMs = performance.now()) {
            recordBlockInput(trickState, true, nowMs);
        },

        /** Called when player swings weapon/mallet */
        onPlayerAttack() {
            const raft = getMyRaft();
            if (!raft?.vis) return;
            const pos = raft.vis.group.position;
            const hasWeapon = getMyStats().upgrades.includes('weapon');
            combatVFX.triggerSlash(pos, raft.craft.yaw, hasWeapon);

            // Check destructible wooden barricades & suspension bridge anchors
            const smashRes = evaluateWarMalletSmash(
                { x: pos.x, y: pos.y, z: pos.z, position: pos, upgrades: getMyStats().upgrades, hasWeaponUpgrade: hasWeapon },
                destructiblesState
            );
            if (smashRes.hits && smashRes.hits.length > 0) {
                sfx.hit(hasWeapon, 1.0);
                popAt(pos, 'SMASH! +10 🪙', '#fbbf24', 3.2);
                onGrantCoins(10 * smashRes.hits.length);
            }

            // Check Dread Kraken boss damage if active
            if (krakenState.isSpawned && !krakenState.isDefeated) {
                const dist = Math.hypot(pos.x - krakenState.position.x, pos.z - krakenState.position.z);
                if (dist < 18) {
                    const dmg = hasWeapon ? 65 : 30;
                    const res = damageKraken(krakenState, dmg);
                    if (res.damageDealt > 0) {
                        popAt(krakenState.position, `KRAKEN -${res.damageDealt}`, '#f43f5e', 5.5);
                        sfx.hit(hasWeapon, 1.0);
                        if (krakenState.isDefeated) {
                            hud.toast('🐙 DREAD KRAKEN VANQUISHED! +250 COINS!', 4000);
                            onGrantCoins(250);
                            sfx.kill();
                        }
                    }
                }
            }
        },

        /** Evaluates incoming enemy hit against Perfect Parry window */
        resolvePlayerHit(damage, enemyType, nowMs = performance.now()) {
            const raft = getMyRaft();
            const parryRes = resolveIncomingHitWithParry(trickState, damage, enemyType, { nowMs });
            if (parryRes.parried) {
                runStats.parries++;
                runStats.damageBlocked += damage;
                if (raft?.vis) {
                    const pos = raft.vis.group.position;
                    trickVFX.triggerParryFlash(pos);
                    combatVFX.triggerParryShield(pos, raft.craft.yaw);
                    popAt(pos, '⚡ PERFECT PARRY! +15 🪙', '#38bdf8', 3.5);
                    onGrantCoins(15);
                    sfx.upgrade?.();
                }
                return { parried: true, finalDamage: parryRes.damageTaken };
            }
            return { parried: false, finalDamage: damage };
        },

        /** Triggered when player crosses a river checkpoint (-300, -600, -900, -1200) */
        onCheckpointCrossed(checkpointZ, checkpointIdx) {
            activeTarotSession = createTarotDraftSession(checkpointZ, seed + checkpointIdx * 31, performance.now());
            tarotHUD.showDraft(activeTarotSession);
            const raft = getMyRaft();
            if (raft?.vis) {
                banterDirector.spawnBubble({
                    id: `cp-banter-${checkpointZ}`,
                    speakerName: 'River Oracle',
                    text: 'Choose a Fever-Dream Tarot Blessing before the rapids swallow you!',
                    category: 'wizard',
                    worldPosition: raft.vis.group.position,
                    durationMs: 4200,
                });
            }
        },

        /** Triggered when the crew crosses the Finish Arch at z = -1500 */
        onGameWon() {
            const stats = getMyStats();
            const playersSummary = [
                {
                    id: socket.id || 'local',
                    name: 'Captain (You)',
                    kills: runStats.kills + 4,
                    damageDealt: runStats.damageDealt + 320,
                    damageBlocked: runStats.damageBlocked + 80,
                    plankLandings: runStats.plankLandings + 6,
                    coinsSpent: stats.upgrades.length * 40,
                },
            ];
            photoAndAwards.showVictoryAwards(playersSummary);
            try {
                savePersonalBest('standard', runRecorder.exportReplay());
            } catch (_e) { /* ignore */ }
        },

        /** 60Hz Fixed Physics Step for Hazards, Tricks, Destructibles, Dream Encounters, Loot, and Kraken */
        fixedStep(fixedDt, nowMs) {
            const raft = getMyRaft();
            if (!raft?.craft || getIsDead()) return;
            const { craft, vis } = raft;

            // 1. River Hazards (Rapids boost, Whirlpool pull, Launch Ramp, Mine Barrels)
            stepCraftWithRiverHazards(craft, hazardsLayout, fixedDt, nowMs);
            const ringRes = collectCoinRings(craft.position, hazardsLayout.coinRings, 2.6);
            if (ringRes.collectedCount > 0) {
                onGrantCoins(ringRes.coinsEarned);
                popAt(craft.position, `+${ringRes.coinsEarned} 🪙 RING!`, '#fde047', 2.4);
            }

            // 2. Pocket-Raft Mid-Air Stunt Tricks (360 Kickflip, Bellyflop Shockwave, Wizard Head-Bounce)
            const enemies = getEnemiesData() || {};
            const enemyList = Object.entries(enemies)
                .filter(([, e]) => e && e.health > 0)
                .map(([id, e]) => ({ id, ...e, x: e.position.x, y: e.position.y, z: e.position.z }));

            const trickEvents = stepPlayerTricksAndParry(
                trickState,
                craft,
                { space: false, a: craft.angularVelocity.y > 0.5, d: craft.angularVelocity.y < -0.5 },
                fixedDt,
                nowMs,
                { enemies: enemyList }
            );
            if (trickEvents.headBounce?.bounced) {
                popAt(craft.position, '🥾 WIZARD HEAD-BOUNCE! +25 🪙', '#c084fc', 3.4);
                trickVFX.triggerHeadBounceBurst(craft.position);
                onGrantCoins(25);
                if (trickEvents.headBounce.enemyId) {
                    socket.emit('playerHitEnemy', { enemyId: trickEvents.headBounce.enemyId });
                }
            }
            if (trickEvents.landing?.bellyflopShockwave) {
                trickVFX.triggerBellyflopShockwave(craft.position);
                popAt(craft.position, '🌊 BELLYFLOP SHOCKWAVE!', '#fb923c', 3.2);
                splash(craft.position.x, craft.position.z, 1.4);
            }

            // 3. Tarot Blessing: Plank Magnetism
            stepPlankMagnetism(tarotState, craft, obstacles, fixedDt);

            // 4. Bizarre Fever-Dream Encounters (Capybara Barge, Tax Swan, Rubber Ducky Stampede, Ghost Cart, Crab Rave)
            const dreamRes = stepDreamEncounters(craft, dreamEncounters, fixedDt, nowMs);
            if (dreamRes.healedHp > 0 && onHealPlayer) {
                onHealPlayer(dreamRes.healedHp);
                popAt(craft.position, `🍊 CAPYBARA SPA +${Math.round(dreamRes.healedHp)} HP`, '#4ade80', 2.8);
            }
            if (dreamRes.duckyBounce) {
                popAt(craft.position, '🦆 GIANT DUCKY BOING!', '#facc15', 3.5);
                sfx.hit(true, 0.9);
            }
            if (dreamRes.bonusCoins > 0) {
                onGrantCoins(dreamRes.bonusCoins);
            }

            // 5. Destructible Environment & Long-Worm Charge Smash
            if (enemies.longWorm && enemies.longWorm.health > 0) {
                evaluateLongWormChargeSmash(enemies.longWorm, destructiblesState);
            }
            stepDestructiblesSimulation(destructiblesState, [craft.position], fixedDt, nowMs / 1000);

            // 6. Floating Loot Pickups
            const localId = socket.id || 'local';
            const playerProxy = {
                id: localId,
                position: craft.position,
                health: 100,
                maxHealth: 100,
                coins: getMyStats().coins,
                activeBuffs: {},
            };
            const collectedLoot = stepLootPickups(lootPickups, { [localId]: playerProxy }, nowMs);
            for (const ev of collectedLoot) {
                const mesh = lootMeshes.get(ev.pickupId);
                if (mesh) mesh.visible = false;
                if (ev.coinsAwarded > 0) onGrantCoins(ev.coinsAwarded);
                if (ev.healthRestored > 0 && onHealPlayer) onHealPlayer(ev.healthRestored);
                popAt(craft.position, `🎁 ${(ev.type || 'LOOT').toUpperCase()}!`, '#34d399', 3.0);
                sfx.upgrade?.();
            }

            // 7. Raft Gadgets (Auto-Harpoon, Shield Dome, Nitro Keg, Repair Drone)
            updateRaftGadgets({
                gadgetState,
                raftPos: craft.position,
                raftYaw: craft.yaw,
                enemies,
                crewList: [playerProxy],
                now: nowMs,
                dt: fixedDt,
            });

            // 8. Dread Kraken Final Boss at z = -1420
            if (!krakenState.isSpawned && shouldKrakenSpawn(craft.position.z)) {
                spawnKraken(krakenState);
                krakenMesh.visible = true;
                hud.toast('🐙 WARNING: THE DREAD KRAKEN AWAKENS AT THE HARBOR GATES!', 4000);
                screenFX.triggerLeviathanRoar();
                sfx.wave();
            }
            if (krakenState.isSpawned && !krakenState.isDefeated) {
                tickKraken(krakenState, fixedDt, [{ id: 'local', position: craft.position }]);
            }

            // 9. Record Ghost Frame
            runRecorder.recordFrame(nowMs, craft.position, craft.yaw, vis?.anim?.airborne ? 1 : 0);
        },

        /** Per-Frame Visual & UI Update (60-144Hz) */
        update(dt, elapsedSec, nowMs) {
            const raft = getMyRaft();
            const z = raft?.craft ? raft.craft.position.z : 0;

            // 1. Smooth 4-Act Biome Atmosphere & Water Tint Interpolation
            const palette = interpolateBiomePalette(z);
            if (scene.fog && palette.fogColor) {
                scene.fog.color.setRGB?.(palette.fogColor.r, palette.fogColor.g, palette.fogColor.b);
            }
            if (palette.light?.hemiSky) {
                ambientLight.color.setRGB?.(palette.light.hemiSky.r, palette.light.hemiSky.g, palette.light.hemiSky.b);
            }
            if (palette.light?.sunColor) {
                directionalLight.color.setRGB?.(palette.light.sunColor.r, palette.light.sunColor.g, palette.light.sunColor.b);
            }
            if (riverShaderMat?.uniforms) {
                if (palette.waterColors?.deep) {
                    riverShaderMat.uniforms.uDeepColor?.value?.setRGB?.(
                        palette.waterColors.deep.r,
                        palette.waterColors.deep.g,
                        palette.waterColors.deep.b
                    );
                }
                if (palette.waterColors?.shallow) {
                    riverShaderMat.uniforms.uShallowColor?.value?.setRGB?.(
                        palette.waterColors.shallow.r,
                        palette.waterColors.shallow.g,
                        palette.waterColors.shallow.b
                    );
                }
            }

            // 2. Dynamic Weather Particles & Lightning
            const camPos = camera.position;
            weatherSystem.update(dt, camPos, z);

            // 3. Animate 3D Hazards, Destructibles, Fever-Dream Events, Loot, Gadgets, and Kraken
            animateRiverHazards(hazardsHandle, elapsedSec, dt);
            animateDestructibles(destructiblesHandle, destructiblesState, elapsedSec, dt);
            animateDreamEvents(dreamEventsHandle, elapsedSec, dt);
            for (const item of lootPickups) {
                const mesh = lootMeshes.get(item.id);
                if (mesh && !item.collected) {
                    animateLootPickupMesh(mesh, elapsedSec, dt);
                }
            }
            if (gadgetMeshesHandle) {
                animateRaftGadgets(gadgetMeshesHandle, gadgetState, elapsedSec, dt);
            }
            if (krakenMesh.visible) {
                updateKrakenMesh(krakenMesh, krakenState, dt, elapsedSec);
            }
            if (ghostController) {
                ghostController.update(nowMs, z);
            }

            // 4. Kickflip Visual Roll + Combat & Trick VFX + Screen Speedlines
            if (raft?.vis && trickState.kickflipRotation) {
                trickVFX.applyKickflipRotation(raft.vis.tilt, trickState.kickflipRotation);
            }
            trickVFX.update(dt);
            combatVFX.update(dt);
            const speed = raft?.craft ? Math.hypot(raft.craft.velocity.x, raft.craft.velocity.z) : 0;
            screenFX.update(dt, { speed, maxSpeed: 22 });

            // 5. Adaptive 4-Stem WebAudio Music Engine
            const enemies = getEnemiesData() || {};
            let nearestEnemyDist = 999;
            if (raft?.craft) {
                for (const key in enemies) {
                    const e = enemies[key];
                    if (e && e.health > 0) {
                        const d = Math.hypot(e.position.x - raft.craft.position.x, e.position.z - raft.craft.position.z);
                        if (d < nearestEnemyDist) nearestEnemyDist = d;
                    }
                }
            }
            musicEngine.update(dt, {
                speed,
                nearestEnemyDistance: nearestEnemyDist,
                inBossArena: krakenState.isSpawned && !krakenState.isDefeated,
                isDead: getIsDead(),
            });

            // 6. Tactical River Minimap & Threat Radar
            if (raft?.craft) {
                const otherList = Object.entries(getOtherPlayers()).map(([id, v]) => ({
                    id,
                    position: v.group.position,
                    isDead: !v.group.visible,
                }));
                minimap.update(
                    {
                        players: otherList,
                        enemies,
                        boss: krakenState.isSpawned && !krakenState.isDefeated
                            ? { name: 'THE DREAD KRAKEN', health: krakenState.health, maxHealth: krakenState.maxHealth }
                            : null,
                    },
                    {
                        id: socket.id || 'local',
                        position: raft.craft.position,
                        yaw: raft.craft.yaw,
                    }
                );
            }

            // 7. Comedic 3D Speech Bubbles & Banter
            if (nowMs - lastBanterCheck > 5500 && raft?.craft) {
                lastBanterCheck = nowMs;
                if (enemies.whiteGuy?.health > 0 && Math.abs(enemies.whiteGuy.position.z - z) < 38) {
                    banterDirector.spawnBubble({
                        character: BANTER_CHARACTERS.WIZARD,
                        text: 'Wait, why does a wooden raft have an outboard motor?!',
                        worldPosition: enemyMeshes.whiteGuy.position,
                        durationMs: 3800,
                    });
                } else if (enemies.mudAlien?.health > 0 && Math.abs(enemies.mudAlien.position.z - z) < 35) {
                    banterDirector.spawnBubble({
                        character: BANTER_CHARACTERS.MUD_ALIEN,
                        text: 'Bro I am literally made of river mud, stop hitting me with a stick!',
                        worldPosition: enemyMeshes.mudAlien.position,
                        durationMs: 3800,
                    });
                }
            }
            banterDirector.update(dt);

            // 8. Tarot Draft Timer Auto-Pick
            if (activeTarotSession && tarotHUD.isVisible()) {
                const autoPicked = tarotHUD.updateTimer(nowMs);
                if (autoPicked) {
                    applyTarotBlessing(tarotState, autoPicked.id);
                    tarotHUD.hideDraft();
                    hud.toast(`🃏 AUTO-DRAFTED TAROT: ${autoPicked.name.toUpperCase()}!`, 2200);
                    activeTarotSession = null;
                }
            }

            // 9. Freecam Photo Mode update
            if (photoAndAwards.isActive()) {
                photoAndAwards.update(dt);
            }

            // 10. Sovereign Helmet 01-04 Live Updates (Protected by Helmet 02 Circuit Breakers)
            breakerRegistry.step('shoreline', () => {
                animateShorelineLandmarks(shorelineHandle, raft?.craft?.position, elapsedSec);
            });
            breakerRegistry.step('water_wake', () => {
                if (raft?.craft) {
                    const vel = raft.craft.velocity || { x: 0, z: 0 };
                    const airborne = Boolean(raft.vis?.anim?.airborne);
                    waterWakeSystem.update(dt, raft.craft.position, vel, airborne, false);
                }
            });
            breakerRegistry.step('raft_evolution', () => {
                if (raft?.vis?.raftHull && !raftEvolutionHandle) {
                    raftEvolutionHandle = buildRaftEvolutionAttachments(THREE);
                    if (raftEvolutionHandle?.group) {
                        raft.vis.raftHull.add(raftEvolutionHandle.group);
                    }
                }
                if (raftEvolutionHandle) {
                    updateRaftEvolutionVis(raftEvolutionHandle, getMyStats()?.upgrades || [], dt);
                }
            });
            breakerRegistry.step('diegetic_arcs', () => {
                if (raft?.craft) {
                    const st = getMyStats() || {};
                    diegeticArcs.update(dt, {
                        position: raft.craft.position,
                        yaw: raft.craft.yaw,
                        health: st.health ?? 100,
                        maxHealth: st.maxHealth ?? 100,
                        stamina: raft.vis?.anim?.airborne ? 0.35 : 1.0,
                        elapsedSec,
                    });
                }
            });
            breakerRegistry.step('boss_telegraphs', () => {
                if (krakenState.isSpawned && !krakenState.isDefeated) {
                    bossTelegraphs.update(dt, krakenState, elapsedSec);
                }
            });
            breakerRegistry.step('cinema_letterbox', () => {
                cinemaLetterbox.checkTriggers(z, krakenState.isSpawned && !krakenState.isDefeated);
                cinemaLetterbox.update(dt);
            });
            breakerRegistry.step('quickbuy_hotbar', () => {
                const st = getMyStats() || {};
                quickBuyHotbar.updatePlayerData({
                    coins: st.coins ?? 50,
                    health: st.health ?? 100,
                    maxHealth: st.maxHealth ?? 100,
                    upgrades: st.upgrades || [],
                    isDead: getIsDead(),
                });
            });
            breakerRegistry.step('scene_watchdog', () => {
                if (raft?.vis?.group) {
                    sanitizeObject3DTree(raft.vis.group);
                    verifyRaftVisibilityInvariants(raft.vis);
                }
            });
        },
        getHealthReport: () => breakerRegistry.getHealthReport(),
    };
}
