/**
 * Don't Sink, Don't Die — Reactive Keybind Pill Bar & Cooldown Highlighter
 * Upgrades the bottom #instructions keybind bar:
 * - Pressing W/A/S/D, Space, LMB, RMB, B, Z/X/C/V, or P visibly lights up corresponding keycaps in real time (Zero Dead Touch!).
 * - Automatically switches keycap glyphs between Keyboard/Mouse, Xbox, PlayStation, and Mobile Touch modes based on last active input.
 * - Dynamic cooldown highlighter for crew orders, abilities, and shop cooldowns.
 * - Pure ES module with clean DOM lifecycle and headless node testability.
 */

export const INPUT_MODES = {
    KEYBOARD: 'keyboard',
    XBOX: 'xbox',
    PLAYSTATION: 'playstation',
    TOUCH: 'touch',
};

/**
 * Keybind definitions per mode.
 * Each pill item contains:
 * - id: unique key for tracking state and cooldowns
 * - action: readable action description
 * - keys: array of keycaps to render { id, glyph, label }
 */
export const KEYBIND_SCHEMAS = {
    [INPUT_MODES.KEYBOARD]: [
        {
            id: 'paddle',
            action: 'paddle',
            keys: [
                { id: 'KeyW', code: 'KeyW', glyph: 'W' },
                { id: 'KeyS', code: 'KeyS', glyph: 'S' },
            ],
        },
        {
            id: 'steer',
            action: 'steer',
            keys: [
                { id: 'KeyA', code: 'KeyA', glyph: 'A' },
                { id: 'KeyD', code: 'KeyD', glyph: 'D' },
            ],
        },
        {
            id: 'jump',
            action: 'jump / kickflip',
            keys: [
                { id: 'Space', code: 'Space', glyph: 'Space' },
            ],
        },
        {
            id: 'attack',
            action: 'attack',
            keys: [
                { id: 'LMB', code: 'Mouse0', glyph: 'LMB' },
            ],
        },
        {
            id: 'parry',
            action: 'parry / block',
            keys: [
                { id: 'RMB', code: 'Mouse2', glyph: 'RMB' },
            ],
        },
        {
            id: 'armory',
            action: 'armory',
            keys: [
                { id: 'KeyE', code: 'KeyE', glyph: 'E' },
                { id: 'KeyB', code: 'KeyB', glyph: 'B' },
            ],
        },
        {
            id: 'crew_orders',
            action: 'crew orders',
            keys: [
                { id: 'KeyZ', code: 'KeyZ', glyph: 'Z' },
                { id: 'KeyX', code: 'KeyX', glyph: 'X' },
                { id: 'KeyC', code: 'KeyC', glyph: 'C' },
                { id: 'KeyV', code: 'KeyV', glyph: 'V' },
            ],
        },
        {
            id: 'photo',
            action: 'photo mode',
            keys: [
                { id: 'KeyP', code: 'KeyP', glyph: 'P' },
            ],
        },
        {
            id: 'settings',
            action: 'settings',
            keys: [
                { id: 'Escape', code: 'Escape', glyph: 'Esc' },
            ],
        },
    ],
    [INPUT_MODES.XBOX]: [
        {
            id: 'paddle',
            action: 'paddle',
            keys: [
                { id: 'LS_Y', code: 'GamepadLS_Y', glyph: 'LS ↕' },
            ],
        },
        {
            id: 'steer',
            action: 'steer',
            keys: [
                { id: 'LS_X', code: 'GamepadLS_X', glyph: 'LS ↔' },
            ],
        },
        {
            id: 'jump',
            action: 'jump / kickflip',
            keys: [
                { id: 'BtnA', code: 'Gamepad0', glyph: 'A' },
            ],
        },
        {
            id: 'attack',
            action: 'attack',
            keys: [
                { id: 'BtnRT', code: 'Gamepad7', glyph: 'RT' },
            ],
        },
        {
            id: 'parry',
            action: 'parry / block',
            keys: [
                { id: 'BtnLT', code: 'Gamepad6', glyph: 'LT' },
            ],
        },
        {
            id: 'armory',
            action: 'armory',
            keys: [
                { id: 'BtnY', code: 'Gamepad3', glyph: 'Y' },
            ],
        },
        {
            id: 'crew_orders',
            action: 'crew orders',
            keys: [
                { id: 'DPad', code: 'GamepadDPad', glyph: 'D-PAD' },
            ],
        },
        {
            id: 'photo',
            action: 'photo mode',
            keys: [
                { id: 'BtnBack', code: 'Gamepad8', glyph: 'View' },
            ],
        },
        {
            id: 'settings',
            action: 'menu',
            keys: [
                { id: 'BtnStart', code: 'Gamepad9', glyph: 'Menu' },
            ],
        },
    ],
    [INPUT_MODES.PLAYSTATION]: [
        {
            id: 'paddle',
            action: 'paddle',
            keys: [
                { id: 'LS_Y', code: 'GamepadLS_Y', glyph: 'L3 ↕' },
            ],
        },
        {
            id: 'steer',
            action: 'steer',
            keys: [
                { id: 'LS_X', code: 'GamepadLS_X', glyph: 'L3 ↔' },
            ],
        },
        {
            id: 'jump',
            action: 'jump / kickflip',
            keys: [
                { id: 'BtnCross', code: 'Gamepad0', glyph: '✕' },
            ],
        },
        {
            id: 'attack',
            action: 'attack',
            keys: [
                { id: 'BtnR2', code: 'Gamepad7', glyph: 'R2' },
            ],
        },
        {
            id: 'parry',
            action: 'parry / block',
            keys: [
                { id: 'BtnL2', code: 'Gamepad6', glyph: 'L2' },
            ],
        },
        {
            id: 'armory',
            action: 'armory',
            keys: [
                { id: 'BtnTriangle', code: 'Gamepad3', glyph: '△' },
            ],
        },
        {
            id: 'crew_orders',
            action: 'crew orders',
            keys: [
                { id: 'DPad', code: 'GamepadDPad', glyph: 'D-PAD' },
            ],
        },
        {
            id: 'photo',
            action: 'photo mode',
            keys: [
                { id: 'BtnShare', code: 'Gamepad8', glyph: 'Share' },
            ],
        },
        {
            id: 'settings',
            action: 'options',
            keys: [
                { id: 'BtnOptions', code: 'Gamepad9', glyph: 'Options' },
            ],
        },
    ],
    [INPUT_MODES.TOUCH]: [
        {
            id: 'paddle',
            action: 'paddle',
            keys: [
                { id: 'TouchStickY', code: 'TouchStickY', glyph: 'Stick ↕' },
            ],
        },
        {
            id: 'steer',
            action: 'steer',
            keys: [
                { id: 'TouchStickX', code: 'TouchStickX', glyph: 'Stick ↔' },
            ],
        },
        {
            id: 'jump',
            action: 'jump',
            keys: [
                { id: 'TouchJump', code: 'TouchJump', glyph: 'JUMP' },
            ],
        },
        {
            id: 'attack',
            action: 'attack',
            keys: [
                { id: 'TouchAttack', code: 'TouchAttack', glyph: 'SWING' },
            ],
        },
        {
            id: 'parry',
            action: 'parry',
            keys: [
                { id: 'TouchBlock', code: 'TouchBlock', glyph: 'BLOCK' },
            ],
        },
        {
            id: 'armory',
            action: 'armory',
            keys: [
                { id: 'TouchShop', code: 'TouchShop', glyph: 'SHOP' },
            ],
        },
        {
            id: 'photo',
            action: 'photo',
            keys: [
                { id: 'TouchPhoto', code: 'TouchPhoto', glyph: 'CAM' },
            ],
        },
    ],
};

/**
 * Key code normalize lookup helper.
 * Normalizes keyboard event key/code to schema key id.
 */
export function normalizeKeyboardCode(key, code) {
    if (code) {
        if (code === 'KeyW' || code === 'ArrowUp') return 'KeyW';
        if (code === 'KeyS' || code === 'ArrowDown') return 'KeyS';
        if (code === 'KeyA' || code === 'ArrowLeft') return 'KeyA';
        if (code === 'KeyD' || code === 'ArrowRight') return 'KeyD';
        if (code === 'Space') return 'Space';
        if (code === 'KeyB') return 'KeyB';
        if (code === 'KeyE') return 'KeyE';
        if (code === 'KeyZ') return 'KeyZ';
        if (code === 'KeyX') return 'KeyX';
        if (code === 'KeyC') return 'KeyC';
        if (code === 'KeyV') return 'KeyV';
        if (code === 'KeyP') return 'KeyP';
        if (code === 'Escape') return 'Escape';
        if (code === 'KeyF') return 'LMB';
        if (code === 'ShiftLeft' || code === 'ShiftRight') return 'RMB';
    }
    const lowerKey = (key || '').toLowerCase();
    if (lowerKey === 'w' || lowerKey === 'arrowup') return 'KeyW';
    if (lowerKey === 's' || lowerKey === 'arrowdown') return 'KeyS';
    if (lowerKey === 'a' || lowerKey === 'arrowleft') return 'KeyA';
    if (lowerKey === 'd' || lowerKey === 'arrowright') return 'KeyD';
    if (lowerKey === ' ') return 'Space';
    if (lowerKey === 'b') return 'KeyB';
    if (lowerKey === 'e') return 'KeyE';
    if (lowerKey === 'z') return 'KeyZ';
    if (lowerKey === 'x') return 'KeyX';
    if (lowerKey === 'c') return 'KeyC';
    if (lowerKey === 'v') return 'KeyV';
    if (lowerKey === 'p') return 'KeyP';
    if (lowerKey === 'escape') return 'Escape';
    if (lowerKey === 'f') return 'LMB';
    if (lowerKey === 'shift') return 'RMB';
    return null;
}

/**
 * Gamepad brand discriminator helper.
 */
export function detectGamepadBrand(gamepadId = '') {
    const id = String(gamepadId).toLowerCase();
    if (id.includes('playstation') || id.includes('dualshock') || id.includes('dualsense') || id.includes('ps4') || id.includes('ps5') || id.includes('sony')) {
        return INPUT_MODES.PLAYSTATION;
    }
    return INPUT_MODES.XBOX;
}

/**
 * Creates and manages the Reactive Keybind Pill Bar and Cooldown Highlighter.
 */
export function createReactiveKeybar(options = {}) {
    const rootEl = options.element || (typeof document !== 'undefined' ? document.getElementById('instructions') : null);
    let activeMode = options.initialMode || INPUT_MODES.KEYBOARD;

    // Set of currently pressed key IDs (e.g. 'KeyW', 'Space', 'LMB', 'KeyZ')
    const pressedKeys = new Set();

    // Map of action or key IDs to cooldown info: { endTimestamp, durationMs }
    const cooldowns = new Map();

    // Keycap DOM elements mapped by key ID: Map<keyId, HTMLElement>
    const keycapElements = new Map();

    // Pill group DOM elements mapped by pill id
    const pillElements = new Map();

    let disposed = false;

    // Apply / inject styles
    function injectStyles() {
        if (typeof document === 'undefined') return;
        const styleId = 'reactive-keybar-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            #instructions {
                transition: transform 0.15s ease-out, border-color 0.2s ease;
                user-select: none;
                -webkit-user-select: none;
            }
            .keybar-pill {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                position: relative;
                transition: transform 0.1s ease, color 0.15s ease;
            }
            .keybar-pill.on-cooldown {
                opacity: 0.55;
            }
            .keybar-keycap {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font: 600 10.5px/1 var(--mono, monospace);
                color: var(--ink, #e6ebf2);
                background: var(--panel-2, #161c26);
                border: 1px solid var(--line-2, #2f3a4b);
                border-bottom: 2px solid var(--line-2, #2f3a4b);
                border-radius: 4px;
                padding: 2px 5px;
                min-width: 14px;
                text-align: center;
                box-sizing: border-box;
                position: relative;
                overflow: hidden;
                transition: transform 0.06s cubic-bezier(0.1, 0.9, 0.2, 1),
                            background 0.08s ease,
                            border-color 0.08s ease,
                            color 0.08s ease,
                            box-shadow 0.08s ease;
            }
            .keybar-keycap.active {
                background: #5eead4 !important;
                color: #04201c !important;
                border-color: #2dd4bf !important;
                border-bottom-width: 1px !important;
                transform: translateY(1px) scale(0.96) !important;
                box-shadow: 0 0 10px rgba(94, 234, 212, 0.8), inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
            }
            .keybar-keycap.cooldown {
                border-color: #fbbf24 !important;
                color: #fbbf24 !important;
            }
            .keybar-cooldown-overlay {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                background: rgba(251, 191, 36, 0.35);
                pointer-events: none;
                transition: height 0.05s linear;
            }
            .keybar-action-label {
                font-size: 11px;
                letter-spacing: 0.02em;
                color: var(--muted, #8d99ab);
                margin-left: 1px;
            }
            .keybar-pill:hover .keybar-action-label {
                color: var(--ink, #e6ebf2);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Renders DOM elements inside rootEl based on active mode.
     */
    function render() {
        if (!rootEl) return;
        keycapElements.clear();
        pillElements.clear();
        rootEl.innerHTML = '';

        const schema = KEYBIND_SCHEMAS[activeMode] || KEYBIND_SCHEMAS[INPUT_MODES.KEYBOARD];

        for (const item of schema) {
            const pill = document.createElement('span');
            pill.className = 'keybar-pill';
            pill.dataset.pillId = item.id;

            // Render keycaps
            for (const keyDef of item.keys) {
                const kbd = document.createElement('kbd');
                kbd.className = 'keybar-keycap';
                kbd.dataset.keyId = keyDef.id;
                kbd.dataset.keyCode = keyDef.code;
                kbd.textContent = keyDef.glyph;

                if (pressedKeys.has(keyDef.id) || pressedKeys.has(keyDef.code)) {
                    kbd.classList.add('active');
                }

                // Check active cooldown
                if (cooldowns.has(keyDef.id) || cooldowns.has(item.id)) {
                    kbd.classList.add('cooldown');
                }

                pill.appendChild(kbd);
                keycapElements.set(keyDef.id, kbd);
                keycapElements.set(keyDef.code, kbd);
            }

            // Action description label
            const label = document.createElement('span');
            label.className = 'keybar-action-label';
            label.textContent = item.action;
            pill.appendChild(label);

            rootEl.appendChild(pill);
            pillElements.set(item.id, pill);
        }
    }

    /**
     * Sets a keycap's pressed status.
     * @param {string} keyId - E.g. 'KeyW', 'Space', 'LMB', 'Mouse0', etc.
     * @param {boolean} isPressed - Whether the keycap is pressed
     */
    function setKeyPressed(keyId, isPressed) {
        if (isPressed) {
            pressedKeys.add(keyId);
        } else {
            pressedKeys.delete(keyId);
        }

        const el = keycapElements.get(keyId);
        if (el) {
            if (isPressed) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        }
    }

    /**
     * Switches the active input mode (keyboard, xbox, playstation, touch).
     * @param {'keyboard'|'xbox'|'playstation'|'touch'} mode
     */
    function setInputMode(mode) {
        if (!KEYBIND_SCHEMAS[mode]) return;
        if (activeMode === mode) return;
        activeMode = mode;
        render();
    }

    /**
     * Sets cooldown on a specific action or key.
     * @param {string} id - E.g. 'crew_orders', 'KeyZ', 'jump', 'parry'
     * @param {number} durationMs - Cooldown duration in milliseconds
     * @param {number} [startMs] - Optional start timestamp in ms (defaults to performance.now())
     */
    function triggerCooldown(id, durationMs, startMs) {
        const now = startMs !== undefined ? startMs : (typeof performance !== 'undefined' ? performance.now() : Date.now());
        cooldowns.set(id, {
            start: now,
            duration: durationMs,
            end: now + durationMs,
        });

        // Update DOM visual
        updateCooldownDOM(id, 1.0);
    }

    function clearCooldown(id) {
        cooldowns.delete(id);
        updateCooldownDOM(id, 0);
    }

    function clearAllCooldowns() {
        for (const id of cooldowns.keys()) {
            updateCooldownDOM(id, 0);
        }
        cooldowns.clear();
    }

    /**
     * Updates cooldown visual overlays.
     */
    function updateCooldownDOM(id, fraction) {
        const pill = pillElements.get(id);
        const keyEl = keycapElements.get(id);

        if (fraction > 0) {
            if (pill) pill.classList.add('on-cooldown');
            if (keyEl) keyEl.classList.add('cooldown');
        } else {
            if (pill) pill.classList.remove('on-cooldown');
            if (keyEl) keyEl.classList.remove('cooldown');
        }
    }

    /**
     * Per-frame update loop to decay cooldowns and poll gamepad if needed.
     * @param {number} [nowMs] - Current time in ms
     */
    function update(nowMs) {
        if (disposed) return;
        const now = nowMs !== undefined ? nowMs : (typeof performance !== 'undefined' ? performance.now() : Date.now());

        // Update active cooldowns
        for (const [id, cd] of cooldowns.entries()) {
            const remaining = cd.end - now;
            if (remaining <= 0) {
                clearCooldown(id);
            } else {
                const fraction = Math.max(0, Math.min(1, remaining / cd.duration));
                updateCooldownDOM(id, fraction);
            }
        }

        // Poll gamepad for active mode switch & buttons if gamepad API available
        if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
            const gamepads = navigator.getGamepads();
            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp && gp.connected) {
                    // Check button activity or stick tilt to detect gamepad usage
                    let hasActivity = false;
                    for (let b = 0; b < gp.buttons.length; b++) {
                        const btn = gp.buttons[b];
                        const val = typeof btn === 'object' ? btn.value : btn;
                        if (val > 0.3 || (btn && btn.pressed)) {
                            hasActivity = true;
                            break;
                        }
                    }
                    if (!hasActivity) {
                        for (let a = 0; a < gp.axes.length; a++) {
                            if (Math.abs(gp.axes[a]) > 0.35) {
                                hasActivity = true;
                                break;
                            }
                        }
                    }

                    if (hasActivity) {
                        const brand = detectGamepadBrand(gp.id);
                        if (activeMode !== brand) {
                            setInputMode(brand);
                        }

                        // Map standard gamepad button presses to keys
                        // A: Jump (Gamepad0 / BtnA)
                        const aPressed = (gp.buttons[0]?.pressed || (gp.buttons[0]?.value ?? 0) > 0.5);
                        setKeyPressed('BtnA', aPressed);
                        setKeyPressed('BtnCross', aPressed);
                        setKeyPressed('Gamepad0', aPressed);

                        // RT: Attack (Gamepad7 / BtnRT)
                        const rtPressed = (gp.buttons[7]?.pressed || (gp.buttons[7]?.value ?? 0) > 0.5);
                        setKeyPressed('BtnRT', rtPressed);
                        setKeyPressed('BtnR2', rtPressed);
                        setKeyPressed('Gamepad7', rtPressed);

                        // LT: Parry (Gamepad6 / BtnLT)
                        const ltPressed = (gp.buttons[6]?.pressed || (gp.buttons[6]?.value ?? 0) > 0.5);
                        setKeyPressed('BtnLT', ltPressed);
                        setKeyPressed('BtnL2', ltPressed);
                        setKeyPressed('Gamepad6', ltPressed);

                        // Y: Armory (Gamepad3 / BtnY)
                        const yPressed = (gp.buttons[3]?.pressed || (gp.buttons[3]?.value ?? 0) > 0.5);
                        setKeyPressed('BtnY', yPressed);
                        setKeyPressed('BtnTriangle', yPressed);
                        setKeyPressed('Gamepad3', yPressed);

                        // Left Stick Axes
                        const lsX = Math.abs(gp.axes[0] || 0) > 0.3;
                        setKeyPressed('LS_X', lsX);
                        setKeyPressed('GamepadLS_X', lsX);

                        const lsY = Math.abs(gp.axes[1] || 0) > 0.3;
                        setKeyPressed('LS_Y', lsY);
                        setKeyPressed('GamepadLS_Y', lsY);

                        // D-Pad for crew orders (Buttons 12-15)
                        const dpadPressed = [12, 13, 14, 15].some((idx) => gp.buttons[idx]?.pressed);
                        setKeyPressed('DPad', dpadPressed);
                        setKeyPressed('GamepadDPad', dpadPressed);

                        // Select / Share
                        const backPressed = Boolean(gp.buttons[8]?.pressed);
                        setKeyPressed('BtnBack', backPressed);
                        setKeyPressed('BtnShare', backPressed);
                        setKeyPressed('Gamepad8', backPressed);

                        // Start / Options
                        const startPressed = Boolean(gp.buttons[9]?.pressed);
                        setKeyPressed('BtnStart', startPressed);
                        setKeyPressed('BtnOptions', startPressed);
                        setKeyPressed('Gamepad9', startPressed);
                    }
                }
            }
        }
    }

    // Window event listeners
    const onKeyDown = (e) => {
        if (activeMode !== INPUT_MODES.KEYBOARD) {
            setInputMode(INPUT_MODES.KEYBOARD);
        }
        const keyId = normalizeKeyboardCode(e.key, e.code);
        if (keyId) {
            setKeyPressed(keyId, true);
        }
    };

    const onKeyUp = (e) => {
        const keyId = normalizeKeyboardCode(e.key, e.code);
        if (keyId) {
            setKeyPressed(keyId, false);
        }
    };

    const onMouseDown = (e) => {
        if (activeMode !== INPUT_MODES.KEYBOARD) {
            setInputMode(INPUT_MODES.KEYBOARD);
        }
        if (e.button === 0) {
            setKeyPressed('LMB', true);
            setKeyPressed('Mouse0', true);
        } else if (e.button === 2) {
            setKeyPressed('RMB', true);
            setKeyPressed('Mouse2', true);
        }
    };

    const onMouseUp = (e) => {
        if (e.button === 0) {
            setKeyPressed('LMB', false);
            setKeyPressed('Mouse0', false);
        } else if (e.button === 2) {
            setKeyPressed('RMB', false);
            setKeyPressed('Mouse2', false);
        }
    };

    const onTouchStart = () => {
        if (activeMode !== INPUT_MODES.TOUCH) {
            setInputMode(INPUT_MODES.TOUCH);
        }
    };

    const onGamepadConnected = (e) => {
        const brand = detectGamepadBrand(e.gamepad?.id);
        setInputMode(brand);
    };

    const onGamepadDisconnected = () => {
        setInputMode(INPUT_MODES.KEYBOARD);
    };

    const onBlur = () => {
        pressedKeys.clear();
        for (const el of keycapElements.values()) {
            el.classList.remove('active');
        }
    };

    // Attach listeners if in browser environment
    if (typeof window !== 'undefined') {
        injectStyles();
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('gamepadconnected', onGamepadConnected);
        window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
        window.addEventListener('blur', onBlur);
    }

    // Initial render
    render();

    function dispose() {
        disposed = true;
        pressedKeys.clear();
        cooldowns.clear();
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('gamepadconnected', onGamepadConnected);
            window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
            window.removeEventListener('blur', onBlur);
        }
        if (rootEl) {
            rootEl.innerHTML = '';
        }
    }

    return {
        render,
        setKeyPressed,
        setInputMode,
        triggerCooldown,
        clearCooldown,
        clearAllCooldowns,
        update,
        dispose,
        getActiveMode: () => activeMode,
        getPressedKeys: () => Array.from(pressedKeys),
        getActiveCooldowns: () => new Map(cooldowns),
        getRootElement: () => rootEl,
        getKeycapElement: (keyId) => keycapElements.get(keyId) || null,
        getPillElement: (pillId) => pillElements.get(pillId) || null,
        // Handlers for explicit mocking/testing
        _handlers: {
            onKeyDown,
            onKeyUp,
            onMouseDown,
            onMouseUp,
            onTouchStart,
            onGamepadConnected,
            onGamepadDisconnected,
            onBlur,
        },
    };
}
