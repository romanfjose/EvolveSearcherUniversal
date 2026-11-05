import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    INPUT_MODES,
    KEYBIND_SCHEMAS,
    detectGamepadBrand,
    normalizeKeyboardCode,
    createReactiveKeybar,
} from '../public/js/ui/reactive-keybar.js';

// Minimal mock DOM element implementation for headless Node.js testing
class MockElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.classList = {
            classes: new Set(),
            add: (c) => this.classList.classes.add(c),
            remove: (c) => this.classList.classes.delete(c),
            contains: (c) => this.classList.classes.has(c),
            toggle: (c, force) => {
                if (force === undefined) {
                    if (this.classList.classes.has(c)) this.classList.classes.delete(c);
                    else this.classList.classes.add(c);
                } else if (force) {
                    this.classList.classes.add(c);
                } else {
                    this.classList.classes.delete(c);
                }
            },
        };
        this.children = [];
        this.dataset = {};
        this.textContent = '';
        this.innerHTML = '';
        this.style = {};
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        return child;
    }

    querySelector(selector) {
        return this.children.find((c) => {
            if (selector.startsWith('.')) return c.classList.contains(selector.slice(1));
            return false;
        }) || null;
    }

    querySelectorAll(selector) {
        const res = [];
        for (const c of this.children) {
            if (selector.startsWith('.') && c.classList.contains(selector.slice(1))) {
                res.push(c);
            }
        }
        return res;
    }
}

describe('Reactive Keybind Pill Bar & Cooldown Highlighter Suite', () => {
    describe('Input Modes and Keybind Schemas', () => {
        it('exports all 4 required input device modes', () => {
            assert.equal(INPUT_MODES.KEYBOARD, 'keyboard');
            assert.equal(INPUT_MODES.XBOX, 'xbox');
            assert.equal(INPUT_MODES.PLAYSTATION, 'playstation');
            assert.equal(INPUT_MODES.TOUCH, 'touch');
        });

        it('defines valid keybind schemas for all modes', () => {
            for (const mode of Object.values(INPUT_MODES)) {
                const schema = KEYBIND_SCHEMAS[mode];
                assert.ok(Array.isArray(schema), `Schema for ${mode} must be an array`);
                assert.ok(schema.length >= 6, `Schema for ${mode} must define core actions`);
                for (const item of schema) {
                    assert.ok(item.id, `Item in ${mode} must have an id`);
                    assert.ok(item.action, `Item in ${mode} must have an action label`);
                    assert.ok(Array.isArray(item.keys) && item.keys.length > 0, `Item ${item.id} must have keycaps`);
                    for (const k of item.keys) {
                        assert.ok(k.id, `Key in ${item.id} must have id`);
                        assert.ok(k.glyph, `Key in ${item.id} must have visible glyph`);
                    }
                }
            }
        });

        it('keyboard schema contains W/A/S/D, Space, LMB, RMB, B, Z/X/C/V, and P', () => {
            const kb = KEYBIND_SCHEMAS[INPUT_MODES.KEYBOARD];
            const allGlyphs = kb.flatMap((item) => item.keys.map((k) => k.glyph));
            const requiredGlyphs = ['W', 'S', 'A', 'D', 'Space', 'LMB', 'RMB', 'B', 'Z', 'X', 'C', 'V', 'P'];
            for (const g of requiredGlyphs) {
                assert.ok(allGlyphs.includes(g), `Keyboard schema must include glyph "${g}"`);
            }
        });

        it('xbox schema contains A, RT, LT, Y, and LS ↕ glyphs', () => {
            const xbox = KEYBIND_SCHEMAS[INPUT_MODES.XBOX];
            const allGlyphs = xbox.flatMap((item) => item.keys.map((k) => k.glyph));
            assert.ok(allGlyphs.includes('A'));
            assert.ok(allGlyphs.includes('RT'));
            assert.ok(allGlyphs.includes('LT'));
            assert.ok(allGlyphs.includes('Y'));
            assert.ok(allGlyphs.includes('LS ↕'));
        });

        it('playstation schema contains ✕, R2, L2, △, and L3 ↕ glyphs', () => {
            const ps = KEYBIND_SCHEMAS[INPUT_MODES.PLAYSTATION];
            const allGlyphs = ps.flatMap((item) => item.keys.map((k) => k.glyph));
            assert.ok(allGlyphs.includes('✕'));
            assert.ok(allGlyphs.includes('R2'));
            assert.ok(allGlyphs.includes('L2'));
            assert.ok(allGlyphs.includes('△'));
            assert.ok(allGlyphs.includes('L3 ↕'));
        });

        it('touch schema contains Stick ↕, JUMP, SWING, BLOCK, and SHOP', () => {
            const touch = KEYBIND_SCHEMAS[INPUT_MODES.TOUCH];
            const allGlyphs = touch.flatMap((item) => item.keys.map((k) => k.glyph));
            assert.ok(allGlyphs.includes('Stick ↕'));
            assert.ok(allGlyphs.includes('JUMP'));
            assert.ok(allGlyphs.includes('SWING'));
            assert.ok(allGlyphs.includes('BLOCK'));
            assert.ok(allGlyphs.includes('SHOP'));
        });
    });

    describe('Normalizers and Brand Detectors', () => {
        it('normalizes keyboard codes and key fallback strings', () => {
            assert.equal(normalizeKeyboardCode('w', 'KeyW'), 'KeyW');
            assert.equal(normalizeKeyboardCode('W', 'KeyW'), 'KeyW');
            assert.equal(normalizeKeyboardCode('s', 'KeyS'), 'KeyS');
            assert.equal(normalizeKeyboardCode('a', 'KeyA'), 'KeyA');
            assert.equal(normalizeKeyboardCode('d', 'KeyD'), 'KeyD');
            assert.equal(normalizeKeyboardCode(' ', 'Space'), 'Space');
            assert.equal(normalizeKeyboardCode('b', 'KeyB'), 'KeyB');
            assert.equal(normalizeKeyboardCode('z', 'KeyZ'), 'KeyZ');
            assert.equal(normalizeKeyboardCode('x', 'KeyX'), 'KeyX');
            assert.equal(normalizeKeyboardCode('c', 'KeyC'), 'KeyC');
            assert.equal(normalizeKeyboardCode('v', 'KeyV'), 'KeyV');
            assert.equal(normalizeKeyboardCode('p', 'KeyP'), 'KeyP');
            assert.equal(normalizeKeyboardCode('f', 'KeyF'), 'LMB');
            assert.equal(normalizeKeyboardCode('shift', 'ShiftLeft'), 'RMB');
            assert.equal(normalizeKeyboardCode('arrowup'), 'KeyW');
            assert.equal(normalizeKeyboardCode('arrowdown'), 'KeyS');
        });

        it('detects PlayStation controller brands', () => {
            assert.equal(detectGamepadBrand('Sony Interactive Entertainment Wireless Controller'), INPUT_MODES.PLAYSTATION);
            assert.equal(detectGamepadBrand('DualSense Wireless Controller (054c:0ce6)'), INPUT_MODES.PLAYSTATION);
            assert.equal(detectGamepadBrand('DualShock 4'), INPUT_MODES.PLAYSTATION);
            assert.equal(detectGamepadBrand('PS5 Gamepad'), INPUT_MODES.PLAYSTATION);
        });

        it('defaults other controllers to Xbox layout', () => {
            assert.equal(detectGamepadBrand('Xbox 360 Controller (XInput STANDARD GAMEPAD)'), INPUT_MODES.XBOX);
            assert.equal(detectGamepadBrand('Xbox Wireless Controller'), INPUT_MODES.XBOX);
            assert.equal(detectGamepadBrand('Generic USB Joystick'), INPUT_MODES.XBOX);
            assert.equal(detectGamepadBrand(''), INPUT_MODES.XBOX);
        });
    });

    describe('Reactive Keybar Controller & DOM Rendering', () => {
        let mockRoot;
        let originalDocument;

        beforeEach(() => {
            mockRoot = new MockElement('div');
            mockRoot.id = 'instructions';

            // Provide document mock for elements
            originalDocument = globalThis.document;
            globalThis.document = {
                getElementById: (id) => (id === 'instructions' ? mockRoot : null),
                createElement: (tag) => new MockElement(tag),
                head: { appendChild: () => {} },
            };
        });

        it('renders keybar pills and keycaps according to schema', () => {
            const bar = createReactiveKeybar({ element: mockRoot });
            assert.equal(bar.getActiveMode(), INPUT_MODES.KEYBOARD);
            assert.ok(mockRoot.children.length > 0);

            // Verify paddle pill
            const paddlePill = bar.getPillElement('paddle');
            assert.ok(paddlePill);
            assert.equal(paddlePill.dataset.pillId, 'paddle');

            // Verify W keycap
            const keyW = bar.getKeycapElement('KeyW');
            assert.ok(keyW);
            assert.equal(keyW.textContent, 'W');
            assert.equal(keyW.dataset.keyId, 'KeyW');

            bar.dispose();
        });

        it('lights up keycaps in real time when setKeyPressed is called (Zero Dead Touch)', () => {
            const bar = createReactiveKeybar({ element: mockRoot });
            const keyW = bar.getKeycapElement('KeyW');
            const keySpace = bar.getKeycapElement('Space');

            assert.equal(keyW.classList.contains('active'), false);
            assert.equal(keySpace.classList.contains('active'), false);

            // Press W and Space
            bar.setKeyPressed('KeyW', true);
            assert.equal(keyW.classList.contains('active'), true);
            assert.deepEqual(bar.getPressedKeys(), ['KeyW']);

            bar.setKeyPressed('Space', true);
            assert.equal(keySpace.classList.contains('active'), true);

            // Release W
            bar.setKeyPressed('KeyW', false);
            assert.equal(keyW.classList.contains('active'), false);
            assert.equal(keySpace.classList.contains('active'), true);

            bar.dispose();
        });

        it('switches keycap glyphs cleanly when changing input modes', () => {
            const bar = createReactiveKeybar({ element: mockRoot });
            assert.equal(bar.getActiveMode(), INPUT_MODES.KEYBOARD);
            assert.ok(bar.getKeycapElement('KeyW'));

            // Switch to Xbox mode
            bar.setInputMode(INPUT_MODES.XBOX);
            assert.equal(bar.getActiveMode(), INPUT_MODES.XBOX);
            const btnA = bar.getKeycapElement('BtnA');
            assert.ok(btnA);
            assert.equal(btnA.textContent, 'A');
            assert.equal(bar.getKeycapElement('BtnRT').textContent, 'RT');

            // Switch to PlayStation mode
            bar.setInputMode(INPUT_MODES.PLAYSTATION);
            assert.equal(bar.getActiveMode(), INPUT_MODES.PLAYSTATION);
            const btnCross = bar.getKeycapElement('BtnCross');
            assert.ok(btnCross);
            assert.equal(btnCross.textContent, '✕');
            assert.equal(bar.getKeycapElement('BtnR2').textContent, 'R2');

            // Switch to Mobile Touch mode
            bar.setInputMode(INPUT_MODES.TOUCH);
            assert.equal(bar.getActiveMode(), INPUT_MODES.TOUCH);
            const touchJump = bar.getKeycapElement('TouchJump');
            assert.ok(touchJump);
            assert.equal(touchJump.textContent, 'JUMP');

            bar.dispose();
        });

        it('manages and highlights cooldowns accurately', () => {
            const bar = createReactiveKeybar({ element: mockRoot });

            // Trigger cooldown on crew orders
            bar.triggerCooldown('crew_orders', 3000, 1000);
            assert.ok(bar.getActiveCooldowns().has('crew_orders'));

            const pill = bar.getPillElement('crew_orders');
            assert.ok(pill);
            assert.equal(pill.classList.contains('on-cooldown'), true);

            // Update at t = 2000 (remaining: 2000ms out of 3000ms)
            bar.update(2000);
            assert.ok(bar.getActiveCooldowns().has('crew_orders'));
            assert.equal(pill.classList.contains('on-cooldown'), true);

            // Update past end at t = 4500 (remaining <= 0)
            bar.update(4500);
            assert.equal(bar.getActiveCooldowns().has('crew_orders'), false);
            assert.equal(pill.classList.contains('on-cooldown'), false);

            bar.dispose();
        });

        it('responds to simulated browser keyboard events', () => {
            const bar = createReactiveKeybar({ element: mockRoot });
            const keyW = bar.getKeycapElement('KeyW');
            const keyZ = bar.getKeycapElement('KeyZ');

            bar._handlers.onKeyDown({ key: 'w', code: 'KeyW' });
            assert.equal(keyW.classList.contains('active'), true);

            bar._handlers.onKeyDown({ key: 'z', code: 'KeyZ' });
            assert.equal(keyZ.classList.contains('active'), true);

            bar._handlers.onKeyUp({ key: 'w', code: 'KeyW' });
            assert.equal(keyW.classList.contains('active'), false);
            assert.equal(keyZ.classList.contains('active'), true);

            // Blur resets all active keys
            bar._handlers.onBlur();
            assert.equal(keyZ.classList.contains('active'), false);
            assert.equal(bar.getPressedKeys().length, 0);

            bar.dispose();
        });

        it('responds to mouse click events (LMB / RMB)', () => {
            const bar = createReactiveKeybar({ element: mockRoot });
            const lmb = bar.getKeycapElement('LMB');
            const rmb = bar.getKeycapElement('RMB');

            bar._handlers.onMouseDown({ button: 0 });
            assert.equal(lmb.classList.contains('active'), true);
            assert.equal(rmb.classList.contains('active'), false);

            bar._handlers.onMouseDown({ button: 2 });
            assert.equal(rmb.classList.contains('active'), true);

            bar._handlers.onMouseUp({ button: 0 });
            assert.equal(lmb.classList.contains('active'), false);
            assert.equal(rmb.classList.contains('active'), true);

            bar._handlers.onMouseUp({ button: 2 });
            assert.equal(rmb.classList.contains('active'), false);

            bar.dispose();
        });

        it('switches to touch mode on touchstart event and resets on dispose', () => {
            const bar = createReactiveKeybar({ element: mockRoot });
            assert.equal(bar.getActiveMode(), INPUT_MODES.KEYBOARD);

            bar._handlers.onTouchStart();
            assert.equal(bar.getActiveMode(), INPUT_MODES.TOUCH);

            bar.dispose();
            assert.equal(mockRoot.innerHTML, '');
        });
    });
});
