import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    NOTIFICATION_PRIORITIES,
    NOTIFICATION_QUEUE_CONFIG,
    filterCockpitNoise,
    formatLineOfSightStrokeReadout,
    calculateNotificationFootprint,
    createHudNotificationQueue,
    resetNoiseFilterHistory,
    countEmojis,
    isAllCapsTutorialParagraph,
} from '../shared/hud-Notification-Queue.js';

describe('Helmet 01 Cockpit Notification Queue & Telemetry Suite', () => {
    beforeEach(() => {
        resetNoiseFilterHistory();
    });

    describe('filterCockpitNoise: Zero Toast Spam & Viewport Protection', () => {
        it('blocks empty or whitespace-only notifications', () => {
            assert.equal(filterCockpitNoise(null).allowed, false);
            assert.equal(filterCockpitNoise('').allowed, false);
            assert.equal(filterCockpitNoise('   ').allowed, false);
            assert.equal(filterCockpitNoise({ text: '' }).allowed, false);
        });

        it('blocks emoji bloat (> 1 emoji)', () => {
            const spamNotification = '🔥🚣‍♂️🌊 TURBO ROWING ENGAGED!! 🚣‍♂️🌊';
            const res = filterCockpitNoise(spamNotification);
            assert.equal(res.allowed, false);
            assert.equal(res.reason, 'emoji_bloat');
            assert.ok(res.emojiCount > 1);
        });

        it('allows single tasteful icon or non-bloated message', () => {
            const cleanNotification = '⚓ DOCKED AT PIER';
            const res = filterCockpitNoise(cleanNotification);
            assert.equal(res.allowed, true);
            assert.equal(res.sanitized.text, '⚓ DOCKED AT PIER');
        });

        it('blocks all-caps tutorial paragraphs and lengthy wall-of-text explanations', () => {
            const essay = 'REMEMBER TO ALWAYS PRESS AND HOLD THE W KEY TO PADDLE FORWARD IN RHYTHM AND AVOID WHIRLPOOLS AT ALL COSTS';
            const res = filterCockpitNoise(essay);
            assert.equal(res.allowed, false);
            assert.equal(res.reason, 'all_caps_tutorial_paragraph');
        });

        it('blocks repetitive stroke and combat button prompt noise', () => {
            const prompts = [
                'PRESS [W] TO STROKE AGAIN',
                'tap w to paddle',
                'SWING OAR TO HIT ENEMY',
                'Tutorial: how to play the game',
            ];

            for (const p of prompts) {
                const res = filterCockpitNoise(p);
                assert.equal(res.allowed, false, `Expected prompt to be blocked: "${p}"`);
            }
        });

        it('permits critical game-over and boss signals even in uppercase', () => {
            const krakenAlert = 'DREAD KRAKEN AWAKENS!';
            const resKraken = filterCockpitNoise({ text: krakenAlert, priority: NOTIFICATION_PRIORITIES.CRITICAL });
            assert.equal(resKraken.allowed, true);

            const victoryAlert = 'VICTORY ESCAPE!';
            const resVictory = filterCockpitNoise(victoryAlert);
            assert.equal(resVictory.allowed, true);
        });

        it('rate-limits duplicate or identical rapid toasts to prevent spam', () => {
            const now = 10000;
            const first = filterCockpitNoise('SPEED BOOST ACTIVE', now);
            assert.equal(first.allowed, true);

            const rapidDuplicate = filterCockpitNoise('SPEED BOOST ACTIVE', now + 200);
            assert.equal(rapidDuplicate.allowed, false);
            assert.equal(rapidDuplicate.reason, 'rate_limited');

            const afterCooldown = filterCockpitNoise('SPEED BOOST ACTIVE', now + 2000);
            assert.equal(afterCooldown.allowed, true);
        });
    });

    describe('formatLineOfSightStrokeReadout: Subtle In-Place Feedback', () => {
        it('returns 100% steady tabular telemetry when motor upgrade is installed', () => {
            const res = formatLineOfSightStrokeReadout({ hasMotor: true });
            assert.equal(res.mode, 'motor');
            assert.equal(res.efficiencyPct, 100);
            assert.equal(res.tabularReadout, 'MTR 100%');
            assert.equal(res.inPowerWindow, true);
        });

        it('returns choked mode and penalized efficiency when chokedTimer > 0', () => {
            const res = formatLineOfSightStrokeReadout({ chokedTimer: 0.20 });
            assert.equal(res.mode, 'choked');
            assert.ok(res.efficiencyPct < 40);
            assert.ok(res.tabularReadout.startsWith('CHK'));
            assert.equal(res.inPowerWindow, false);
        });

        it('returns catch state when active stroke is just starting (elapsed < pullStart)', () => {
            const res = formatLineOfSightStrokeReadout({
                active: true,
                elapsed: 0.02,
                pullStart: 0.05,
                pullEnd: 0.62,
            });
            assert.equal(res.mode, 'pull');
            assert.equal(res.efficiencyPct, 10);
            assert.equal(res.tabularReadout, 'CATCH 10%');
            assert.equal(res.inPowerWindow, false);
        });

        it('returns sinusoidal power pull curve during hydrodynamic pull window', () => {
            // Midpoint of pull window: (0.05 + 0.62) / 2 = 0.335
            const resMid = formatLineOfSightStrokeReadout({
                active: true,
                elapsed: 0.335,
                pullStart: 0.05,
                pullEnd: 0.62,
            });
            assert.equal(resMid.mode, 'pull');
            assert.ok(resMid.efficiencyPct >= 95, `Expected high peak efficiency, got ${resMid.efficiencyPct}`);
            assert.equal(resMid.inPowerWindow, true);
            assert.ok(resMid.tabularReadout.startsWith('PULL'));
        });

        it('returns recovery glide mode when active stroke is past pullEnd', () => {
            const res = formatLineOfSightStrokeReadout({
                active: true,
                elapsed: 0.70,
                duration: 0.84,
                pullStart: 0.05,
                pullEnd: 0.62,
            });
            assert.equal(res.mode, 'glide');
            assert.ok(res.efficiencyPct > 0 && res.efficiencyPct <= 50);
            assert.ok(res.tabularReadout.startsWith('GLD'));
            assert.equal(res.inPowerWindow, false);
        });

        it('returns neutral coast idle state when not active', () => {
            const res = formatLineOfSightStrokeReadout({ active: false });
            assert.equal(res.mode, 'idle');
            assert.equal(res.efficiencyPct, 0);
            assert.equal(res.tabularReadout, 'IDLE --%');
            assert.equal(res.inPowerWindow, false);
        });
    });

    describe('Viewport HUD Footprint & Budget Constraints (< 8%)', () => {
        it('guarantees maximum active notification footprint is well under 8% on 1440x900', () => {
            const footprint = calculateNotificationFootprint(3, 1440, 900);
            assert.ok(footprint.areaRatio < 0.08, `Expected < 0.08, got ${footprint.areaRatio}`);
            assert.equal(footprint.isUnderBudget, true);
        });

        it('guarantees footprint is under 8% even on small 844x390 mobile landscape', () => {
            const footprint = calculateNotificationFootprint(2, 844, 390);
            assert.ok(footprint.areaRatio < 0.08, `Expected < 0.08 on mobile, got ${footprint.areaRatio}`);
            assert.equal(footprint.isUnderBudget, true);
        });
    });

    describe('createHudNotificationQueue: Lifecycle & Capacity Management', () => {
        it('enqueues valid notifications and promotes up to maxActive', () => {
            const q = createHudNotificationQueue({ maxActive: 2 });
            const now = 50000;

            const n1 = q.enqueue('ITEM 1 SECURED', now);
            const n2 = q.enqueue('ITEM 2 SECURED', now + 10);
            const n3 = q.enqueue('ITEM 3 SECURED', now + 20);

            assert.ok(n1);
            assert.ok(n2);
            assert.ok(n3);

            assert.equal(q.getActive().length, 2);
            assert.equal(q.getQueued().length, 1);
            assert.equal(q.size, 3);
        });

        it('automatically promotes queued items when active ones expire', () => {
            const q = createHudNotificationQueue({ maxActive: 1 });
            const t0 = 1000;

            q.enqueue({ text: 'FIRST NOTICE', duration: 1000 }, t0);
            q.enqueue({ text: 'SECOND NOTICE', duration: 1000 }, t0 + 10);

            assert.equal(q.getActive()[0].text, 'FIRST NOTICE');

            // Fast forward past first duration
            q.update(t0 + 1500);

            assert.equal(q.getActive().length, 1);
            assert.equal(q.getActive()[0].text, 'SECOND NOTICE');
        });

        it('supports explicit dismissal by id and queue clearing', () => {
            const q = createHudNotificationQueue();
            const n1 = q.enqueue('NOTICE A');
            const n2 = q.enqueue('NOTICE B');

            assert.equal(q.size, 2);
            assert.equal(q.dismiss(n1.id), true);
            assert.equal(q.size, 1);

            q.clear();
            assert.equal(q.size, 0);
            assert.equal(q.getActive().length, 0);
            assert.equal(q.getQueued().length, 0);
        });

        it('discards noise items on enqueue without polluting the queue', () => {
            const q = createHudNotificationQueue();
            const rejected = q.enqueue('🚨🚨🚨 SPAM ALERT 🚨🚨🚨');
            assert.equal(rejected, null);
            assert.equal(q.size, 0);
        });
    });
});
