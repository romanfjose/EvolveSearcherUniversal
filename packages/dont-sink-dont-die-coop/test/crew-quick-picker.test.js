/**
 * Don't Sink, Don't Die — 1-Click Dockside Crew Class & Hat Carousel Switcher Test Suite
 * (test/crew-quick-picker.test.js)
 *
 * Sovereign Core & Helmet 01 Verification:
 * 1. Canonical Quick-Picker Crew Classes (Bureaucrat, Viking, Plague Doctor, Capybara)
 * 2. Comedic taglines and stat preview deltas (+knockback, +turn rate, discount, etc.)
 * 3. v0.8 Pre-baked loadout and immediate launch readiness (<60s to fire)
 * 4. Q/E keystroke carousel cycling and direct preview click mutation
 * 5. Persistent localStorage syncing with clean fallback
 * 6. DOM Widget mounting, carousel button clicking, and event propagation
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    QUICK_PICKER_CLASSES,
    QUICK_PICKER_CLASS_IDS,
    QUICK_PICKER_HATS,
    QUICK_PICKER_HAT_IDS,
    STORAGE_KEY_CREW_LOADOUT,
    PRE_BAKED_V08_LOADOUT,
    normalizeQuickClassId,
    normalizeQuickHatId,
    getQuickPickerClass,
    getQuickPickerHat,
    getComedicClassTagline,
    computeStatPreviewDeltas,
    loadPersistedLoadout,
    savePersistedLoadout,
    cycleClassId,
    cycleHatId,
    createCrewQuickPickerState,
    mountQuickPickerCarouselUI,
} from '../shared/crew-quick-picker.js';

// In-memory mock localStorage
class MockStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
        this.store.set(key, String(value));
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}

// Minimal mock DOM for headless testing
function createMockDOM() {
    function createElement(tagName) {
        const listeners = {};
        const children = [];
        return {
            tagName: tagName.toUpperCase(),
            id: '',
            style: { cssText: '' },
            innerHTML: '',
            textContent: '',
            children,
            dataset: {},
            setAttribute(name, val) { this[name] = val; },
            getAttribute(name) { return this[name]; },
            appendChild(child) {
                children.push(child);
                child.parentNode = this;
                return child;
            },
            remove() {
                if (this.parentNode) {
                    const idx = this.parentNode.children.indexOf(this);
                    if (idx !== -1) this.parentNode.children.splice(idx, 1);
                }
            },
            addEventListener(evt, fn) {
                listeners[evt] = listeners[evt] || [];
                listeners[evt].push(fn);
            },
            dispatchEvent(event) {
                const list = listeners[event.type] || [];
                for (const fn of list) fn(event);
            },
            click() {
                this.dispatchEvent({ type: 'click', target: this });
            },
        };
    }

    return {
        createElement,
    };
}

describe('Helmet 01 Crew Quick Picker: Canonical Class Definitions & Pre-Bake', () => {
    it('defines all 4 canonical quick-picker classes: Bureaucrat, Viking, Plague Doctor, Capybara', () => {
        const expected = ['bureaucrat', 'viking', 'plague_doctor', 'capybara'];
        assert.deepEqual(QUICK_PICKER_CLASS_IDS, expected);
        for (const cid of expected) {
            const cls = QUICK_PICKER_CLASSES[cid];
            assert.ok(cls, `Missing class definition for ${cid}`);
            assert.equal(cls.id, cid);
            assert.ok(typeof cls.name === 'string');
            assert.ok(typeof cls.title === 'string');
            assert.ok(typeof cls.icon === 'string');
            assert.ok(typeof cls.tagline === 'string');
            assert.ok(Array.isArray(cls.deltas));
            assert.ok(cls.deltas.length >= 3);
        }
    });

    it('pre-bakes loadout to v0.8 on title screen for zero-friction launch', () => {
        assert.equal(PRE_BAKED_V08_LOADOUT.version, '0.8');
        assert.equal(PRE_BAKED_V08_LOADOUT.isReady, true);
        assert.ok(QUICK_PICKER_CLASS_IDS.includes(PRE_BAKED_V08_LOADOUT.classId));
        assert.ok(QUICK_PICKER_HAT_IDS.includes(PRE_BAKED_V08_LOADOUT.hatId));
    });

    it('normalizes legacy or aliased class ids into canonical quick-picker classes', () => {
        assert.equal(normalizeQuickClassId('bureaucrat'), 'bureaucrat');
        assert.equal(normalizeQuickClassId('viking'), 'viking');
        assert.equal(normalizeQuickClassId('plague_doctor'), 'plague_doctor');
        assert.equal(normalizeQuickClassId('capybara'), 'capybara');

        // Aliases
        assert.equal(normalizeQuickClassId('helmsman'), 'capybara');
        assert.equal(normalizeQuickClassId('bruiser'), 'viking');
        assert.equal(normalizeQuickClassId('tinkerer'), 'bureaucrat');
        assert.equal(normalizeQuickClassId('mystic'), 'plague_doctor');

        // Space/hyphen/case handling
        assert.equal(normalizeQuickClassId('Plague Doctor'), 'plague_doctor');
        assert.equal(normalizeQuickClassId('plague-doctor'), 'plague_doctor');
        assert.equal(normalizeQuickClassId('UNKNOWN', 'capybara'), 'capybara');
    });

    it('normalizes hat ids and respects valid silly hats', () => {
        assert.equal(normalizeQuickHatId('viking_horns'), 'viking_horns');
        assert.equal(normalizeQuickHatId('traffic_cone'), 'traffic_cone');
        assert.equal(normalizeQuickHatId('invalid_hat', 'disco_afro'), 'disco_afro');
    });
});

describe('Helmet 01 Crew Quick Picker: Comedic Taglines & Stat Preview Deltas', () => {
    it('returns hilarious and thematic comedic class taglines', () => {
        const bureaucrat = getComedicClassTagline('bureaucrat');
        const viking = getComedicClassTagline('viking');
        const doc = getComedicClassTagline('plague_doctor');
        const capy = getComedicClassTagline('capybara');

        assert.match(bureaucrat, /tax audits|red tape/i);
        assert.match(viking, /calamari|berserker|smash/i);
        assert.match(doc, /leeches|miasma/i);
        assert.match(capy, /tangerine|zen|unbothered/i);
    });

    it('computes structured stat preview deltas with positive and comedic penalty tags', () => {
        const vikingDeltas = computeStatPreviewDeltas('viking');
        assert.ok(Array.isArray(vikingDeltas));
        const knockback = vikingDeltas.find(d => d.stat.includes('Melee Knockback'));
        assert.ok(knockback);
        assert.equal(knockback.deltaText, '+25%');
        assert.equal(knockback.isPositive, true);

        const diplomacy = vikingDeltas.find(d => d.stat.includes('Diplomacy'));
        assert.ok(diplomacy);
        assert.equal(diplomacy.deltaText, '-90%');
        assert.equal(diplomacy.isPositive, false);

        const bureaucratDeltas = computeStatPreviewDeltas('bureaucrat');
        const shopCost = bureaucratDeltas.find(d => d.stat.includes('Shop Upgrade Cost'));
        assert.ok(shopCost);
        assert.equal(shopCost.deltaText, '-20%');
        assert.equal(shopCost.isPositive, true);

        const capyDeltas = computeStatPreviewDeltas('capybara');
        const stress = capyDeltas.find(d => d.stat.includes('Stress Level'));
        assert.ok(stress);
        assert.equal(stress.deltaText, '-100%');
    });
});

describe('Helmet 01 Crew Quick Picker: Carousel Cycling Logic', () => {
    it('cycles class carousel cleanly in forward (+1) and backward (-1) directions with wrap-around', () => {
        const c0 = QUICK_PICKER_CLASS_IDS[0];
        const c1 = cycleClassId(c0, 1);
        const c2 = cycleClassId(c1, 1);
        const c3 = cycleClassId(c2, 1);
        const c4 = cycleClassId(c3, 1);

        assert.equal(c1, QUICK_PICKER_CLASS_IDS[1]);
        assert.equal(c2, QUICK_PICKER_CLASS_IDS[2]);
        assert.equal(c3, QUICK_PICKER_CLASS_IDS[3]);
        assert.equal(c4, c0); // Wrapped

        // Reverse
        const prev = cycleClassId(c0, -1);
        assert.equal(prev, QUICK_PICKER_CLASS_IDS[QUICK_PICKER_CLASS_IDS.length - 1]);
    });

    it('cycles cosmetic hat carousel cleanly with wrap-around', () => {
        const h0 = QUICK_PICKER_HAT_IDS[0];
        const h1 = cycleHatId(h0, 1);
        assert.equal(h1, QUICK_PICKER_HAT_IDS[1]);

        const prev = cycleHatId(h0, -1);
        assert.equal(prev, QUICK_PICKER_HAT_IDS[QUICK_PICKER_HAT_IDS.length - 1]);
    });
});

describe('Helmet 01 Crew Quick Picker: Persistence & Storage Sync', () => {
    it('loads pre-baked v0.8 defaults when storage is empty or null', () => {
        const mockStorage = new MockStorage();
        const loadout = loadPersistedLoadout(mockStorage);
        assert.equal(loadout.classId, PRE_BAKED_V08_LOADOUT.classId);
        assert.equal(loadout.hatId, PRE_BAKED_V08_LOADOUT.hatId);
        assert.equal(loadout.version, '0.8');
    });

    it('persists choices into localStorage and survives reloading', () => {
        const mockStorage = new MockStorage();
        savePersistedLoadout({ classId: 'viking', hatId: 'viking_horns' }, mockStorage);

        const loaded = loadPersistedLoadout(mockStorage);
        assert.equal(loaded.classId, 'viking');
        assert.equal(loaded.hatId, 'viking_horns');
        assert.equal(loaded.version, '0.8');
    });

    it('heals corrupted storage gracefully', () => {
        const mockStorage = new MockStorage();
        mockStorage.setItem(STORAGE_KEY_CREW_LOADOUT, '{"corrupted: true');
        const loaded = loadPersistedLoadout(mockStorage);
        assert.equal(loaded.classId, PRE_BAKED_V08_LOADOUT.classId);
    });
});

describe('Helmet 01 Crew Quick Picker: State Machine & Interactive Trigger Controls', () => {
    let mockStorage;
    let state;

    beforeEach(() => {
        mockStorage = new MockStorage();
        state = createCrewQuickPickerState({ storage: mockStorage });
    });

    it('initializes to v0.8 pre-baked loadout by default', () => {
        const loadout = state.getLoadout();
        assert.equal(loadout.classId, PRE_BAKED_V08_LOADOUT.classId);
        assert.equal(loadout.version, '0.8');
        assert.equal(loadout.isPreBaked, true);
        assert.ok(loadout.deltas.length > 0);
    });

    it('cycles class and notifies subscribers with line-of-sight mutation', () => {
        let lastNotified = null;
        state.subscribe((l) => { lastNotified = l; });

        const nextClass = state.cycleClass(1);
        assert.equal(state.getClass(), nextClass);
        assert.equal(lastNotified.classId, nextClass);

        // Verify persisted
        const saved = loadPersistedLoadout(mockStorage);
        assert.equal(saved.classId, nextClass);
    });

    it('cycles hat and persists immediately', () => {
        const initialHat = state.getHat();
        const nextHat = state.cycleHat(1);
        assert.notEqual(nextHat, initialHat);
        assert.equal(state.getHat(), nextHat);

        const saved = loadPersistedLoadout(mockStorage);
        assert.equal(saved.hatId, nextHat);
    });

    it('handles Q / E keystroke inputs to cycle classes with zero modal friction', () => {
        const startClass = state.getClass();

        // Press 'E' -> cycles next class
        let handled = state.handleKeyDown({ key: 'e' });
        assert.equal(handled, true);
        assert.notEqual(state.getClass(), startClass);

        // Press 'Q' -> cycles back
        handled = state.handleKeyDown({ key: 'q' });
        assert.equal(handled, true);
        assert.equal(state.getClass(), startClass);

        // Arrow keys support
        handled = state.handleKeyDown({ key: 'ArrowRight' });
        assert.equal(handled, true);
        assert.notEqual(state.getClass(), startClass);
    });

    it('handles Shift + Q / Shift + E keystrokes to cycle hats', () => {
        const startHat = state.getHat();

        const handled = state.handleKeyDown({ key: 'e', shiftKey: true });
        assert.equal(handled, true);
        assert.notEqual(state.getHat(), startHat);

        const back = state.handleKeyDown({ key: 'q', shiftKey: true });
        assert.equal(back, true);
        assert.equal(state.getHat(), startHat);
    });

    it('ignores keystrokes if the target is an input or textarea', () => {
        const startClass = state.getClass();
        const handled = state.handleKeyDown({
            key: 'e',
            target: { tagName: 'INPUT' },
        });
        assert.equal(handled, false);
        assert.equal(state.getClass(), startClass);
    });

    it('handles direct 1-click on 3D character preview', () => {
        const startClass = state.getClass();
        const updated = state.handlePreviewClick({ shiftKey: false });
        assert.notEqual(updated.classId, startClass);

        // Alt/Shift click cycles hat
        const startHat = state.getHat();
        const updatedHat = state.handlePreviewClick({ shiftKey: true });
        assert.notEqual(updatedHat.hatId, startHat);
    });

    it('resets back to v0.8 pre-baked loadout cleanly', () => {
        state.setClass('bureaucrat');
        state.setHat('disco_afro');
        assert.equal(state.getClass(), 'bureaucrat');

        const reset = state.reset();
        assert.equal(reset.classId, PRE_BAKED_V08_LOADOUT.classId);
        assert.equal(reset.hatId, PRE_BAKED_V08_LOADOUT.hatId);
    });
});

describe('Helmet 01 Crew Quick Picker: DOM Widget Mounting & 1-Click Carousel', () => {
    it('mounts quick-picker carousel onto container and reacts to button clicks', () => {
        const dom = createMockDOM();
        const container = dom.createElement('div');
        const mockStorage = new MockStorage();
        const state = createCrewQuickPickerState({ storage: mockStorage });

        let navigated = null;
        const widget = mountQuickPickerCarouselUI({
            container,
            pickerState: state,
            onNavigate: (l) => { navigated = l; },
            documentRef: dom,
        });

        assert.ok(widget);
        assert.ok(container.children.length > 0);
        assert.ok(navigated);
        assert.equal(navigated.version, '0.8');

        // Locate carousel buttons
        const root = widget.root;
        const prevClassBtn = root.children[1].children[0];
        const nextClassBtn = root.children[1].children[2];
        const classCenterCard = root.children[1].children[1];

        // Click next class button
        const initialClass = state.getClass();
        nextClassBtn.click();
        assert.notEqual(state.getClass(), initialClass);

        // Click class center card (1-click cycle)
        const afterNext = state.getClass();
        classCenterCard.click();
        assert.notEqual(state.getClass(), afterNext);

        // Click prev class button
        prevClassBtn.click();
        assert.equal(state.getClass(), afterNext);

        // Hat buttons
        const prevHatBtn = root.children[2].children[0];
        const nextHatBtn = root.children[2].children[2];
        const initialHat = state.getHat();
        nextHatBtn.click();
        assert.notEqual(state.getHat(), initialHat);
        prevHatBtn.click();
        assert.equal(state.getHat(), initialHat);

        // Dispose cleanly
        widget.dispose();
        assert.equal(container.children.length, 0);
    });
});
