import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    GADGET_META,
    getTarotTooltip,
    getGadgetTooltip,
    calculateRadialSvgSweep,
    collectActiveLoadoutItems,
    LOADOUT_STRIP_CONFIG,
    createActiveLoadoutStrip,
} from '../public/js/ui/active-loadout-strip.js';

import {
    GADGET_TYPES,
    GADGET_CONFIGS,
    createRaftGadgetState,
    installGadget,
} from '../shared/raft-gadgets.js';

import {
    TAROT_CARD_IDS,
    TAROT_CARDS,
    createPlayerTarotState,
    applyTarotBlessing,
} from '../shared/dream-tarot.js';

describe('Active Loadout & Cooldown Strip Suite', () => {
    describe('Metadata and 1-Line Tooltips', () => {
        it('defines metadata for all 4 required raft gadgets', () => {
            const required = ['harpoon', 'shield-dome', 'nitro-keg', 'repair-drone'];
            for (const gadgetId of required) {
                const meta = GADGET_META[gadgetId];
                assert.ok(meta, `Metadata for ${gadgetId} must exist`);
                assert.ok(meta.name, 'Gadget must have a short cockpit name');
                assert.ok(meta.icon, 'Gadget must have an icon/glyph');
                assert.ok(meta.tooltip, 'Gadget must have a 1-line tooltip');
                assert.ok(typeof meta.getCooldownFraction === 'function');
                assert.ok(typeof meta.getStatusText === 'function');
            }
        });

        it('generates crisp 1-line tooltips for Tarot cards', () => {
            for (const cardId of Object.values(TAROT_CARD_IDS)) {
                const tooltip = getTarotTooltip(cardId);
                assert.ok(tooltip.length > 5);
                assert.ok(!tooltip.includes('\n'), 'Must be a clean single-line tooltip');
                assert.ok(tooltip.includes(TAROT_CARDS[cardId].name));
            }
            assert.equal(getTarotTooltip('invalid-card-id'), 'Unknown Blessing');
        });

        it('generates crisp 1-line tooltips for Raft Gadgets with live status', () => {
            const tooltipBase = getGadgetTooltip(GADGET_TYPES.HARPOON);
            assert.ok(tooltipBase.includes('Auto-Harpoon'));
            assert.ok(!tooltipBase.includes('\n'));

            const gadgetState = createRaftGadgetState();
            const uninstalledTip = getGadgetTooltip(GADGET_TYPES.HARPOON, gadgetState, 1000);
            assert.ok(uninstalledTip.includes('Not Installed'));

            installGadget({ coins: 999 }, gadgetState, GADGET_TYPES.HARPOON, 1000);
            const readyTip = getGadgetTooltip(GADGET_TYPES.HARPOON, gadgetState, 5000);
            assert.ok(readyTip.includes('READY'));

            // On cooldown right after firing
            gadgetState.harpoon.lastFireTime = 5000;
            const cooldownTip = getGadgetTooltip(GADGET_TYPES.HARPOON, gadgetState, 5900);
            assert.ok(cooldownTip.includes('0.9s'));
        });
    });

    describe('Radial SVG Cooldown Sweep Math', () => {
        it('calculates exact circumference and stroke-dashoffset for radius 15', () => {
            const r = 15;
            const circumference = 2 * Math.PI * r;

            // fraction = 0 (ready / no cooldown)
            const ready = calculateRadialSvgSweep(r, 0);
            assert.equal(ready.circumference, circumference);
            assert.equal(ready.strokeDashoffset, Number(circumference.toFixed(2)));

            // fraction = 1.0 (full cooldown)
            const full = calculateRadialSvgSweep(r, 1.0);
            assert.equal(full.strokeDashoffset, 0);

            // fraction = 0.5 (half cooldown)
            const half = calculateRadialSvgSweep(r, 0.5);
            assert.equal(half.strokeDashoffset, Number((circumference * 0.5).toFixed(2)));
        });

        it('clamps fractions safely within [0, 1]', () => {
            const r = 15;
            const under = calculateRadialSvgSweep(r, -0.2);
            assert.equal(under.strokeDashoffset, Number((2 * Math.PI * r).toFixed(2)));

            const over = calculateRadialSvgSweep(r, 1.5);
            assert.equal(over.strokeDashoffset, 0);
        });
    });

    describe('Loadout Item Aggregator (collectActiveLoadoutItems)', () => {
        it('collects all 4 gadgets in uninstalled state when none equipped', () => {
            const gadgetState = createRaftGadgetState();
            const tarotState = createPlayerTarotState();

            const items = collectActiveLoadoutItems(tarotState, gadgetState, 0);
            assert.equal(items.length, 4);

            for (const item of items) {
                assert.equal(item.type, 'gadget');
                assert.equal(item.isInstalled, false);
                assert.equal(item.cooldownFraction, 0);
                assert.equal(item.statusText, 'Locked');
            }
        });

        it('reflects installed gadgets with active cooldowns and gauges', () => {
            const gadgetState = createRaftGadgetState();
            const tarotState = createPlayerTarotState();

            // Install harpoon and shield dome
            installGadget({ coins: 999 }, gadgetState, GADGET_TYPES.HARPOON, 1000);
            installGadget({ coins: 999 }, gadgetState, GADGET_TYPES.SHIELD_DOME, 1000);
            installGadget({ coins: 999 }, gadgetState, GADGET_TYPES.NITRO_KEG, 1000);

            // Drain 40% nitro fuel
            gadgetState.nitroKeg.fuel = 60; // max is 100

            // Shield dome recently activated at 5000ms, current time 7000ms (cooldown is 8000ms -> remaining 6000ms / 8000ms = 0.75)
            gadgetState.shieldDome.lastActivatedTime = 5000;

            const items = collectActiveLoadoutItems(tarotState, gadgetState, 7000);
            const harpoon = items.find((i) => i.id === GADGET_TYPES.HARPOON);
            const shield = items.find((i) => i.id === GADGET_TYPES.SHIELD_DOME);
            const nitro = items.find((i) => i.id === GADGET_TYPES.NITRO_KEG);
            const drone = items.find((i) => i.id === GADGET_TYPES.REPAIR_DRONE);

            assert.equal(harpoon.isInstalled, true);
            assert.equal(harpoon.statusText, 'READY');

            assert.equal(shield.isInstalled, true);
            assert.equal(shield.cooldownFraction, 0.75);
            assert.equal(shield.statusText, '6.0s');

            assert.equal(nitro.isInstalled, true);
            assert.equal(nitro.cooldownFraction, 0.4);
            assert.equal(nitro.statusText, '60%');

            assert.equal(drone.isInstalled, false);
        });

        it('includes equipped tarot blessings as passive icons with stack counters', () => {
            const gadgetState = createRaftGadgetState();
            const tarotState = createPlayerTarotState();

            applyTarotBlessing(tarotState, TAROT_CARD_IDS.CAFFEINATED_OARS);
            applyTarotBlessing(tarotState, TAROT_CARD_IDS.PLANK_MAGNETISM);
            applyTarotBlessing(tarotState, TAROT_CARD_IDS.CAFFEINATED_OARS); // stack x2

            const items = collectActiveLoadoutItems(tarotState, gadgetState, 0);
            // 4 gadgets + 2 distinct tarot cards = 6 items
            assert.equal(items.length, 6);

            const oarBlessing = items.find((i) => i.id === TAROT_CARD_IDS.CAFFEINATED_OARS);
            const magnetBlessing = items.find((i) => i.id === TAROT_CARD_IDS.PLANK_MAGNETISM);

            assert.ok(oarBlessing);
            assert.equal(oarBlessing.type, 'tarot');
            assert.equal(oarBlessing.count, 2);
            assert.equal(oarBlessing.statusText, 'x2');

            assert.ok(magnetBlessing);
            assert.equal(magnetBlessing.type, 'tarot');
            assert.equal(magnetBlessing.count, 1);
            assert.equal(magnetBlessing.statusText, 'PASSIVE');
        });
    });

    describe('Headless Safe Controller Lifecycle (createActiveLoadoutStrip)', () => {
        it('instantiates safely without DOM (Node environment)', () => {
            const strip = createActiveLoadoutStrip(null);
            assert.ok(strip);
            assert.equal(strip.isVisible(), true);
            assert.equal(strip.getRoot(), null);
            assert.equal(strip.getTooltip(), null);

            // update() should run headlessly without crashing
            const gadgetState = createRaftGadgetState();
            const tarotState = createPlayerTarotState();
            installGadget({ coins: 999 }, gadgetState, GADGET_TYPES.HARPOON, 0);

            const items = strip.update({ tarotState, gadgetState, now: 1000 });
            assert.equal(items.length, 4);
            assert.equal(strip.getItems().length, 4);

            strip.setVisible(false);
            assert.equal(strip.isVisible(), false);
            strip.dispose();
        });

        it('operates in mock DOM environment if document & elements are provided', () => {
            // Lightweight mock element for Node testing
            function createMockElement(tag, ns = false) {
                const listeners = {};
                const attributes = {};
                const children = [];
                const el = {
                    tag,
                    ns,
                    id: '',
                    className: '',
                    style: {},
                    offsetLeft: 10,
                    parentNode: null,
                    textContent: '',
                    setAttribute: (k, v) => { attributes[k] = String(v); },
                    getAttribute: (k) => attributes[k],
                    appendChild: (c) => {
                        children.push(c);
                        c.parentNode = el;
                        return c;
                    },
                    removeChild: (c) => {
                        const idx = children.indexOf(c);
                        if (idx >= 0) children.splice(idx, 1);
                        c.parentNode = null;
                        return c;
                    },
                    addEventListener: (ev, fn) => {
                        listeners[ev] = listeners[ev] || [];
                        listeners[ev].push(fn);
                    },
                    triggerEvent: (ev) => {
                        (listeners[ev] || []).forEach((fn) => fn());
                    },
                    get children() { return children; },
                    get innerHTML() { return ''; },
                    set innerHTML(_val) {
                        children.length = 0;
                    },
                };
                return el;
            }

            const mockContainer = createMockElement('div');
            const originalDoc = globalThis.document;

            globalThis.document = {
                createElement: (tag) => createMockElement(tag),
                createElementNS: (_ns, tag) => createMockElement(tag, true),
                body: mockContainer,
            };

            try {
                const strip = createActiveLoadoutStrip(mockContainer);
                const root = strip.getRoot();
                assert.ok(root, 'Root DOM container must be created');
                assert.equal(root.id, LOADOUT_STRIP_CONFIG.ROOT_ID);

                const gadgetState = createRaftGadgetState();
                const tarotState = createPlayerTarotState();
                installGadget({ coins: 999 }, gadgetState, GADGET_TYPES.HARPOON, 0);
                installGadget({ coins: 999 }, gadgetState, GADGET_TYPES.SHIELD_DOME, 0);
                applyTarotBlessing(tarotState, TAROT_CARD_IDS.CAFFEINATED_OARS);

                strip.update({ tarotState, gadgetState, now: 500 });
                assert.equal(strip.getItems().length, 5);

                // Check child slots inside root (1 tooltip + 5 slots = 6 children)
                assert.equal(root.children.length, 6);

                // Test hover listeners on slot
                const firstSlot = root.children[1];
                assert.ok(firstSlot);
                firstSlot.triggerEvent('mouseenter');
                const tooltip = strip.getTooltip();
                assert.equal(tooltip.style.opacity, '1');

                firstSlot.triggerEvent('mouseleave');
                assert.equal(tooltip.style.opacity, '0');

                // Test visibility toggle
                strip.setVisible(false);
                assert.equal(root.style.display, 'none');
                strip.setVisible(true);
                assert.equal(root.style.display, 'flex');

                // Test dispose
                strip.dispose();
                assert.equal(strip.getRoot(), null);
            } finally {
                globalThis.document = originalDoc;
            }
        });
    });
});
