import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    TICKER_CONFIG,
    formatCoinDelta,
    formatHpDelta,
    getHpBadgeStyle,
    getCoinBadgeStyle,
    createDeltaTickerTracker,
    createHudDeltaTickers,
} from '../public/js/ui/hud-delta-tickers.js';

describe('Line-of-Sight HUD Delta Tickers Suite (+Coins / -HP)', () => {
    describe('Configuration & Styling Invariants', () => {
        it('specifies exact 300ms scale-pop and 400ms coin batch window', () => {
            assert.equal(TICKER_CONFIG.SCALE_POP_DURATION_MS, 300, 'Scale-pop must last 300ms');
            assert.equal(TICKER_CONFIG.COIN_BATCH_WINDOW_MS, 400, 'Rapid coin pickups must batch within 400ms');
            assert.equal(TICKER_CONFIG.COLORS.COIN_GOLD, '#fbbf24', 'Coins must be gold (#fbbf24)');
            assert.equal(TICKER_CONFIG.COLORS.HP_CRIMSON, '#ef4444', 'Damage must be crimson (#ef4444)');
            assert.equal(TICKER_CONFIG.COLORS.HP_EMERALD, '#10b981', 'Heal must be emerald (#10b981)');
        });

        it('formats coin deltas with + prefix and escalating exclamation mark', () => {
            assert.equal(formatCoinDelta(25, 1), '+25c');
            assert.equal(formatCoinDelta(10, 1), '+10c');
            assert.equal(formatCoinDelta(20, 2), '+20c');
            assert.equal(formatCoinDelta(35, 3), '+35c!');
            assert.equal(formatCoinDelta(50, 4), '+50c!');
            assert.equal(formatCoinDelta(-15, 1), '-15c');
        });

        it('formats HP deltas correctly for damage and healing', () => {
            assert.equal(formatHpDelta(-15), '-15 HP');
            assert.equal(formatHpDelta(-30), '-30 HP');
            assert.equal(formatHpDelta(25), '+25 HP');
            assert.equal(formatHpDelta(50), '+50 HP');
        });

        it('resolves correct badge style for HP and coins', () => {
            const dmgStyle = getHpBadgeStyle(-15);
            assert.equal(dmgStyle.color, '#ef4444');
            assert.equal(dmgStyle.type, 'damage');

            const healStyle = getHpBadgeStyle(25);
            assert.equal(healStyle.color, '#10b981');
            assert.equal(healStyle.type, 'heal');

            const coinStyle = getCoinBadgeStyle(25);
            assert.equal(coinStyle.color, '#fbbf24');
        });
    });

    describe('Delta Ticker Tracker State Machine', () => {
        let tracker;

        beforeEach(() => {
            tracker = createDeltaTickerTracker({
                initialCoins: 50,
                initialHp: 100,
            });
        });

        it('does not trigger on unchanged values or first initialization', () => {
            const freshTracker = createDeltaTickerTracker();
            const res1 = freshTracker.onCoinChange(50, 1000);
            assert.equal(res1, null, 'First initialization should not emit delta');

            const res2 = freshTracker.onCoinChange(50, 1100);
            assert.equal(res2, null, 'Identical value should not emit delta');
        });

        it('triggers an immediate inline delta badge (+25c in gold) on coin mutation', () => {
            const ev = tracker.onCoinChange(75, 1000); // 50 -> 75 = +25
            assert.ok(ev);
            assert.equal(ev.type, 'coin');
            assert.equal(ev.diff, 25);
            assert.equal(ev.newCoins, 75);
            assert.equal(ev.text, '+25c');
            assert.equal(ev.color, '#fbbf24');
            assert.equal(ev.popDuration, 300);

            const snap = tracker.getSnapshot(1100);
            assert.equal(snap.coinPop.active, true);
            assert.equal(snap.coinPop.remainingMs, 200); // 1300 - 1100 = 200ms
        });

        it('triggers an immediate inline delta badge (-15 HP in crimson) and scale-pops for 300ms', () => {
            const ev = tracker.onHpChange(85, 2000); // 100 -> 85 = -15
            assert.ok(ev);
            assert.equal(ev.type, 'hp');
            assert.equal(ev.diff, -15);
            assert.equal(ev.newHp, 85);
            assert.equal(ev.text, '-15 HP');
            assert.equal(ev.color, '#ef4444'); // Crimson
            assert.equal(ev.popDuration, 300);

            const snap = tracker.getSnapshot(2150);
            assert.equal(snap.hpPop.active, true);
            assert.equal(snap.hpPop.remainingMs, 150); // 2300 - 2150 = 150ms

            const snapAfterPop = tracker.getSnapshot(2301);
            assert.equal(snapAfterPop.hpPop.active, false);
        });

        it('triggers an immediate inline delta badge (+25 HP in emerald) on healing', () => {
            tracker.onHpChange(50, 3000); // drop to 50
            const ev = tracker.onHpChange(75, 3500); // heal +25
            assert.ok(ev);
            assert.equal(ev.type, 'hp');
            assert.equal(ev.diff, 25);
            assert.equal(ev.newHp, 75);
            assert.equal(ev.text, '+25 HP');
            assert.equal(ev.color, '#10b981'); // Emerald
            assert.equal(ev.popDuration, 300);
        });

        it('batches rapid coin pickups within 400ms into an escalating counter (+10 -> +20 -> +35!)', () => {
            const baseTime = 10000;

            // 1st pickup: +10 coins at t = 10000 (total coins: 50 -> 60)
            const ev1 = tracker.onCoinChange(60, baseTime);
            assert.equal(ev1.diff, 10);
            assert.equal(ev1.text, '+10c');
            assert.equal(ev1.batchCount, 1);

            // 2nd pickup: +10 coins at t = 10200 (within 200ms < 400ms, total coins: 60 -> 70)
            const ev2 = tracker.onCoinChange(70, baseTime + 200);
            assert.equal(ev2.diff, 10);
            assert.equal(ev2.text, '+20c');
            assert.equal(ev2.batchCount, 2);

            // 3rd pickup: +15 coins at t = 10350 (within 150ms < 400ms of last pickup, total coins: 70 -> 85)
            const ev3 = tracker.onCoinChange(85, baseTime + 350);
            assert.equal(ev3.diff, 15);
            assert.equal(ev3.text, '+35c!'); // Escalating punctuation '!'
            assert.equal(ev3.batchCount, 3);

            // Verify scale-pop refreshed to 300ms from last pickup
            const snap = tracker.getSnapshot(baseTime + 450);
            assert.equal(snap.coinPop.active, true);
            assert.equal(snap.coinPop.remainingMs, 200); // (10350 + 300) - 10450 = 200ms
        });

        it('starts a new batch when rapid pickups pause beyond 400ms', () => {
            const baseTime = 20000;

            // Initial pickup
            tracker.onCoinChange(60, baseTime); // +10c
            tracker.onCoinChange(70, baseTime + 200); // +20c

            // Pause for 500ms (> 400ms)
            const evAfterPause = tracker.onCoinChange(75, baseTime + 750); // +5c
            assert.equal(evAfterPause.diff, 5);
            assert.equal(evAfterPause.text, '+5c');
            assert.equal(evAfterPause.batchCount, 1, 'Batch count should reset to 1 after 400ms window expires');
        });

        it('supports direct helper methods addCoinDelta and addHpDelta', () => {
            const evCoin = tracker.addCoinDelta(25, 30000);
            assert.equal(evCoin.text, '+25c');
            assert.equal(evCoin.newCoins, 75);

            const evHp = tracker.addHpDelta(-15, 30050);
            assert.equal(evHp.text, '-15 HP');
            assert.equal(evHp.newHp, 85);
        });

        it('resets cleanly across mode transitions and run restarts', () => {
            tracker.onCoinChange(100, 40000);
            tracker.onHpChange(20, 40000);

            tracker.reset(50, 100);
            const snap = tracker.getSnapshot(40001);
            assert.equal(snap.coinValue, 50);
            assert.equal(snap.hpValue, 100);
            assert.equal(snap.coinBatch.active, false);
            assert.equal(snap.hpDelta.active, false);
            assert.equal(snap.coinPop.active, false);
            assert.equal(snap.hpPop.active, false);
        });
    });

    describe('DOM Mock & Controller Integration', () => {
        function createMockDocument() {
            const elements = new Map();

            function makeElement(tag, id = null) {
                let _className = '';
                const el = {
                    tagName: tag.toUpperCase(),
                    id,
                    get className() {
                        return _className;
                    },
                    set className(val) {
                        _className = val;
                    },
                    textContent: '',
                    style: {},
                    parentNode: null,
                    nextSibling: null,
                    classList: {
                        add: (c) => {
                            const set = new Set(_className.split(' ').filter(Boolean));
                            set.add(c);
                            _className = Array.from(set).join(' ');
                        },
                        remove: (c) => {
                            const set = new Set(_className.split(' ').filter(Boolean));
                            set.delete(c);
                            _className = Array.from(set).join(' ');
                        },
                        contains: (c) => {
                            const set = new Set(_className.split(' ').filter(Boolean));
                            return set.has(c);
                        },
                    },
                    insertBefore(newChild, refChild) {
                        newChild.parentNode = this;
                        if (newChild.id) elements.set(newChild.id, newChild);
                        return newChild;
                    },
                    appendChild(child) {
                        child.parentNode = this;
                        if (child.id) elements.set(child.id, child);
                        return child;
                    },
                    remove() {
                        if (this.id) elements.delete(this.id);
                    },
                };
                return el;
            }

            const doc = {
                head: makeElement('head', 'head'),
                body: makeElement('body', 'body'),
                createElement: (tag) => makeElement(tag),
                getElementById: (id) => elements.get(id) || null,
            };

            // Setup mock #ui panel with #coins and #health
            const coins = makeElement('b', 'coins');
            const health = makeElement('span', 'health');
            const kpiContainer = makeElement('div', 'kpi-coins');
            const hullContainer = makeElement('div', 'hull');

            kpiContainer.appendChild(coins);
            hullContainer.appendChild(health);
            doc.body.appendChild(kpiContainer);
            doc.body.appendChild(hullContainer);

            return doc;
        }

        it('mounts inline badges beside #coins and #health without layout disruption', () => {
            const mockDoc = createMockDocument();
            const hudTickers = createHudDeltaTickers({
                document: mockDoc,
                initialCoins: 50,
                initialHp: 100,
            });

            const coinBadge = mockDoc.getElementById('hud-coin-delta-badge');
            const hpBadge = mockDoc.getElementById('hud-hp-delta-badge');

            assert.ok(coinBadge, 'Badge must be mounted for coins');
            assert.ok(hpBadge, 'Badge must be mounted for health');

            // Trigger coin change
            hudTickers.updateCoins(75);
            assert.equal(coinBadge.textContent, '+25c');
            assert.ok(coinBadge.classList.contains('visible'));
            assert.ok(mockDoc.getElementById('coins').classList.contains('popping'));

            // Trigger HP damage
            hudTickers.updateHealth(85);
            assert.equal(hpBadge.textContent, '-15 HP');
            assert.ok(hpBadge.classList.contains('visible'));
            assert.ok(mockDoc.getElementById('health').classList.contains('popping'));

            // Clean destruction
            hudTickers.destroy();
        });
    });
});
