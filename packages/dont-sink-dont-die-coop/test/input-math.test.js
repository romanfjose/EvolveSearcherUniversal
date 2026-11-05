import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_INPUT_CONFIG,
    DEFAULT_KEYMAP,
    GAMEPAD_STANDARD_BUTTONS,
    GAMEPAD_STANDARD_AXES,
    clamp,
    applyAxisDeadzone,
    applyRadialDeadzone,
    analogToDigitalDirections,
    normalizeVirtualJoystick,
    isTriggerPressed,
    normalizeGamepadSnapshot,
    mergeUnifiedInputs,
    validateKeymap,
    serializeKeymap,
    deserializeKeymap,
    getHapticVibrationPattern,
} from '../shared/input-math.js';

describe('Scalar clamp helper', () => {
    it('1. clamps values below minimum', () => {
        assert.equal(clamp(-5, 0, 10), 0);
    });

    it('2. clamps values above maximum', () => {
        assert.equal(clamp(15, 0, 10), 10);
    });

    it('3. leaves values inside range intact', () => {
        assert.equal(clamp(7.5, 0, 10), 7.5);
    });
});

describe('1D Axis Deadzones (applyAxisDeadzone)', () => {
    it('4. returns 0 for non-finite or zero values', () => {
        assert.equal(applyAxisDeadzone(NaN), 0);
        assert.equal(applyAxisDeadzone(0), 0);
        assert.equal(applyAxisDeadzone(Infinity), 0);
    });

    it('5. returns 0 for inputs within deadzone', () => {
        assert.equal(applyAxisDeadzone(0.1, 0.2), 0);
        assert.equal(applyAxisDeadzone(-0.19, 0.2), 0);
        assert.equal(applyAxisDeadzone(0.2, 0.2), 0);
    });

    it('6. linearly rescales values beyond deadzone to full [0, 1] range', () => {
        // Range [0.2, 1.0]. Input 0.6 is halfway -> 0.5
        const res = applyAxisDeadzone(0.6, 0.2);
        assert.ok(Math.abs(res - 0.5) < 1e-6, `Expected 0.5, got ${res}`);

        // Negative value preserves sign
        const neg = applyAxisDeadzone(-0.6, 0.2);
        assert.ok(Math.abs(neg - (-0.5)) < 1e-6, `Expected -0.5, got ${neg}`);

        // Max boundary
        assert.equal(applyAxisDeadzone(1.0, 0.2), 1.0);
        assert.equal(applyAxisDeadzone(-1.0, 0.2), -1.0);
    });
});

describe('2D Radial Deadzones (applyRadialDeadzone)', () => {
    it('7. returns zero vector when magnitude is within deadzone', () => {
        const res = applyRadialDeadzone(0.08, 0.08, 0.15);
        assert.equal(res.x, 0);
        assert.equal(res.y, 0);
        assert.equal(res.magnitude, 0);
        assert.ok(res.rawMagnitude < 0.15);
    });

    it('8. smoothly normalizes magnitude beyond deadzone preserving direction', () => {
        // vector at 45 degrees: raw (0.6, 0.6), mag approx 0.8485
        const rawX = 0.6;
        const rawY = 0.8; // mag = 1.0
        const deadzone = 0.2;
        const res = applyRadialDeadzone(rawX, rawY, deadzone, 1.0);

        assert.equal(res.rawMagnitude, 1.0);
        assert.equal(res.magnitude, 1.0);
        assert.ok(Math.abs(res.x - rawX) < 1e-6);
        assert.ok(Math.abs(res.y - rawY) < 1e-6);

        // Halfway magnitude
        const mid = applyRadialDeadzone(0.36, 0.48, 0.2, 1.0); // raw mag = 0.60
        // (0.6 - 0.2) / 0.8 = 0.5 magnitude
        assert.ok(Math.abs(mid.magnitude - 0.5) < 1e-6);
        // Angle should be preserved: atan2(y, x)
        assert.ok(Math.abs(Math.atan2(mid.y, mid.x) - Math.atan2(0.48, 0.36)) < 1e-6);
    });

    it('9. clamps magnitude at maxStickRadius', () => {
        // Deflection greater than 1.0 (e.g. diagonal 1.0, 1.0 -> mag ~1.414)
        const res = applyRadialDeadzone(1.0, 1.0, 0.15, 1.0);
        assert.equal(res.magnitude, 1.0);
        const outMag = Math.hypot(res.x, res.y);
        assert.ok(Math.abs(outMag - 1.0) < 1e-6);
    });
});

describe('Analog-to-Digital Directions (analogToDigitalDirections)', () => {
    it('10. converts negative Y to forward (w) and positive Y to backward (s)', () => {
        const fwd = analogToDigitalDirections(0, -0.6, 0.5);
        assert.equal(fwd.forward, true);
        assert.equal(fwd.backward, false);

        const bwd = analogToDigitalDirections(0, 0.7, 0.5);
        assert.equal(bwd.forward, false);
        assert.equal(bwd.backward, true);
    });

    it('11. converts negative X to left (a) and positive X to right (d)', () => {
        const left = analogToDigitalDirections(-0.8, 0, 0.5);
        assert.equal(left.left, true);
        assert.equal(left.right, false);

        const right = analogToDigitalDirections(0.9, 0, 0.5);
        assert.equal(right.left, false);
        assert.equal(right.right, true);
    });

    it('12. respects custom threshold boundary', () => {
        const sub = analogToDigitalDirections(0.4, -0.4, 0.5);
        assert.equal(sub.forward, false);
        assert.equal(sub.right, false);

        const active = analogToDigitalDirections(0.4, -0.4, 0.3);
        assert.equal(active.forward, true);
        assert.equal(active.right, true);
    });
});

describe('Virtual Touch Joystick (normalizeVirtualJoystick)', () => {
    it('13. returns zero distance and inactive within deadzone', () => {
        const touch = normalizeVirtualJoystick(105, 105, 100, 100, 60, 0.2); // dx=5, dy=5, dist ~7.07 <= 12
        assert.equal(touch.x, 0);
        assert.equal(touch.y, 0);
        assert.equal(touch.normalizedDistance, 0);
        assert.equal(touch.active, true);
    });

    it('14. normalizes and clamps touch coordinates to max radius circle', () => {
        const originX = 100;
        const originY = 100;
        const maxRadius = 50;
        // Drag 100px to the right
        const touch = normalizeVirtualJoystick(200, 100, originX, originY, maxRadius, 0.1);
        assert.equal(touch.distance, maxRadius);
        assert.equal(touch.normalizedDistance, 1.0);
        assert.ok(Math.abs(touch.x - 1.0) < 1e-6);
        assert.ok(Math.abs(touch.y - 0.0) < 1e-6);
    });

    it('15. computes correct angle in radians', () => {
        const originX = 50;
        const originY = 50;
        // Drag downwards (dy > 0, angle = PI/2)
        const touch = normalizeVirtualJoystick(50, 90, originX, originY, 50, 0.1);
        assert.ok(Math.abs(touch.angle - Math.PI / 2) < 1e-6);
    });
});

describe('Analog Trigger Thresholds (isTriggerPressed)', () => {
    it('16. identifies trigger press from numeric scalar value', () => {
        assert.equal(isTriggerPressed(0.1, 0.25), false);
        assert.equal(isTriggerPressed(0.25, 0.25), true);
        assert.equal(isTriggerPressed(0.9, 0.25), true);
    });

    it('17. handles GamepadButton object structure { value, pressed }', () => {
        assert.equal(isTriggerPressed({ value: 0.1, pressed: false }, 0.25), false);
        assert.equal(isTriggerPressed({ value: 0.3, pressed: false }, 0.25), true);
        assert.equal(isTriggerPressed({ value: 0.0, pressed: true }, 0.25), true);
    });
});

describe('Gamepad Snapshot Normalizer (normalizeGamepadSnapshot)', () => {
    it('18. returns disconnected default state for null gamepad', () => {
        const snap = normalizeGamepadSnapshot(null);
        assert.equal(snap.connected, false);
        assert.equal(snap.forward, false);
        assert.equal(snap.attack, false);
        assert.equal(snap.leftStick.magnitude, 0);
    });

    it('19. maps Xbox/PS button layout: A -> jump, RT/X -> attack, LT/RB/LB -> block, Y -> shop', () => {
        // Test A (button 0) -> jump
        const gpA = {
            axes: [0, 0, 0, 0],
            buttons: [{ pressed: true, value: 1.0 }], // button 0
            connected: true,
        };
        const snapA = normalizeGamepadSnapshot(gpA);
        assert.equal(snapA.jump, true);
        assert.equal(snapA.attack, false);

        // Test X (button 2) -> attack
        const buttonsX = Array(8).fill(null).map(() => ({ pressed: false, value: 0 }));
        buttonsX[GAMEPAD_STANDARD_BUTTONS.X] = { pressed: true, value: 1.0 };
        const snapX = normalizeGamepadSnapshot({ axes: [0, 0, 0, 0], buttons: buttonsX, connected: true });
        assert.equal(snapX.attack, true);

        // Test RT (button 7) -> attack
        const buttonsRT = Array(8).fill(null).map(() => ({ pressed: false, value: 0 }));
        buttonsRT[GAMEPAD_STANDARD_BUTTONS.RT] = { pressed: true, value: 0.85 };
        const snapRT = normalizeGamepadSnapshot({ axes: [0, 0, 0, 0], buttons: buttonsRT, connected: true });
        assert.equal(snapRT.attack, true);
        assert.equal(snapRT.triggers.rt, 0.85);

        // Test LT (button 6) -> block
        const buttonsLT = Array(8).fill(null).map(() => ({ pressed: false, value: 0 }));
        buttonsLT[GAMEPAD_STANDARD_BUTTONS.LT] = { pressed: true, value: 0.9 };
        const snapLT = normalizeGamepadSnapshot({ axes: [0, 0, 0, 0], buttons: buttonsLT, connected: true });
        assert.equal(snapLT.block, true);
        assert.equal(snapLT.triggers.lt, 0.9);

        // Test Y (button 3) -> shop
        const buttonsY = Array(8).fill(null).map(() => ({ pressed: false, value: 0 }));
        buttonsY[GAMEPAD_STANDARD_BUTTONS.Y] = { pressed: true, value: 1.0 };
        const snapY = normalizeGamepadSnapshot({ axes: [0, 0, 0, 0], buttons: buttonsY, connected: true });
        assert.equal(snapY.shop, true);
    });

    it('20. maps left analog stick to steering and throttle with deadzone', () => {
        // Small drift within deadzone -> 0
        const gpDrift = {
            axes: [0.05, -0.05, 0, 0],
            buttons: [],
            connected: true,
        };
        const snapDrift = normalizeGamepadSnapshot(gpDrift);
        assert.equal(snapDrift.leftStick.magnitude, 0);
        assert.equal(snapDrift.forward, false);

        // Full forward stick (Y = -1.0)
        const gpFwd = {
            axes: [0, -1.0, 0, 0],
            buttons: [],
            connected: true,
        };
        const snapFwd = normalizeGamepadSnapshot(gpFwd);
        assert.equal(snapFwd.forward, true);
        assert.equal(snapFwd.backward, false);
        assert.ok(snapFwd.leftStick.y < -0.9);

        // Full turn right stick (X = 1.0)
        const gpRight = {
            axes: [1.0, 0, 0, 0],
            buttons: [],
            connected: true,
        };
        const snapRight = normalizeGamepadSnapshot(gpRight);
        assert.equal(snapRight.right, true);
        assert.equal(snapRight.left, false);
        assert.ok(snapRight.leftStick.x > 0.9);
    });

    it('21. maps D-pad buttons to forward/backward/left/right', () => {
        const buttons = Array(16).fill(null).map(() => ({ pressed: false, value: 0 }));
        buttons[GAMEPAD_STANDARD_BUTTONS.DPAD_UP] = { pressed: true, value: 1 };
        buttons[GAMEPAD_STANDARD_BUTTONS.DPAD_LEFT] = { pressed: true, value: 1 };
        const snap = normalizeGamepadSnapshot({ axes: [0, 0, 0, 0], buttons, connected: true });
        assert.equal(snap.forward, true);
        assert.equal(snap.left, true);
        assert.equal(snap.backward, false);
        assert.equal(snap.right, false);
    });
});

describe('Unified Input Merger (mergeUnifiedInputs)', () => {
    it('22. combines keyboard, gamepad, and touch signals into a single input snapshot', () => {
        // Keyboard space + Gamepad RT attack + Touch steering
        const combined = mergeUnifiedInputs({
            keyboard: { jump: true, forward: true },
            gamepad: { attack: true, right: true },
            touch: { backward: false },
        });

        assert.equal(combined.space, true);
        assert.equal(combined.w, true);
        assert.equal(combined.attacking, true);
        assert.equal(combined.d, true);
        assert.equal(combined.s, false);
        assert.equal(combined.blocking, false);
    });
});

describe('Keymap Validation, Serialization, and Deserialization', () => {
    it('23. validates default keymap structure', () => {
        const check = validateKeymap(DEFAULT_KEYMAP);
        assert.equal(check.valid, true);
        assert.equal(check.error, undefined);
    });

    it('24. rejects corrupted or incomplete keymaps', () => {
        assert.equal(validateKeymap(null).valid, false);
        assert.equal(validateKeymap({ forward: ['KeyW'] }).valid, false); // missing actions
        assert.equal(validateKeymap({ ...DEFAULT_KEYMAP, attack: [] }).valid, false); // empty array
        assert.equal(validateKeymap({ ...DEFAULT_KEYMAP, jump: [123] }).valid, false); // non-string
    });

    it('25. serializes and deserializes keymaps cleanly to JSON and back', () => {
        const json = serializeKeymap(DEFAULT_KEYMAP);
        assert.equal(typeof json, 'string');
        const restored = deserializeKeymap(json);
        assert.deepEqual(restored, DEFAULT_KEYMAP);
    });

    it('26. deserializes corrupted JSON safely into fallback defaults', () => {
        const fallback = deserializeKeymap('{ invalid json');
        assert.deepEqual(fallback, DEFAULT_KEYMAP);

        const emptyFallback = deserializeKeymap(null);
        assert.deepEqual(emptyFallback, DEFAULT_KEYMAP);

        const invalidObjFallback = deserializeKeymap('{"invalid":"data"}');
        assert.deepEqual(invalidObjFallback, DEFAULT_KEYMAP);
    });
});

describe('Haptic Vibration Patterns (getHapticVibrationPattern)', () => {
    it('27. generates distinct haptic effects for hit, splash, attack, and block', () => {
        const hit = getHapticVibrationPattern('hit');
        assert.ok(hit.duration >= 200);
        assert.ok(hit.strongMagnitude >= 0.7);

        const splash = getHapticVibrationPattern('splash');
        assert.ok(splash.duration >= 150);
        assert.ok(splash.weakMagnitude >= 0.5);

        const attack = getHapticVibrationPattern('attack');
        assert.ok(attack.duration <= 100);

        const block = getHapticVibrationPattern('block');
        assert.ok(block.duration > 100);
    });

    it('28. scales haptic rumble magnitudes according to intensity parameter', () => {
        const full = getHapticVibrationPattern('hit', 1.0);
        const half = getHapticVibrationPattern('hit', 0.5);

        assert.ok(Math.abs(half.strongMagnitude - full.strongMagnitude * 0.5) < 1e-4);
        assert.ok(Math.abs(half.weakMagnitude - full.weakMagnitude * 0.5) < 1e-4);
    });
});
