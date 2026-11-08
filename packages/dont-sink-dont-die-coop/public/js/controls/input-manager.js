/**
 * Don't Sink, Don't Die — Unified Input Manager
 * ES module managing Gamepad API, Keyboard rebinding, and Mobile Virtual Twin-Stick touch controls.
 * Integrates seamlessly with shared/input-math.js.
 */

import {
    DEFAULT_KEYMAP,
    DEFAULT_INPUT_CONFIG,
    normalizeGamepadSnapshot,
    mergeUnifiedInputs,
    normalizeVirtualJoystick,
    serializeKeymap,
    deserializeKeymap,
    validateKeymap,
    getHapticVibrationPattern,
} from '../../../shared/input-math.js';

export class InputManager {
    constructor(options = {}) {
        this.options = {
            storageKey: options.storageKey || 'dsdd_keymap',
            container: options.container || (typeof document !== 'undefined' ? document.body : null),
            enableTouch: options.enableTouch ?? true,
            enableGamepad: options.enableGamepad ?? true,
            enableKeyboard: options.enableKeyboard ?? true,
            vibrationEnabled: options.vibrationEnabled ?? true,
            touchAutoDetect: options.touchAutoDetect ?? true,
            stickDeadzone: options.stickDeadzone ?? DEFAULT_INPUT_CONFIG.stickDeadzone,
            ...options,
        };

        // Keymaps & bindings
        this.keymap = structuredClone(DEFAULT_KEYMAP);
        this.loadKeymap();

        // Internal device input states
        this.keyboardState = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            attack: false,
            block: false,
            shop: false,
            mute: false,
        };

        this.gamepadState = {
            connected: false,
            id: null,
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            attack: false,
            block: false,
            shop: false,
            leftStick: { x: 0, y: 0, magnitude: 0 },
            rightStick: { x: 0, y: 0, magnitude: 0 },
            triggers: { lt: 0, rt: 0 },
        };

        this.touchState = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            row: false,
            jump: false,
            attack: false,
            block: false,
            shop: false,
            settings: false,
            steering: 0,
            throttle: 0,
            leftStick: { x: 0, y: 0, active: false },
            rightStick: { x: 0, y: 0, active: false },
        };

        // Unified merged snapshot
        this.currentInput = mergeUnifiedInputs({});

        // Previous button states for edge detection (press / release)
        this.prevInput = { ...this.currentInput };
        this.prevGamepadButtons = {};

        // Active Gamepad index
        this.activeGamepadIndex = null;

        // Callbacks / Action Listeners (e.g. for attack trigger or shop toggle)
        this.actionListeners = new Map();

        // Mobile touch controls state & DOM elements
        this.isTouchDevice = false;
        this.touchElements = null;
        this.touchTracking = {
            joystickTouchId: null,
            rightStickTouchId: null,
            originX: 0,
            originY: 0,
            currentX: 0,
            currentY: 0,
            rightOriginX: 0,
            rightOriginY: 0,
            rightCurrentX: 0,
            rightCurrentY: 0,
        };

        // Bind event handlers
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onWindowBlur = this._onWindowBlur.bind(this);
        this._onGamepadConnected = this._onGamepadConnected.bind(this);
        this._onGamepadDisconnected = this._onGamepadDisconnected.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);

        this.init();
    }

    init() {
        if (typeof window === 'undefined') return;

        // Check touch capabilities or mobile phone viewport width
        const isMobileViewport = (typeof window.innerWidth === 'number' && window.innerWidth <= 900) ||
            Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
        this.isTouchDevice = ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0) ||
            isMobileViewport;

        if (this.options.enableKeyboard) {
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);
            window.addEventListener('blur', this._onWindowBlur);
        }

        if (this.options.enableGamepad) {
            window.addEventListener('gamepadconnected', this._onGamepadConnected);
            window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
        }

        if (this.options.enableTouch) {
            if (this.isTouchDevice) {
                this.setupTouchControls();
            } else if (this.options.touchAutoDetect) {
                // Auto-appear on first touch event or mobile viewport resize
                window.addEventListener('touchstart', this._onTouchStart, { once: true, passive: true });
                this._onMobileResize = () => {
                    if (!this.touchElements && window.innerWidth <= 900) {
                        this.isTouchDevice = true;
                        this.setupTouchControls();
                    }
                };
                window.addEventListener('resize', this._onMobileResize);
            }
        }
    }

    _onTouchStart() {
        if (!this.touchElements) {
            this.isTouchDevice = true;
            this.setupTouchControls();
        }
    }

    _onKeyDown(e) {
        const code = e.code;
        let matched = false;

        for (const [action, keys] of Object.entries(this.keymap)) {
            if (keys.includes(code)) {
                this._setKeyboardAction(action, true);
                matched = true;
            }
        }

        // Also check common fallback keys if code didn't match (e.g. arrow keys)
        if (!matched) {
            if (e.key === 'ArrowUp') this._setKeyboardAction('forward', true);
            else if (e.key === 'ArrowDown') this._setKeyboardAction('backward', true);
            else if (e.key === 'ArrowLeft') this._setKeyboardAction('turnLeft', true);
            else if (e.key === 'ArrowRight') this._setKeyboardAction('turnRight', true);
            else if (e.key === ' ') this._setKeyboardAction('jump', true);
        }
    }

    _onKeyUp(e) {
        const code = e.code;
        let matched = false;

        for (const [action, keys] of Object.entries(this.keymap)) {
            if (keys.includes(code)) {
                this._setKeyboardAction(action, false);
                matched = true;
            }
        }

        if (!matched) {
            if (e.key === 'ArrowUp') this._setKeyboardAction('forward', false);
            else if (e.key === 'ArrowDown') this._setKeyboardAction('backward', false);
            else if (e.key === 'ArrowLeft') this._setKeyboardAction('turnLeft', false);
            else if (e.key === 'ArrowRight') this._setKeyboardAction('turnRight', false);
            else if (e.key === ' ') this._setKeyboardAction('jump', false);
        }
    }

    _setKeyboardAction(action, isPressed) {
        switch (action) {
            case 'forward': this.keyboardState.forward = isPressed; break;
            case 'backward': this.keyboardState.backward = isPressed; break;
            case 'turnLeft': this.keyboardState.left = isPressed; break;
            case 'turnRight': this.keyboardState.right = isPressed; break;
            case 'jump': this.keyboardState.jump = isPressed; break;
            case 'attack': this.keyboardState.attack = isPressed; break;
            case 'block': this.keyboardState.block = isPressed; break;
            case 'shop': this.keyboardState.shop = isPressed; break;
            case 'mute': this.keyboardState.mute = isPressed; break;
        }
    }

    _onWindowBlur() {
        for (const k in this.keyboardState) {
            this.keyboardState[k] = false;
        }
    }

    _onGamepadConnected(e) {
        const gp = e.gamepad;
        if (this.activeGamepadIndex === null) {
            this.activeGamepadIndex = gp.index;
        }
    }

    _onGamepadDisconnected(e) {
        if (this.activeGamepadIndex === e.gamepad.index) {
            this.activeGamepadIndex = null;
            this.gamepadState = normalizeGamepadSnapshot(null);
        }
    }

    /**
     * Polls active gamepad via navigator.getGamepads()
     */
    pollGamepad() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) {
            return this.gamepadState;
        }

        const gamepads = navigator.getGamepads();
        let targetGamepad = null;

        if (this.activeGamepadIndex !== null && gamepads[this.activeGamepadIndex]) {
            targetGamepad = gamepads[this.activeGamepadIndex];
        } else {
            // Pick first connected gamepad
            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i] && gamepads[i].connected) {
                    this.activeGamepadIndex = i;
                    targetGamepad = gamepads[i];
                    break;
                }
            }
        }

        this.gamepadState = normalizeGamepadSnapshot(targetGamepad, {
            stickDeadzone: this.options.stickDeadzone,
        });

        return this.gamepadState;
    }

    /**
     * Triggers haptic vibration rumble on the connected gamepad.
     */
    playHapticRumble(effectType = 'hit', intensity = 1.0) {
        if (!this.options.vibrationEnabled || typeof navigator === 'undefined' || !navigator.getGamepads) {
            return false;
        }

        const gamepads = navigator.getGamepads();
        const gp = this.activeGamepadIndex !== null ? gamepads[this.activeGamepadIndex] : null;
        if (!gp || !gp.connected) return false;

        const pattern = getHapticVibrationPattern(effectType, intensity);

        // Standard VibrationActuator API (Chromium / Web standard)
        if (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') {
            gp.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: pattern.duration,
                weakMagnitude: pattern.weakMagnitude,
                strongMagnitude: pattern.strongMagnitude,
            }).catch(() => {});
            return true;
        }

        // Standard hapticActuators fallback
        if (gp.hapticActuators && gp.hapticActuators.length > 0) {
            const actuator = gp.hapticActuators[0];
            if (typeof actuator.pulse === 'function') {
                actuator.pulse(pattern.strongMagnitude, pattern.duration);
                return true;
            }
        }

        return false;
    }

    /**
     * Update loop to be called each simulation frame.
     * Polls gamepad, checks button edge-triggers, and merges all inputs.
     */
    update() {
        if (this.options.enableGamepad) {
            this.pollGamepad();
        }

        // Merge unified input
        const merged = mergeUnifiedInputs({
            keyboard: this.keyboardState,
            gamepad: this.gamepadState,
            touch: this.touchState,
        });

        // Trigger discrete action callbacks on rising edges (e.g. jump, attack, shop)
        this._dispatchEdgeActions(merged);

        this.prevInput = this.currentInput;
        this.currentInput = merged;

        return this.currentInput;
    }

    _dispatchEdgeActions(current) {
        const prev = this.currentInput;
        const checkEdge = (actionKey) => current[actionKey] && !prev[actionKey];

        if (checkEdge('jump')) this._triggerAction('jump');
        if (checkEdge('attacking')) this._triggerAction('attack');
        if (checkEdge('shop')) this._triggerAction('shop');
        if (checkEdge('mute')) this._triggerAction('mute');
    }

    onAction(action, callback) {
        if (!this.actionListeners.has(action)) {
            this.actionListeners.set(action, new Set());
        }
        this.actionListeners.get(action).add(callback);
        return () => this.actionListeners.get(action)?.delete(callback);
    }

    _triggerAction(action) {
        const listeners = this.actionListeners.get(action);
        if (listeners) {
            for (const cb of listeners) cb();
        }
    }

    /**
     * Gets current unified game input state: { w, a, s, d, space, attacking, blocking, shop, steering, throttle }
     */
    getState() {
        return this.currentInput;
    }

    /**
     * Mobile Touch Virtual Twin-Stick UI Setup
     */
    setupTouchControls() {
        if (this.touchElements || typeof document === 'undefined') return;

        const container = document.createElement('div');
        container.id = 'touch-controls-container';
        container.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 90;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
        `;

        // Top-Right Mobile Settings Button (⚙️) so phone users can open Settings / Title Menu without an [Esc] key
        const btnSettings = document.createElement('button');
        btnSettings.id = 'btn-touch-settings';
        btnSettings.setAttribute('aria-label', 'Settings');
        btnSettings.innerText = '⚙️';
        btnSettings.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            background: rgba(15, 23, 42, 0.85);
            color: #e2e8f0;
            font-size: 17px;
            border: 1px solid rgba(56, 189, 248, 0.35);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
            pointer-events: auto;
            touch-action: manipulation;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;

        // Left Virtual Joystick Zone (Steering & Throttle)
        const leftZone = document.createElement('div');
        leftZone.id = 'touch-joystick-zone';
        leftZone.style.cssText = `
            position: absolute;
            bottom: 18px;
            left: 16px;
            width: 132px;
            height: 132px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(15, 23, 42, 0.55) 0%, rgba(15, 23, 42, 0.78) 100%);
            border: 2px solid rgba(94, 234, 212, 0.38);
            pointer-events: auto;
            touch-action: none;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
        `;

        const joystickHint = document.createElement('div');
        joystickHint.style.cssText = `
            position: absolute;
            top: 8px;
            left: 50%;
            transform: translateX(-50%);
            font: 800 9px/1 ui-monospace, monospace;
            letter-spacing: 0.08em;
            color: rgba(94, 234, 212, 0.75);
            pointer-events: none;
        `;
        joystickHint.innerText = 'STEER / ROW';
        leftZone.appendChild(joystickHint);

        const joystickKnob = document.createElement('div');
        joystickKnob.id = 'touch-joystick-knob';
        joystickKnob.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 52px;
            height: 52px;
            margin-top: -26px;
            margin-left: -26px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(94, 234, 212, 0.92) 0%, rgba(14, 165, 233, 0.55) 100%);
            border: 2px solid rgba(255, 255, 255, 0.75);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45);
            pointer-events: none;
            transition: transform 0.04s ease-out;
        `;
        leftZone.appendChild(joystickKnob);

        // Right Action Buttons Cluster: ROW (Primary), SWING, JUMP, BLOCK, SHOP
        const actionCluster = document.createElement('div');
        actionCluster.id = 'touch-action-cluster';
        actionCluster.style.cssText = `
            position: absolute;
            bottom: 16px;
            right: 14px;
            width: 178px;
            height: 172px;
            pointer-events: none;
        `;

        const createButton = (id, text, color, top, left, size = 52) => {
            const btn = document.createElement('button');
            btn.id = id;
            btn.innerText = text;
            btn.style.cssText = `
                position: absolute;
                top: ${top}px;
                left: ${left}px;
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: ${color};
                color: #fff;
                font-family: ui-sans-serif, system-ui, sans-serif;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.03em;
                border: 2px solid rgba(255, 255, 255, 0.42);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.55);
                pointer-events: auto;
                touch-action: none;
                display: flex;
                align-items: center;
                justify-content: center;
                text-shadow: 0 1px 2px #000;
                cursor: pointer;
                padding: 0;
            `;
            return btn;
        };

        // Ergonomic right-thumb layout with dedicated ROW button for physical oar strokes
        const btnRow = createButton('btn-touch-row', '🚣 ROW', 'rgba(14, 165, 233, 0.9)', 106, 114, 60);
        const btnAttack = createButton('btn-touch-attack', '⚔️ SWING', 'rgba(230, 57, 70, 0.88)', 44, 118, 54);
        const btnJump = createButton('btn-touch-jump', '⏫ JUMP', 'rgba(42, 157, 143, 0.88)', 114, 52, 52);
        const btnBlock = createButton('btn-touch-block', '🛡️ BLOCK', 'rgba(233, 196, 106, 0.88)', 56, 4, 50);
        const btnShop = createButton('btn-touch-shop', '🛒 SHOP', 'rgba(99, 102, 241, 0.85)', 0, 58, 46);

        actionCluster.appendChild(btnRow);
        actionCluster.appendChild(btnAttack);
        actionCluster.appendChild(btnJump);
        actionCluster.appendChild(btnBlock);
        actionCluster.appendChild(btnShop);

        container.appendChild(btnSettings);
        container.appendChild(leftZone);
        container.appendChild(actionCluster);
        (this.options.container || document.body).appendChild(container);

        // Bind Touch + Pointer Listeners on Virtual Joystick
        const maxRadius = 50;

        const updateJoystickUI = (touchX, touchY, rect) => {
            const originX = rect.left + rect.width / 2;
            const originY = rect.top + rect.height / 2;
            const norm = normalizeVirtualJoystick(touchX, touchY, originX, originY, maxRadius, 0.12);

            this.touchState.leftStick = { x: norm.x, y: norm.y, active: true };
            this.touchState.steering = norm.x;
            this.touchState.throttle = -norm.y;

            // Update digital directions
            const deadzoneThresh = 0.26;
            this.touchState.forward = norm.y < -deadzoneThresh;
            this.touchState.backward = norm.y > deadzoneThresh;
            this.touchState.left = norm.x < -deadzoneThresh;
            this.touchState.right = norm.x > deadzoneThresh;

            joystickKnob.style.transform = `translate(${norm.x * maxRadius}px, ${norm.y * maxRadius}px)`;
        };

        const resetJoystickUI = () => {
            this.touchState.leftStick = { x: 0, y: 0, active: false };
            this.touchState.steering = 0;
            this.touchState.throttle = 0;
            this.touchState.forward = false;
            this.touchState.backward = false;
            this.touchState.left = false;
            this.touchState.right = false;
            joystickKnob.style.transform = 'translate(0px, 0px)';
            this.touchTracking.joystickTouchId = null;
        };

        leftZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.touchTracking.joystickTouchId = touch.identifier;
            const rect = leftZone.getBoundingClientRect();
            updateJoystickUI(touch.clientX, touch.clientY, rect);
        }, { passive: false });

        leftZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === this.touchTracking.joystickTouchId) {
                    const rect = leftZone.getBoundingClientRect();
                    updateJoystickUI(touch.clientX, touch.clientY, rect);
                    break;
                }
            }
        }, { passive: false });

        const endJoystick = (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchTracking.joystickTouchId) {
                    resetJoystickUI();
                    break;
                }
            }
        };
        leftZone.addEventListener('touchend', endJoystick);
        leftZone.addEventListener('touchcancel', endJoystick);

        // Pointer Events fallback for mobile browsers / hybrid touchscreens
        let pointerDraggingStick = false;
        leftZone.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' && this.touchTracking.joystickTouchId !== null) return;
            pointerDraggingStick = true;
            leftZone.setPointerCapture?.(e.pointerId);
            const rect = leftZone.getBoundingClientRect();
            updateJoystickUI(e.clientX, e.clientY, rect);
        });
        leftZone.addEventListener('pointermove', (e) => {
            if (!pointerDraggingStick) return;
            const rect = leftZone.getBoundingClientRect();
            updateJoystickUI(e.clientX, e.clientY, rect);
        });
        const endPointerStick = () => {
            if (!pointerDraggingStick) return;
            pointerDraggingStick = false;
            resetJoystickUI();
        };
        leftZone.addEventListener('pointerup', endPointerStick);
        leftZone.addEventListener('pointercancel', endPointerStick);

        // Bind Action Buttons (Touch + Pointer/Click support)
        const bindActionButton = (element, stateKey, onTapCallback = null) => {
            const activate = (e) => {
                if (e?.cancelable) e.preventDefault();
                const wasActive = this.touchState[stateKey];
                this.touchState[stateKey] = true;
                element.style.filter = 'brightness(1.35)';
                if (!wasActive && onTapCallback) onTapCallback();
            };
            const deactivate = (e) => {
                if (e?.cancelable) e.preventDefault();
                this.touchState[stateKey] = false;
                element.style.filter = 'none';
            };
            element.addEventListener('touchstart', activate, { passive: false });
            element.addEventListener('touchend', deactivate);
            element.addEventListener('touchcancel', deactivate);
            element.addEventListener('pointerdown', activate);
            element.addEventListener('pointerup', deactivate);
            element.addEventListener('pointercancel', deactivate);
            element.addEventListener('pointerleave', deactivate);
        };

        bindActionButton(btnRow, 'row', () => this._triggerAction('row'));
        bindActionButton(btnAttack, 'attack', () => this._triggerAction('attack'));
        bindActionButton(btnJump, 'jump', () => this._triggerAction('jump'));
        bindActionButton(btnBlock, 'block');
        bindActionButton(btnShop, 'shop', () => this._triggerAction('shop'));
        bindActionButton(btnSettings, 'settings', () => this._triggerAction('settings'));

        this.touchElements = {
            container,
            btnSettings,
            leftZone,
            joystickKnob,
            actionCluster,
            btnRow,
            btnAttack,
            btnJump,
            btnBlock,
            btnShop,
        };
    }

    setTouchVisible(visible) {
        if (!this.touchElements?.container) return;
        this.touchElements.container.style.display = visible ? 'block' : 'none';
    }

    /**
     * Keymap Rebinding API
     */
    rebindKey(action, keyCode) {
        if (!this.keymap[action]) {
            throw new Error(`Unknown action to rebind: ${action}`);
        }
        this.keymap[action] = [keyCode];
        this.saveKeymap();
    }

    addKeyBinding(action, keyCode) {
        if (!this.keymap[action]) {
            throw new Error(`Unknown action: ${action}`);
        }
        if (!this.keymap[action].includes(keyCode)) {
            this.keymap[action].push(keyCode);
            this.saveKeymap();
        }
    }

    resetDefaultKeymap() {
        this.keymap = structuredClone(DEFAULT_KEYMAP);
        this.saveKeymap();
    }

    saveKeymap() {
        if (typeof localStorage === 'undefined') return;
        try {
            const serialized = serializeKeymap(this.keymap);
            localStorage.setItem(this.options.storageKey, serialized);
        } catch {}
    }

    loadKeymap() {
        if (typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem(this.options.storageKey);
            if (raw) {
                this.keymap = deserializeKeymap(raw, DEFAULT_KEYMAP);
            }
        } catch {}
    }

    dispose() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this._onKeyDown);
            window.removeEventListener('keyup', this._onKeyUp);
            window.removeEventListener('blur', this._onWindowBlur);
            window.removeEventListener('gamepadconnected', this._onGamepadConnected);
            window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
            window.removeEventListener('touchstart', this._onTouchStart);
        }

        if (this.touchElements?.container?.parentNode) {
            this.touchElements.container.parentNode.removeChild(this.touchElements.container);
        }
        this.touchElements = null;
        this.actionListeners.clear();
    }
}
