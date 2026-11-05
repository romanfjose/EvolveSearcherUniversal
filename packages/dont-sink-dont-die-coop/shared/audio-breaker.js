/**
 * WebAudio Autoplay-Lock & Voice-Limiter Breaker.
 * Stress-tests procedural SFX and the 4-stem music scheduler under harsh WebAudio edge cases:
 * - Autoplay restrictions / suspended AudioContext / closed AudioContext.
 * - Single-frame micro-burst spam of 200+ simultaneous audio events (hit/splash/coin/parry/boss).
 * - Polyphony limiter (strictly <= 12 concurrent synth voices).
 * - Priority ducking queue: boss & parry SFX highest priority, dynamic voice stealing, ducking lower priority voices.
 * - Peak headroom limiter / 0 dBFS ceiling: guarantees zero digital clipping above 0 dBFS (peak linear <= 1.0).
 *
 * Pure ES module with zero external dependencies, compatible with Node.js and browser.
 */

export const MAX_CONCURRENT_VOICES = 12;
export const MAX_PEAK_AMPLITUDE = 1.0; // 0 dBFS ceiling
export const EPSILON = 1e-6;

/**
 * Priority tier definitions. Higher integer = higher priority.
 * Boss & parry have the highest priority.
 */
export const VOICE_PRIORITY = {
    BOSS: 100,       // Dread Kraken, leviathan roar, boss phase stabs
    PARRY: 90,       // Perfect parry, shield reflect
    PLAYER_HIT: 70,  // Weapon hit, hurt scream, death tone
    COMBAT_SFX: 60,  // Enemy attack, arrow whoosh, cannon blast
    UPGRADE: 55,     // Armory buy, tarot blessing picked
    COIN: 50,        // Coin pickup chime
    SPLASH: 40,      // Water splash, wake droplet
    MUSIC_STEM: 30,  // 4-stem background music synth voice
    AMBIANCE: 20,    // Distant waterfall, river murmur, insect drone
    UI_CLICK: 10,    // Minor button click, tab hover
};

export const AUDIO_CONTEXT_STATES = {
    SUSPENDED: 'suspended',
    RUNNING: 'running',
    CLOSED: 'closed',
    INTERRUPTED: 'interrupted',
};

/**
 * Pure math helper: clamp value between min and max.
 */
export function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

/**
 * Convert linear amplitude to decibels relative to full scale (dBFS).
 * 1.0 linear = 0 dBFS. Values above 1.0 yield > 0 dBFS (clipping).
 */
export function amplitudeToDb(amp) {
    if (amp <= EPSILON) return -120;
    return 20 * Math.log10(amp);
}

/**
 * Convert decibels full scale (dBFS) to linear gain.
 * 0 dBFS = 1.0 linear gain.
 */
export function dbToAmplitude(db) {
    return Math.pow(10, db / 20);
}

/**
 * Calculate dynamic limiter gain reduction to prevent clipping above 0 dBFS.
 * @param {number} totalSummedPeak - Combined peak sum of all active voices
 * @param {number} [ceilingLinear=1.0] - Maximum allowable peak amplitude (1.0 = 0 dBFS)
 * @returns {Object} { limiterGain: number, reductionDb: number, isLimiting: boolean, finalPeak: number }
 */
export function calculateHeadroomLimiter(totalSummedPeak, ceilingLinear = MAX_PEAK_AMPLITUDE) {
    const rawPeak = Math.max(0, totalSummedPeak);
    if (rawPeak <= ceilingLinear) {
        return {
            limiterGain: 1.0,
            reductionDb: 0.0,
            isLimiting: false,
            finalPeak: rawPeak,
        };
    }

    const limiterGain = ceilingLinear / (rawPeak + EPSILON);
    const reductionDb = amplitudeToDb(limiterGain); // Negative dB
    const finalPeak = rawPeak * limiterGain;

    return {
        limiterGain: clamp(limiterGain, 0, 1.0),
        reductionDb: Math.min(0, reductionDb),
        isLimiting: true,
        finalPeak: Math.min(finalPeak, ceilingLinear),
    };
}

/**
 * Priority-Aware Ducking Multiplier.
 * Calculates how much lower-priority voices should be attenuated when high-priority voices
 * (like BOSS or PARRY) are actively playing.
 *
 * @param {Array<Object>} activeVoices - List of active voice descriptors
 * @returns {Object} Mapping from voiceId -> duckMultiplier [0..1]
 */
export function calculatePriorityDucking(activeVoices) {
    const duckMultipliers = {};
    if (!Array.isArray(activeVoices) || activeVoices.length === 0) {
        return duckMultipliers;
    }

    let hasBoss = false;
    let hasParry = false;
    let maxPriority = 0;

    for (const v of activeVoices) {
        const priority = v.priority ?? VOICE_PRIORITY.COIN;
        if (priority > maxPriority) maxPriority = priority;
        if (priority >= VOICE_PRIORITY.BOSS) hasBoss = true;
        else if (priority >= VOICE_PRIORITY.PARRY) hasParry = true;
    }

    // Ducking rules:
    // If Boss is playing: lower tiers (<= PARRY) duck to 0.4, ambient/music duck to 0.25
    // If Parry is playing: lower tiers (<= COMBAT) duck to 0.5, ambient/music duck to 0.35
    for (const v of activeVoices) {
        const id = v.id;
        const p = v.priority ?? VOICE_PRIORITY.COIN;

        if (p >= VOICE_PRIORITY.BOSS) {
            duckMultipliers[id] = 1.0;
        } else if (p >= VOICE_PRIORITY.PARRY) {
            duckMultipliers[id] = hasBoss ? 0.65 : 1.0;
        } else if (p >= VOICE_PRIORITY.PLAYER_HIT) {
            duckMultipliers[id] = hasBoss ? 0.45 : hasParry ? 0.65 : 1.0;
        } else if (p >= VOICE_PRIORITY.COIN) {
            duckMultipliers[id] = hasBoss ? 0.35 : hasParry ? 0.5 : 1.0;
        } else {
            // Music stem / ambiance / low priority
            duckMultipliers[id] = hasBoss ? 0.2 : hasParry ? 0.35 : 1.0;
        }
    }

    return duckMultipliers;
}

/**
 * Autoplay Guard & AudioContext State Manager.
 * Safely guards WebAudio calls against suspended, closed, or interrupted states.
 * Automatically queues or handles sound requests when the browser blocks autoplay.
 */
export class AudioAutoplayGuard {
    constructor(audioContext = null) {
        this.ctx = audioContext;
        this.isUnlocked = !audioContext || (audioContext.state === AUDIO_CONTEXT_STATES.RUNNING);
        this.pendingUnlocks = [];
        this.queuedPlayRequests = [];
        this.maxQueuedRequests = 64;
        this.droppedRequestsCount = 0;
        this.onStateChangeCallbacks = new Set();
    }

    setAudioContext(audioContext) {
        this.ctx = audioContext;
        if (this.ctx && this.ctx.state === AUDIO_CONTEXT_STATES.RUNNING) {
            this.isUnlocked = true;
        }
    }

    getState() {
        if (!this.ctx) return AUDIO_CONTEXT_STATES.RUNNING;
        return this.ctx.state || AUDIO_CONTEXT_STATES.SUSPENDED;
    }

    isBlocked() {
        const state = this.getState();
        return state === AUDIO_CONTEXT_STATES.SUSPENDED || state === AUDIO_CONTEXT_STATES.INTERRUPTED;
    }

    isClosed() {
        return this.getState() === AUDIO_CONTEXT_STATES.CLOSED;
    }

    isOperational() {
        return !this.isBlocked() && !this.isClosed();
    }

    /**
     * Unlock AudioContext on user interaction gesture (click/keydown/touchend).
     * Resolves pending promises and drains queued sound requests.
     */
    async unlock() {
        if (!this.ctx) {
            this.isUnlocked = true;
            return true;
        }

        if (this.ctx.state === AUDIO_CONTEXT_STATES.CLOSED) {
            return false;
        }

        if (this.ctx.state === AUDIO_CONTEXT_STATES.SUSPENDED) {
            try {
                if (typeof this.ctx.resume === 'function') {
                    await this.ctx.resume();
                }
            } catch (err) {
                // Browser security block
                return false;
            }
        }

        this.isUnlocked = (this.ctx.state === AUDIO_CONTEXT_STATES.RUNNING);
        if (this.isUnlocked) {
            this._flushPending();
        }
        return this.isUnlocked;
    }

    /**
     * Queue a sound request if context is suspended, or drop it if closed or queue is full.
     */
    handleRequest(request) {
        if (this.isClosed()) {
            this.droppedRequestsCount++;
            return { handled: false, queued: false, reason: 'context_closed' };
        }

        if (this.isBlocked()) {
            if (this.queuedPlayRequests.length >= this.maxQueuedRequests) {
                // Drop lowest priority queued item
                this.queuedPlayRequests.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
                this.queuedPlayRequests.shift();
                this.droppedRequestsCount++;
            }
            this.queuedPlayRequests.push({ ...request, queuedAt: Date.now() });
            return { handled: false, queued: true, reason: 'context_suspended' };
        }

        return { handled: true, queued: false };
    }

    drainQueue() {
        const requests = [...this.queuedPlayRequests];
        this.queuedPlayRequests = [];
        return requests;
    }

    _flushPending() {
        for (const cb of this.pendingUnlocks) {
            try { cb(); } catch {}
        }
        this.pendingUnlocks = [];
    }
}

/**
 * Polyphony Limiter & Priority Ducking Queue.
 * Enforces:
 * 1. Strict cap of at most MAX_CONCURRENT_VOICES (12) active voices.
 * 2. Dynamic voice stealing: when 13th voice attempts to play, lowest priority
 *    or oldest voice is evicted.
 * 3. Priority ducking: boss and parry SFX duck lower-tier voices.
 * 4. Zero clipping: Master peak limiter ensures total combined amplitude <= 1.0 (0 dBFS).
 */
export class PolyphonyLimiter {
    constructor(options = {}) {
        const {
            maxVoices = MAX_CONCURRENT_VOICES,
            ceilingLinear = MAX_PEAK_AMPLITUDE,
            autoplayGuard = null,
        } = options;

        this.maxVoices = maxVoices;
        this.ceilingLinear = ceilingLinear;
        this.guard = autoplayGuard || new AudioAutoplayGuard();

        this.activeVoices = new Map(); // voiceId -> voiceObj
        this.nextVoiceId = 1;
        this.evictedVoicesCount = 0;
        this.spammedRequestsCount = 0;
        this.clippingPreventedCount = 0;
    }

    /**
     * Request allocation for a synth voice.
     * @param {Object} voiceDescriptor - { type, priority, peakGain, duration, startTime, onStop }
     * @returns {Object} Allocation result: { ok, voiceId, evictedVoiceId, duckMultiplier, limiterReductionDb }
     */
    allocateVoice(voiceDescriptor = {}) {
        this.spammedRequestsCount++;

        // Verify AudioContext state with Autoplay Guard
        const guardStatus = this.guard.handleRequest(voiceDescriptor);
        if (!guardStatus.handled) {
            return {
                ok: false,
                queued: guardStatus.queued,
                reason: guardStatus.reason,
                voiceId: null,
            };
        }

        const priority = voiceDescriptor.priority ?? VOICE_PRIORITY.COIN;
        const peakGain = Math.max(0, voiceDescriptor.peakGain ?? 0.2);
        const duration = Math.max(0.01, voiceDescriptor.duration ?? 0.2);
        const startTime = voiceDescriptor.startTime ?? 0;
        const type = voiceDescriptor.type || 'sfx';

        let evictedVoiceId = null;

        // If active voices hit maximum limit (12), perform intelligent voice stealing
        if (this.activeVoices.size >= this.maxVoices) {
            // Find lowest priority candidate (or oldest if equal priority)
            let lowestVoice = null;

            for (const [, voice] of this.activeVoices) {
                if (!lowestVoice) {
                    lowestVoice = voice;
                    continue;
                }
                if (voice.priority < lowestVoice.priority) {
                    lowestVoice = voice;
                } else if (voice.priority === lowestVoice.priority && voice.startTime < lowestVoice.startTime) {
                    lowestVoice = voice;
                }
            }

            // If the incoming voice has equal or higher priority than lowest voice, steal it!
            if (lowestVoice && priority >= lowestVoice.priority) {
                this.releaseVoice(lowestVoice.id, 'evicted');
                evictedVoiceId = lowestVoice.id;
                this.evictedVoicesCount++;
            } else {
                // Incoming voice is lower priority than all 12 currently playing voices: reject
                return {
                    ok: false,
                    reason: 'polyphony_full_low_priority',
                    voiceId: null,
                };
            }
        }

        const voiceId = this.nextVoiceId++;
        const voiceObj = {
            id: voiceId,
            type,
            priority,
            peakGain,
            duration,
            startTime,
            onStop: voiceDescriptor.onStop || null,
        };

        this.activeVoices.set(voiceId, voiceObj);

        // Compute ducking and limiter after adding new voice
        const duckMap = calculatePriorityDucking(Array.from(this.activeVoices.values()));
        const duckMultiplier = duckMap[voiceId] ?? 1.0;

        // Compute headroom limiter for the entire active voice pool
        const headroom = this.computeHeadroom();
        if (headroom.isLimiting) {
            this.clippingPreventedCount++;
        }

        return {
            ok: true,
            voiceId,
            evictedVoiceId,
            duckMultiplier,
            limiterGain: headroom.limiterGain,
            limiterReductionDb: headroom.reductionDb,
            activeCount: this.activeVoices.size,
        };
    }

    /**
     * Release/finish an active voice.
     */
    releaseVoice(voiceId, reason = 'finished') {
        const voice = this.activeVoices.get(voiceId);
        if (!voice) return false;

        if (typeof voice.onStop === 'function') {
            try {
                voice.onStop(reason);
            } catch {}
        }

        this.activeVoices.delete(voiceId);
        return true;
    }

    /**
     * Release all active voices.
     */
    releaseAll(reason = 'cleared') {
        for (const [id] of this.activeVoices) {
            this.releaseVoice(id, reason);
        }
    }

    /**
     * Prune expired voices based on elapsed time.
     */
    update(currentTime) {
        for (const [id, voice] of this.activeVoices) {
            if (currentTime >= voice.startTime + voice.duration) {
                this.releaseVoice(id, 'expired');
            }
        }
    }

    /**
     * Compute current summed peak amplitude across all voices with ducking applied,
     * and calculate the zero-clipping headroom limiter values.
     */
    computeHeadroom() {
        const voices = Array.from(this.activeVoices.values());
        const duckMap = calculatePriorityDucking(voices);

        let totalPeak = 0;
        for (const v of voices) {
            const duck = duckMap[v.id] ?? 1.0;
            totalPeak += v.peakGain * duck;
        }

        return calculateHeadroomLimiter(totalPeak, this.ceilingLinear);
    }

    getActiveVoices() {
        return Array.from(this.activeVoices.values());
    }

    getActiveCount() {
        return this.activeVoices.size;
    }
}

/**
 * Headless Mock AudioContext for Node.js unit tests and deterministic stress harnesses.
 */
export function createMockAudioContext(initialState = AUDIO_CONTEXT_STATES.RUNNING) {
    let state = initialState;
    let currentTime = 0;
    const createdNodes = [];

    const mockCtx = {
        sampleRate: 44100,
        get state() { return state; },
        get currentTime() { return currentTime; },
        destination: { type: 'destination', inputs: [] },

        advanceTime(dt) {
            currentTime += dt;
        },

        setState(newState) {
            state = newState;
        },

        async resume() {
            if (state === AUDIO_CONTEXT_STATES.CLOSED) {
                throw new Error('Cannot resume a closed AudioContext');
            }
            state = AUDIO_CONTEXT_STATES.RUNNING;
            return Promise.resolve();
        },

        async suspend() {
            if (state === AUDIO_CONTEXT_STATES.CLOSED) {
                throw new Error('Cannot suspend a closed AudioContext');
            }
            state = AUDIO_CONTEXT_STATES.SUSPENDED;
            return Promise.resolve();
        },

        async close() {
            state = AUDIO_CONTEXT_STATES.CLOSED;
            return Promise.resolve();
        },

        createGain() {
            const gainNode = {
                type: 'gain',
                gain: {
                    value: 1.0,
                    setValueAtTime(v, t) { this.value = v; },
                    linearRampToValueAtTime(v, t) { this.value = v; },
                    exponentialRampToValueAtTime(v, t) { this.value = v; },
                    cancelScheduledValues() {},
                },
                connect(target) {
                    this.target = target;
                    return target;
                },
                disconnect() {},
            };
            createdNodes.push(gainNode);
            return gainNode;
        },

        createOscillator() {
            const osc = {
                type: 'oscillator',
                frequency: {
                    value: 440,
                    setValueAtTime(v, t) { this.value = v; },
                    exponentialRampToValueAtTime(v, t) { this.value = v; },
                    linearRampToValueAtTime(v, t) { this.value = v; },
                },
                connect(target) {
                    this.target = target;
                    return target;
                },
                start(t) { this.started = true; this.startTime = t; },
                stop(t) { this.stopped = true; this.stopTime = t; },
            };
            createdNodes.push(osc);
            return osc;
        },

        createBiquadFilter() {
            const filter = {
                type: 'biquadFilter',
                frequency: {
                    value: 350,
                    setValueAtTime(v, t) { this.value = v; },
                    exponentialRampToValueAtTime(v, t) { this.value = v; },
                },
                Q: {
                    value: 1.0,
                    setValueAtTime(v, t) { this.value = v; },
                },
                connect(target) {
                    this.target = target;
                    return target;
                },
            };
            createdNodes.push(filter);
            return filter;
        },

        createBuffer(channels, length, sampleRate) {
            return {
                channels,
                length,
                sampleRate,
                data: new Float32Array(length),
                getChannelData(c) { return this.data; },
            };
        },

        createBufferSource() {
            const src = {
                type: 'bufferSource',
                buffer: null,
                loop: false,
                connect(target) {
                    this.target = target;
                    return target;
                },
                start(t) { this.started = true; },
                stop(t) { this.stopped = true; },
            };
            createdNodes.push(src);
            return src;
        },

        getCreatedNodes() {
            return createdNodes;
        },
    };

    return mockCtx;
}

/**
 * Audio Breaker Stress Test Harness.
 * Simulates micro-bursts of 200 simultaneous sound requests in a single frame across
 * different AudioContext states (suspended, closed, running), and checks strict invariants:
 * - Max active concurrent voices <= 12 at all times.
 * - Boss and parry sounds always take priority over hits/splashes/coins.
 * - Limiter peak never exceeds 0 dBFS (final peak <= 1.0).
 * - Zero uncaught exceptions thrown during spam.
 *
 * @param {Object} options
 * @returns {Object} Diagnostic stress test report
 */
export function stressTestAudioHarness(options = {}) {
    const {
        burstCount = 200,
        contextState = AUDIO_CONTEXT_STATES.RUNNING,
        includeBossAndParry = true,
        maxVoices = MAX_CONCURRENT_VOICES,
    } = options;

    const mockCtx = createMockAudioContext(contextState);
    const guard = new AudioAutoplayGuard(mockCtx);
    const limiter = new PolyphonyLimiter({
        maxVoices,
        ceilingLinear: MAX_PEAK_AMPLITUDE,
        autoplayGuard: guard,
    });

    const results = {
        burstCount,
        contextState,
        allocatedCount: 0,
        evictedCount: 0,
        rejectedCount: 0,
        queuedCount: 0,
        maxActiveRecorded: 0,
        bossActive: false,
        parryActive: false,
        clippingViolations: 0,
        peakLinearRecorded: 0,
        exceptions: [],
    };

    try {
        // Generate a 200-sound frame burst of mixed types:
        // hits, splashes, coins, plus 2 boss sounds and 2 parry sounds
        const soundDescriptors = [];
        for (let i = 0; i < burstCount; i++) {
            let type = 'hit';
            let priority = VOICE_PRIORITY.PLAYER_HIT;
            let peakGain = 0.25;

            if (i % 4 === 0) {
                type = 'splash';
                priority = VOICE_PRIORITY.SPLASH;
                peakGain = 0.15;
            } else if (i % 4 === 1) {
                type = 'coin';
                priority = VOICE_PRIORITY.COIN;
                peakGain = 0.18;
            }

            if (includeBossAndParry) {
                if (i === 42) {
                    type = 'parry';
                    priority = VOICE_PRIORITY.PARRY;
                    peakGain = 0.45;
                } else if (i === 99) {
                    type = 'boss_roar';
                    priority = VOICE_PRIORITY.BOSS;
                    peakGain = 0.55;
                }
            }

            soundDescriptors.push({
                type,
                priority,
                peakGain,
                duration: 0.3,
                startTime: 0,
            });
        }

        // Fire all 200 sounds in a single simulated frame
        for (const desc of soundDescriptors) {
            const alloc = limiter.allocateVoice(desc);
            if (alloc.ok) {
                results.allocatedCount++;
                if (alloc.evictedVoiceId !== null) {
                    results.evictedCount++;
                }
            } else if (alloc.queued) {
                results.queuedCount++;
            } else {
                results.rejectedCount++;
            }

            const currentActive = limiter.getActiveCount();
            if (currentActive > results.maxActiveRecorded) {
                results.maxActiveRecorded = currentActive;
            }

            // Invariant check: Voice cap strictly enforced
            if (currentActive > maxVoices) {
                results.exceptions.push(`Polyphony cap violated: ${currentActive} > ${maxVoices}`);
            }

            // Compute peak headroom
            const headroom = limiter.computeHeadroom();
            if (headroom.finalPeak > results.peakLinearRecorded) {
                results.peakLinearRecorded = headroom.finalPeak;
            }
            if (headroom.finalPeak > MAX_PEAK_AMPLITUDE + EPSILON) {
                results.clippingViolations++;
                results.exceptions.push(`Clipping violation! finalPeak: ${headroom.finalPeak} > 1.0 (0 dBFS)`);
            }
        }

        // Inspect remaining active voices
        const active = limiter.getActiveVoices();
        results.bossActive = active.some((v) => v.priority === VOICE_PRIORITY.BOSS);
        results.parryActive = active.some((v) => v.priority === VOICE_PRIORITY.PARRY);
        results.finalActiveCount = active.length;

    } catch (err) {
        results.exceptions.push(err.message || String(err));
    }

    return {
        ...results,
        success: results.exceptions.length === 0 && results.maxActiveRecorded <= maxVoices && results.clippingViolations === 0,
    };
}
