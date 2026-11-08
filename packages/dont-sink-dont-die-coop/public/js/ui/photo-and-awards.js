/**
 * Don't Sink, Don't Die — Freecam Photo Mode & Post-Run Awards Director
 * Zero external dependencies.
 *
 * Requirements fulfilled:
 * 1. Pressing [P] in offline mode pauses the simulation and unlocks a 6-DOF
 *    Freecam Photo Mode with FOV slider, time-of-day lighting presets
 *    ('Golden Hour', 'Neon Cyber-Night', 'Blood Moon', 'Emerald Mist'),
 *    depth-of-field frame overlay, and 1-click PNG screenshot download.
 * 2. Victory Screen Post-Run Co-Op Awards & Titles Director
 *    ('Monster Hunter', 'Untouchable Blocker', 'Plank Parkour Master',
 *    'Big Spender', 'Rearguard Hero') displaying badges, tiers, and MVP.
 */

import { evaluateRunAwards, MEDAL_DEFINITIONS, formatAwardAnnouncement } from '../../../shared/run-awards.js';

// ─── Time-of-Day Lighting Presets ──────────────────────────────────────────

export const LIGHTING_PRESETS = {
    'Golden Hour': {
        name: 'Golden Hour',
        description: 'Warm sunset radiance with rich amber haze and long cast shadows.',
        ambientColor: 0xffdfba,
        ambientIntensity: 0.65,
        sunColor: 0xffaa5e,
        sunIntensity: 1.6,
        sunPosition: { x: 45, y: 35, z: -40 },
        fogColor: 0x3d2b28,
        fogDensity: 0.0045,
        filterTint: 'rgba(255, 175, 75, 0.08)',
    },
    'Neon Cyber-Night': {
        name: 'Neon Cyber-Night',
        description: 'High-contrast midnight indigo with vivid cyan and magenta reflections.',
        ambientColor: 0x1e1b4b,
        ambientIntensity: 0.45,
        sunColor: 0x38bdf8,
        sunIntensity: 1.1,
        sunPosition: { x: -30, y: 70, z: -60 },
        fogColor: 0x070a1e,
        fogDensity: 0.0085,
        filterTint: 'rgba(56, 189, 248, 0.09)',
    },
    'Blood Moon': {
        name: 'Blood Moon',
        description: 'Eerie crimson eclipse sky casting sharp ominous scarlet shadows.',
        ambientColor: 0x450a0a,
        ambientIntensity: 0.5,
        sunColor: 0xef4444,
        sunIntensity: 1.5,
        sunPosition: { x: 20, y: 55, z: -50 },
        fogColor: 0x1a0505,
        fogDensity: 0.009,
        filterTint: 'rgba(239, 68, 68, 0.12)',
    },
    'Emerald Mist': {
        name: 'Emerald Mist',
        description: 'Atmospheric toxic swamp canopy with deep bio-luminescent jade fog.',
        ambientColor: 0x064e3b,
        ambientIntensity: 0.55,
        sunColor: 0x34d399,
        sunIntensity: 1.25,
        sunPosition: { x: -40, y: 40, z: -35 },
        fogColor: 0x042017,
        fogDensity: 0.012,
        filterTint: 'rgba(52, 211, 153, 0.10)',
    },
};

export const PRESET_KEYS = Object.keys(LIGHTING_PRESETS);

// ─── Freecam 6-DOF Math Helpers ────────────────────────────────────────────

/**
 * Computes forward, right, and up vectors from Euler yaw, pitch, and roll angles (in radians).
 */
export function compute6DofVectors(yaw, pitch, roll = 0) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);

    // Forward vector (-Z convention in camera local space)
    const forward = {
        x: -sy * cp,
        y: sp,
        z: -cy * cp,
    };

    // Right vector (+X in camera local space)
    const right = {
        x: cy * cr + sy * sp * sr,
        y: cp * sr,
        z: -sy * cr + cy * sp * sr,
    };

    // Up vector (+Y in camera local space)
    const up = {
        x: -cy * sr + sy * sp * cr,
        y: cp * cr,
        z: sy * sr + cy * sp * cr,
    };

    return { forward, right, up };
}

/**
 * Calculates updated 6-DOF camera position given input movement deltas and orientation.
 */
export function step6DofPosition(position, orientation, inputDeltas, moveSpeed, dt) {
    const { forward, right, up } = compute6DofVectors(orientation.yaw, orientation.pitch, orientation.roll);
    const speed = moveSpeed * dt;

    return {
        x: position.x + (right.x * inputDeltas.x + up.x * inputDeltas.y + forward.x * inputDeltas.z) * speed,
        y: position.y + (right.y * inputDeltas.x + up.y * inputDeltas.y + forward.y * inputDeltas.z) * speed,
        z: position.z + (right.z * inputDeltas.x + up.z * inputDeltas.y + forward.z * inputDeltas.z) * speed,
    };
}

// ─── Freecam Photo Mode & Awards Director ──────────────────────────────────

/**
 * Creates and initializes the Photo Mode & Post-Run Awards Director.
 *
 * @param {object} params
 * @param {object} params.camera - Three.js PerspectiveCamera
 * @param {object} params.scene - Three.js Scene
 * @param {object} params.renderer - Three.js WebGLRenderer
 * @param {Function} [params.getIsOffline] - Callback returning boolean (is offline mode)
 * @param {Function} [params.onPauseToggle] - Callback (paused: boolean) => void
 * @param {object} [params.lights] - { ambientLight, directionalLight }
 */
export function createPhotoAndAwardsDirector({
    camera,
    scene,
    renderer,
    getIsOffline = () => true,
    onPauseToggle = () => {},
    lights = {},
} = {}) {
    let isActive = false;
    let savedCameraState = null;
    let savedLightingState = null;
    let currentPresetName = 'Golden Hour';
    let dofEnabled = true;
    let dofFocusDistance = 25; // meters
    let dofAperture = 2.8;

    // 6-DOF Transform State
    const camTransform = {
        position: { x: 0, y: 5, z: 10 },
        yaw: 0,
        pitch: 0,
        roll: 0,
    };

    const freecamKeys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
        rollLeft: false,
        rollRight: false,
        fast: false,
    };

    let baseMoveSpeed = 16.0;
    const lookSensitivity = 0.0025;

    // ── Build Photo Mode DOM Overlay ──
    const dom = createPhotoModeDOM();
    document.body.appendChild(dom.root);

    // ── Build Victory Awards DOM Overlay ──
    const awardsDom = createAwardsDOM();
    document.body.appendChild(awardsDom.root);

    // ── Setup Event Listeners ──
    setupUIControls();
    setupKeyboardListeners();

    function setupUIControls() {
        // FOV Slider
        dom.fovSlider.addEventListener('input', (e) => {
            const val = Number(e.target.value);
            dom.fovValue.textContent = `${val}°`;
            if (camera) {
                camera.fov = val;
                camera.updateProjectionMatrix();
            }
        });

        // Speed Slider
        dom.speedSlider.addEventListener('input', (e) => {
            baseMoveSpeed = Number(e.target.value);
            dom.speedValue.textContent = `${baseMoveSpeed.toFixed(0)} m/s`;
        });

        // Lighting Preset Buttons
        dom.presetButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const presetKey = btn.dataset.preset;
                applyLightingPreset(presetKey);
            });
        });

        // DOF Toggle
        dom.dofToggle.addEventListener('change', (e) => {
            dofEnabled = e.target.checked;
            dom.dofFrame.style.display = dofEnabled ? 'block' : 'none';
        });

        // Screenshot Download
        dom.screenshotBtn.addEventListener('click', captureScreenshot);

        // Close / Exit Photo Mode
        dom.exitBtn.addEventListener('click', () => exitPhotoMode());

        // Awards Close Button
        awardsDom.closeBtn.addEventListener('click', () => {
            awardsDom.root.style.display = 'none';
        });
    }

    function setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();

            // Toggle Photo Mode on [P] (Offline only)
            if (k === 'p') {
                const offline = typeof getIsOffline === 'function' ? getIsOffline() : true;
                if (offline) {
                    togglePhotoMode();
                    e.preventDefault();
                }
                return;
            }

            if (!isActive) return;

            // Freecam Controls
            if (k === 'w') freecamKeys.forward = true;
            if (k === 's') freecamKeys.backward = true;
            if (k === 'a') freecamKeys.left = true;
            if (k === 'd') freecamKeys.right = true;
            if (k === 'e' || k === 'space') { freecamKeys.up = true; e.preventDefault(); }
            if (k === 'q' || k === 'c') freecamKeys.down = true;
            if (k === 'z') freecamKeys.rollLeft = true;
            if (k === 'x') freecamKeys.rollRight = true;
            if (e.shiftKey) freecamKeys.fast = true;
            if (k === 'escape') exitPhotoMode();
        });

        window.addEventListener('keyup', (e) => {
            if (!isActive) return;
            const k = e.key.toLowerCase();
            if (k === 'w') freecamKeys.forward = false;
            if (k === 's') freecamKeys.backward = false;
            if (k === 'a') freecamKeys.left = false;
            if (k === 'd') freecamKeys.right = false;
            if (k === 'e' || k === 'space') freecamKeys.up = false;
            if (k === 'q' || k === 'c') freecamKeys.down = false;
            if (k === 'z') freecamKeys.rollLeft = false;
            if (k === 'x') freecamKeys.rollRight = false;
            if (!e.shiftKey) freecamKeys.fast = false;
        });

        // Mouse look while in photo mode (right click drag or left drag)
        window.addEventListener('mousemove', (e) => {
            if (!isActive) return;
            if ((e.buttons & 1) || (e.buttons & 2) || document.pointerLockElement) {
                camTransform.yaw -= e.movementX * lookSensitivity;
                camTransform.pitch = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, camTransform.pitch - e.movementY * lookSensitivity));
            }
        });
    }

    /**
     * Toggles Photo Mode on or off.
     */
    function togglePhotoMode() {
        if (isActive) exitPhotoMode();
        else enterPhotoMode();
    }

    /**
     * Enters 6-DOF Freecam Photo Mode.
     */
    function enterPhotoMode() {
        if (isActive) return;
        isActive = true;

        // Pause game simulation
        if (typeof onPauseToggle === 'function') {
            onPauseToggle(true);
        }

        // Save active camera & lighting settings for restore on exit
        if (camera) {
            savedCameraState = {
                fov: camera.fov,
                position: { ...camera.position },
                rotation: { ...camera.rotation },
            };
            camTransform.position.x = camera.position.x;
            camTransform.position.y = camera.position.y;
            camTransform.position.z = camera.position.z;
            camTransform.yaw = camera.rotation.y || 0;
            camTransform.pitch = camera.rotation.x || 0;
            camTransform.roll = camera.rotation.z || 0;
            dom.fovSlider.value = camera.fov;
            dom.fovValue.textContent = `${Math.round(camera.fov)}°`;
        }

        if (lights.ambientLight || lights.directionalLight) {
            savedLightingState = {
                ambientColor: lights.ambientLight?.color?.getHex(),
                ambientIntensity: lights.ambientLight?.intensity,
                sunColor: lights.directionalLight?.color?.getHex(),
                sunIntensity: lights.directionalLight?.intensity,
                fogColor: scene.fog?.color?.getHex(),
                fogDensity: scene.fog?.density,
            };
        }

        // Show photo mode UI
        dom.root.style.display = 'block';
        dom.dofFrame.style.display = dofEnabled ? 'block' : 'none';
        applyLightingPreset(currentPresetName);
    }

    /**
     * Exits Freecam Photo Mode and restores standard camera and lighting.
     */
    function exitPhotoMode() {
        if (!isActive) return;
        isActive = false;

        // Resume simulation
        if (typeof onPauseToggle === 'function') {
            onPauseToggle(false);
        }

        // Restore camera
        if (camera && savedCameraState) {
            camera.fov = savedCameraState.fov;
            camera.position.set(savedCameraState.position.x, savedCameraState.position.y, savedCameraState.position.z);
            camera.updateProjectionMatrix();
        }

        // Restore lighting
        if (savedLightingState) {
            if (lights.ambientLight && savedLightingState.ambientColor !== undefined) {
                lights.ambientLight.color.setHex(savedLightingState.ambientColor);
                lights.ambientLight.intensity = savedLightingState.ambientIntensity;
            }
            if (lights.directionalLight && savedLightingState.sunColor !== undefined) {
                lights.directionalLight.color.setHex(savedLightingState.sunColor);
                lights.directionalLight.intensity = savedLightingState.sunIntensity;
            }
            if (scene.fog && savedLightingState.fogColor !== undefined) {
                scene.fog.color.setHex(savedLightingState.fogColor);
                scene.fog.density = savedLightingState.fogDensity;
            }
        }

        // Hide photo mode UI
        dom.root.style.display = 'none';
    }

    /**
     * Applies a time-of-day lighting preset.
     */
    function applyLightingPreset(presetKey) {
        const preset = LIGHTING_PRESETS[presetKey];
        if (!preset) return;
        currentPresetName = presetKey;

        // Update active UI preset button states
        dom.presetButtons.forEach((b) => {
            b.classList.toggle('active', b.dataset.preset === presetKey);
        });

        // Apply to scene lighting if available
        if (lights.ambientLight) {
            lights.ambientLight.color.setHex(preset.ambientColor);
            lights.ambientLight.intensity = preset.ambientIntensity;
        }

        if (lights.directionalLight) {
            lights.directionalLight.color.setHex(preset.sunColor);
            lights.directionalLight.intensity = preset.sunIntensity;
            if (preset.sunPosition) {
                lights.directionalLight.position.set(
                    camTransform.position.x + preset.sunPosition.x,
                    preset.sunPosition.y,
                    camTransform.position.z + preset.sunPosition.z
                );
            }
        }

        if (scene && scene.fog) {
            scene.fog.color.setHex(preset.fogColor);
            scene.fog.density = preset.fogDensity;
        }

        // Apply color grading tint overlay
        dom.filterTintOverlay.style.background = preset.filterTint || 'transparent';
    }

    /**
     * 1-Click PNG Screenshot capture & download from WebGL canvas.
     */
    function captureScreenshot() {
        if (!renderer || !renderer.domElement) return;

        // Temporarily hide UI overlay for clean picture
        dom.controlsPanel.style.display = 'none';
        dom.dofFrame.style.display = 'none';

        // Force high-res render frame
        if (scene && camera) {
            renderer.render(scene, camera);
        }

        try {
            const dataUrl = renderer.domElement.toDataURL('image/png');
            const link = document.createElement('a');
            const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `DontSinkDontDie-Photo-${dateStr}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.warn('Screenshot capture fallback:', err);
        } finally {
            // Restore UI panels
            dom.controlsPanel.style.display = 'flex';
            if (dofEnabled) dom.dofFrame.style.display = 'block';
        }
    }

    /**
     * Updates freecam 6-DOF transform every frame.
     */
    function update(dt) {
        if (!isActive || !camera) return;

        const effectiveSpeed = baseMoveSpeed * (freecamKeys.fast ? 2.5 : 1.0);

        // Calculate input movement deltas
        const inputDeltas = {
            x: (freecamKeys.right ? 1 : 0) - (freecamKeys.left ? 1 : 0),
            y: (freecamKeys.up ? 1 : 0) - (freecamKeys.down ? 1 : 0),
            z: (freecamKeys.forward ? 1 : 0) - (freecamKeys.backward ? 1 : 0),
        };

        // Handle Roll
        if (freecamKeys.rollLeft) camTransform.roll += dt * 1.5;
        if (freecamKeys.rollRight) camTransform.roll -= dt * 1.5;

        // Move position along 6-DOF basis
        const newPos = step6DofPosition(camTransform.position, camTransform, inputDeltas, effectiveSpeed, dt);
        camTransform.position.x = newPos.x;
        camTransform.position.y = newPos.y;
        camTransform.position.z = newPos.z;

        // Update Camera in Three.js
        camera.position.set(camTransform.position.x, camTransform.position.y, camTransform.position.z);

        // Rotation matrix from yaw, pitch, roll
        camera.rotation.order = 'YXZ';
        camera.rotation.set(camTransform.pitch, camTransform.yaw, camTransform.roll);
    }

    /**
     * Displays the Post-Run Co-Op Awards screen given player run statistics.
     */
    function showVictoryAwards(playersList) {
        const awardsReport = evaluateRunAwards(playersList);
        renderVictoryAwardsDOM(awardsDom, awardsReport);
        awardsDom.root.style.display = 'flex';
        return awardsReport;
    }

    function hideVictoryAwards() {
        if (awardsDom?.root) {
            awardsDom.root.style.display = 'none';
        }
    }

    return {
        isActive: () => isActive,
        enterPhotoMode,
        exitPhotoMode,
        togglePhotoMode,
        applyLightingPreset,
        captureScreenshot,
        showVictoryAwards,
        hideVictoryAwards,
        update,
        getTransform: () => ({ ...camTransform }),
        getCurrentPreset: () => currentPresetName,
        dispose: () => {
            dom.root.remove();
            awardsDom.root.remove();
        },
    };
}

// ─── DOM UI Builders ───────────────────────────────────────────────────────

function createPhotoModeDOM() {
    const root = document.createElement('div');
    root.id = 'photo-mode-root';
    root.style.cssText = `
        position: fixed; inset: 0; pointer-events: none; z-index: 10000;
        display: none; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    `;

    // Visual Filter Tint Overlay
    const filterTintOverlay = document.createElement('div');
    filterTintOverlay.id = 'photo-tint-overlay';
    filterTintOverlay.style.cssText = `
        position: absolute; inset: 0; pointer-events: none; transition: background 0.4s ease;
    `;
    root.appendChild(filterTintOverlay);

    // Depth-of-Field Cinematic Frame
    const dofFrame = document.createElement('div');
    dofFrame.id = 'photo-dof-frame';
    dofFrame.style.cssText = `
        position: absolute; inset: 0; pointer-events: none;
        box-shadow: inset 0 0 100px 30px rgba(0,0,0,0.45);
        border: 1px solid rgba(255, 255, 255, 0.12);
        display: block;
    `;

    // Rule-of-Thirds Grid lines
    const gridLines = document.createElement('div');
    gridLines.style.cssText = `
        position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(to right, transparent 33.2%, rgba(255,255,255,0.06) 33.3%, transparent 33.4%, transparent 66.5%, rgba(255,255,255,0.06) 66.6%, transparent 66.7%),
                    linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,0.06) 33.3%, transparent 33.4%, transparent 66.5%, rgba(255,255,255,0.06) 66.6%, transparent 66.7%);
    `;
    dofFrame.appendChild(gridLines);
    root.appendChild(dofFrame);

    // Bottom Controls Dock
    const controlsPanel = document.createElement('div');
    controlsPanel.id = 'photo-controls-panel';
    controlsPanel.style.cssText = `
        position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 14px; padding: 14px 22px; display: flex; align-items: center; gap: 20px;
        pointer-events: auto; backdrop-filter: blur(12px); box-shadow: 0 16px 36px rgba(0,0,0,0.5);
        color: #f8fafc; font-size: 13px;
    `;

    controlsPanel.innerHTML = `
        <div style="font-weight: 700; letter-spacing: 0.1em; color: #38bdf8; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">📷</span> Photo Mode
        </div>

        <!-- Presets -->
        <div style="display: flex; gap: 6px;" id="photo-preset-buttons-container">
            ${PRESET_KEYS.map((k) => `
                <button data-preset="${k}" class="photo-preset-btn" style="
                    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
                    color: #e2e8f0; border-radius: 6px; padding: 6px 10px; font-size: 11.5px;
                    font-weight: 600; cursor: pointer; transition: all 0.2s;
                ">${k}</button>
            `).join('')}
        </div>

        <div style="width: 1px; height: 26px; background: rgba(255,255,255,0.15);"></div>

        <!-- FOV Slider -->
        <div style="display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">FOV</label>
            <input id="photo-fov-slider" type="range" min="30" max="110" value="75" style="width: 85px; cursor: pointer;">
            <span id="photo-fov-value" style="font-family: monospace; font-size: 11px; width: 30px;">75°</span>
        </div>

        <!-- Speed Slider -->
        <div style="display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">Speed</label>
            <input id="photo-speed-slider" type="range" min="4" max="40" value="16" style="width: 75px; cursor: pointer;">
            <span id="photo-speed-value" style="font-family: monospace; font-size: 11px; width: 38px;">16 m/s</span>
        </div>

        <!-- DOF Checkbox -->
        <label style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; cursor: pointer;">
            <input id="photo-dof-toggle" type="checkbox" checked style="cursor: pointer;">
            DOF Frame
        </label>

        <div style="width: 1px; height: 26px; background: rgba(255,255,255,0.15);"></div>

        <!-- Action Buttons -->
        <button id="photo-capture-btn" style="
            background: #0ea5e9; color: #fff; border: none; border-radius: 8px;
            padding: 8px 16px; font-weight: 700; font-size: 12px; letter-spacing: 0.05em;
            cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
        ">
            📸 Snap PNG
        </button>

        <button id="photo-exit-btn" style="
            background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px; padding: 8px 12px; font-weight: 600; font-size: 12px; cursor: pointer;
        ">
            Exit [P]
        </button>
    `;

    root.appendChild(controlsPanel);

    return {
        root,
        filterTintOverlay,
        dofFrame,
        controlsPanel,
        fovSlider: controlsPanel.querySelector('#photo-fov-slider'),
        fovValue: controlsPanel.querySelector('#photo-fov-value'),
        speedSlider: controlsPanel.querySelector('#photo-speed-slider'),
        speedValue: controlsPanel.querySelector('#photo-speed-value'),
        dofToggle: controlsPanel.querySelector('#photo-dof-toggle'),
        screenshotBtn: controlsPanel.querySelector('#photo-capture-btn'),
        exitBtn: controlsPanel.querySelector('#photo-exit-btn'),
        presetButtons: controlsPanel.querySelectorAll('.photo-preset-btn'),
    };
}

function createAwardsDOM() {
    const root = document.createElement('div');
    root.id = 'post-run-awards-overlay';
    root.style.cssText = `
        position: fixed; inset: 0; background: rgba(5, 8, 14, 0.88); z-index: 10001;
        display: none; justify-content: center; align-items: center;
        backdrop-filter: blur(14px); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        color: #f8fafc; padding: 24px; box-sizing: border-box;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
        background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px; width: min(840px, 94vw); max-height: 90vh;
        overflow-y: auto; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        display: flex; flex-direction: column; gap: 24px;
    `;

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
            <div>
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #38bdf8;">
                    Post-Run Co-Op Awards
                </div>
                <div style="font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin-top: 4px;">
                    River Mouth Victory Celebration
                </div>
            </div>
            <div id="awards-squad-badge" style="
                background: linear-gradient(135deg, #10b981, #059669);
                padding: 8px 18px; border-radius: 12px; font-weight: 800; font-size: 18px;
                box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35); text-align: center;
            ">
                <div style="font-size: 9px; text-transform: uppercase; opacity: 0.9; font-weight: 600;">Squad Grade</div>
                <div id="awards-squad-rating">S+</div>
            </div>
        </div>

        <!-- MVP Showcase Banner -->
        <div id="awards-mvp-banner" style="
            background: linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05));
            border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 16px 20px;
            display: flex; align-items: center; justify-content: space-between;
        ">
            <!-- Populated dynamically -->
        </div>

        <!-- 5 Core Medals Grid -->
        <div>
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 12px;">
                Co-Op Titles & Medals
            </div>
            <div id="awards-medals-grid" style="
                display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;
            ">
                <!-- Populated dynamically -->
            </div>
        </div>

        <!-- Squad Player Roster Cards -->
        <div>
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 12px;">
                Crew Performance Breakdown
            </div>
            <div id="awards-roster-list" style="display: flex; flex-direction: column; gap: 10px;">
                <!-- Populated dynamically -->
            </div>
        </div>

        <div style="display: flex; justify-content: flex-end; padding-top: 10px;">
            <button id="awards-close-btn" style="
                background: #3b82f6; color: #fff; border: none; border-radius: 8px;
                padding: 10px 24px; font-weight: 700; font-size: 13px; cursor: pointer;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            ">Continue</button>
        </div>
    `;

    root.appendChild(container);

    return {
        root,
        squadRatingEl: container.querySelector('#awards-squad-rating'),
        mvpBannerEl: container.querySelector('#awards-mvp-banner'),
        medalsGridEl: container.querySelector('#awards-medals-grid'),
        rosterListEl: container.querySelector('#awards-roster-list'),
        closeBtn: container.querySelector('#awards-close-btn'),
    };
}

function renderVictoryAwardsDOM(dom, report) {
    if (!dom || !report) return;

    // Squad Grade
    if (dom.squadRatingEl) {
        dom.squadRatingEl.textContent = report.squadRating || 'S';
    }

    // MVP Banner
    if (dom.mvpBannerEl) {
        if (report.mvp) {
            dom.mvpBannerEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="font-size: 32px;">👑</div>
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; color: #f59e0b; font-weight: 800; letter-spacing: 0.1em;">
                            Run MVP / Most Valuable Raft
                        </div>
                        <div style="font-size: 20px; font-weight: 800; color: #fff;">
                            ${report.mvp.name} ${report.mvp.isBot ? '<span style="font-size: 11px; opacity: 0.7;">(AI Bot)</span>' : ''}
                        </div>
                    </div>
                </div>
                <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #fbbf24;">
                    ${Math.round(report.mvp.mvpScore)} pts
                </div>
            `;
        } else {
            dom.mvpBannerEl.innerHTML = `<div>No MVP registered.</div>`;
        }
    }

    // Medals Grid
    if (dom.medalsGridEl) {
        dom.medalsGridEl.innerHTML = Object.entries(report.awards).map(([key, aw]) => {
            const def = MEDAL_DEFINITIONS[key];
            const isWon = Boolean(aw.winnerId);
            return `
                <div style="
                    background: rgba(30, 41, 59, 0.7); border: 1px solid ${isWon ? aw.badgeColor : 'rgba(255,255,255,0.1)'};
                    border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 22px;">${aw.icon}</span>
                        <span style="
                            font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
                            padding: 3px 8px; border-radius: 6px;
                            background: ${isWon ? aw.badgeColor : '#334155'}; color: #fff;
                        ">${isWon ? aw.winningTier : 'Unclaimed'}</span>
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 14px;">${aw.medal}</div>
                        <div style="font-size: 11px; color: #94a3b8; line-height: 1.3; margin-top: 2px;">${def.description}</div>
                    </div>
                    <div style="margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px;">
                        ${isWon ? `<b>${aw.winnerName}</b> <span style="font-family: monospace; color: #38bdf8;">(${Math.round(aw.winningScore)})</span>` : '<span style="color: #64748b;">No crew qualified</span>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Crew Roster
    if (dom.rosterListEl) {
        dom.rosterListEl.innerHTML = Object.values(report.playerSummaries).map((p) => {
            return `
                <div style="
                    background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between;
                ">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 15px; font-weight: 700;">${p.name}</span>
                        <span style="
                            font-size: 10.5px; font-weight: 700; text-transform: uppercase;
                            background: rgba(56, 189, 248, 0.15); color: #38bdf8;
                            border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px; padding: 2px 6px;
                        ">${p.primaryTitle}</span>
                    </div>
                    <div style="display: flex; gap: 14px; font-family: monospace; font-size: 11.5px; color: #cbd5e1;">
                        <span>Kills: <b>${p.stats.kills}</b></span>
                        <span>Dmg: <b>${p.stats.damageDealt}</b></span>
                        <span>Blocked: <b>${p.stats.damageBlocked}</b></span>
                        <span>Planks: <b>${p.stats.plankLandings}</b></span>
                        <span>Coins: <b>${p.stats.coinsSpent}</b></span>
                    </div>
                </div>
            `;
        }).join('');
    }
}
