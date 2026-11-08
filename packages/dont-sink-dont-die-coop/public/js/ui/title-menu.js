/**
 * Don't Sink, Don't Die — 3D Dockside Title Screen, Party Mode Picker,
 * Crew Hat/Class Customizer, and [Esc] Settings Drawer.
 *
 * Requirements fulfilled:
 * 1. Render a polished glassmorphic Title & Crew Lobby overlay over the live 3D river dock scene with:
 *    - Mode selector: Standard 4-Act Campaign, Daily Fever-Dream Seed, Endless Rogue-River, Boss Rush, 2P Split-Screen.
 *    - Crew Class & Silly Hat selector (Captain Tricorn, Viking Horns, Traffic Cone, Giant Frog Hat, Wizard Beard, Disco Afro)
 *      + AI Bot count (1-3) + 1-click "Copy Challenge Seed URL" button to share with friends.
 *    - [Esc] Settings Drawer: Graphics Quality preset (Ultra AAA / Balanced / Laptop 60fps), Audio Mix sliders
 *      (Master, Music, SFX, Squeaky Hammer Volume 0-200%), Camera Shake slider, and FOV slider.
 * 2. Zero-external runtime dependencies; ES module with modular DOM components and callbacks.
 */

import {
    GAME_MODES,
    GAME_MODE_IDS,
    SILLY_HATS,
    SILLY_HAT_IDS,
    GRAPHICS_PRESETS,
    GRAPHICS_PRESET_IDS,
    DEFAULT_SETTINGS,
    sanitizeSettings,
    loadGameSettings,
    saveGameSettings,
    resetGameSettings,
    buildChallengeSeedUrl,
    parseChallengeSeedUrl,
    getDailySeed,
    generateRandomSeed,
    clampBotCount,
    clampVolume,
    clampFov,
    clampCameraShake,
} from '../../../shared/game-settings.js';

import { CREW_CLASSES, CREW_CLASS_IDS, getCrewClass } from '../../../shared/crew-classes.js';

/**
 * Creates and mounts the Title Menu, Lobby, and Settings Drawer overlay.
 *
 * @param {object} params
 * @param {Function} [params.onStartGame] - Callback (settings) => void when Start is clicked
 * @param {Function} [params.onSettingsChanged] - Callback (settings) => void on any live setting change (FOV, graphics, audio, etc.)
 * @param {object} [params.camera] - Optional Three.js PerspectiveCamera for live FOV updates
 * @param {object} [params.renderer] - Optional Three.js WebGLRenderer for live graphics preset updates
 * @param {object} [params.initialSettings] - Optional overrides for initial settings
 * @returns {object} Controller instance
 */
export function createTitleMenuDirector({
    onStartGame = () => {},
    onSettingsChanged = () => {},
    camera = null,
    renderer = null,
    initialSettings = null,
} = {}) {
    // Load or initialize settings from localStorage + query params
    let settings = loadGameSettings();
    if (initialSettings) {
        settings = sanitizeSettings({ ...settings, ...initialSettings });
    }

    // Check if browser URL has challenge seed params
    if (typeof window !== 'undefined' && window.location?.search) {
        const querySettings = parseChallengeSeedUrl(window.location.search);
        if (querySettings) {
            settings = sanitizeSettings({ ...settings, ...querySettings });
        }
    }

    let isTitleVisible = true;
    let isSettingsDrawerOpen = false;

    // Build DOM Elements
    const dom = buildTitleAndSettingsDOM();
    if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(dom.root);
    }

    // Update UI Elements with active settings
    syncUIWithSettings();

    // Setup Event Listeners
    setupEventListeners();

    // Apply initial settings (e.g. FOV and graphics preset)
    applyLiveSettings(settings);

    function applyLiveSettings(s) {
        // Live camera FOV
        if (camera && typeof camera.updateProjectionMatrix === 'function') {
            camera.fov = s.fov;
            camera.updateProjectionMatrix();
        }

        // Live renderer graphics preset
        if (renderer && typeof renderer.setPixelRatio === 'function') {
            const preset = GRAPHICS_PRESETS[s.graphicsPreset] || GRAPHICS_PRESETS.ultra;
            const maxPr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, preset.pixelRatioCap);
            renderer.setPixelRatio(maxPr);
            if (renderer.shadowMap) {
                renderer.shadowMap.enabled = preset.shadowsEnabled;
            }
        }

        // Trigger settings changed callback for audio / screen-fx
        if (typeof onSettingsChanged === 'function') {
            onSettingsChanged(s);
        }
    }

    function syncUIWithSettings() {
        if (!dom) return;

        // Player Name
        if (dom.playerNameInput) {
            dom.playerNameInput.value = settings.playerName;
        }

        // Seed Display / Input
        if (dom.seedInput) {
            dom.seedInput.value = settings.seed || (settings.mode === 'daily' ? getDailySeed() : 'DEFAULT-RIVER');
        }

        // Mode cards
        dom.modeCards.forEach((card) => {
            const modeId = card.dataset.mode;
            const isSelected = modeId === settings.mode;
            card.classList.toggle('active', isSelected);
            card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });

        // Class cards
        dom.classCards.forEach((card) => {
            const cid = card.dataset.class;
            const isSelected = cid === settings.classId;
            card.classList.toggle('active', isSelected);
            card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });

        // Hat cards
        dom.hatCards.forEach((card) => {
            const hid = card.dataset.hat;
            const isSelected = hid === settings.hatId;
            card.classList.toggle('active', isSelected);
            card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });

        // Bot count buttons
        dom.botButtons.forEach((btn) => {
            const count = Number(btn.dataset.bots);
            btn.classList.toggle('active', count === settings.botCount);
        });

        // Graphics Preset buttons
        dom.graphicsPresetButtons.forEach((btn) => {
            const pid = btn.dataset.preset;
            btn.classList.toggle('active', pid === settings.graphicsPreset);
        });

        // Sliders & value displays
        if (dom.fovSlider) {
            dom.fovSlider.value = settings.fov;
            dom.fovValue.textContent = `${settings.fov}°`;
        }

        if (dom.cameraShakeSlider) {
            dom.cameraShakeSlider.value = settings.cameraShake;
            dom.cameraShakeValue.textContent = `${Math.round(settings.cameraShake * 100)}%`;
        }

        if (dom.masterSlider) {
            dom.masterSlider.value = settings.audio.master;
            dom.masterValue.textContent = `${Math.round(settings.audio.master * 100)}%`;
        }

        if (dom.musicSlider) {
            dom.musicSlider.value = settings.audio.music;
            dom.musicValue.textContent = `${Math.round(settings.audio.music * 100)}%`;
        }

        if (dom.sfxSlider) {
            dom.sfxSlider.value = settings.audio.sfx;
            dom.sfxValue.textContent = `${Math.round(settings.audio.sfx * 100)}%`;
        }

        if (dom.squeakySlider) {
            dom.squeakySlider.value = settings.audio.squeakyHammer;
            dom.squeakyValue.textContent = `${Math.round(settings.audio.squeakyHammer * 100)}%`;
        }

        updatePreviewBadge();
    }

    function updatePreviewBadge() {
        if (!dom.previewBadge) return;
        const cls = getCrewClass(settings.classId);
        const hat = SILLY_HATS[settings.hatId];
        const mode = GAME_MODES[settings.mode];

        dom.previewBadge.innerHTML = `
            <div style="font-size: 28px; line-height: 1;">${hat?.icon || '🤠'}</div>
            <div>
                <div style="font-weight: 800; font-size: 15px; color: #fff; letter-spacing: -0.01em;">
                    ${cls?.name || 'Helmsman'} · <span style="color: #38bdf8;">${hat?.name || 'Hat'}</span>
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                    Mode: <span style="color: #facc15; font-weight: 600;">${mode?.name || 'Campaign'}</span> · ${settings.botCount} AI Bot${settings.botCount > 1 ? 's' : ''}
                </div>
            </div>
        `;
    }

    function setupEventListeners() {
        // Mode Selection
        dom.modeCards.forEach((card) => {
            card.addEventListener('click', () => {
                const modeId = card.dataset.mode;
                settings.mode = modeId;
                if (modeId === 'daily' && !settings.seed) {
                    settings.seed = getDailySeed();
                }
                saveGameSettings(settings);
                syncUIWithSettings();
                applyLiveSettings(settings);
            });
        });

        // Class Selection
        dom.classCards.forEach((card) => {
            card.addEventListener('click', () => {
                settings.classId = card.dataset.class;
                saveGameSettings(settings);
                syncUIWithSettings();
                applyLiveSettings(settings);
            });
        });

        // Silly Hat Selection
        dom.hatCards.forEach((card) => {
            card.addEventListener('click', () => {
                settings.hatId = card.dataset.hat;
                saveGameSettings(settings);
                syncUIWithSettings();
                applyLiveSettings(settings);
            });
        });

        // AI Bot Count Selection
        dom.botButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                settings.botCount = clampBotCount(btn.dataset.bots);
                saveGameSettings(settings);
                syncUIWithSettings();
                applyLiveSettings(settings);
            });
        });

        // Player Name Change
        if (dom.playerNameInput) {
            dom.playerNameInput.addEventListener('input', (e) => {
                settings.playerName = e.target.value.trim().slice(0, 24) || 'Captain River';
                saveGameSettings(settings);
            });
        }

        // Custom Seed Input
        if (dom.seedInput) {
            dom.seedInput.addEventListener('input', (e) => {
                settings.seed = e.target.value.trim().slice(0, 32) || null;
                saveGameSettings(settings);
            });
        }

        // Random Seed Button
        if (dom.randomSeedBtn) {
            dom.randomSeedBtn.addEventListener('click', () => {
                settings.seed = generateRandomSeed();
                if (dom.seedInput) dom.seedInput.value = settings.seed;
                saveGameSettings(settings);
            });
        }

        // 1-Click "Copy Challenge Seed URL"
        if (dom.copySeedBtn) {
            dom.copySeedBtn.addEventListener('click', async () => {
                const url = buildChallengeSeedUrl(settings, typeof window !== 'undefined' ? window.location?.href : 'https://dontsink.game/');
                try {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        await navigator.clipboard.writeText(url);
                    }
                    dom.copySeedBtn.textContent = '✅ Copied to Clipboard!';
                    setTimeout(() => {
                        dom.copySeedBtn.textContent = '🔗 Copy Challenge Seed URL';
                    }, 2200);
                } catch {
                    dom.copySeedBtn.textContent = '✅ Seed URL Ready!';
                }
            });
        }

        // Launch Game Button
        if (dom.startGameBtn) {
            dom.startGameBtn.addEventListener('click', () => {
                startGame();
            });
        }

        // [Esc] Drawer Toggles
        if (dom.openSettingsBtn) {
            dom.openSettingsBtn.addEventListener('click', () => openSettingsDrawer());
        }
        if (dom.closeDrawerBtn) {
            dom.closeDrawerBtn.addEventListener('click', () => closeSettingsDrawer());
        }
        if (dom.doneDrawerBtn) {
            dom.doneDrawerBtn.addEventListener('click', () => closeSettingsDrawer());
        }
        if (dom.returnTitleBtn) {
            dom.returnTitleBtn.addEventListener('click', () => showTitleScreen());
        }
        if (dom.drawerBackdrop) {
            dom.drawerBackdrop.addEventListener('click', () => closeSettingsDrawer());
        }

        // Reset to Defaults Button
        if (dom.resetSettingsBtn) {
            dom.resetSettingsBtn.addEventListener('click', () => {
                settings = resetGameSettings();
                syncUIWithSettings();
                applyLiveSettings(settings);
            });
        }

        // Graphics Preset Buttons
        dom.graphicsPresetButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                settings.graphicsPreset = btn.dataset.preset;
                saveGameSettings(settings);
                syncUIWithSettings();
                applyLiveSettings(settings);
            });
        });

        // FOV Slider
        if (dom.fovSlider) {
            dom.fovSlider.addEventListener('input', (e) => {
                settings.fov = clampFov(e.target.value);
                dom.fovValue.textContent = `${settings.fov}°`;
                saveGameSettings(settings);
                applyLiveSettings(settings);
            });
        }

        // Camera Shake Slider
        if (dom.cameraShakeSlider) {
            dom.cameraShakeSlider.addEventListener('input', (e) => {
                settings.cameraShake = clampCameraShake(e.target.value);
                dom.cameraShakeValue.textContent = `${Math.round(settings.cameraShake * 100)}%`;
                saveGameSettings(settings);
                applyLiveSettings(settings);
            });
        }

        // Audio Sliders (0 - 200%)
        const audioSliders = [
            { el: dom.masterSlider, label: dom.masterValue, key: 'master' },
            { el: dom.musicSlider, label: dom.musicValue, key: 'music' },
            { el: dom.sfxSlider, label: dom.sfxValue, key: 'sfx' },
            { el: dom.squeakySlider, label: dom.squeakyValue, key: 'squeakyHammer' },
        ];

        audioSliders.forEach(({ el, label, key }) => {
            if (el) {
                el.addEventListener('input', (e) => {
                    const val = clampVolume(e.target.value);
                    settings.audio[key] = val;
                    label.textContent = `${Math.round(val * 100)}%`;
                    saveGameSettings(settings);
                    applyLiveSettings(settings);
                });
            }
        });

        // Global [Esc] Key Listener
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (typeof document !== 'undefined') {
                        const armoryEl = document.getElementById('armory-overlay');
                        if (armoryEl && armoryEl.classList.contains('open')) return;
                        if (armoryEl?.dataset?.justClosedAt && Date.now() - Number(armoryEl.dataset.justClosedAt) < 120) return;
                        const photoEl = document.getElementById('photo-mode-overlay');
                        if (photoEl && photoEl.style.display && photoEl.style.display !== 'none') return;
                    }
                    toggleSettingsDrawer();
                    e.preventDefault();
                }
            });
            try {
                const params = new URLSearchParams(window.location?.search || '');
                if (params.get('autostart') === '1') {
                    setTimeout(() => startGame(), 0);
                }
            } catch { /* ignore */ }
        }
    }

    let hideTitleTimer = null;

    function startGame() {
        isTitleVisible = false;
        closeSettingsDrawer();
        if (hideTitleTimer) {
            clearTimeout(hideTitleTimer);
            hideTitleTimer = null;
        }
        if (dom.titleOverlay) {
            dom.titleOverlay.style.opacity = '0';
            dom.titleOverlay.style.pointerEvents = 'none';
            hideTitleTimer = setTimeout(() => {
                if (!isTitleVisible && dom.titleOverlay) {
                    dom.titleOverlay.style.display = 'none';
                }
                hideTitleTimer = null;
            }, 300);
        }
        if (typeof onStartGame === 'function') {
            onStartGame(structuredClone(settings));
        }
    }

    function openSettingsDrawer() {
        isSettingsDrawerOpen = true;
        if (dom.settingsDrawer) {
            dom.settingsDrawer.style.transform = 'translateX(0)';
        }
        if (dom.drawerBackdrop) {
            dom.drawerBackdrop.style.display = 'block';
            dom.drawerBackdrop.style.opacity = '1';
        }
    }

    function closeSettingsDrawer() {
        isSettingsDrawerOpen = false;
        if (dom.settingsDrawer) {
            dom.settingsDrawer.style.transform = 'translateX(100%)';
        }
        if (dom.drawerBackdrop) {
            dom.drawerBackdrop.style.opacity = '0';
            setTimeout(() => {
                if (!isSettingsDrawerOpen && dom.drawerBackdrop) {
                    dom.drawerBackdrop.style.display = 'none';
                }
            }, 250);
        }
    }

    function showTitleScreen() {
        isTitleVisible = true;
        closeSettingsDrawer();
        if (hideTitleTimer) {
            clearTimeout(hideTitleTimer);
            hideTitleTimer = null;
        }
        if (dom.titleOverlay) {
            dom.titleOverlay.style.display = 'flex';
            dom.titleOverlay.style.opacity = '1';
            dom.titleOverlay.style.pointerEvents = 'auto';
        }
    }

    function toggleSettingsDrawer() {
        if (isSettingsDrawerOpen) closeSettingsDrawer();
        else openSettingsDrawer();
    }

    return {
        getSettings: () => structuredClone(settings),
        updateSettings: (partial) => {
            settings = sanitizeSettings({ ...settings, ...partial });
            saveGameSettings(settings);
            syncUIWithSettings();
            applyLiveSettings(settings);
        },
        openSettingsDrawer,
        closeSettingsDrawer,
        toggleSettingsDrawer,
        showTitleScreen,
        startGame,
        isTitleVisible: () => isTitleVisible,
        isSettingsDrawerOpen: () => isSettingsDrawerOpen,
        dispose: () => {
            if (dom.root) dom.root.remove();
        },
    };
}

// ── DOM UI Builders ─────────────────────────────────────────────────────────

function buildTitleAndSettingsDOM() {
    const root = document.createElement('div');
    root.id = 'title-menu-root';
    root.style.cssText = `
        position: fixed; inset: 0; pointer-events: none; z-index: 9999;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        color: #f8fafc;
    `;

    // ── 1. Glassmorphic Title & Lobby Overlay ──
    const titleOverlay = document.createElement('div');
    titleOverlay.id = 'title-lobby-overlay';
    titleOverlay.style.cssText = `
        position: absolute; inset: 0; pointer-events: auto;
        background: radial-gradient(circle at 50% 25%, rgba(15, 23, 42, 0.45) 0%, rgba(11, 14, 19, 0.88) 100%);
        backdrop-filter: blur(8px); display: flex; flex-direction: column;
        justify-content: space-between; padding: 28px 40px; box-sizing: border-box;
        overflow-y: auto; -webkit-overflow-scrolling: touch;
        transition: opacity 0.3s ease;
    `;

    // Top Header: Title Branding & [Esc] Settings Trigger
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
    `;
    header.innerHTML = `
        <div>
            <div style="
                font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700;
                letter-spacing: 0.2em; text-transform: uppercase; color: #38bdf8;
                display: flex; align-items: center; gap: 8px;
            ">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 10px #38bdf8;"></span>
                3D River Survival Co-Op
            </div>
            <h1 style="
                font-size: 38px; font-weight: 900; letter-spacing: -0.03em; margin: 4px 0 0;
                background: linear-gradient(135deg, #ffffff 40%, #94a3b8 100%);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                text-shadow: 0 4px 20px rgba(0,0,0,0.6);
            ">
                Don't Sink, Don't Die
            </h1>
        </div>
        <button id="btn-open-settings" style="
            background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 10px; color: #e2e8f0; font-size: 13px; font-weight: 700;
            padding: 10px 18px; cursor: pointer; display: flex; align-items: center; gap: 8px;
            backdrop-filter: blur(6px); transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
            ⚙️ Settings <kbd style="
                font-family: monospace; font-size: 11px; background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 2px 5px;
            ">[Esc]</kbd>
        </button>
    `;

    // Center Content: Mode Grid, Class & Hat Customizer, Challenge Sharing
    const centerPanel = document.createElement('div');
    centerPanel.id = 'title-center-grid';
    centerPanel.style.cssText = `
        display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 20px 0;
        max-width: 1180px; width: 100%; align-self: center;
    `;

    // Mode Selector Column
    const leftCol = document.createElement('div');
    leftCol.style.cssText = `display: flex; flex-direction: column; gap: 14px;`;
    leftCol.innerHTML = `
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8;">
            Select Party Mode
        </div>
        <div id="mode-selector-grid" style="display: flex; flex-direction: column; gap: 10px;">
            ${GAME_MODE_IDS.map((mid) => {
                const m = GAME_MODES[mid];
                return `
                    <div data-mode="${m.id}" class="mode-select-card" style="
                        background: rgba(30, 41, 59, 0.65); border: 1px solid rgba(255, 255, 255, 0.12);
                        border-radius: 12px; padding: 12px 18px; cursor: pointer; display: flex;
                        align-items: center; justify-content: space-between; transition: all 0.2s;
                    ">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <span style="font-size: 26px;">${m.icon}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 15px; color: #fff;">${m.name}</div>
                                <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">${m.description}</div>
                            </div>
                        </div>
                        <div class="mode-check" style="
                            width: 18px; height: 18px; min-width: 18px; flex-shrink: 0; border-radius: 50%;
                            border: 2px solid rgba(255, 255, 255, 0.3); display: flex;
                            align-items: center; justify-content: center; margin-left: 10px;
                        "></div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Crew & Hat Customizer Column
    const rightCol = document.createElement('div');
    rightCol.style.cssText = `display: flex; flex-direction: column; gap: 16px;`;
    rightCol.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8;">
                Crew Customization & Party
            </div>
            <div id="crew-preview-badge" style="
                background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.3);
                border-radius: 10px; padding: 6px 14px; display: flex; align-items: center; gap: 12px;
            "></div>
        </div>

        <!-- Class Selector -->
        <div>
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #cbd5e1; margin-bottom: 6px;">
                Playable Crew Class
            </div>
            <div id="class-selector-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                ${CREW_CLASS_IDS.map((cid) => {
                    const c = CREW_CLASSES[cid];
                    return `
                        <button data-class="${c.id}" class="class-select-card" style="
                            background: rgba(30, 41, 59, 0.65); border: 1px solid rgba(255, 255, 255, 0.12);
                            border-radius: 8px; padding: 10px 8px; color: #e2e8f0; font-weight: 700;
                            font-size: 12px; cursor: pointer; text-align: center; transition: all 0.2s;
                        ">
                            <div>${c.name}</div>
                            <div style="font-size: 9.5px; opacity: 0.7; font-weight: 500; margin-top: 2px;">${c.title}</div>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>

        <!-- Silly Hat Selector -->
        <div>
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #cbd5e1; margin-bottom: 6px;">
                Silly Hat
            </div>
            <div id="hat-selector-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                ${SILLY_HAT_IDS.map((hid) => {
                    const hat = SILLY_HATS[hid];
                    return `
                        <button data-hat="${hat.id}" class="hat-select-card" style="
                            background: rgba(30, 41, 59, 0.65); border: 1px solid rgba(255, 255, 255, 0.12);
                            border-radius: 8px; padding: 8px 10px; color: #e2e8f0; font-size: 12px;
                            font-weight: 700; cursor: pointer; display: flex; align-items: center;
                            gap: 8px; transition: all 0.2s; text-align: left;
                        ">
                            <span style="font-size: 18px;">${hat.icon}</span>
                            <span style="font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${hat.name}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>

        <!-- AI Bot Count Selector -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 16px;">
            <div>
                <div style="font-size: 12px; font-weight: 700;">Companion AI Bots</div>
                <div style="font-size: 11px; color: #94a3b8;">Autonomous kinematic crew members (1-3)</div>
            </div>
            <div style="display: flex; gap: 6px;">
                ${[1, 2, 3].map((b) => `
                    <button data-bots="${b}" class="bot-count-btn" style="
                        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px; color: #fff; width: 34px; height: 32px; font-weight: 700;
                        font-size: 13px; cursor: pointer; transition: all 0.2s;
                    ">${b}</button>
                `).join('')}
            </div>
        </div>

        <!-- 1-Click "Copy Challenge Seed URL" & Seed Row -->
        <div style="display: flex; flex-direction: column; gap: 8px; background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8;">
                    Run Seed & Invite Link
                </div>
                <button id="btn-random-seed" style="
                    background: transparent; border: none; color: #38bdf8; font-size: 11px;
                    font-weight: 700; cursor: pointer; text-decoration: underline;
                ">🎲 Re-roll Seed</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <input id="input-run-seed" type="text" placeholder="RIVER-7749" style="
                    background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px; color: #fbbf24; font-family: monospace; font-size: 12px;
                    font-weight: 700; padding: 8px 12px; width: 140px;
                ">
                <button id="btn-copy-seed-url" style="
                    flex: 1; background: #0284c7; color: #fff; border: none; border-radius: 6px;
                    font-weight: 700; font-size: 12px; cursor: pointer; display: flex;
                    align-items: center; justify-content: center; gap: 6px; transition: background 0.2s;
                    box-shadow: 0 4px 10px rgba(2, 132, 199, 0.35);
                ">
                    🔗 Copy Challenge Seed URL
                </button>
            </div>
        </div>
    `;

    centerPanel.appendChild(leftCol);
    centerPanel.appendChild(rightCol);

    // Bottom Footer: Big Launch Button
    const footer = document.createElement('div');
    footer.id = 'title-footer-bar';
    footer.style.cssText = `
        display: flex; justify-content: center; align-items: center; gap: 20px;
    `;
    footer.innerHTML = `
        <button id="btn-start-game" style="
            background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
            border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 14px;
            color: #ffffff; font-size: 18px; font-weight: 800; letter-spacing: 0.05em;
            padding: 16px 56px; cursor: pointer; box-shadow: 0 10px 25px rgba(14, 165, 233, 0.45);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; gap: 10px;
        ">
            <span>⛵</span> Launch Raft Expedition
        </button>
    `;

    titleOverlay.appendChild(header);
    titleOverlay.appendChild(centerPanel);
    titleOverlay.appendChild(footer);
    root.appendChild(titleOverlay);

    // ── 2. [Esc] Settings Drawer & Backdrop ──
    const drawerBackdrop = document.createElement('div');
    drawerBackdrop.id = 'settings-drawer-backdrop';
    drawerBackdrop.style.cssText = `
        position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px); display: none; opacity: 0; pointer-events: auto;
        transition: opacity 0.25s ease;
    `;
    root.appendChild(drawerBackdrop);

    const settingsDrawer = document.createElement('div');
    settingsDrawer.id = 'settings-drawer';
    settingsDrawer.style.cssText = `
        position: absolute; top: 0; right: 0; bottom: 0; width: min(440px, 92vw);
        background: #0f172a; border-left: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: -10px 0 35px rgba(0, 0, 0, 0.7); pointer-events: auto;
        transform: translateX(100%); transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex; flex-direction: column; justify-content: space-between;
        padding: 28px 24px; box-sizing: border-box; overflow-y: auto;
    `;

    settingsDrawer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Drawer Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
                <div>
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #38bdf8;">
                        Configuration Drawer
                    </div>
                    <div style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin-top: 2px;">
                        Settings [Esc]
                    </div>
                </div>
                <button id="btn-close-drawer" style="
                    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 8px; color: #cbd5e1; width: 32px; height: 32px; font-size: 16px;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                ">✕</button>
            </div>

            <!-- Section 1: Graphics Quality Preset -->
            <div>
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 10px;">
                    Graphics Quality Preset
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${GRAPHICS_PRESET_IDS.map((pid) => {
                        const p = GRAPHICS_PRESETS[pid];
                        return `
                            <button data-preset="${p.id}" class="graphics-preset-card" style="
                                background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.1);
                                border-radius: 8px; padding: 10px 14px; text-align: left; cursor: pointer;
                                color: #e2e8f0; transition: all 0.2s;
                            ">
                                <div style="font-weight: 700; font-size: 13.5px;">${p.name}</div>
                                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${p.description}</div>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Section 2: Camera FOV & Camera Shake -->
            <div>
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 12px;">
                    Camera & Feel
                </div>
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <!-- FOV Slider -->
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span>Field of View (FOV)</span>
                            <span id="label-fov-val" style="font-family: monospace; color: #38bdf8;">75°</span>
                        </div>
                        <input id="slider-fov" type="range" min="50" max="110" value="75" style="width: 100%; cursor: pointer;">
                    </div>

                    <!-- Camera Shake Slider -->
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span>Camera Shake Intensity</span>
                            <span id="label-shake-val" style="font-family: monospace; color: #38bdf8;">100%</span>
                        </div>
                        <input id="slider-shake" type="range" min="0" max="2" step="0.05" value="1.0" style="width: 100%; cursor: pointer;">
                    </div>
                </div>
            </div>

            <!-- Section 3: Audio Mix Sliders (0 - 200%) -->
            <div>
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 12px;">
                    Audio Mix (0 - 200%)
                </div>
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <!-- Master -->
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span>Master Volume</span>
                            <span id="label-master-val" style="font-family: monospace; color: #38bdf8;">100%</span>
                        </div>
                        <input id="slider-master" type="range" min="0" max="2" step="0.05" value="1.0" style="width: 100%; cursor: pointer;">
                    </div>

                    <!-- Music -->
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span>Music & Synth Ambiance</span>
                            <span id="label-music-val" style="font-family: monospace; color: #38bdf8;">80%</span>
                        </div>
                        <input id="slider-music" type="range" min="0" max="2" step="0.05" value="0.8" style="width: 100%; cursor: pointer;">
                    </div>

                    <!-- SFX -->
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span>Sound Effects & Splashes</span>
                            <span id="label-sfx-val" style="font-family: monospace; color: #38bdf8;">100%</span>
                        </div>
                        <input id="slider-sfx" type="range" min="0" max="2" step="0.05" value="1.0" style="width: 100%; cursor: pointer;">
                    </div>

                    <!-- Squeaky Hammer (0 - 200%) -->
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span>🔨 Squeaky Hammer Volume</span>
                            <span id="label-squeaky-val" style="font-family: monospace; color: #fbbf24;">125%</span>
                        </div>
                        <input id="slider-squeaky" type="range" min="0" max="2" step="0.05" value="1.25" style="width: 100%; cursor: pointer;">
                    </div>
                </div>
            </div>
        </div>

        <!-- Drawer Footer -->
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <button id="btn-reset-settings" style="
                background: transparent; border: 1px solid rgba(248, 113, 113, 0.4);
                color: #f87171; border-radius: 8px; padding: 8px 12px; font-size: 12px;
                font-weight: 700; cursor: pointer;
            ">Reset to Defaults</button>
            <div style="display: flex; gap: 8px;">
                <button id="btn-return-title" style="
                    background: rgba(56, 189, 248, 0.14); border: 1px solid rgba(56, 189, 248, 0.45);
                    color: #7dd3fc; border-radius: 8px; padding: 8px 14px; font-size: 12px;
                    font-weight: 700; cursor: pointer;
                ">🏠 Title Screen</button>
                <button id="btn-drawer-done" style="
                    background: #0284c7; border: none; color: #fff; border-radius: 8px;
                    padding: 8px 18px; font-size: 12px; font-weight: 700; cursor: pointer;
                ">Done [Esc]</button>
            </div>
        </div>
    `;

    root.appendChild(settingsDrawer);

    // Dynamic style rules for active card states
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        .mode-select-card.active {
            background: rgba(14, 165, 233, 0.18) !important;
            border-color: #38bdf8 !important;
            box-shadow: 0 0 16px rgba(56, 189, 248, 0.3) !important;
        }
        .mode-select-card.active .mode-check {
            background: #38bdf8 !important;
            border-color: #38bdf8 !important;
        }
        .mode-select-card.active .mode-check::after {
            content: "✓"; font-size: 12px; color: #04201c; font-weight: 900;
        }
        .class-select-card.active {
            background: rgba(14, 165, 233, 0.22) !important;
            border-color: #38bdf8 !important;
            color: #fff !important;
        }
        .hat-select-card.active {
            background: rgba(245, 158, 11, 0.2) !important;
            border-color: #f59e0b !important;
            color: #fff !important;
        }
        .bot-count-btn.active {
            background: #0284c7 !important;
            border-color: #38bdf8 !important;
        }
        .graphics-preset-card.active {
            background: rgba(14, 165, 233, 0.22) !important;
            border-color: #38bdf8 !important;
        }
        @media (max-width: 860px) {
            #title-lobby-overlay {
                padding: 12px 14px 18px !important;
                justify-content: flex-start !important;
                gap: 10px !important;
            }
            #title-lobby-overlay h1 {
                font-size: 24px !important;
            }
            #title-center-grid {
                grid-template-columns: 1fr !important;
                gap: 12px !important;
                margin: 4px 0 !important;
            }
            .mode-select-card {
                padding: 8px 12px !important;
            }
            #class-selector-grid {
                grid-template-columns: repeat(2, 1fr) !important;
            }
            #hat-selector-grid {
                grid-template-columns: repeat(2, 1fr) !important;
            }
            #title-footer-bar {
                position: sticky !important;
                bottom: 0 !important;
                z-index: 10 !important;
                padding-top: 6px !important;
                background: linear-gradient(180deg, rgba(11, 14, 19, 0) 0%, rgba(11, 14, 19, 0.95) 35%) !important;
            }
            #btn-start-game {
                width: 100% !important;
                justify-content: center !important;
                padding: 13px 20px !important;
                font-size: 16px !important;
            }
        }
    `;
    root.appendChild(styleTag);

    return {
        root,
        titleOverlay,
        drawerBackdrop,
        settingsDrawer,
        previewBadge: rightCol.querySelector('#crew-preview-badge'),
        playerNameInput: null,
        seedInput: rightCol.querySelector('#input-run-seed'),
        randomSeedBtn: rightCol.querySelector('#btn-random-seed'),
        copySeedBtn: rightCol.querySelector('#btn-copy-seed-url'),
        startGameBtn: footer.querySelector('#btn-start-game'),
        openSettingsBtn: header.querySelector('#btn-open-settings'),
        closeDrawerBtn: settingsDrawer.querySelector('#btn-close-drawer'),
        resetSettingsBtn: settingsDrawer.querySelector('#btn-reset-settings'),
        returnTitleBtn: settingsDrawer.querySelector('#btn-return-title'),
        doneDrawerBtn: settingsDrawer.querySelector('#btn-drawer-done'),
        modeCards: leftCol.querySelectorAll('.mode-select-card'),
        classCards: rightCol.querySelectorAll('.class-select-card'),
        hatCards: rightCol.querySelectorAll('.hat-select-card'),
        botButtons: rightCol.querySelectorAll('.bot-count-btn'),
        graphicsPresetButtons: settingsDrawer.querySelectorAll('.graphics-preset-card'),
        fovSlider: settingsDrawer.querySelector('#slider-fov'),
        fovValue: settingsDrawer.querySelector('#label-fov-val'),
        cameraShakeSlider: settingsDrawer.querySelector('#slider-shake'),
        cameraShakeValue: settingsDrawer.querySelector('#label-shake-val'),
        masterSlider: settingsDrawer.querySelector('#slider-master'),
        masterValue: settingsDrawer.querySelector('#label-master-val'),
        musicSlider: settingsDrawer.querySelector('#slider-music'),
        musicValue: settingsDrawer.querySelector('#label-music-val'),
        sfxSlider: settingsDrawer.querySelector('#slider-sfx'),
        sfxValue: settingsDrawer.querySelector('#label-sfx-val'),
        squeakySlider: settingsDrawer.querySelector('#slider-squeaky'),
        squeakyValue: settingsDrawer.querySelector('#label-squeaky-val'),
    };
}
