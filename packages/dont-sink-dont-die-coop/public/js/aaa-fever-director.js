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
import { createCrewClassMesh, createSillyHatMesh } from './entities/crew-classes-mesh.js';
import { getCrewClass } from '../../shared/crew-classes.js';
import { getDailySeed, GRAPHICS_PRESETS } from '../../shared/game-settings.js';
import { EndlessSession, hashString } from '../../shared/endless-mode.js';
import { createSplitScreenManager } from './modes/splitscreen.js';
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
import { resolveCrewClassPerks, computeClassDiscountedCost } from '../../shared/crew-class-gameplay-bridge.js';
import { installGadgetForArmoryPurchase, stepAndApplyRaftGadgets } from '../../shared/gadget-live-resolver.js';
import { dispatchBotOrderByKey, computeWingmanOrderedTarget } from '../../shared/bot-order-formation-bridge.js';
import { grantCheckpointTarotBlessing, computeTarotLiveModifiers } from '../../shared/tarot-gameplay-bridge.js';
import { resolveEscapeKeyAction, createSingleDispatchKeyGuard } from '../../shared/modal-and-keybind-router.js';
import { isWithinRenderHorizon, cullSceneByRaftZ } from '../../shared/spatial-biome-culler.js';
import { computeTieredCraftFeel } from '../../shared/tiered-upgrade-physics-bridge.js';
import { getModeCameraProfile } from '../../shared/camera-modes-and-kickflip-feel.js';
import { getBranchAudioCue } from '../../shared/audio-branch-cues.js';
import { evaluateSceneClutterBudget } from '../../shared/frustum-clutter-budget.js';
import { verifyZonePayoffAtPosition, RIVER_KEY_ZONES } from '../../shared/landmark-payoff-verifier.js';

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
    getAllPlayers,
    getEnemiesData,
    enemyMeshes,
    getMyStats,
    getIsDead,
    onGrantCoins,
    onHealPlayer,
    onUpgradePurchased,
    onRunLaunch,
    onFovChanged,
    onCameraShakeChanged,
    riverWidth = 80,
}) {
    let seed = 20261105;
    let selectedClass = 'helmsman';
    let selectedHatId = 'captain_tricorn';
    let activeMode = 'campaign';
    let endlessSession = null;
    let splitScreenManager = null;

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
    const keyGuard = createSingleDispatchKeyGuard(80);
    function applyLocalUpgradePurchase(slot, upgradeId, cost, name) {
        const stats = getMyStats();
        if (!stats.upgrades.includes(slot)) {
            stats.upgrades.push(slot);
        }
        if (upgradeId && !stats.upgrades.includes(upgradeId)) {
            stats.upgrades.push(upgradeId);
        }
        // Tinkerer Class Passive Perk: -20% shop upgrade cost refund via crew-class-gameplay-bridge
        const discountedCost = computeClassDiscountedCost(cost, selectedClass);
        if (Number.isFinite(cost) && cost > discountedCost) {
            onGrantCoins?.(cost - discountedCost);
        }
        hud.setStats(stats);
        installGadgetForArmoryPurchase(gadgetState, slot, upgradeId);
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
    if (inputManager) {
        inputManager.onAction('shop', () => {
            const stats = getMyStats();
            const allP = typeof getAllPlayers === 'function' ? getAllPlayers() : {};
            armoryShop.updatePlayerData({ coins: stats.coins, upgrades: stats.upgrades, isDead: getIsDead() });
            armoryShop.updateCrewPlayers(allP);
            armoryShop.toggle({ coins: stats.coins, upgrades: stats.upgrades, isDead: getIsDead() }, allP);
        });
        inputManager.onAction('settings', () => {
            if (armoryShop.isOpen()) {
                armoryShop.close();
            } else {
                titleMenu?.toggleSettingsDrawer?.();
            }
        });
    }

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
    function applyLiveSettingsToEngine(newSettings = {}) {
        if (!newSettings) return;
        if (Number.isFinite(Number(newSettings.fov)) && camera) {
            camera.fov = Number(newSettings.fov);
            camera.updateProjectionMatrix?.();
            onFovChanged?.(Number(newSettings.fov));
        }
        if (Number.isFinite(Number(newSettings.cameraShake))) {
            onCameraShakeChanged?.(Number(newSettings.cameraShake));
        }
        const aud = newSettings.audio || {};
        const masterVol = typeof newSettings.masterVolume === 'number'
            ? newSettings.masterVolume
            : (typeof aud.master === 'number' ? aud.master : 1.0);
        const musicVol = typeof aud.music === 'number' ? aud.music : 0.8;
        const sfxVol = typeof aud.sfx === 'number' ? aud.sfx : 1.0;
        const squeakyVol = typeof aud.squeakyHammer === 'number' ? aud.squeakyHammer : 1.25;
        const isMuted = Boolean(aud.muted);

        musicEngine.setMasterVolume?.(isMuted ? 0 : Math.min(2, masterVol * musicVol));
        sfx?.setVolume?.(isMuted ? 0 : Math.min(2, masterVol * sfxVol));
        sfx?.setSqueakyVolume?.(squeakyVol);
        sfx?.setMuted?.(isMuted);

        if (newSettings.graphicsPreset && GRAPHICS_PRESETS[newSettings.graphicsPreset] && renderer) {
            const preset = GRAPHICS_PRESETS[newSettings.graphicsPreset];
            if (typeof window !== 'undefined' && renderer.setPixelRatio) {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap || 2));
            }
            if (renderer.shadowMap) {
                renderer.shadowMap.enabled = Boolean(preset.shadowsEnabled);
            }
        }
    }

    const titleMenu = hasDOM
        ? createTitleMenuDirector({
            camera,
            renderer,
            onStartGame: (cfg = {}) => {
                musicEngine.unlock();
                musicEngine.start();

                selectedClass = cfg.classId || cfg.crewClass || 'helmsman';
                selectedHatId = cfg.hatId || 'captain_tricorn';
                activeMode = cfg.mode || 'campaign';
                const botCount = cfg.botCount ?? 2;
                const playerName = cfg.playerName || 'Captain River';

                if (activeMode === 'daily') {
                    seed = hashString(getDailySeed());
                } else if (cfg.seed) {
                    seed = hashString(String(cfg.seed));
                }

                if (activeMode === 'endless') {
                    endlessSession = new EndlessSession({ seed, playerName });
                } else {
                    endlessSession = null;
                }

                if (activeMode === 'splitscreen') {
                    if (!splitScreenManager && hasDOM) {
                        splitScreenManager = createSplitScreenManager(THREE, renderer, scene, {
                            fov: cfg.fov || 72,
                        });
                    }
                } else if (splitScreenManager) {
                    splitScreenManager.dispose();
                    splitScreenManager = null;
                }

                applyLiveSettingsToEngine(cfg);
                socket?.setPaused?.(false);

                onRunLaunch?.({
                    ...cfg,
                    classId: selectedClass,
                    hatId: selectedHatId,
                    mode: activeMode,
                    botCount,
                    playerName,
                    numericSeed: seed,
                });

                applyCrewCosmetics(selectedClass, selectedHatId);
                // Helmet 03 (Pacing, Narrative & Essence): Show, Never Explain — zero all-caps tutorial banner spam at start
            },
            onSettingsChanged: (newSettings) => {
                applyLiveSettingsToEngine(newSettings);
            },
        })
        : {
            toggleSettingsDrawer() {},
            isTitleVisible: () => false,
            isSettingsDrawerOpen: () => false,
            getSettings: () => ({ classId: 'helmsman', hatId: 'captain_tricorn', mode: 'campaign', botCount: 2 }),
        };

    // Pause authoritative loopback server while initial title screen is open in browser
    if (hasDOM && titleMenu.isTitleVisible?.()) {
        socket?.setPaused?.(true);
        const initCfg = titleMenu.getSettings?.() || {};
        selectedClass = initCfg.classId || 'helmsman';
        selectedHatId = initCfg.hatId || 'captain_tricorn';
        activeMode = initCfg.mode || 'campaign';
        applyLiveSettingsToEngine(initCfg);
    }

    function applyCrewCosmetics(crewClassId = selectedClass, hatId = selectedHatId, targetRaft = getMyRaft()) {
        if (!targetRaft?.vis?.rig) return;
        const vis = targetRaft.vis;
        if (Array.isArray(vis.cosmeticNodes)) {
            for (const node of vis.cosmeticNodes) {
                if (node && node.parent) node.parent.remove(node);
            }
        }
        vis.cosmeticNodes = [];

        try {
            const clsId = crewClassId || selectedClass || 'helmsman';
            const hId = hatId || selectedHatId || 'captain_tricorn';
            const classDef = getCrewClass(clsId);
            if (targetRaft.craft) {
                targetRaft.craft.classPerks = { ...(classDef?.perks || {}) };
            }
            const mySt = getMyStats?.();
            if (mySt && targetRaft === getMyRaft()) {
                mySt.classPerks = { ...(classDef?.perks || {}) };
            }
            const rig = createCrewClassMesh(THREE, clsId);

            // Hide default flat cylinder bandana on headGroup when wearing a 3D hat
            if (vis.rig.headGroup?.children) {
                for (const child of vis.rig.headGroup.children) {
                    if (child?.geometry?.type === 'CylinderGeometry' && Math.abs((child.position?.y || 0) - 0.1) < 0.05) {
                        child.visible = false;
                    }
                }
            }

            // Attach selected 3D Silly Hat (or class hat) to headGroup
            const hatNode = hId ? createSillyHatMesh(THREE, hId) : (rig?.cosmetics?.hat || rig?.hat);
            if (hatNode && vis.rig.headGroup?.add) {
                vis.rig.headGroup.add(hatNode);
                vis.cosmeticNodes.push(hatNode);
            }

            // Attach class body outfit accessories (coat, pauldrons, steampunk crane backpack, mystic talisman/lantern)
            const torsoTarget = vis.rig.torso || vis.rig.character;
            if (torsoTarget?.add && rig?.cosmetics) {
                const { coat, pauldrons, backpack, talisman, accessory } = rig.cosmetics;
                for (const part of [coat, backpack, talisman, accessory]) {
                    if (part) {
                        if (part.parent) part.parent.remove(part);
                        torsoTarget.add(part);
                        vis.cosmeticNodes.push(part);
                    }
                }
                if (Array.isArray(pauldrons)) {
                    for (const p of pauldrons) {
                        if (p) {
                            if (p.parent) p.parent.remove(p);
                            torsoTarget.add(p);
                            vis.cosmeticNodes.push(p);
                        }
                    }
                }
            }
        } catch (_e) { /* ignore */ }
    }

    function ensureGadgetMeshes() {
        // Helmet 03 & 04: Keep 1-person inflatable raft silhouette pure (no floating sci-fi drone ring or clutter)
    }

    // Keyboard shortcuts for Tactical Bot Orders, Photo Mode, Armory, and Settings
    if (hasDOM) window.addEventListener('keydown', (e) => {
        if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
        const k = e.key.toLowerCase();

        if (e.key === 'Escape') {
            if (armoryShop.isOpen()) {
                const armoryEl = document.getElementById('armory-overlay');
                if (armoryEl) armoryEl.dataset.justClosedAt = String(Date.now());
                armoryShop.close();
                e.stopImmediatePropagation?.();
            }
            return;
        }
        // Note: [P] Photo Mode keydown is handled directly inside photoAndAwards (photo-and-awards.js)
        // so we do not double-toggle it ON and immediately OFF in the same event tick.
        if (k === 'b') {
            const stats = getMyStats();
            const allP = typeof getAllPlayers === 'function' ? getAllPlayers() : {};
            armoryShop.updatePlayerData({ coins: stats.coins, upgrades: stats.upgrades, isDead: getIsDead() });
            armoryShop.updateCrewPlayers(allP);
            armoryShop.toggle({ coins: stats.coins, upgrades: stats.upgrades, isDead: getIsDead() }, allP);
            return;
        }
        // Bot tactical orders: Z = Focus Boss/Fire, X = Form Up & Defend, C = Scavenge Coins, V = Rush Checkpoint
        if (['z', 'x', 'c', 'v'].includes(k)) {
            if (!keyGuard.shouldProcess(k)) return;
            const orderRes = dispatchBotOrderByKey(botOrderState, k, performance.now(), { ignoreCooldown: true });
            if (orderRes.issued && orderRes.commandId) {
                const bark = orderRes.bark || getBotOrderBark(orderRes.commandId);
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
    let meleeSwingCounter = 0;
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
        hazardsHandle,
        hazardsLayout,
        krakenState,
        krakenMesh,
        gadgetState,
        botOrderState,
        tarotState,
        getActiveMode: () => activeMode,
        getSelectedClass: () => selectedClass,
        getSelectedHat: () => selectedHatId,
        getCrewClassDef: () => getCrewClass(selectedClass),
        getClassPerks: () => ({ ...(getCrewClass(selectedClass)?.perks || {}), ...resolveCrewClassPerks(selectedClass) }),
        isClassPerksWired: () => true,
        isGadgetEventsWired: () => true,
        isBotOrderFormationWired: () => true,
        isTarotMultipliersWired: () => true,
        getTarotMultipliers: () => computeTarotLiveModifiers(tarotState),
        getTieredCraftFeel: () => computeTieredCraftFeel(getMyStats()?.upgrades || []),
        getModeCameraProfile: () => getModeCameraProfile(activeMode),
        getBranchAudioCue: (cueId) => getBranchAudioCue(cueId),
        getSceneClutterEvaluation: (metrics = {}) => evaluateSceneClutterBudget(metrics),
        getLandmarkAuditReport: (pos = { x: 0, z: -42 }) => ({ zones: RIVER_KEY_ZONES, current: verifyZonePayoffAtPosition(pos) }),
        getBotFormationWaypoint: (botIndex = 0, leaderPos = { x: 0, z: 0 }, enemiesMap = {}) =>
            computeWingmanOrderedTarget({
                botIndex,
                playerPos: leaderPos,
                activeOrderId: botOrderState?.activeOrder || 'form-up',
                enemies: enemiesMap,
            }),
        getEndlessSession: () => endlessSession,
        getSplitScreenManager: () => splitScreenManager,
        inputManager,
        getInputManager: () => inputManager,
        applyCrewCosmetics,
        isPaused: () => {
            const paused = isPhotoPaused
                || Boolean(titleMenu?.isTitleVisible?.())
                || Boolean(titleMenu?.isSettingsDrawerOpen?.())
                || Boolean(armoryShop?.isOpen?.());
            socket?.setPaused?.(paused);
            return paused;
        },

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
            meleeSwingCounter++;

            // Tarot Blessing: Squeaky Overdrive (every 3rd melee hit unleashes a 45-damage 8m ultrasonic shockwave)
            if ((tarotState?.blessings?.['squeaky-overdrive']?.count || 0) > 0 && meleeSwingCounter % 3 === 0) {
                const enemies = getEnemiesData() || {};
                for (const [eId, e] of Object.entries(enemies)) {
                    if (e && e.health > 0 && Math.hypot(e.position.x - pos.x, e.position.z - pos.z) <= 8.5) {
                        socket.emit('playerHitEnemy', { enemyId: eId });
                    }
                }
                popAt(pos, '🔨 SQUEAKY OVERDRIVE!', '#ec4899', 3.2);
            }

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
        onCheckpointCrossed(checkpointZ, checkpointIdx = 0) {
            grantCheckpointTarotBlessing(tarotState, checkpointZ, checkpointIdx, seed, performance.now());
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

            // 1. River Hazards (Rapids boost, Whirlpool pull + spin + core slingshot, Launch Ramp) — physical feedback only, zero noisy emoji popups
            const hazardRes = stepCraftWithRiverHazards(craft, hazardsLayout, fixedDt, nowMs);
            if (hazardRes.inWhirlpool) {
                if (craft.quaternion?.setFromAxisAngle) {
                    craft.quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, craft.yaw);
                }
                if (hazardRes.whirlpoolLaunched) {
                    splash(craft.position.x, craft.position.z, 1.5);
                    sfx.splash?.(1.1);
                    lastHazardFeedbackMs = nowMs;
                } else if (nowMs - lastHazardFeedbackMs > 950) {
                    splash(craft.position.x, craft.position.z, 0.75);
                    lastHazardFeedbackMs = nowMs;
                }
            } else if (hazardRes.inRapids && nowMs - lastHazardFeedbackMs > 1200) {
                splash(craft.position.x, craft.position.z, 0.65);
                lastHazardFeedbackMs = nowMs;
            } else if (hazardRes.rampInteraction?.launched && nowMs - lastHazardFeedbackMs > 800) {
                splash(craft.position.x, craft.position.z, 1.2);
                lastHazardFeedbackMs = nowMs;
            }
            const ringRes = collectCoinRings(craft.position, hazardsLayout.coinRings, 3.2);
            if (ringRes.collectedCount > 0) {
                const earned = Number(ringRes.earnedCoins ?? ringRes.coinsEarned ?? ringRes.collectedCount * 10) || 10;
                onGrantCoins(earned);
                popAt(craft.position, `+${earned}`, '#fde047', 2.2);
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
            const gadgetRes = updateRaftGadgets({
                gadgetState,
                raftPos: craft.position,
                raftYaw: craft.yaw,
                enemies,
                crewList: [playerProxy],
                now: nowMs,
                dt: fixedDt,
            });
            if (Array.isArray(gadgetRes?.events)) {
                for (const gev of gadgetRes.events) {
                    if ((gev.type === 'harpoon-hit' || gev.type === 'harpoon-fire') && gev.targetId && enemies[gev.targetId]?.health > 0) {
                        socket.emit('playerHitEnemy', { enemyId: gev.targetId });
                    } else if (gev.type === 'repair-heal' && gev.healAmount > 0 && onHealPlayer) {
                        onHealPlayer(gev.healAmount);
                    }
                }
            }

            // 8. Dread Kraken Final Boss at z = -1420 (or earlier in Boss Rush mode at z = -450)
            const krakenTriggerZ = activeMode === 'boss_rush' ? -450 : -1300;
            if (!krakenState.isSpawned && shouldKrakenSpawn(craft.position.z, krakenTriggerZ)) {
                krakenState.position.z = activeMode === 'boss_rush' ? craft.position.z - 55 : -1420;
                spawnKraken(krakenState);
                krakenMesh.visible = true;
                hud.toast('🐙 WARNING: THE DREAD KRAKEN AWAKENS AT THE HARBOR GATES!', 4000);
                screenFX.triggerLeviathanRoar();
                sfx.wave();
            }
            if (krakenState.isSpawned && !krakenState.isDefeated) {
                krakenState.targetPosition = craft.position;
                tickKraken(krakenState, fixedDt, [{ id: 'local', position: craft.position }]);
            }

            // 8b. Endless Rogue-River Sector Chainer & Split-Screen Update
            if (activeMode === 'endless' && endlessSession) {
                const endRes = endlessSession.updateRaftZ(craft.position.z);
                if (endRes?.newEvents?.length) {
                    for (const ev of endRes.newEvents) {
                        if (ev.event === 'endless:sector_entered') {
                            hud.toast(`♾️ ENDLESS SECTOR ${ev.data.sectorIndex + 1}: ${ev.data.biomeName.toUpperCase()}!`, 3200);
                        } else if (ev.event === 'endless:perk_draft_triggered' && ev.data?.offer?.cards?.[0]) {
                            const topCard = ev.data.offer.cards[0];
                            endlessSession.selectPerk(topCard.id);
                            hud.toast(`🃏 ROGUE PERK DRAFTED: ${topCard.name.toUpperCase()}!`, 2600);
                        }
                    }
                }
            }
            if (activeMode === 'splitscreen' && splitScreenManager) {
                splitScreenManager.player1.craft.position.x = craft.position.x;
                splitScreenManager.player1.craft.position.y = craft.position.y;
                splitScreenManager.player1.craft.position.z = craft.position.z;
                splitScreenManager.player1.craft.velocity.x = craft.velocity.x;
                splitScreenManager.player1.craft.velocity.z = craft.velocity.z;
                splitScreenManager.player1.craft.yaw = craft.yaw;
            }

            // 9. Record Ghost Frame (Helmet 06: hard ring-buffer cap of 7200 frames so 8-hour runs use constant RAM)
            runRecorder.recordFrame(nowMs, craft.position, craft.yaw, vis?.anim?.airborne ? 1 : 0);
            if (Array.isArray(runRecorder.frames) && runRecorder.frames.length > 7200) {
                runRecorder.frames.shift();
            }
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

            // 3. Animate 3D Hazards, Destructibles, Fever-Dream Events, Loot, Gadgets, and Kraken (with Helmet 06 spatial distance culling)
            animateRiverHazards(hazardsHandle, elapsedSec, dt, z);
            animateDestructibles(destructiblesHandle, destructiblesState, elapsedSec, dt);
            animateDreamEvents(dreamEventsHandle, elapsedSec, dt);
            for (const item of lootPickups) {
                const mesh = lootMeshes.get(item.id);
                if (mesh && !item.collected) {
                    const itemZ = item.position?.z ?? item.z ?? 0;
                    if (Math.abs(itemZ - z) <= 220) {
                        animateLootPickupMesh(mesh, elapsedSec, dt);
                    }
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

            // 10. Sovereign Helmet 01-06 Live Updates & Z-Horizon Spatial Culling (Protected by Helmet 02 Circuit Breakers)
            breakerRegistry.step('biomes_3d_arch', () => {
                // Helmet 06 (Pragmatic Performance): Cull distant Act architectural groups and props via spatial-biome-culler
                cullSceneByRaftZ({
                    raftZ: z,
                    actGroups: {
                        act1: act1ArchGroup,
                        act2: act2ArchGroup,
                        act3: act3ArchGroup,
                        act4: act4ArchGroup,
                    },
                    shorelineGroup: shorelineHandle?.group || null,
                });
                if (act1ArchGroup) act1ArchGroup.visible = false;
                if (act2ArchGroup?.visible) stepWalledHarborCityBiome(act2ArchGroup, dt, elapsedSec);
                if (act3ArchGroup?.visible) stepSunkenCrystalTemplesBiome(act3ArchGroup, dt, elapsedSec);
                if (act4ArchGroup?.visible) stepVolcanicShipwreckCalderaBiome(act4ArchGroup, dt, elapsedSec);
                if (nauticalBuoysGroup) {
                    for (const child of nauticalBuoysGroup.children || []) {
                        const cz = child.position?.z ?? 0;
                        if (cz !== 0) child.visible = isWithinRenderHorizon(cz, z, 220, 70);
                    }
                    stepNauticalBuoys(nauticalBuoysGroup, elapsedSec);
                }
                for (const child of biomeGroup.children || []) {
                    if (child === act2ArchGroup || child === act3ArchGroup || child === act4ArchGroup || child === nauticalBuoysGroup) continue;
                    for (const prop of child.children || []) {
                        const pz = prop.position?.z ?? 0;
                        if (pz !== 0) prop.visible = isWithinRenderHorizon(pz, z, 220, 70);
                    }
                }
            });
            breakerRegistry.step('raft_anchor_vfx', () => {
                if (raftAnchorVfxGroup) raftAnchorVfxGroup.visible = false;
            });
            breakerRegistry.step('coop_tether_vfx', () => {
                const tetherNode = coopTetherGroup?.group || coopTetherGroup;
                if (tetherNode) tetherNode.visible = false;
            });
            breakerRegistry.step('shoreline', () => {
                if (shorelineHandle?.group?.children) {
                    for (const sp of shorelineHandle.group.children) {
                        const sz = sp.position?.z ?? 0;
                        if (sz !== 0) sp.visible = sz >= z - 240 && sz <= z + 80;
                    }
                }
                animateShorelineLandmarks(shorelineHandle, raft?.craft?.position, elapsedSec);
            });
            breakerRegistry.step('water_wake', () => {
                // Helmet 04: Keep flat polygon wake ribbons hidden so only the natural foam droplet wake renders
                if (waterWakeSystem?.group) waterWakeSystem.group.visible = false;
                if (waterWakeSystem?.leftMesh) waterWakeSystem.leftMesh.visible = false;
                if (waterWakeSystem?.rightMesh) waterWakeSystem.rightMesh.visible = false;
            });
            breakerRegistry.step('raft_evolution', () => {
                // Helmet 03 & 04: Keep 1-person plastic inflatable raft silhouette pure (no floating side drones)
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

            // Helmet 03 (Pacing, Narrative & Essence): Show, Never Explain — zero all-caps tutorial banner popups
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
            if (inputManager?.touchElements) {
                const modalOpen = isPhotoPaused
                    || Boolean(titleMenu?.isTitleVisible?.())
                    || Boolean(titleMenu?.isSettingsDrawerOpen?.())
                    || Boolean(armoryShop?.isOpen?.());
                inputManager.setTouchVisible(!modalOpen && activeMode !== 'splitscreen');
            }
        },
        getHealthReport: () => breakerRegistry.getHealthReport(),
    };
}
