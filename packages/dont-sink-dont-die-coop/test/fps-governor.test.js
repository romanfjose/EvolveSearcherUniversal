import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    LOD_TIERS,
    DEFAULT_GOVERNOR_CONFIG,
    createFpsGovernor,
} from '../shared/fps-governor.js';

describe('Sovereign Core & Helmet 02: Frame-Budget & Dynamic LOD Governor', () => {
    describe('LOD_TIERS configuration and hierarchy', () => {
        it('defines all 4 cascading LOD tiers (ultra, high, medium, low) with strictly monotonic parameters', () => {
            assert.equal(LOD_TIERS.length, 4);

            const names = LOD_TIERS.map((t) => t.name);
            assert.deepEqual(names, ['ultra', 'high', 'medium', 'low']);

            for (let i = 0; i < LOD_TIERS.length; i++) {
                const tier = LOD_TIERS[i];
                assert.equal(tier.tier, i);
                assert.ok(tier.weatherParticleDensity > 0 && tier.weatherParticleDensity <= 1.0);
                assert.ok(tier.wakeRibbonSegments >= 10 && tier.wakeRibbonSegments <= 36);
                assert.ok(tier.distantTreeDrawDistance >= 80 && tier.distantTreeDrawDistance <= 350);

                if (i > 0) {
                    const prev = LOD_TIERS[i - 1];
                    // Lower tiers (higher index) must step down resource costs
                    assert.ok(tier.weatherParticleDensity < prev.weatherParticleDensity, `Tier ${i} particle density should be lower than Tier ${i - 1}`);
                    assert.ok(tier.wakeRibbonSegments < prev.wakeRibbonSegments, `Tier ${i} wake ribbon segments should be lower than Tier ${i - 1}`);
                    assert.ok(tier.distantTreeDrawDistance < prev.distantTreeDrawDistance, `Tier ${i} tree draw distance should be lower than Tier ${i - 1}`);
                }
            }

            // Verify lowest tier disables shadows for max frame stability
            assert.equal(LOD_TIERS[3].shadowsEnabled, false);
            assert.equal(LOD_TIERS[0].shadowsEnabled, true);
        });

        it('exports immutable frozen configurations', () => {
            assert.ok(Object.isFrozen(LOD_TIERS));
            for (const t of LOD_TIERS) {
                assert.ok(Object.isFrozen(t));
            }
            assert.ok(Object.isFrozen(DEFAULT_GOVERNOR_CONFIG));
        });
    });

    describe('Rolling frame window and FPS tracking', () => {
        it('tracks rolling average frame time and FPS across a 30-frame window', () => {
            const gov = createFpsGovernor({ windowSize: 30 });
            assert.equal(gov.getStatus().sampleCount, 0);

            // Feed 30 frames at solid 60 FPS (16.666ms)
            for (let i = 0; i < 30; i++) {
                gov.recordFrame(0.016666);
            }

            const status = gov.getStatus();
            assert.equal(status.sampleCount, 30);
            assert.equal(status.totalFramesRecorded, 30);
            assert.ok(Math.abs(status.rollingFps - 60) < 0.5, `Expected ~60 FPS, got ${status.rollingFps}`);
            assert.ok(Math.abs(status.avgFrameTimeMs - 16.666) < 0.2);
            assert.equal(status.tier, 0);
            assert.equal(status.tierName, 'ultra');
        });

        it('accepts frame times in either seconds (0.016) or milliseconds (16.66)', () => {
            const govSeconds = createFpsGovernor({ windowSize: 10 });
            const govMillis = createFpsGovernor({ windowSize: 10 });

            for (let i = 0; i < 10; i++) {
                govSeconds.recordFrame(0.016);
                govMillis.recordFrame(16.0);
            }

            assert.equal(govSeconds.getStatus().avgFrameTimeMs, 16.0);
            assert.equal(govMillis.getStatus().avgFrameTimeMs, 16.0);
            assert.equal(govSeconds.getStatus().rollingFps, govMillis.getStatus().rollingFps);
        });

        it('gracefully sanitizes non-finite, NaN, zero, and negative dt spikes to safe 60 FPS defaults', () => {
            const gov = createFpsGovernor({ windowSize: 5 });

            gov.recordFrame(NaN);
            gov.recordFrame(Infinity);
            gov.recordFrame(-0.05);
            gov.recordFrame(0);
            gov.recordFrame(null);

            const status = gov.getStatus();
            assert.equal(status.sampleCount, 5);
            assert.ok(Number.isFinite(status.rollingFps));
            assert.ok(Number.isFinite(status.avgFrameTimeMs));
            assert.ok(Math.abs(status.rollingFps - 60) < 1.0);
        });

        it('clamps extreme frame hitches (e.g. background tab pauses > 500ms) to prevent infinite average skew', () => {
            const gov = createFpsGovernor({ windowSize: 10 });

            // 9 normal frames
            for (let i = 0; i < 9; i++) {
                gov.recordFrame(0.0166);
            }
            // 1 extreme 15-second freeze
            gov.recordFrame(15.0);

            const status = gov.getStatus();
            // Hitch clamped to 500ms instead of 15,000ms
            assert.ok(status.avgFrameTimeMs < 75.0, `avgFrameTimeMs was ${status.avgFrameTimeMs}`);
        });
    });

    describe('Frame drop detection and automatic LOD step-down (FPS < 54)', () => {
        it('automatically steps down from Tier 0 (Ultra) to Tier 1 (High) when rolling FPS drops below 54 FPS', () => {
            let transitionEvent = null;
            const gov = createFpsGovernor({
                windowSize: 30,
                fpsDropThreshold: 54.0,
                stepDownCooldownFrames: 25,
            });

            gov.onTierChange((status, change) => {
                transitionEvent = change;
            });

            // 1. Establish stable baseline at 60 FPS (16.6ms)
            for (let i = 0; i < 20; i++) {
                gov.recordFrame(0.01666);
            }
            assert.equal(gov.getStatus().tier, 0);

            // 2. Introduce heavy frame times (22ms per frame = ~45 FPS)
            for (let i = 0; i < 15; i++) {
                gov.recordFrame(0.022);
            }

            const status = gov.getStatus();
            assert.equal(status.tier, 1, 'Should have stepped down to tier 1');
            assert.equal(status.tierName, 'high');
            assert.ok(status.rollingFps < 54.0, `Rolling FPS should be under 54, was ${status.rollingFps}`);
            assert.equal(status.isDropping, true);

            assert.ok(transitionEvent);
            assert.equal(transitionEvent.oldTier, 0);
            assert.equal(transitionEvent.newTier, 1);
            assert.equal(transitionEvent.reason, 'fps-drop');
        });

        it('progressively steps down through Tier 1 -> Tier 2 -> Tier 3 if frame rate remains suppressed', () => {
            const tierHistory = [];
            const gov = createFpsGovernor({
                windowSize: 30,
                fpsDropThreshold: 54.0,
                stepDownCooldownFrames: 10,
            });

            gov.onTierChange((_, change) => {
                tierHistory.push(change.newTier);
            });

            // Sustained heavy load (25ms per frame = 40 FPS)
            for (let i = 0; i < 60; i++) {
                gov.recordFrame(0.025);
            }

            const status = gov.getStatus();
            assert.equal(status.tier, 3, 'Should bottom out at Tier 3 (low)');
            assert.equal(status.tierName, 'low');
            assert.deepEqual(tierHistory, [1, 2, 3]);

            // Feed more heavy frames; must clamp at max tier (Tier 3) without overflow
            for (let i = 0; i < 20; i++) {
                gov.recordFrame(0.030);
            }
            assert.equal(gov.getStatus().tier, 3);
        });

        it('smoothly reduces weatherParticleDensity, wakeRibbonSegments, and distantTreeDrawDistance on step down', () => {
            const gov = createFpsGovernor({
                windowSize: 30,
                fpsDropThreshold: 54.0,
                stepDownCooldownFrames: 30,
                smoothingAlpha: 0.25,
            });

            const initial = gov.getStatus();
            assert.equal(initial.targetWeatherParticleDensity, 1.0);
            assert.equal(initial.targetWakeRibbonSegments, 36);
            assert.equal(initial.targetDistantTreeDrawDistance, 320);

            // Establish baseline then trigger single step down to tier 1
            for (let i = 0; i < 15; i++) {
                gov.recordFrame(0.0166);
            }
            for (let i = 0; i < 12; i++) {
                gov.recordFrame(0.025);
            }

            const afterStepDown = gov.getStatus();
            assert.equal(afterStepDown.tier, 1);
            assert.equal(afterStepDown.targetWeatherParticleDensity, 0.75);
            assert.equal(afterStepDown.targetWakeRibbonSegments, 24);
            assert.equal(afterStepDown.targetDistantTreeDrawDistance, 240);

            // Smoothed continuous values should be actively transitioning downward
            assert.ok(afterStepDown.weatherParticleDensity < 1.0);
            assert.ok(afterStepDown.wakeRibbonSegments < 36);
            assert.ok(afterStepDown.distantTreeDrawDistance < 320);
        });
    });

    describe('Smooth self-healing recovery (frame times stay under 12ms)', () => {
        it('steps back up smoothly when consecutive frame times stay under 12ms', () => {
            const gov = createFpsGovernor({
                windowSize: 30,
                recoveryThresholdMs: 12.0,
                recoveryFrameRequirement: 25,
                stepDownCooldownFrames: 5,
            });

            // 1. Force down to Tier 2 (Medium)
            gov.setTier(2);
            assert.equal(gov.getStatus().tier, 2);

            // 2. Feed blazing fast frames: 10ms (100 FPS) < 12ms recovery threshold
            const stepUpEvents = [];
            gov.onTierChange((status, change) => {
                if (change.reason === 'recovery') {
                    stepUpEvents.push(change);
                }
            });

            for (let i = 0; i < 35; i++) {
                gov.recordFrame(0.010); // 10ms
            }

            const status = gov.getStatus();
            assert.ok(status.tier < 2, `Tier should have recovered towards 0/1, was ${status.tier}`);
            assert.ok(stepUpEvents.length >= 1, 'Should have emitted recovery event');
            assert.equal(stepUpEvents[0].oldTier, 2);
            assert.equal(stepUpEvents[0].newTier, 1);
        });

        it('resets consecutive recovery counter if a single frame spikes above 12ms before requirement is met', () => {
            const gov = createFpsGovernor({
                windowSize: 30,
                recoveryThresholdMs: 12.0,
                recoveryFrameRequirement: 20,
            });

            gov.setTier(2);

            // 15 frames under 12ms
            for (let i = 0; i < 15; i++) {
                gov.recordFrame(0.009);
            }
            assert.equal(gov.getStatus().consecutiveRecoveryFrames, 15);
            assert.equal(gov.getStatus().tier, 2);

            // 1 hiccup frame at 14ms (> 12ms)
            gov.recordFrame(0.014);
            assert.equal(gov.getStatus().consecutiveRecoveryFrames, 0, 'Counter must reset on hiccup');
            assert.equal(gov.getStatus().tier, 2, 'Should not step up after hiccup');
        });

        it('recovers all the way back to Tier 0 (Ultra) under sustained high performance', () => {
            const gov = createFpsGovernor({
                windowSize: 30,
                recoveryThresholdMs: 12.0,
                recoveryFrameRequirement: 15,
            });

            gov.setTier(3);
            assert.equal(gov.getStatus().tier, 3);

            // Feed sustained 8ms frames (125 FPS)
            for (let i = 0; i < 60; i++) {
                gov.recordFrame(0.008);
            }

            const status = gov.getStatus();
            assert.equal(status.tier, 0, 'Should fully recover back to Tier 0 (Ultra)');
            assert.equal(status.tierName, 'ultra');
            assert.equal(status.targetWeatherParticleDensity, 1.0);
            assert.equal(status.targetWakeRibbonSegments, 36);
            assert.equal(status.targetDistantTreeDrawDistance, 320);
        });
    });

    describe('Manual overrides, snapping, reset, and lifecycle', () => {
        it('supports manual setTier pinning and clamps within configured minTier/maxTier', () => {
            const gov = createFpsGovernor({ minTier: 1, maxTier: 2 });

            gov.setTier(0); // below minTier -> clamps to 1
            assert.equal(gov.getStatus().tier, 1);

            gov.setTier(3); // above maxTier -> clamps to 2
            assert.equal(gov.getStatus().tier, 2);

            gov.setTier(1);
            assert.equal(gov.getStatus().tier, 1);
        });

        it('snapToCurrentTier immediately sets smoothed values to target values', () => {
            const gov = createFpsGovernor({ smoothingAlpha: 0.05 });
            gov.setTier(3);

            // Before snap, smoothed value lags
            assert.notEqual(gov.getStatus().weatherParticleDensity, 0.25);

            gov.snapToCurrentTier();
            assert.equal(gov.getStatus().weatherParticleDensity, 0.25);
            assert.equal(gov.getStatus().wakeRibbonSegments, 10);
            assert.equal(gov.getStatus().distantTreeDrawDistance, 90);
        });

        it('reset clears circular buffer, restores initial tier, and snaps values', () => {
            const gov = createFpsGovernor({ windowSize: 20 });

            for (let i = 0; i < 30; i++) {
                gov.recordFrame(0.030);
            }
            assert.ok(gov.getStatus().tier > 0);

            gov.reset();
            const resetStatus = gov.getStatus();
            assert.equal(resetStatus.tier, 0);
            assert.equal(resetStatus.sampleCount, 0);
            assert.equal(resetStatus.totalFramesRecorded, 0);
            assert.equal(resetStatus.consecutiveRecoveryFrames, 0);
            assert.equal(resetStatus.targetWeatherParticleDensity, 1.0);
        });

        it('listener unsubscribe removes callbacks cleanly', () => {
            const gov = createFpsGovernor();
            let callCount = 0;

            const unsubscribe = gov.onTierChange(() => {
                callCount++;
            });

            gov.setTier(1);
            assert.equal(callCount, 1);

            unsubscribe();
            gov.setTier(2);
            assert.equal(callCount, 1, 'Unsubscribed listener must not be called');
        });

        it('update alias functions identically to recordFrame', () => {
            const gov = createFpsGovernor();
            const s1 = gov.update(0.0166);
            assert.equal(s1.sampleCount, 1);
            assert.equal(s1.totalFramesRecorded, 1);
        });
    });
});
