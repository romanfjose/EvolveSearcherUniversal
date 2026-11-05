/**
 * Don't Sink, Don't Die — Shared Input Math & Normalization Helpers
 * Deterministic math functions for deadzones, analog-to-digital conversions,
 * vector clamping/smoothing, keybinding serialization, and virtual joystick normalization.
 */

/** Default deadzones for analog sticks and triggers */
export const DEFAULT_INPUT_CONFIG = {
    stickDeadzone: 0.15,
    triggerThreshold: 0.25,
    analogDigitalThreshold: 0.5,
    maxStickRadius: 1.0,
};

/** Default input key bindings for keyboard */
export const DEFAULT_KEYMAP = {
    forward: ['KeyW', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    turnLeft: ['KeyA', 'ArrowLeft'],
    turnRight: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    attack: ['KeyF'],
    block: ['ShiftLeft', 'ShiftRight'],
    shop: ['KeyE'],
    mute: ['KeyM'],
};

/** Standard Gamepad Button mapping (Standard Gamepad / W3C layout) */
export const GAMEPAD_STANDARD_BUTTONS = {
    A: 0,            // Cross on PlayStation, A on Xbox -> Jump
    B: 1,            // Circle on PS, B on Xbox
    X: 2,            // Square on PS, X on Xbox -> Attack
    Y: 3,            // Triangle on PS, Y on Xbox -> Shop
    LB: 4,           // L1 -> Block
    RB: 5,           // R1 -> Block
    LT: 6,           // L2 (Trigger) -> Block
    RT: 7,           // R2 (Trigger) -> Attack
    SELECT: 8,       // Back / Share
    START: 9,        // Start / Options
    LS: 10,          // Left stick press
    RS: 11,          // Right stick press
    DPAD_UP: 12,
    DPAD_DOWN: 13,
    DPAD_LEFT: 14,
    DPAD_RIGHT: 15,
    HOME: 16,        // Xbox button / PS button
};

/** Standard Gamepad Axes */
export const GAMEPAD_STANDARD_AXES = {
    LEFT_STICK_X: 0,
    LEFT_STICK_Y: 1,
    RIGHT_STICK_X: 2,
    RIGHT_STICK_Y: 3,
};

/**
 * Clamps a scalar value between min and max.
 */
export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

/**
 * 1D radial deadzone: returns 0 if |value| <= deadzone, otherwise rescales remaining range [deadzone, 1] to [0, 1].
 */
export function applyAxisDeadzone(value, deadzone = DEFAULT_INPUT_CONFIG.stickDeadzone) {
    if (!Number.isFinite(value)) return 0;
    const abs = Math.abs(value);
    if (abs <= deadzone) return 0;
    const sign = Math.sign(value);
    const scaled = (abs - deadzone) / (1.0 - deadzone);
    return sign * clamp(scaled, 0, 1);
}

/**
 * 2D circular radial deadzone:
 * Computes magnitude of (x, y). If magnitude <= deadzone, returns { x: 0, y: 0, magnitude: 0 }.
 * Otherwise rescales magnitude linearly from [deadzone, maxRadius] -> [0, 1] and preserves direction.
 */
export function applyRadialDeadzone(x, y, deadzone = DEFAULT_INPUT_CONFIG.stickDeadzone, maxRadius = DEFAULT_INPUT_CONFIG.maxStickRadius) {
    const rawX = Number.isFinite(x) ? x : 0;
    const rawY = Number.isFinite(y) ? y : 0;
    const mag = Math.hypot(rawX, rawY);
    if (mag <= deadzone) {
        return { x: 0, y: 0, magnitude: 0, rawMagnitude: mag };
    }
    const clampedMag = Math.min(mag, maxRadius);
    const normalizedMag = clamp((clampedMag - deadzone) / (maxRadius - deadzone), 0, 1);
    const factor = normalizedMag / mag;
    return {
        x: rawX * factor,
        y: rawY * factor,
        magnitude: normalizedMag,
        rawMagnitude: mag,
    };
}

/**
 * Converts analog stick (or touch drag) into digital steering & throttle booleans.
 * Typically:
 * y < -threshold -> forward (w)
 * y > threshold -> backward (s)
 * x < -threshold -> left (a)
 * x > threshold -> right (d)
 */
export function analogToDigitalDirections(x, y, threshold = DEFAULT_INPUT_CONFIG.analogDigitalThreshold) {
    return {
        forward: y < -threshold,
        backward: y > threshold,
        left: x < -threshold,
        right: x > threshold,
    };
}

/**
 * Normalizes touch delta relative to virtual joystick origin with radius clamp and deadzone.
 * returns { x, y, magnitude, active }
 */
export function normalizeVirtualJoystick(touchX, touchY, originX, originY, maxRadius = 60, deadzoneRatio = 0.1) {
    const dx = touchX - originX;
    const dy = touchY - originY;
    const dist = Math.hypot(dx, dy);
    const deadzone = maxRadius * deadzoneRatio;

    if (dist <= deadzone) {
        return {
            x: 0,
            y: 0,
            distance: dist,
            normalizedDistance: 0,
            angle: Math.atan2(dy, dx),
            active: true,
        };
    }

    const clampedDist = Math.min(dist, maxRadius);
    const normalizedDist = (clampedDist - deadzone) / (maxRadius - deadzone);
    const clampedRatio = clampedDist / (dist || 1);
    const clampedX = dx * clampedRatio;
    const clampedY = dy * clampedRatio;

    return {
        x: (clampedX / maxRadius),
        y: (clampedY / maxRadius),
        distance: clampedDist,
        normalizedDistance: clamp(normalizedDist, 0, 1),
        angle: Math.atan2(dy, dx),
        active: true,
    };
}

/**
 * Evaluates whether an analog trigger (e.g. LT / RT with value in [0, 1]) is pressed.
 */
export function isTriggerPressed(triggerValue, threshold = DEFAULT_INPUT_CONFIG.triggerThreshold) {
    if (typeof triggerValue === 'object' && triggerValue !== null) {
        return (triggerValue.value ?? 0) >= threshold || Boolean(triggerValue.pressed);
    }
    return (Number(triggerValue) || 0) >= threshold;
}

/**
 * Normalizes a Gamepad API snapshot into standard game inputs.
 * Returns {
 *   forward, backward, left, right,
 *   jump, attack, block, shop,
 *   leftStick: { x, y, magnitude },
 *   rightStick: { x, y, magnitude },
 *   connected
 * }
 */
export function normalizeGamepadSnapshot(gamepad, options = {}) {
    const deadzone = options.stickDeadzone ?? DEFAULT_INPUT_CONFIG.stickDeadzone;
    const trigThreshold = options.triggerThreshold ?? DEFAULT_INPUT_CONFIG.triggerThreshold;

    if (!gamepad) {
        return {
            connected: false,
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
    }

    const axes = gamepad.axes || [];
    const buttons = gamepad.buttons || [];

    const getBtn = (idx) => {
        const b = buttons[idx];
        if (!b) return false;
        if (typeof b === 'object') return Boolean(b.pressed) || (b.value ?? 0) > trigThreshold;
        return Boolean(b);
    };

    const getBtnVal = (idx) => {
        const b = buttons[idx];
        if (!b) return 0;
        if (typeof b === 'object') return b.value ?? (b.pressed ? 1 : 0);
        return Number(b) || 0;
    };

    // Left stick (steering / throttle)
    const rawLx = axes[GAMEPAD_STANDARD_AXES.LEFT_STICK_X] ?? 0;
    const rawLy = axes[GAMEPAD_STANDARD_AXES.LEFT_STICK_Y] ?? 0;
    const leftStick = applyRadialDeadzone(rawLx, rawLy, deadzone);

    // Right stick (look / orbit)
    const rawRx = axes[GAMEPAD_STANDARD_AXES.RIGHT_STICK_X] ?? 0;
    const rawRy = axes[GAMEPAD_STANDARD_AXES.RIGHT_STICK_Y] ?? 0;
    const rightStick = applyRadialDeadzone(rawRx, rawRy, deadzone);

    // Triggers
    const ltValue = getBtnVal(GAMEPAD_STANDARD_BUTTONS.LT);
    const rtValue = getBtnVal(GAMEPAD_STANDARD_BUTTONS.RT);

    // Digital directions from left stick or D-pad
    const dpadUp = getBtn(GAMEPAD_STANDARD_BUTTONS.DPAD_UP);
    const dpadDown = getBtn(GAMEPAD_STANDARD_BUTTONS.DPAD_DOWN);
    const dpadLeft = getBtn(GAMEPAD_STANDARD_BUTTONS.DPAD_LEFT);
    const dpadRight = getBtn(GAMEPAD_STANDARD_BUTTONS.DPAD_RIGHT);

    const stickDirs = analogToDigitalDirections(leftStick.x, leftStick.y, options.analogDigitalThreshold ?? 0.35);

    const forward = dpadUp || stickDirs.forward;
    const backward = dpadDown || stickDirs.backward;
    const left = dpadLeft || stickDirs.left;
    const right = dpadRight || stickDirs.right;

    // Actions
    // A to jump (btn 0)
    const jump = getBtn(GAMEPAD_STANDARD_BUTTONS.A);
    // RT (btn 7) or X (btn 2) to swing
    const attack = getBtn(GAMEPAD_STANDARD_BUTTONS.RT) || getBtn(GAMEPAD_STANDARD_BUTTONS.X);
    // LT (btn 6) or RB (btn 5) or LB (btn 4) to block
    const block = getBtn(GAMEPAD_STANDARD_BUTTONS.LT) || getBtn(GAMEPAD_STANDARD_BUTTONS.RB) || getBtn(GAMEPAD_STANDARD_BUTTONS.LB);
    // Y (btn 3) to open shop
    const shop = getBtn(GAMEPAD_STANDARD_BUTTONS.Y);

    return {
        connected: Boolean(gamepad.connected ?? true),
        id: gamepad.id || 'Standard Gamepad',
        forward,
        backward,
        left,
        right,
        jump,
        attack,
        block,
        shop,
        leftStick,
        rightStick,
        triggers: { lt: ltValue, rt: rtValue },
    };
}

/**
 * Merges keyboard, gamepad, and touch input states into a single unified game input snapshot.
 * Output format matches what game-core and watercraft kinematics expect:
 * { w, a, s, d, space, attacking, blocking, shop, mute, rawAxes: { leftStick, rightStick } }
 */
export function mergeUnifiedInputs({ keyboard = {}, gamepad = {}, touch = {} }) {
    const w = Boolean(keyboard.forward || gamepad.forward || touch.forward);
    const s = Boolean(keyboard.backward || gamepad.backward || touch.backward);
    const a = Boolean(keyboard.left || gamepad.left || touch.left);
    const d = Boolean(keyboard.right || gamepad.right || touch.right);
    const space = Boolean(keyboard.jump || gamepad.jump || touch.jump);
    const attacking = Boolean(keyboard.attack || gamepad.attack || touch.attack);
    const blocking = Boolean(keyboard.block || gamepad.block || touch.block);
    const shop = Boolean(keyboard.shop || gamepad.shop || touch.shop);
    const mute = Boolean(keyboard.mute || gamepad.mute || touch.mute);

    return {
        w,
        a,
        s,
        d,
        space,
        attacking,
        blocking,
        shop,
        mute,
        // Composite steering & throttle floats for smooth analog control if needed:
        steering: (touch.steering ?? 0) || (gamepad.leftStick?.x ?? (d ? 1 : a ? -1 : 0)),
        throttle: (touch.throttle ?? 0) || (-(gamepad.leftStick?.y ?? (w ? -1 : s ? 1 : 0))),
    };
}

/**
 * Keymap serialization & validation helpers
 */

/**
 * Validates whether a keymap object is structurally valid.
 */
export function validateKeymap(keymap) {
    if (!keymap || typeof keymap !== 'object' || Array.isArray(keymap)) {
        return { valid: false, error: 'Keymap must be a non-null object' };
    }
    const requiredActions = ['forward', 'backward', 'turnLeft', 'turnRight', 'jump', 'attack', 'block', 'shop'];
    for (const action of requiredActions) {
        if (!keymap[action]) {
            return { valid: false, error: `Missing required action: ${action}` };
        }
        if (!Array.isArray(keymap[action])) {
            return { valid: false, error: `Binding for ${action} must be an array of key codes` };
        }
        if (keymap[action].length === 0) {
            return { valid: false, error: `Binding for ${action} cannot be empty` };
        }
        for (const code of keymap[action]) {
            if (typeof code !== 'string' || !code.trim()) {
                return { valid: false, error: `Invalid key code for ${action}: "${code}"` };
            }
        }
    }
    return { valid: true };
}

/**
 * Serializes a keymap object to a JSON string.
 */
export function serializeKeymap(keymap) {
    const validation = validateKeymap(keymap);
    if (!validation.valid) {
        throw new Error(`Cannot serialize invalid keymap: ${validation.error}`);
    }
    return JSON.stringify(keymap);
}

/**
 * Deserializes a keymap JSON string, falling back to defaultKeymap if invalid.
 */
export function deserializeKeymap(jsonString, defaultFallback = DEFAULT_KEYMAP) {
    if (!jsonString || typeof jsonString !== 'string') {
        return structuredClone(defaultFallback);
    }
    try {
        const parsed = JSON.parse(jsonString);
        const check = validateKeymap(parsed);
        if (check.valid) {
            return parsed;
        }
        return structuredClone(defaultFallback);
    } catch {
        return structuredClone(defaultFallback);
    }
}

/**
 * Haptic Vibration Pattern Generators
 * Returns vibration actuator effect definitions: { duration, strongMagnitude, weakMagnitude }
 */
export function getHapticVibrationPattern(effectType, intensity = 1.0) {
    const scale = clamp(intensity, 0, 1);
    switch (effectType) {
        case 'hit':
        case 'damage':
            return {
                duration: 250,
                strongMagnitude: clamp(0.8 * scale, 0, 1),
                weakMagnitude: clamp(0.5 * scale, 0, 1),
            };
        case 'splash':
        case 'jump-land':
            return {
                duration: 180,
                strongMagnitude: clamp(0.4 * scale, 0, 1),
                weakMagnitude: clamp(0.7 * scale, 0, 1),
            };
        case 'attack':
        case 'swing':
            return {
                duration: 90,
                strongMagnitude: clamp(0.5 * scale, 0, 1),
                weakMagnitude: clamp(0.2 * scale, 0, 1),
            };
        case 'block':
            return {
                duration: 120,
                strongMagnitude: clamp(0.3 * scale, 0, 1),
                weakMagnitude: clamp(0.6 * scale, 0, 1),
            };
        case 'bump':
        default:
            return {
                duration: 100,
                strongMagnitude: clamp(0.2 * scale, 0, 1),
                weakMagnitude: clamp(0.2 * scale, 0, 1),
            };
    }
}
