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
            jump: false,
            attack: false,
            block: false,
            shop: false,
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

        // Check touch capabilities
        this.isTouchDevice = ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0);

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
                // Auto-appear on first touch event
                window.addEventListener('touchstart', this._onTouchStart, { once: true, passive: true });
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
            z-index: 1000;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
        `;

        // Left Virtual Joystick Zone (Steering & Throttle)
        const leftZone = document.createElement('div');
        leftZone.id = 'touch-joystick-zone';
        leftZone.style.cssText = `
            position: absolute;
            bottom: 25px;
            left: 25px;
            width: 140px;
            height: 140px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            border: 2px solid rgba(255, 255, 255, 0.25);
            pointer-events: auto;
            touch-action: none;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        `;

        const joystickKnob = document.createElement('div');
        joystickKnob.id = 'touch-joystick-knob';
        joystickKnob.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 54px;
            height: 54px;
            margin-top: -27px;
            margin-left: -27px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(200, 220, 255, 0.4) 100%);
            border: 2px solid rgba(255, 255, 255, 0.6);
            pointer-events: none;
            transition: transform 0.05s ease-out;
        `;
        leftZone.appendChild(joystickKnob);

        // Right Action Buttons Cluster: Jump, Attack, Block, Shop
        const actionCluster = document.createElement('div');
        actionCluster.id = 'touch-action-cluster';
        actionCluster.style.cssText = `
            position: absolute;
            bottom: 25px;
            right: 25px;
            width: 180px;
            height: 180px;
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
                font-family: sans-serif;
                font-size: 13px;
                font-weight: bold;
                border: 2px solid rgba(255, 255, 255, 0.4);
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
                pointer-events: auto;
                touch-action: none;
                display: flex;
                align-items: center;
                justify-content: center;
                text-shadow: 0 1px 2px #000;
            `;
            return btn;
        };

        // Layout matching standard diamond / ergonomic thumb placement
        const btnAttack = createButton('btn-touch-attack', 'SWING', 'rgba(230, 57, 70, 0.8)', 64, 116, 56);
        const btnJump = createButton('btn-touch-jump', 'JUMP', 'rgba(42, 157, 143, 0.85)', 120, 58, 54);
        const btnBlock = createButton('btn-touch-block', 'BLOCK', 'rgba(233, 196, 106, 0.85)', 64, 0, 54);
        const btnShop = createButton('btn-touch-shop', 'SHOP', 'rgba(69, 123, 157, 0.8)', 0, 58, 48);

        actionCluster.appendChild(btnAttack);
        actionCluster.appendChild(btnJump);
        actionCluster.appendChild(btnBlock);
        actionCluster.appendChild(btnShop);

        container.appendChild(leftZone);
        container.appendChild(actionCluster);
        (this.options.container || document.body).appendChild(container);

        // Bind Touch Listeners
        const maxRadius = 55;

        const updateJoystickUI = (touchX, touchY, rect) => {
            const originX = rect.left + rect.width / 2;
            const originY = rect.top + rect.height / 2;
            const norm = normalizeVirtualJoystick(touchX, touchY, originX, originY, maxRadius, 0.12);

            this.touchState.leftStick = { x: norm.x, y: norm.y, active: true };
            this.touchState.steering = norm.x;
            this.touchState.throttle = -norm.y;

            // Update digital directions
            const deadzoneThresh = 0.3;
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

        // Bind Action Buttons
        const bindActionButton = (element, stateKey) => {
            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.touchState[stateKey] = true;
                element.style.filter = 'brightness(1.4)';
            }, { passive: false });

            const endTouch = (e) => {
                e.preventDefault();
                this.touchState[stateKey] = false;
                element.style.filter = 'none';
            };
            element.addEventListener('touchend', endTouch);
            element.addEventListener('touchcancel', endTouch);
        };

        bindActionButton(btnAttack, 'attack');
        bindActionButton(btnJump, 'jump');
        bindActionButton(btnBlock, 'block');
        bindActionButton(btnShop, 'shop');

        this.touchElements = {
            container,
            leftZone,
            joystickKnob,
            actionCluster,
            btnAttack,
            btnJump,
            btnBlock,
            btnShop,
        };
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
