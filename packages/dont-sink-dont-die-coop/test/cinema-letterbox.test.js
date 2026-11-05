import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    LETTERBOX_CONFIG,
    CINEMA_SPLASH_CARDS,
    getActCardForZ,
    calculateLetterboxState,
    createCinemaLetterboxDirector,
} from '../public/js/ui/cinema-letterbox.js';

describe('Cinema Letterbox & Act Splash Director Suite', () => {
    describe('Config and Card Definitions', () => {
        it('specifies exact 7% bar height and 2.4s display duration', () => {
            assert.equal(LETTERBOX_CONFIG.BAR_HEIGHT_PERCENT, 7, 'Must have 7% letterbox bars');
            assert.equal(LETTERBOX_CONFIG.DISPLAY_DURATION_SEC, 2.4, 'Must have 2.4s display duration');
            assert.ok(LETTERBOX_CONFIG.SLIDE_IN_SEC > 0);
            assert.ok(LETTERBOX_CONFIG.SLIDE_OUT_SEC > 0);
        });

        it('defines all 4 Biome Acts and The Dread Kraken Boss splash cards', () => {
            const requiredCards = ['act-1', 'act-2', 'act-3', 'act-4', 'kraken'];
            for (const id of requiredCards) {
                const card = CINEMA_SPLASH_CARDS[id];
                assert.ok(card, `Card ${id} must exist`);
                assert.ok(card.title, `Card ${id} must have title typography`);
                assert.ok(card.subtitle, `Card ${id} must have subtitle lore`);
                assert.ok(card.hazardIcon, `Card ${id} must have hazard icon`);
                assert.ok(card.hazardLevel, `Card ${id} must have hazard level`);
                assert.ok(card.accentColor, `Card ${id} must have accent color`);
            }
            assert.equal(CINEMA_SPLASH_CARDS['kraken'].isBoss, true);
        });

        it('maps river Z-coordinates correctly to Acts 1 through 4', () => {
            assert.equal(getActCardForZ(0).id, 'act-1');
            assert.equal(getActCardForZ(-150).id, 'act-1');
            assert.equal(getActCardForZ(-374).id, 'act-1');
            assert.equal(getActCardForZ(-375).id, 'act-2');
            assert.equal(getActCardForZ(-500).id, 'act-2');
            assert.equal(getActCardForZ(-749).id, 'act-2');
            assert.equal(getActCardForZ(-750).id, 'act-3');
            assert.equal(getActCardForZ(-1000).id, 'act-3');
            assert.equal(getActCardForZ(-1124).id, 'act-3');
            assert.equal(getActCardForZ(-1125).id, 'act-4');
            assert.equal(getActCardForZ(-1400).id, 'act-4');
        });
    });

    describe('Pure Letterbox State Calculations', () => {
        it('returns zero fraction and inactive state when dismissed or out of bounds', () => {
            assert.deepEqual(calculateLetterboxState(-0.1), { barFraction: 0, contentOpacity: 0, isActive: false });
            assert.deepEqual(calculateLetterboxState(2.4), { barFraction: 0, contentOpacity: 0, isActive: false });
            assert.deepEqual(calculateLetterboxState(3.0), { barFraction: 0, contentOpacity: 0, isActive: false });
            assert.deepEqual(calculateLetterboxState(1.0, 2.4, true), { barFraction: 0, contentOpacity: 0, isActive: false });
        });

        it('slides in smoothly during initial transition window', () => {
            const start = calculateLetterboxState(0.05);
            assert.equal(start.isActive, true);
            assert.ok(start.barFraction > 0 && start.barFraction < 1);
            assert.ok(start.contentOpacity >= 0 && start.contentOpacity <= 1);

            const midSlide = calculateLetterboxState(0.18);
            assert.ok(midSlide.barFraction > start.barFraction, 'Bar fraction should increase during slide-in');
        });

        it('holds fully visible at peak display interval (e.g. 1.0s to 1.8s)', () => {
            const peak = calculateLetterboxState(1.2);
            assert.equal(peak.isActive, true);
            assert.equal(peak.barFraction, 1.0);
            assert.equal(peak.contentOpacity, 1.0);
        });

        it('eases out during ending fade window', () => {
            const endSlide = calculateLetterboxState(2.2);
            assert.equal(endSlide.isActive, true);
            assert.ok(endSlide.barFraction < 1.0, 'Bar should be retracting near end');
            assert.ok(endSlide.contentOpacity < 1.0, 'Content opacity should be fading near end');
        });
    });

    describe('Headless Director Controller Lifecycle', () => {
        it('initializes without errors in headless Node environment', () => {
            const director = createCinemaLetterboxDirector();
            assert.equal(director.isActive(), false);
            assert.equal(director.getCurrentCard(), null);
            assert.equal(director.getElapsed(), 0);
            assert.equal(director.getLastAct(), null);
            assert.equal(director.isKrakenTriggered(), false);
        });

        it('triggers cards and updates progress through 2.4s lifecycle', () => {
            const triggered = [];
            const dismissed = [];
            const director = createCinemaLetterboxDirector({
                onTrigger: (card) => triggered.push(card.id),
                onDismiss: (card, reason) => dismissed.push({ id: card?.id, reason }),
            });

            const ok = director.trigger('act-1');
            assert.equal(ok, true);
            assert.equal(director.isActive(), true);
            assert.equal(director.getCurrentCard().id, 'act-1');
            assert.equal(director.getLastAct(), 'act-1');
            assert.deepEqual(triggered, ['act-1']);

            // Step forward 1.0s
            director.update(1.0);
            assert.equal(director.isActive(), true);
            assert.equal(director.getElapsed(), 1.0);

            // Step forward past 2.4s
            director.update(1.5); // Total 2.5s -> should complete
            assert.equal(director.isActive(), false);
            assert.equal(dismissed.length, 1);
            assert.equal(dismissed[0].id, 'act-1');
            assert.equal(dismissed[0].reason, 'completed');
        });

        it('supports checkTriggers across river positions without spamming duplicates', () => {
            const sequence = [];
            const director = createCinemaLetterboxDirector({
                onTrigger: (card) => sequence.push(card.id),
            });

            // Start in Act I
            director.checkTriggers(-50);
            assert.equal(sequence.length, 1);
            assert.equal(sequence[0], 'act-1');

            // Moving within Act I should NOT re-trigger
            director.checkTriggers(-150);
            director.checkTriggers(-350);
            assert.equal(sequence.length, 1);

            // Crossing into Act II (-400) triggers Act II
            director.checkTriggers(-400);
            assert.equal(sequence.length, 2);
            assert.equal(sequence[1], 'act-2');

            // Crossing into Act III (-800) triggers Act III
            director.checkTriggers(-800);
            assert.equal(sequence.length, 3);
            assert.equal(sequence[2], 'act-3');

            // Crossing into Act IV (-1200) triggers Act IV
            director.checkTriggers(-1200);
            assert.equal(sequence.length, 4);
            assert.equal(sequence[3], 'act-4');

            // Dread Kraken trigger
            director.checkTriggers(-1350, true);
            assert.equal(sequence.length, 5);
            assert.equal(sequence[4], 'kraken');
            assert.equal(director.isKrakenTriggered(), true);

            // Redundant Kraken trigger does not duplicate
            director.checkTriggers(-1360, true);
            assert.equal(sequence.length, 5);
        });

        it('instantly dismisses on combat input or manual dismiss call', () => {
            let dismissInfo = null;
            const director = createCinemaLetterboxDirector({
                onDismiss: (card, reason) => {
                    dismissInfo = { cardId: card.id, reason };
                },
            });

            director.trigger('kraken');
            assert.equal(director.isActive(), true);

            // Simulate instant dismissal on combat input
            director.dismiss('combat_input_key:Space');
            assert.equal(director.isActive(), false);
            assert.deepEqual(dismissInfo, {
                cardId: 'kraken',
                reason: 'combat_input_key:Space',
            });
        });
    });

    describe('Mock DOM Integration & Pointer-Events / Non-blocking verification', () => {
        let mockDocument;
        let mockWindow;
        let rootContainer;

        beforeEach(() => {
            const elements = [];
            function createMockElement(tag) {
                const styleObj = {
                    set cssText(val) {
                        this._cssText = val;
                        // Parse simple declarations into camelCase properties
                        const declarations = val.split(';');
                        for (const decl of declarations) {
                            const [k, v] = decl.split(':').map((s) => s.trim());
                            if (k && v) {
                                const camel = k.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
                                this[camel] = v;
                            }
                        }
                    },
                    get cssText() {
                        return this._cssText || '';
                    },
                };
                const el = {
                    tagName: tag.toUpperCase(),
                    id: '',
                    style: styleObj,
                    children: [],
                    innerHTML: '',
                    textContent: '',
                    appendChild(child) {
                        this.children.push(child);
                        return child;
                    },
                    querySelector(selector) {
                        const targetId = selector.replace('#', '');
                        function find(node) {
                            if (node.id === targetId) return node;
                            for (const c of node.children) {
                                const res = find(c);
                                if (res) return res;
                            }
                            return null;
                        }
                        return find(this);
                    },
                    remove() {
                        const idx = elements.indexOf(this);
                        if (idx >= 0) elements.splice(idx, 1);
                    },
                    addEventListener() {},
                    removeEventListener() {},
                };
                elements.push(el);
                return el;
            }

            mockDocument = {
                createElement: createMockElement,
                body: createMockElement('body'),
            };

            const keydownListeners = [];
            mockWindow = {
                addEventListener(evt, fn) {
                    if (evt === 'keydown') keydownListeners.push(fn);
                },
                removeEventListener(evt, fn) {
                    const idx = keydownListeners.indexOf(fn);
                    if (idx >= 0) keydownListeners.splice(idx, 1);
                },
                dispatchKeydown(code) {
                    for (const fn of keydownListeners) {
                        fn({ code });
                    }
                },
            };

            global.document = mockDocument;
            global.window = mockWindow;
            rootContainer = mockDocument.body;
        });

        it('creates letterbox DOM with pointer-events: none so player control is never paused', () => {
            const director = createCinemaLetterboxDirector({ container: rootContainer });
            const dom = director.getDom();
            assert.ok(dom, 'DOM structure should be built');
            assert.equal(dom.root.id, 'cinema-letterbox-root');
            assert.equal(dom.root.style.pointerEvents, 'none', 'Must have pointer-events: none so player can paddle/steer');

            director.trigger('act-1');
            assert.equal(dom.root.style.display, 'block');
            assert.equal(dom.actTitle.textContent, 'AMBER CANYON HEADWATERS');

            // Keyboard combat input (e.g. Space to kickflip/jump or KeyJ to attack)
            mockWindow.dispatchKeydown('KeyJ');
            assert.equal(director.isActive(), false, 'Combat input should dismiss letterbox instantly');
            assert.equal(dom.root.style.display, 'none');

            director.dispose();
            assert.equal(director.getDom(), null);
        });

        it('cleans up DOM and listeners on dispose', () => {
            const director = createCinemaLetterboxDirector({ container: rootContainer });
            assert.ok(director.getDom());
            director.dispose();
            assert.equal(director.getDom(), null);
        });
    });
});
