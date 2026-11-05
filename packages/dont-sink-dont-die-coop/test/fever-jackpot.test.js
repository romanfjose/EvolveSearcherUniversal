import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    FEVER_SPIN_DURATION_SEC,
    REEL_STOP_DELAYS_SEC,
    DEFAULT_PITY_THRESHOLD,
    FEVER_SYMBOLS,
    SYMBOL_KEYS,
    SYMBOL_DEFINITIONS,
    createFeverRng,
    rollSingleSymbol,
    evaluateReelMatch,
    rollSlotReels,
    calculatePayout,
    evaluateFeverChestHit,
    createFeverJackpotSession,
    stepFeverJackpotSession,
    getOverheadHologramTransform,
    applyFeverPayout,
    createWaterfallFeverChest,
} from '../shared/fever-jackpot.js';

describe('Fever Jackpot Symbol Constants and Definitions', () => {
    test('defines all 5 required fever dream slot symbols', () => {
        const expected = [
            'triple-gold',
            'hyper-nitro',
            'mega-mallet',
            'rubber-ducky-armada',
            'crab-rave-shield',
        ];
        assert.equal(SYMBOL_KEYS.length, 5);
        for (const sym of expected) {
            assert.ok(SYMBOL_KEYS.includes(sym), `Missing symbol key: ${sym}`);
            assert.ok(SYMBOL_DEFINITIONS[sym], `Missing definition for: ${sym}`);
        }
    });

    test('each symbol definition has valid icons, names, weights and payouts', () => {
        for (const sym of SYMBOL_KEYS) {
            const def = SYMBOL_DEFINITIONS[sym];
            assert.ok(def.name && typeof def.name === 'string');
            assert.ok(def.icon && typeof def.icon === 'string');
            assert.ok(Number.isFinite(def.weight) && def.weight > 0);
            assert.ok(def.jackpotPayout && def.jackpotPayout.type);
            assert.ok(def.partialPayout && def.partialPayout.type);
            assert.ok(def.consolationPayout && def.consolationPayout.type);
        }
    });

    test('spin duration is 1.5s with staggered reel stops', () => {
        assert.equal(FEVER_SPIN_DURATION_SEC, 1.5);
        assert.equal(REEL_STOP_DELAYS_SEC.length, 3);
        assert.ok(REEL_STOP_DELAYS_SEC[0] < REEL_STOP_DELAYS_SEC[1]);
        assert.ok(REEL_STOP_DELAYS_SEC[1] < REEL_STOP_DELAYS_SEC[2]);
        assert.equal(REEL_STOP_DELAYS_SEC[2], FEVER_SPIN_DURATION_SEC);
    });
});

describe('Seeded PRNG & Reel Roll Mechanics', () => {
    test('createFeverRng produces deterministic sequences across identical seeds', () => {
        const rng1 = createFeverRng(42);
        const rng2 = createFeverRng(42);
        const seq1 = [rng1(), rng1(), rng1(), rng1()];
        const seq2 = [rng2(), rng2(), rng2(), rng2()];
        assert.deepEqual(seq1, seq2);
    });

    test('rollSingleSymbol generates valid symbols from SYMBOL_KEYS', () => {
        const rng = createFeverRng(1337);
        for (let i = 0; i < 50; i++) {
            const sym = rollSingleSymbol(rng);
            assert.ok(SYMBOL_KEYS.includes(sym));
        }
    });

    test('evaluateReelMatch identifies jackpot, partial match, and bust correctly', () => {
        // Jackpot
        const resJackpot = evaluateReelMatch(['triple-gold', 'triple-gold', 'triple-gold']);
        assert.equal(resJackpot.isJackpot, true);
        assert.equal(resJackpot.isPartial, false);
        assert.equal(resJackpot.matchingSymbol, 'triple-gold');
        assert.equal(resJackpot.matchCount, 3);

        // Partial match (first two match)
        const resPartial1 = evaluateReelMatch(['mega-mallet', 'mega-mallet', 'hyper-nitro']);
        assert.equal(resPartial1.isJackpot, false);
        assert.equal(resPartial1.isPartial, true);
        assert.equal(resPartial1.matchingSymbol, 'mega-mallet');
        assert.equal(resPartial1.matchCount, 2);

        // Partial match (outer two match)
        const resPartial2 = evaluateReelMatch(['crab-rave-shield', 'hyper-nitro', 'crab-rave-shield']);
        assert.equal(resPartial2.isJackpot, false);
        assert.equal(resPartial2.isPartial, true);
        assert.equal(resPartial2.matchingSymbol, 'crab-rave-shield');

        // Partial match (last two match)
        const resPartial3 = evaluateReelMatch(['rubber-ducky-armada', 'triple-gold', 'triple-gold']);
        assert.equal(resPartial3.isJackpot, false);
        assert.equal(resPartial3.isPartial, true);
        assert.equal(resPartial3.matchingSymbol, 'triple-gold');

        // Bust (all distinct)
        const resBust = evaluateReelMatch(['triple-gold', 'hyper-nitro', 'mega-mallet']);
        assert.equal(resBust.isJackpot, false);
        assert.equal(resBust.isPartial, false);
        assert.equal(resBust.matchCount, 1);
    });
});

describe('Guaranteed Pity Jackpot Mechanics', () => {
    test('rollSlotReels triggers guaranteed jackpot when pity counter hits threshold', () => {
        const rng = createFeverRng(999);
        const threshold = 4;

        // When pity counter is at threshold, pity must trigger
        const outcome = rollSlotReels(rng, threshold, threshold);
        assert.equal(outcome.isJackpot, true);
        assert.equal(outcome.isPity, true);
        assert.equal(outcome.reels[0], outcome.reels[1]);
        assert.equal(outcome.reels[1], outcome.reels[2]);
        assert.equal(outcome.pityCounter, 0); // Reset pity counter
    });

    test('pity counter increments on non-jackpots and resets on natural jackpots', () => {
        let pity = 0;
        const rng = createFeverRng(555);

        // Force sequence without pity threshold
        for (let i = 0; i < 10; i++) {
            const res = rollSlotReels(rng, pity, 9999);
            if (res.isJackpot) {
                assert.equal(res.pityCounter, 0);
                pity = 0;
            } else {
                assert.equal(res.pityCounter, pity + 1);
                pity = res.pityCounter;
            }
        }
    });
});

describe('Payout Calculations', () => {
    test('calculates correct jackpot tier, payout data and visual rank', () => {
        const payout = calculatePayout(['hyper-nitro', 'hyper-nitro', 'hyper-nitro']);
        assert.equal(payout.tier, 'jackpot');
        assert.equal(payout.symbol, 'hyper-nitro');
        assert.equal(payout.visualRank, 'FEVER_JACKPOT_SSS');
        assert.equal(payout.payout.type, 'nitro_boost');
        assert.equal(payout.payout.speedMultiplier, 2.2);
    });

    test('calculates correct partial match tier and consolation payout', () => {
        const partial = calculatePayout(['crab-rave-shield', 'crab-rave-shield', 'mega-mallet']);
        assert.equal(partial.tier, 'partial');
        assert.equal(partial.symbol, 'crab-rave-shield');
        assert.equal(partial.visualRank, 'FEVER_PARTIAL_S');
        assert.equal(partial.payout.invincibleSec, 2.5);

        const consolation = calculatePayout(['rubber-ducky-armada', 'mega-mallet', 'hyper-nitro']);
        assert.equal(consolation.tier, 'consolation');
        assert.equal(consolation.symbol, 'rubber-ducky-armada');
        assert.equal(consolation.visualRank, 'FEVER_CONSOLATION');
        assert.equal(consolation.payout.duckCount, 1);
    });
});

describe('Stunt Ramp Waterfall Golden Fever Chest Trigger', () => {
    test('createWaterfallFeverChest positions chest above ramp apex', () => {
        const ramp = { id: 'ramp_1', x: 2, y: 0, z: -400, height: 3.0, length: 10.0 };
        const chest = createWaterfallFeverChest(ramp, 3.5);

        assert.equal(chest.rampId, 'ramp_1');
        assert.equal(chest.x, 2);
        assert.equal(chest.y, 4.2); // 3.0 + 1.2
        assert.equal(chest.z, -405); // -400 - (10.0 * 0.5)
        assert.equal(chest.radius, 3.5);
        assert.equal(chest.collected, false);
    });

    test('evaluateFeverChestHit detects collision within radius', () => {
        const chest = { id: 'chest_1', x: 0, y: 4, z: -300, radius: 3.0, collected: false };
        const craftClose = { position: { x: 0.5, y: 4.2, z: -301 }, velocity: { x: 0, y: 8, z: -25 } };
        const craftFar = { position: { x: 10, y: 4, z: -300 }, velocity: { x: 0, y: 8, z: -25 } };

        assert.equal(evaluateFeverChestHit(craftClose, chest), true);
        assert.equal(evaluateFeverChestHit(craftFar, chest), false);
    });

    test('evaluateFeverChestHit ignores already collected chests or null crafts', () => {
        const chest = { id: 'chest_2', x: 0, y: 4, z: -300, radius: 3.0, collected: true };
        const craft = { position: { x: 0, y: 4, z: -300 } };
        assert.equal(evaluateFeverChestHit(craft, chest), false);
        assert.equal(evaluateFeverChestHit(null, chest), false);
    });
});

describe('Zero-Pause Slot Spinner Session Lifecycle', () => {
    test('createFeverJackpotSession initializes with target reels and active state', () => {
        const session = createFeverJackpotSession({ seed: 777 });
        assert.equal(session.active, true);
        assert.equal(session.completed, false);
        assert.equal(session.elapsedSec, 0);
        assert.equal(session.durationSec, 1.5);
        assert.equal(session.targetReels.length, 3);
        assert.deepEqual(session.locked, [false, false, false]);
    });

    test('stepFeverJackpotSession locks reels in staggered sequence without stopping raft', () => {
        const session = createFeverJackpotSession({
            seed: 1234,
            durationSec: 1.5,
            stopDelays: [0.7, 1.1, 1.5],
        });

        // Step 1: 0.3s -> All spinning
        const s1 = stepFeverJackpotSession(session, 0.3);
        assert.equal(s1.active, true);
        assert.equal(s1.completed, false);
        assert.deepEqual(s1.locked, [false, false, false]);

        // Step 2: +0.45s (0.75s total) -> Reel 0 locked
        const s2 = stepFeverJackpotSession(session, 0.45);
        assert.equal(s2.active, true);
        assert.deepEqual(s2.locked, [true, false, false]);
        assert.equal(s2.currentSymbols[0], session.targetReels[0]);

        // Step 3: +0.4s (1.15s total) -> Reel 0 and Reel 1 locked
        const s3 = stepFeverJackpotSession(session, 0.4);
        assert.equal(s3.active, true);
        assert.deepEqual(s3.locked, [true, true, false]);
        assert.equal(s3.currentSymbols[1], session.targetReels[1]);

        // Step 4: +0.4s (1.55s total) -> All reels locked and completed
        let completedOutcome = null;
        const s4 = stepFeverJackpotSession(session, 0.4, (outcome) => {
            completedOutcome = outcome;
        });

        assert.equal(s4.active, false);
        assert.equal(s4.completed, true);
        assert.deepEqual(s4.locked, [true, true, true]);
        assert.deepEqual(s4.currentSymbols, session.targetReels);
        assert.ok(s4.outcome && s4.outcome.tier);
        assert.ok(completedOutcome);
    });

    test('stepFeverJackpotSession is safe with zero or negative dt', () => {
        const session = createFeverJackpotSession({ seed: 100 });
        const res = stepFeverJackpotSession(session, 0);
        assert.equal(res.elapsedSec, 0);
        assert.equal(res.active, true);
    });
});

describe('Overhead Hologram 3D Transform Computation', () => {
    test('computes floating position directly above raft coordinates', () => {
        const session = createFeverJackpotSession();
        const raftPos = { x: -4, y: 1.5, z: -250 };
        const transform = getOverheadHologramTransform(session, raftPos, 1.0);

        assert.equal(transform.x, -4);
        assert.equal(transform.z, -250);
        // Base y = 1.5 + 3.2 = 4.7 (+ subtle sine wave offset)
        assert.ok(transform.y > 4.5 && transform.y < 4.9);
        assert.ok(transform.scale > 0);
        assert.ok(transform.opacity > 0);
    });

    test('pulses scale and glow on jackpot completion', () => {
        const session = createFeverJackpotSession({ pityCounter: 10 }); // Guaranteed jackpot
        session.completed = true;
        session.isJackpot = true;
        session.elapsedSec = 1.8;
        session.durationSec = 1.5;

        const transform = getOverheadHologramTransform(session, { x: 0, y: 0, z: 0 }, 2.0);
        assert.equal(transform.glowIntensity, 2.5);
        assert.ok(transform.scale >= 1.0);
    });
});

describe('Reward Application to Player Raft State', () => {
    test('applies gold coins reward to player state', () => {
        const player = { coins: 50 };
        const outcome = {
            tier: 'jackpot',
            symbol: 'triple-gold',
            summary: '+75 Gold Coins',
            payout: { type: 'coins', amount: 75 },
        };
        const receipt = applyFeverPayout(player, outcome);

        assert.equal(receipt.success, true);
        assert.equal(player.coins, 125);
        assert.equal(receipt.applied.totalCoins, 125);
    });

    test('applies Hyper Nitro boost to player state', () => {
        const player = {};
        const outcome = {
            tier: 'jackpot',
            symbol: 'hyper-nitro',
            summary: 'Nitro boost',
            payout: { type: 'nitro_boost', speedMultiplier: 2.2, durationSec: 4.0 },
        };
        const receipt = applyFeverPayout(player, outcome, 10000);

        assert.equal(receipt.success, true);
        assert.equal(player.nitroBoost.active, true);
        assert.equal(player.nitroBoost.speedMultiplier, 2.2);
        assert.equal(player.nitroBoost.expiresAt, 14000);
    });

    test('applies Mega Mallet buff to player state', () => {
        const player = {};
        const outcome = {
            tier: 'jackpot',
            symbol: 'mega-mallet',
            summary: 'Titan smash',
            payout: { type: 'mega_mallet', damageBonus: 60, aoeRadius: 8.0, durationSec: 6.0 },
        };
        const receipt = applyFeverPayout(player, outcome, 5000);

        assert.equal(receipt.success, true);
        assert.equal(player.megaMalletBuff.active, true);
        assert.equal(player.megaMalletBuff.damageBonus, 60);
        assert.equal(player.megaMalletBuff.aoeRadius, 8.0);
        assert.equal(player.megaMalletBuff.expiresAt, 11000);
    });

    test('applies Rubber Ducky Armada to player state', () => {
        const player = {};
        const outcome = {
            tier: 'jackpot',
            symbol: 'rubber-ducky-armada',
            summary: 'Quackstorm',
            payout: { type: 'ducky_armada', duckCount: 12, springboardBounceY: 22.0 },
        };
        const receipt = applyFeverPayout(player, outcome, 2000);

        assert.equal(receipt.success, true);
        assert.equal(player.duckyArmada.active, true);
        assert.equal(player.duckyArmada.duckCount, 12);
        assert.equal(player.duckyArmada.springboardBounceY, 22.0);
    });

    test('applies Crab Rave Shield to player state', () => {
        const player = {};
        const outcome = {
            tier: 'jackpot',
            symbol: 'crab-rave-shield',
            summary: 'Crab rave',
            payout: {
                type: 'crab_shield',
                invincibleSec: 5.0,
                reflectDamage: 40,
                discoCoinsDoubleSec: 8.0,
            },
        };
        const receipt = applyFeverPayout(player, outcome, 3000);

        assert.equal(receipt.success, true);
        assert.equal(player.crabShield.active, true);
        assert.equal(player.crabShield.invincibleUntil, 8000);
        assert.equal(player.crabShield.reflectDamage, 40);
        assert.equal(player.crabShield.doubleCoinsUntil, 11000);
    });

    test('handles invalid inputs gracefully', () => {
        const receipt = applyFeverPayout(null, null);
        assert.equal(receipt.success, false);
    });
});
