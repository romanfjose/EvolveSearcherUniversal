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
import { buildRedwoodFlumesBiome, stepRedwoodFlumesBiome } from './world/biome-act1-redwood-flumes.js';
import { buildWalledHarborCityBiome, stepWalledHarborCityBiome } from './world/biome-act2-walled-harbor-city.js';
import { buildSunkenCrystalTemplesBiome, stepSunkenCrystalTemplesBiome } from './world/biome-act3-sunken-crystal-temples.js';
import { buildVolcanicShipwreckCalderaBiome, stepVolcanicShipwreckCalderaBiome } from './world/biome-act4-volcanic-shipwreck-caldera.js';
import { createCoopTetherVfx, updateCoopTetherVfx } from './vfx/coop-tether-vfx.js';
import { buildNauticalBuoyLanes, stepNauticalBuoys } from './world/nautical-buoy-lanes.js';
import { createRaftAnchorVfx, updateRaftAnchorVfx } from './vfx/raft-anchor-vfx.js';

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
    onUpgradePurchased,
    riverWidth = 80,
}) {
    const seed = 20261105;

    // 1. 4-Act Biome Scenery Props + Wave 5A True 3D Architectural Biomes along the 80m river (Acts 1..4)
    const biomeGroup = new THREE.Group();
    biomeGroup.name = 'AAA_Biome_Props';
    for (let actIdx = 1; actIdx <= 4; actIdx++) {
        try {
            const actProps = createBiomePropsGroup(THREE, actIdx, riverWidth);
            biomeGroup.add(actProps);
        } catch (err) {
            console.warn('Biome prop generation error:', err);
        }
    }
    let act1ArchGroup = null;
    let act2ArchGroup = null;
    let act3ArchGroup = null;
    let act4ArchGroup = null;
    let coopTetherGroup = null;
    let nauticalBuoysGroup = null;
    let raftAnchorVfxGroup = null;
    try {
        act1ArchGroup = buildRedwoodFlumesBiome(THREE, { riverWidth, zStart: 0, zEnd: -350 });
        if (act1ArchGroup) act1ArchGroup.visible = false;
    } catch (_e) { /* ignore mock fallback */ }
    try {
        act2ArchGroup = buildWalledHarborCityBiome(THREE, { riverWidth, zStart: -140, zEnd: -700 });
        if (act2ArchGroup) biomeGroup.add(act2ArchGroup);
    } catch (_e) { /* ignore mock fallback */ }
    try {
        act3ArchGroup = buildSunkenCrystalTemplesBiome(THREE, { riverWidth, zStart: -700, zEnd: -1150 });
        if (act3ArchGroup) biomeGroup.add(act3ArchGroup);
    } catch (_e) { /* ignore mock fallback */ }
    try {
        act4ArchGroup = buildVolcanicShipwreckCalderaBiome(THREE, { riverWidth, zStart: -1150, zEnd: -1600 });
        if (act4ArchGroup) biomeGroup.add(act4ArchGroup);
    } catch (_e) { /* ignore mock fallback */ }
    try {
        const dockPlatforms = (obstacles || []).filter((o) => o.isSanctuary && o.z < -95).slice(0, 8);
        nauticalBuoysGroup = buildNauticalBuoyLanes(THREE, { riverWidth, zStart: -95, zEnd: -1500, platforms: dockPlatforms });
        if (nauticalBuoysGroup && typeof nauticalBuoysGroup.add === 'function') biomeGroup.add(nauticalBuoysGroup);
    } catch (_e) { /* ignore mock fallback */ }
    try {
        coopTetherGroup = createCoopTetherVfx(THREE);
        const tetherNode = coopTetherGroup?.group || coopTetherGroup;
        if (tetherNode) tetherNode.visible = false;
    } catch (_e) { /* ignore mock fallback */ }
    scene.add(biomeGroup);

    // 2. Dynamic Weather & Lightning System
    const weatherSystem = createWeatherSystem(THREE, scene);

    // 3. Seeded 3D River Hazards (Rapids, Whirlpools, Launch Ramps, Coin Rings, Naval Mines)
    // Progressive onboarding: keep the first 68m (spawn lagoon) completely free of hazards,
    // then introduce a prominent centreline Whirlpool at z = -76 and Whitewater Rapids at z = -112!
    const rawHazards = generateRiverHazardsLayout(seed, -1500, riverWidth);
    const hazardsLayout = {
        rapids: [
            { id: 'intro_rapids_1', x: 0, z: -112, width: 14, length: 24, angle: 0, direction: { x: 0, z: -1 } },
            ...(rawHazards.rapids || []).filter((h) => h.z < -130),
        ],
        whirlpools: [
            { id: 'intro_whirlpool_1', x: 0, z: -76, radius: 11.5, coreRadius: 2.0, clockwise: true, maxPull: 22, maxSwirl: 28, depth: 2.2 },
            ...(rawHazards.whirlpools || []).filter((h) => h.z < -130),
        ],
        ramps: (rawHazards.ramps || []).filter((h) => h.z < -150),
        mines: (rawHazards.mines || []).filter((h) => h.z < -260),
        coinRings: (rawHazards.coinRings || []).filter((h) => h.z < -150),
    };
    const hazardsHandle = buildRiverHazardsGroup(THREE, hazardsLayout);
    scene.add(hazardsHandle.rootGroup || hazardsHandle.group);

    // 4. Keep the wide river (`ancho`) open & unbloated (no mid-river barricades or floating crystal clutter)
    const destructiblesState = {
        barricades: [],
        bridges: [],
        rockslides: [],
        debris: [],
    };
    const destructiblesHandle = buildDestructiblesGroup(THREE, destructiblesState);
    const destRoot = destructiblesHandle.rootGroup || destructiblesHandle.group;
    if (destRoot) {
        destRoot.visible = false;
        scene.add(destRoot);
    }

    // 5. Keep fever-dream crystal clutter disabled so the 3 Dream Entities & wide river take center stage
    const dreamEncounters = [];
    const dreamEventsHandle = buildDreamEventsGroup(THREE, dreamEncounters);
    const dreamRoot = dreamEventsHandle.root || dreamEventsHandle.rootGroup || dreamEventsHandle.group;
    if (dreamRoot) {
        dreamRoot.visible = false;
        scene.add(dreamRoot);
    }

    // 6. Floating River Loot Pickups (introduced starting at z < -130 near the Harbor approach)
    const lootPickups = (generateRiverLoot({ seed: seed + 29, obstacles, riverLength: 1500 }) || []).filter(
        (item) => (item.position?.z ?? item.z ?? 0) < -130
    );
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

    // 11. Tactical River Minimap, Threat Radar & Boss Health Bar (Canyon strip hidden by default so bottom-right stays clean)
    const hasDOM = typeof document !== 'undefined' && typeof window !== 'undefined';
    const minimap = hasDOM
        ? createMinimapRadar(document.body, {
            showCanyonMap: false,
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
    function applyLocalUpgradePurchase(slot, upgradeId, cost, name) {
        const stats = getMyStats();
        const isTier2OrHigher = Boolean(upgradeId && !['motor_1', 'weapon_1', 'armor_1', 'motor', 'weapon', 'armor'].includes(upgradeId));
        if (!stats.upgrades.includes(slot)) {
            stats.upgrades.push(slot);
        }
        if (upgradeId && !stats.upgrades.includes(upgradeId)) {
            stats.upgrades.push(upgradeId);
        }
        // Only deduct manually for Tier 2/3 upgrades (since Tier 1 socket.emit('buyUpgrade', slot) deducts on loopback server)
        if (isTier2OrHigher && Number.isFinite(cost) && cost > 0) {
            onGrantCoins(-cost);
        } else {
            hud.setStats(stats);
        }
        if (slot === 'weapon') installGadget({ coins: 999 }, gadgetState, 'harpoon');
        if (slot === 'armor') installGadget({ coins: 999 }, gadgetState, 'shield_dome');
        if (slot === 'motor') installGadget({ coins: 999 }, gadgetState, 'nitro_keg');
        onUpgradePurchased?.({ slot, id: upgradeId, cost, name });
        ensureGadgetMeshes();
        sfx.upgrade?.();
        hud.toast(`⚓ EQUIPPED ${(name || slot).toUpperCase()}!`, 2000);
    }

    const armoryShop = createArmoryShopUI({
        socket,
        THREE,
        onPurchase: (item) => {
            applyLocalUpgradePurchase(item.slot, item.id, item.cost, item.name);
            quickBuyHotbar?.render?.();
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
    const shorelineHandle = buildShorelineLandmarks(THREE, seed, { riverWidth });
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
                const safeCoins = Number.isFinite(Number(st.coins)) ? Math.max(0, Math.round(Number(st.coins))) : 50;
                return {
                    coins: safeCoins,
                    health: st.health ?? 100,
                    maxHealth: st.maxHealth ?? 100,
                    upgrades: st.upgrades || [],
                    isDead: getIsDead(),
                };
            },
            onPurchase: (res) => {
                if (res.type === 'repair') {
                    onGrantCoins(-(res.coinsDeducted || 15));
                    onHealPlayer?.(res.healAmount || 35);
                    sfx.upgrade?.();
                    hud.toast(`🩹 HULL PATCHED +${res.healAmount || 35} HP!`, 1800);
                } else if (res.type === 'upgrade') {
                    applyLocalUpgradePurchase(res.upgradeSlot, res.upgradeId, res.coinsDeducted, res.actionName);
                }
                const st = getMyStats() || {};
                armoryShop.updatePlayerData({ coins: st.coins, upgrades: st.upgrades, isDead: getIsDead() });
            },
        })
        : { updatePlayerData() {}, render() {} };

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
                hud.toast('🏁 STAGGERED START — THE WHITE ENTITY IN THE WIZARD HAT HUNTS LAST PLACE! JUMP ON SIDE VEGETATION OR PLANKS FOR SAFETY!', 4600);
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
        if (!raft?.vis?.raft || typeof raft.vis.raft.add !== 'function') return;
        try {
            if (!gadgetMeshesHandle || gadgetMeshesHandle.parentRaft !== raft.vis.raft) {
                gadgetMeshesHandle = buildRaftGadgetMeshes(THREE, raft.vis.raft);
                gadgetMeshesHandle.parentRaft = raft.vis.raft;
            }
        } catch (_e) { /* ignore */ }
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
    let lastHazardFeedbackMs = 0;
    const onboardingStagesShown = new Set();

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

        /** Triggered when player crosses a river checkpoint (-150, -300, -450...) */
        onCheckpointCrossed(checkpointZ, checkpointIdx) {
            const session = createTarotDraftSession(checkpointZ, seed + checkpointIdx * 31, performance.now());
            const firstCard = session?.offeredCards?.[0];
            if (firstCard?.id) {
                applyTarotBlessing(tarotState, firstCard.id);
            }
            activeTarotSession = null;
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

            // 1. River Hazards (Rapids boost, Whirlpool pull + spin + core slingshot, Launch Ramp, Mine Barrels)
            const hazardRes = stepCraftWithRiverHazards(craft, hazardsLayout, fixedDt, nowMs);
            if (hazardRes.inWhirlpool) {
                if (craft.quaternion?.setFromAxisAngle) {
                    craft.quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, craft.yaw);
                }
                if (hazardRes.whirlpoolLaunched) {
                    splash(craft.position.x, craft.position.z, 1.5);
                    sfx.splash?.(1.1);
                    popAt(craft.position, '🌀 VORTEX SLINGSHOT!', '#38bdf8', 3.4);
                    lastHazardFeedbackMs = nowMs;
                } else if (nowMs - lastHazardFeedbackMs > 950) {
                    splash(craft.position.x, craft.position.z, 0.75);
                    popAt(craft.position, '🌀 WHIRLPOOL SPIN!', '#5eead4', 2.6);
                    lastHazardFeedbackMs = nowMs;
                }
            } else if (hazardRes.inRapids && nowMs - lastHazardFeedbackMs > 1200) {
                splash(craft.position.x, craft.position.z, 0.65);
                popAt(craft.position, '🌊 RAPIDS SURGE +45%!', '#7df9ff', 2.5);
                lastHazardFeedbackMs = nowMs;
            } else if (hazardRes.rampInteraction?.launched && nowMs - lastHazardFeedbackMs > 800) {
                splash(craft.position.x, craft.position.z, 1.2);
                popAt(craft.position, '🚀 RAMP LAUNCH!', '#facc15', 3.2);
                lastHazardFeedbackMs = nowMs;
            }
            const ringRes = collectCoinRings(craft.position, hazardsLayout.coinRings, 3.2);
            if (ringRes.collectedCount > 0) {
                const earned = Number(ringRes.earnedCoins ?? ringRes.coinsEarned ?? ringRes.collectedCount * 10) || 10;
                onGrantCoins(earned);
                popAt(craft.position, `+${earned} 🪙 RING!`, '#fde047', 2.4);
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

            // 7. Keep automatic speech bubble popups disabled so the eerie dream entities stay mysterious & uncluttered
            banterDirector.update(dt);

            // 8. Tarot Draft Timer Auto-Pick
            if (activeTarotSession && tarotHUD.isVisible()) {
                const autoPicked = tarotHUD.updateTimer(nowMs);
                if (autoPicked) {
                    const pickId = typeof autoPicked === 'string' ? autoPicked : autoPicked.id;
                    const pickName = autoPicked.name || autoPicked.card?.name || pickId || 'BLESSING';
                    if (pickId) applyTarotBlessing(tarotState, pickId);
                    tarotHUD.hideDraft();
                    hud.toast(`🃏 AUTO-DRAFTED TAROT: ${String(pickName).toUpperCase()}!`, 2200);
                    activeTarotSession = null;
                }
            }

            // 9. Freecam Photo Mode update
            if (photoAndAwards.isActive()) {
                photoAndAwards.update(dt);
            }

            // 10. Sovereign Helmet 01-04 Live Updates (Protected by Helmet 02 Circuit Breakers)
            breakerRegistry.step('biomes_3d_arch', () => {
                if (act1ArchGroup && act1ArchGroup.visible) stepRedwoodFlumesBiome(act1ArchGroup, dt, elapsedSec);
                if (act2ArchGroup) stepWalledHarborCityBiome(act2ArchGroup, dt, elapsedSec);
                if (act3ArchGroup) stepSunkenCrystalTemplesBiome(act3ArchGroup, dt, elapsedSec);
                if (act4ArchGroup) stepVolcanicShipwreckCalderaBiome(act4ArchGroup, dt, elapsedSec);
                if (nauticalBuoysGroup) stepNauticalBuoys(nauticalBuoysGroup, elapsedSec);
            });
            breakerRegistry.step('raft_anchor_vfx', () => {
                if (raftAnchorVfxGroup) raftAnchorVfxGroup.visible = false;
            });
            breakerRegistry.step('coop_tether_vfx', () => {
                const tetherNode = coopTetherGroup?.group || coopTetherGroup;
                if (tetherNode) tetherNode.visible = false;
            });
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
                    const hp = st.health ?? 100;
                    const maxHp = st.maxHealth ?? 100;
                    const isAir = Boolean(raft.vis?.anim?.airborne);
                    diegeticArcs.update(dt, {
                        position: raft.craft.position,
                        yaw: raft.craft.yaw,
                        health: hp,
                        maxHealth: maxHp,
                        stamina: isAir ? 0.35 : 1.0,
                        elapsedSec,
                    });
                    // Keep artificial water arcs hidden so only real whirlpools & foam wake appear on the water
                    diegeticArcs.setVisible(false);
                }
            });

            // Dream Essence Stage Callouts
            if (raft?.craft && !getIsDead()) {
                if (z < -58 && z > -92 && !onboardingStagesShown.has('stage2_whirlpool')) {
                    onboardingStagesShown.add('stage2_whirlpool');
                    hud.toast('🌀 WHIRLPOOLS & RAPIDS AHEAD — JUMP ON SIDE VEGETATION BORDERS OR PLANKS TO STAY SAFE FROM THE WHITE GUY!', 4200);
                } else if (z < -138 && z > -245 && !onboardingStagesShown.has('stage4_harbor')) {
                    onboardingStagesShown.add('stage4_harbor');
                    hud.toast('🏙️ RIVERSIDE CITY: LURE THE 3-LEGGED MUD ALIEN NEAR A PEDESTRIAN SO ITS AOE TRIGGERS THE POLICE GUNS!', 5200);
                } else if (z < -275 && z > -350 && !onboardingStagesShown.has('stage5_worm')) {
                    onboardingStagesShown.add('stage5_worm');
                    hud.toast('🐍 THE LONG WORM: STRIKES IN STRAIGHT VECTORS LIKE NOKIA SNAKE — WATCH ITS HEAD & SIDESTEP!', 4800);
                }
            }
            breakerRegistry.step('boss_telegraphs', () => {
                if (krakenState.isSpawned && !krakenState.isDefeated) {
                    bossTelegraphs.update(dt, krakenState, elapsedSec);
                }
            });
            breakerRegistry.step('cinema_letterbox', () => {
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
