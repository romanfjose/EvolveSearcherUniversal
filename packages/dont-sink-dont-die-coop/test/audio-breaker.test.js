import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    MAX_CONCURRENT_VOICES,
    MAX_PEAK_AMPLITUDE,
    VOICE_PRIORITY,
    AUDIO_CONTEXT_STATES,
    clamp,
    amplitudeToDb,
    dbToAmplitude,
    calculateHeadroomLimiter,
    calculatePriorityDucking,
    AudioAutoplayGuard,
    PolyphonyLimiter,
    createMockAudioContext,
    stressTestAudioHarness,
} from '../shared/audio-breaker.js';

import {
    MUSIC_MODES,
    TRACK_LAYERS,
    calculateLayerWeights,
    smoothCrossfadeWeights,
} from '../shared/music-scheduler.js';

describe('Audio Breaker Constants & Priority Hierarchy', () => {
    test('MAX_CONCURRENT_VOICES is strictly 12', () => {
        assert.equal(MAX_CONCURRENT_VOICES, 12);
    });

    test('MAX_PEAK_AMPLITUDE is 1.0 (0 dBFS ceiling)', () => {
        assert.equal(MAX_PEAK_AMPLITUDE, 1.0);
    });

    test('Boss and Parry have top priority over combat, coins, and splashes', () => {
        assert.ok(VOICE_PRIORITY.BOSS > VOICE_PRIORITY.PARRY);
        assert.ok(VOICE_PRIORITY.PARRY > VOICE_PRIORITY.PLAYER_HIT);
        assert.ok(VOICE_PRIORITY.PLAYER_HIT > VOICE_PRIORITY.COIN);
        assert.ok(VOICE_PRIORITY.COIN > VOICE_PRIORITY.SPLASH);
        assert.ok(VOICE_PRIORITY.SPLASH > VOICE_PRIORITY.AMBIANCE);
    });

    test('AudioContext state definitions are standard', () => {
        assert.equal(AUDIO_CONTEXT_STATES.SUSPENDED, 'suspended');
        assert.equal(AUDIO_CONTEXT_STATES.RUNNING, 'running');
        assert.equal(AUDIO_CONTEXT_STATES.CLOSED, 'closed');
    });
});

describe('Math & Headroom Limiter (0 dBFS Ceiling)', () => {
    test('amplitudeToDb and dbToAmplitude perform accurate conversions', () => {
        assert.ok(Math.abs(amplitudeToDb(1.0) - 0.0) < 1e-6); // 1.0 = 0 dBFS
        assert.ok(Math.abs(amplitudeToDb(0.5) - (-6.0205999)) < 1e-4);
        assert.ok(Math.abs(dbToAmplitude(0.0) - 1.0) < 1e-6);
        assert.ok(Math.abs(dbToAmplitude(-6.0205999) - 0.5) < 1e-4);
    });

    test('calculateHeadroomLimiter allows signals at or below 1.0 without reduction', () => {
        const headroom = calculateHeadroomLimiter(0.85);
        assert.equal(headroom.isLimiting, false);
        assert.equal(headroom.limiterGain, 1.0);
        assert.equal(headroom.reductionDb, 0.0);
        assert.equal(headroom.finalPeak, 0.85);
    });

    test('calculateHeadroomLimiter scales down over-ceiling signals to exactly 1.0 (0 dBFS)', () => {
        const headroom = calculateHeadroomLimiter(2.5); // +7.96 dBFS overshoot
        assert.equal(headroom.isLimiting, true);
        assert.ok(headroom.limiterGain < 1.0);
        assert.ok(headroom.reductionDb < 0.0);
        assert.ok(Math.abs(headroom.finalPeak - 1.0) < 1e-5);
    });

    test('calculateHeadroomLimiter handles massive signal overload (e.g. 50.0 peak)', () => {
        const headroom = calculateHeadroomLimiter(50.0);
        assert.equal(headroom.isLimiting, true);
        assert.ok(headroom.finalPeak <= 1.0);
        assert.ok(headroom.reductionDb < -30);
    });
});

describe('Priority Ducking Queue Mathematics', () => {
    test('returns empty map for empty voice list', () => {
        assert.deepEqual(calculatePriorityDucking([]), {});
    });

    test('does not duck when only low or medium priority voices are playing', () => {
        const voices = [
            { id: 1, priority: VOICE_PRIORITY.COIN },
            { id: 2, priority: VOICE_PRIORITY.SPLASH },
        ];
        const duckMap = calculatePriorityDucking(voices);
        assert.equal(duckMap[1], 1.0);
        assert.equal(duckMap[2], 1.0);
    });

    test('parry voice ducks player hit, coin, and ambiance voices', () => {
        const voices = [
            { id: 1, priority: VOICE_PRIORITY.PARRY },
            { id: 2, priority: VOICE_PRIORITY.COIN },
            { id: 3, priority: VOICE_PRIORITY.AMBIANCE },
        ];
        const duckMap = calculatePriorityDucking(voices);
        assert.equal(duckMap[1], 1.0); // Parry unattenuated
        assert.ok(duckMap[2] <= 0.5, 'Coin should duck when parry plays');
        assert.ok(duckMap[3] <= 0.35, 'Ambiance should duck when parry plays');
    });

    test('boss voice aggressively ducks all lower tiers', () => {
        const voices = [
            { id: 10, priority: VOICE_PRIORITY.BOSS },
            { id: 11, priority: VOICE_PRIORITY.PARRY },
            { id: 12, priority: VOICE_PRIORITY.PLAYER_HIT },
            { id: 13, priority: VOICE_PRIORITY.COIN },
            { id: 14, priority: VOICE_PRIORITY.MUSIC_STEM },
        ];
        const duckMap = calculatePriorityDucking(voices);
        assert.equal(duckMap[10], 1.0); // Boss unattenuated
        assert.ok(duckMap[11] < 1.0);
        assert.ok(duckMap[12] <= 0.5);
        assert.ok(duckMap[13] <= 0.4);
        assert.ok(duckMap[14] <= 0.25);
    });
});

describe('AudioAutoplayGuard & State Transitions', () => {
    test('detects suspended AudioContext and queues requests', () => {
        const mockCtx = createMockAudioContext(AUDIO_CONTEXT_STATES.SUSPENDED);
        const guard = new AudioAutoplayGuard(mockCtx);

        assert.equal(guard.isBlocked(), true);
        assert.equal(guard.isOperational(), false);

        const res = guard.handleRequest({ type: 'hit', priority: VOICE_PRIORITY.PLAYER_HIT });
        assert.equal(res.handled, false);
        assert.equal(res.queued, true);
        assert.equal(guard.queuedPlayRequests.length, 1);
    });

    test('unlock() transitions suspended context to running and flushes queue', async () => {
        const mockCtx = createMockAudioContext(AUDIO_CONTEXT_STATES.SUSPENDED);
        const guard = new AudioAutoplayGuard(mockCtx);

        guard.handleRequest({ type: 'coin', priority: VOICE_PRIORITY.COIN });
        assert.equal(guard.queuedPlayRequests.length, 1);

        const unlocked = await guard.unlock();
        assert.equal(unlocked, true);
        assert.equal(guard.isBlocked(), false);
        assert.equal(mockCtx.state, AUDIO_CONTEXT_STATES.RUNNING);

        const drained = guard.drainQueue();
        assert.equal(drained.length, 1);
        assert.equal(guard.queuedPlayRequests.length, 0);
    });

    test('drops requests cleanly when AudioContext is closed', () => {
        const mockCtx = createMockAudioContext(AUDIO_CONTEXT_STATES.CLOSED);
        const guard = new AudioAutoplayGuard(mockCtx);

        assert.equal(guard.isClosed(), true);
        const res = guard.handleRequest({ type: 'boss', priority: VOICE_PRIORITY.BOSS });
        assert.equal(res.handled, false);
        assert.equal(res.queued, false);
        assert.equal(res.reason, 'context_closed');
        assert.equal(guard.droppedRequestsCount, 1);
    });
});

describe('PolyphonyLimiter: Strict 12-Voice Cap & Voice Stealing', () => {
    test('allocates up to 12 voices without rejection or eviction', () => {
        const limiter = new PolyphonyLimiter();

        for (let i = 0; i < 12; i++) {
            const res = limiter.allocateVoice({
                type: 'hit',
                priority: VOICE_PRIORITY.PLAYER_HIT,
                peakGain: 0.1,
                duration: 0.5,
                startTime: 0,
            });
            assert.equal(res.ok, true);
            assert.equal(res.evictedVoiceId, null);
        }

        assert.equal(limiter.getActiveCount(), 12);
    });

    test('steals lowest priority voice when 13th voice of higher priority arrives', () => {
        const limiter = new PolyphonyLimiter();

        // Fill with 11 coin sounds and 1 splash sound (lowest priority)
        let splashVoiceId = null;
        for (let i = 0; i < 11; i++) {
            limiter.allocateVoice({ type: 'coin', priority: VOICE_PRIORITY.COIN });
        }
        const splashAlloc = limiter.allocateVoice({ type: 'splash', priority: VOICE_PRIORITY.SPLASH });
        splashVoiceId = splashAlloc.voiceId;

        assert.equal(limiter.getActiveCount(), 12);

        // 13th voice: Boss roar arrives!
        const bossAlloc = limiter.allocateVoice({ type: 'boss', priority: VOICE_PRIORITY.BOSS });
        assert.equal(bossAlloc.ok, true);
        assert.equal(bossAlloc.evictedVoiceId, splashVoiceId, 'Should evict the splash voice');
        assert.equal(limiter.getActiveCount(), 12);
        assert.equal(limiter.evictedVoicesCount, 1);
    });

    test('rejects incoming voice if active pool is full and incoming priority is lower', () => {
        const limiter = new PolyphonyLimiter();

        // Fill with 12 boss voices
        for (let i = 0; i < 12; i++) {
            limiter.allocateVoice({ type: 'boss', priority: VOICE_PRIORITY.BOSS });
        }

        // Lowly splash sound tries to play
        const splashAlloc = limiter.allocateVoice({ type: 'splash', priority: VOICE_PRIORITY.SPLASH });
        assert.equal(splashAlloc.ok, false);
        assert.equal(splashAlloc.reason, 'polyphony_full_low_priority');
        assert.equal(limiter.getActiveCount(), 12);
    });

    test('prunes expired voices when update(currentTime) is called', () => {
        const limiter = new PolyphonyLimiter();
        limiter.allocateVoice({ type: 'short', duration: 0.1, startTime: 0 });
        limiter.allocateVoice({ type: 'long', duration: 1.0, startTime: 0 });

        assert.equal(limiter.getActiveCount(), 2);

        limiter.update(0.15); // after 150ms, first voice should be expired
        assert.equal(limiter.getActiveCount(), 1);

        limiter.update(1.2); // after 1.2s, all expired
        assert.equal(limiter.getActiveCount(), 0);
    });

    test('releaseAll cleans up every active voice', () => {
        const limiter = new PolyphonyLimiter();
        limiter.allocateVoice({ type: 'v1' });
        limiter.allocateVoice({ type: 'v2' });
        assert.equal(limiter.getActiveCount(), 2);
        limiter.releaseAll();
        assert.equal(limiter.getActiveCount(), 0);
    });
});

describe('Stress Test Harness: 200 Simultaneous SFX in 1 Frame', () => {
    test('stresses 200 simultaneous SFX under normal RUNNING state', () => {
        const report = stressTestAudioHarness({
            burstCount: 200,
            contextState: AUDIO_CONTEXT_STATES.RUNNING,
            includeBossAndParry: true,
        });

        assert.equal(report.success, true);
        assert.equal(report.burstCount, 200);
        assert.ok(report.maxActiveRecorded <= 12, `Active voices exceeded 12: ${report.maxActiveRecorded}`);
        assert.equal(report.clippingViolations, 0, 'Clipping violation occurred');
        assert.ok(report.peakLinearRecorded <= 1.0, `Peak exceeded 1.0: ${report.peakLinearRecorded}`);
        assert.equal(report.bossActive, true, 'Boss sound must survive and be active');
        assert.equal(report.parryActive, true, 'Parry sound must survive and be active');
        assert.equal(report.exceptions.length, 0);
    });

    test('stresses 200 simultaneous SFX when AudioContext is SUSPENDED (Autoplay locked)', () => {
        const report = stressTestAudioHarness({
            burstCount: 200,
            contextState: AUDIO_CONTEXT_STATES.SUSPENDED,
            includeBossAndParry: true,
        });

        assert.equal(report.success, true);
        assert.equal(report.allocatedCount, 0, 'No voices should allocate directly while suspended');
        assert.ok(report.queuedCount > 0, 'Requests must be queued safely');
        assert.equal(report.clippingViolations, 0);
        assert.equal(report.exceptions.length, 0);
    });

    test('stresses 200 simultaneous SFX when AudioContext is CLOSED', () => {
        const report = stressTestAudioHarness({
            burstCount: 200,
            contextState: AUDIO_CONTEXT_STATES.CLOSED,
            includeBossAndParry: true,
        });

        assert.equal(report.success, true);
        assert.equal(report.allocatedCount, 0);
        assert.equal(report.queuedCount, 0);
        assert.equal(report.rejectedCount, 200, 'All requests must reject cleanly without crash');
        assert.equal(report.exceptions.length, 0);
    });
});

describe('Integration with 4-Stem Music Scheduler Under Stress', () => {
    test('4-stem music scheduler weights combined with 12 SFX voices never clip 0 dBFS', () => {
        const musicWeights = calculateLayerWeights({ mode: MUSIC_MODES.COMBAT }).weights;
        // Combat stem total linear sum:
        const musicSum = musicWeights.bass + musicWeights.percussion + musicWeights.lead + musicWeights.brass;
        assert.ok(musicSum > 2.0, 'Raw uncompressed stems exceed 2.0');

        const limiter = new PolyphonyLimiter();
        // Allocate 8 heavy SFX voices on top of combat music
        for (let i = 0; i < 8; i++) {
            limiter.allocateVoice({
                type: 'combat_explosion',
                priority: VOICE_PRIORITY.COMBAT_SFX,
                peakGain: 0.4,
            });
        }

        const sfxHeadroom = limiter.computeHeadroom();
        const combinedSum = musicSum * 0.7 + sfxHeadroom.finalPeak;
        const finalLimiter = calculateHeadroomLimiter(combinedSum);

        assert.ok(finalLimiter.finalPeak <= 1.0, `Combined music + SFX must not exceed 0 dBFS ceiling: ${finalLimiter.finalPeak}`);
        assert.ok(finalLimiter.reductionDb <= 0.0);
    });
});
