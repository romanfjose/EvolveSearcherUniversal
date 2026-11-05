/**
 * Line-of-Sight HUD Delta Tickers (+Coins / -HP)
 * (`public/js/ui/hud-delta-tickers.js`)
 *
 * Sovereign Core & Helmet 01 Cockpit Directive:
 * Reality must mutate directly in line of sight (zero dead touch).
 *
 * Requirements:
 * - Whenever coins or hull health mutate, trigger an immediate inline delta badge:
 *     - +25c in gold (#fbbf24)
 *     - -15 HP in crimson (#ef4444)
 *     - +25 HP in emerald (#10b981)
 *   right beside the counter and scale-pop the value for 300ms.
 * - Batch rapid coin pickups within 400ms into a single escalating counter
 *   (+10 -> +20 -> +35!) to eliminate visual noise and HUD clutter.
 *
 * Pure, zero-dependency ES module that works both in headless tests and browser DOM.
 */

export const TICKER_CONFIG = {
    SCALE_POP_DURATION_MS: 300,
    COIN_BATCH_WINDOW_MS: 400,
    BADGE_PERSIST_MS: 900,
    COLORS: {
        COIN_GOLD: '#fbbf24',
        HP_CRIMSON: '#ef4444',
        HP_EMERALD: '#10b981',
        TEXT_LIGHT: '#ffffff',
    },
};

/**
 * Format a coin delta into an escalating text badge.
 * Examples:
 *   delta = 25, count = 1 -> "+25c"
 *   delta = 35, count = 3 -> "+35c!" (or "+35!")
 */
export function formatCoinDelta(amount, batchCount = 1) {
    const sign = amount >= 0 ? '+' : '';
    const suffix = batchCount > 2 ? '!' : '';
    return `${sign}${amount}c${suffix}`;
}

/**
 * Format an HP delta into an inline badge text.
 * Examples:
 *   delta = -15 -> "-15 HP"
 *   delta = +25 -> "+25 HP"
 */
export function formatHpDelta(amount) {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount} HP`;
}

/**
 * Determines styling and color for an HP delta.
 */
export function getHpBadgeStyle(delta) {
    return {
        color: delta >= 0 ? TICKER_CONFIG.COLORS.HP_EMERALD : TICKER_CONFIG.COLORS.HP_CRIMSON,
        type: delta >= 0 ? 'heal' : 'damage',
        prefix: delta >= 0 ? '+' : '',
    };
}

/**
 * Determines styling and color for a coin delta.
 */
export function getCoinBadgeStyle(delta) {
    return {
        color: TICKER_CONFIG.COLORS.COIN_GOLD,
        type: delta >= 0 ? 'gain' : 'spend',
        prefix: delta >= 0 ? '+' : '',
    };
}

/**
 * Pure state machine tracker for coin & HP delta batching and scale-pops.
 * Decoupled from DOM so it can be verified with high-precision timestamps in unit tests.
 */
export function createDeltaTickerTracker(options = {}) {
    const scalePopDuration = options.scalePopDuration ?? TICKER_CONFIG.SCALE_POP_DURATION_MS;
    const coinBatchWindow = options.coinBatchWindow ?? TICKER_CONFIG.COIN_BATCH_WINDOW_MS;
    const badgePersist = options.badgePersist ?? TICKER_CONFIG.BADGE_PERSIST_MS;

    let lastCoinValue = options.initialCoins ?? null;
    let lastHpValue = options.initialHp ?? null;

    // Coin batching state
    let coinBatch = {
        active: false,
        accumulatedAmount: 0,
        batchCount: 0,
        startTime: 0,
        lastUpdateTime: 0,
        text: '',
        color: TICKER_CONFIG.COLORS.COIN_GOLD,
    };

    // Coin scale-pop state
    let coinPop = {
        active: false,
        startTime: 0,
        endTime: 0,
        scale: 1.0,
    };

    // HP delta state
    let hpDelta = {
        active: false,
        amount: 0,
        text: '',
        color: '',
        startTime: 0,
    };

    // HP scale-pop state
    let hpPop = {
        active: false,
        startTime: 0,
        endTime: 0,
        scale: 1.0,
    };

    const listeners = [];

    function notify(event, payload) {
        for (const fn of listeners) {
            fn(event, payload);
        }
    }

    return {
        subscribe(fn) {
            listeners.push(fn);
            return () => {
                const idx = listeners.indexOf(fn);
                if (idx !== -1) listeners.splice(idx, 1);
            };
        },

        getSnapshot(now = Date.now()) {
            return {
                coinValue: lastCoinValue,
                hpValue: lastHpValue,
                coinBatch: {
                    ...coinBatch,
                    isExpired: coinBatch.active && (now - coinBatch.lastUpdateTime > coinBatchWindow),
                },
                coinPop: {
                    active: coinPop.active && now < coinPop.endTime,
                    remainingMs: Math.max(0, coinPop.endTime - now),
                },
                hpDelta: {
                    ...hpDelta,
                    isExpired: hpDelta.active && (now - hpDelta.startTime > badgePersist),
                },
                hpPop: {
                    active: hpPop.active && now < hpPop.endTime,
                    remainingMs: Math.max(0, hpPop.endTime - now),
                },
            };
        },

        /**
         * Update coin value.
         * If coins increase and previous mutation was within coinBatchWindow (400ms),
         * batch into a single escalating counter (+10 -> +20 -> +35!).
         * Triggers scale-pop for 300ms.
         *
         * @param {number} newCoins - Current absolute coin count
         * @param {number} [now=Date.now()] - Current timestamp
         * @returns {object|null} Delta event info or null if no change
         */
        onCoinChange(newCoins, now = Date.now()) {
            if (lastCoinValue === null) {
                lastCoinValue = newCoins;
                return null;
            }

            const diff = newCoins - lastCoinValue;
            lastCoinValue = newCoins;

            if (diff === 0) return null;

            // Trigger scale-pop on coin counter for 300ms
            coinPop.active = true;
            coinPop.startTime = now;
            coinPop.endTime = now + scalePopDuration;
            coinPop.scale = 1.35;

            // Handle positive coin batching
            if (diff > 0) {
                const isWithinWindow = coinBatch.active && (now - coinBatch.lastUpdateTime <= coinBatchWindow);

                if (isWithinWindow) {
                    coinBatch.accumulatedAmount += diff;
                    coinBatch.batchCount += 1;
                    coinBatch.lastUpdateTime = now;
                } else {
                    coinBatch.active = true;
                    coinBatch.accumulatedAmount = diff;
                    coinBatch.batchCount = 1;
                    coinBatch.startTime = now;
                    coinBatch.lastUpdateTime = now;
                }

                coinBatch.text = formatCoinDelta(coinBatch.accumulatedAmount, coinBatch.batchCount);
                coinBatch.color = TICKER_CONFIG.COLORS.COIN_GOLD;
            } else {
                // Spending / negative delta
                coinBatch.active = true;
                coinBatch.accumulatedAmount = diff;
                coinBatch.batchCount = 1;
                coinBatch.startTime = now;
                coinBatch.lastUpdateTime = now;
                coinBatch.text = `${diff}c`;
                coinBatch.color = TICKER_CONFIG.COLORS.COIN_GOLD;
            }

            const payload = {
                type: 'coin',
                diff,
                newCoins,
                text: coinBatch.text,
                color: coinBatch.color,
                batchCount: coinBatch.batchCount,
                popDuration: scalePopDuration,
                timestamp: now,
            };

            notify('coinDelta', payload);
            return payload;
        },

        /**
         * Update hull health value.
         * Triggers an immediate inline delta badge:
         *   - negative in crimson (#ef4444, e.g. "-15 HP")
         *   - positive in emerald (#10b981, e.g. "+25 HP")
         * and scale-pops the value for 300ms.
         *
         * @param {number} newHp - Current hull HP
         * @param {number} [now=Date.now()] - Current timestamp
         * @returns {object|null} Delta event info or null if no change
         */
        onHpChange(newHp, now = Date.now()) {
            if (lastHpValue === null) {
                lastHpValue = newHp;
                return null;
            }

            const diff = newHp - lastHpValue;
            lastHpValue = newHp;

            if (diff === 0) return null;

            // Trigger scale-pop on HP counter for 300ms
            hpPop.active = true;
            hpPop.startTime = now;
            hpPop.endTime = now + scalePopDuration;
            hpPop.scale = diff < 0 ? 1.4 : 1.25;

            const style = getHpBadgeStyle(diff);
            hpDelta.active = true;
            hpDelta.amount = diff;
            hpDelta.text = formatHpDelta(diff);
            hpDelta.color = style.color;
            hpDelta.startTime = now;

            const payload = {
                type: 'hp',
                diff,
                newHp,
                text: hpDelta.text,
                color: hpDelta.color,
                popDuration: scalePopDuration,
                timestamp: now,
            };

            notify('hpDelta', payload);
            return payload;
        },

        /**
         * Directly trigger an explicit coin reward delta (e.g. from loot pickup or ring bonus).
         */
        addCoinDelta(amount, now = Date.now()) {
            const current = lastCoinValue ?? 0;
            return this.onCoinChange(current + amount, now);
        },

        /**
         * Directly trigger an explicit HP mutation (damage or heal).
         */
        addHpDelta(amount, now = Date.now()) {
            const current = lastHpValue ?? 100;
            return this.onHpChange(current + amount, now);
        },

        /**
         * Reset batchers and state (e.g. across run resets / new games).
         */
        reset(initialCoins = null, initialHp = null) {
            lastCoinValue = initialCoins;
            lastHpValue = initialHp;
            coinBatch.active = false;
            coinBatch.accumulatedAmount = 0;
            coinBatch.batchCount = 0;
            coinPop.active = false;
            hpDelta.active = false;
            hpPop.active = false;
            notify('reset', { initialCoins, initialHp });
        },
    };
}

/**
 * Injects and manages the DOM badges and 300ms scale-pop animations for #coins and #health.
 * Adheres strictly to JoseStandards Cockpit UX:
 *   - Badges positioned directly inline beside the numeric counters in #ui
 *   - Zero layout shift, no vertical scroll walls, zero collision with other HUD panels
 *
 * @param {object} [options={}]
 * @returns {object} HUD delta tickers controller
 */
export function createHudDeltaTickers(options = {}) {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const tracker = options.tracker || createDeltaTickerTracker(options);

    let coinBadgeEl = null;
    let hpBadgeEl = null;
    let coinHideTimer = null;
    let hpHideTimer = null;
    let coinPopTimer = null;
    let hpPopTimer = null;

    // Inject CSS styles for the badges and scale-pop effect if document is available
    if (doc && !doc.getElementById('hud-delta-tickers-style')) {
        const style = doc.createElement('style');
        style.id = 'hud-delta-tickers-style';
        style.textContent = `
            .hud-delta-badge {
                display: inline-block;
                font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
                font-size: 11px;
                font-weight: 800;
                line-height: 1;
                margin-left: 6px;
                padding: 1px 5px;
                border-radius: 4px;
                vertical-align: middle;
                pointer-events: none;
                opacity: 0;
                transform: translateY(0) scale(0.9);
                transition: opacity 0.15s ease-out, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .hud-delta-badge.visible {
                opacity: 1;
                transform: translateY(-1px) scale(1.05);
            }
            .hud-delta-badge.coin-gold {
                color: ${TICKER_CONFIG.COLORS.COIN_GOLD};
                background: rgba(251, 191, 36, 0.18);
                border: 1px solid rgba(251, 191, 36, 0.4);
                text-shadow: 0 0 6px rgba(251, 191, 36, 0.5);
            }
            .hud-delta-badge.hp-crimson {
                color: ${TICKER_CONFIG.COLORS.HP_CRIMSON};
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.45);
                text-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
            }
            .hud-delta-badge.hp-emerald {
                color: ${TICKER_CONFIG.COLORS.HP_EMERALD};
                background: rgba(16, 185, 129, 0.2);
                border: 1px solid rgba(16, 185, 129, 0.45);
                text-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
            }
            .hud-scale-pop {
                display: inline-block;
                transform-origin: center center;
                transition: transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .hud-scale-pop.popping {
                transform: scale(1.28);
            }
        `;
        doc.head?.appendChild(style);
    }

    function initDomElements() {
        if (!doc) return;

        // 1. Coin Badge inline mounting beside #coins
        const coinsEl = doc.getElementById('coins');
        if (coinsEl) {
            coinsEl.classList.add('hud-scale-pop');
            if (!doc.getElementById('hud-coin-delta-badge')) {
                coinBadgeEl = doc.createElement('span');
                coinBadgeEl.id = 'hud-coin-delta-badge';
                coinBadgeEl.className = 'hud-delta-badge coin-gold';
                // Insert right after #coins element
                coinsEl.parentNode.insertBefore(coinBadgeEl, coinsEl.nextSibling);
            } else {
                coinBadgeEl = doc.getElementById('hud-coin-delta-badge');
            }
        }

        // 2. Health Badge inline mounting beside #health
        const healthEl = doc.getElementById('health');
        if (healthEl) {
            healthEl.classList.add('hud-scale-pop');
            if (!doc.getElementById('hud-hp-delta-badge')) {
                hpBadgeEl = doc.createElement('span');
                hpBadgeEl.id = 'hud-hp-delta-badge';
                hpBadgeEl.className = 'hud-delta-badge';
                healthEl.parentNode.insertBefore(hpBadgeEl, healthEl.nextSibling);
            } else {
                hpBadgeEl = doc.getElementById('hud-hp-delta-badge');
            }
        }
    }

    initDomElements();

    // Listen to tracker events to update the DOM
    const unsubscribe = tracker.subscribe((event, data) => {
        if (!doc) return;

        if (event === 'coinDelta') {
            const coinsEl = doc.getElementById('coins');
            if (coinsEl) {
                // Scale pop for 300ms
                coinsEl.classList.add('popping');
                if (coinPopTimer) clearTimeout(coinPopTimer);
                coinPopTimer = setTimeout(() => {
                    coinsEl.classList.remove('popping');
                }, TICKER_CONFIG.SCALE_POP_DURATION_MS);
            }

            if (!coinBadgeEl) initDomElements();
            if (coinBadgeEl) {
                coinBadgeEl.textContent = data.text;
                coinBadgeEl.className = 'hud-delta-badge coin-gold visible';

                if (coinHideTimer) clearTimeout(coinHideTimer);
                coinHideTimer = setTimeout(() => {
                    coinBadgeEl.classList.remove('visible');
                }, TICKER_CONFIG.BADGE_PERSIST_MS);
            }
        } else if (event === 'hpDelta') {
            const healthEl = doc.getElementById('health');
            if (healthEl) {
                // Scale pop for 300ms
                healthEl.classList.add('popping');
                if (hpPopTimer) clearTimeout(hpPopTimer);
                hpPopTimer = setTimeout(() => {
                    healthEl.classList.remove('popping');
                }, TICKER_CONFIG.SCALE_POP_DURATION_MS);
            }

            if (!hpBadgeEl) initDomElements();
            if (hpBadgeEl) {
                hpBadgeEl.textContent = data.text;
                const colorClass = data.diff >= 0 ? 'hp-emerald' : 'hp-crimson';
                hpBadgeEl.className = `hud-delta-badge ${colorClass} visible`;

                if (hpHideTimer) clearTimeout(hpHideTimer);
                hpHideTimer = setTimeout(() => {
                    hpBadgeEl.classList.remove('visible');
                }, TICKER_CONFIG.BADGE_PERSIST_MS);
            }
        } else if (event === 'reset') {
            if (coinBadgeEl) coinBadgeEl.classList.remove('visible');
            if (hpBadgeEl) hpBadgeEl.classList.remove('visible');
        }
    });

    return {
        tracker,
        initDomElements,
        updateCoins(amount, now) {
            return tracker.onCoinChange(amount, now);
        },
        updateHealth(amount, now) {
            return tracker.onHpChange(amount, now);
        },
        addCoins(amount, now) {
            return tracker.addCoinDelta(amount, now);
        },
        addHp(amount, now) {
            return tracker.addHpDelta(amount, now);
        },
        reset(coins, hp) {
            tracker.reset(coins, hp);
        },
        destroy() {
            unsubscribe();
            if (coinHideTimer) clearTimeout(coinHideTimer);
            if (hpHideTimer) clearTimeout(hpHideTimer);
            if (coinPopTimer) clearTimeout(coinPopTimer);
            if (hpPopTimer) clearTimeout(hpPopTimer);
            coinBadgeEl?.remove();
            hpBadgeEl?.remove();
        },
        get elements() {
            return { coinBadgeEl, hpBadgeEl };
        },
    };
}
