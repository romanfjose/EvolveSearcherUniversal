/**
 * Procedural Multi-Track WebAudio Soundtrack & Spatial 3D Sound Engine.
 * Zero external audio assets required: 100% synthesized oscillators, white noise,
 * resonance filters, and stereo spatial panners.
 *
 * Layers:
 * 1. Bassline (Deep analog sub + FM punch)
 * 2. Percussion / Taiko drums (Synthesized kick, snare, hi-hat, taiko thud, and noise shakers)
 * 3. Arp / Lead (Arpeggiated melodic synth with envelope shaping)
 * 4. Danger Brass (Sawtooth brass stabs with resonant lowpass sweep)
 *
 * Dynamic Crossfades based on:
 * - Calm River Paddling vs. High-Speed Rapids
 * - Harbor City Shop Lo-Fi Lounge beat
 * - Boss / Leviathan Combat stems (enemy within 35m)
 *
 * Includes 3D spatial sound emitters for:
 * - River ambiance
 * - Waterfalls
 * - Police sirens
 * - Monster roars
 */

import {
    MUSIC_MODES,
    TRACK_LAYERS,
    MODE_BPM,
    MUSIC_PATTERNS,
    NOTE_FREQS,
    calculateLayerWeights,
    smoothCrossfadeWeights,
    calculateSpatialAudio,
    calculateRiverAmbianceSpatial,
    calculateWaterfallSpatial,
    calculatePoliceSirenSpatial,
    calculateMonsterRoarSpatial,
    getSequenceStep,
    clamp,
} from '../../../shared/music-scheduler.js';

export function createMusicEngine({ audioContext = null } = {}) {
    let ctx = audioContext;
    let masterGain = null;
    let musicMasterGain = null;
    let sfxMasterGain = null;
    let isMuted = false;
    let isRunning = false;
    let loopTimerId = null;

    // Track stem gain nodes
    const layerGains = {};
    let currentWeights = {
        [TRACK_LAYERS.BASS]: 0.7,
        [TRACK_LAYERS.PERCUSSION]: 0.3,
        [TRACK_LAYERS.LEAD]: 0.4,
        [TRACK_LAYERS.BRASS]: 0.0,
    };
    let targetWeights = { ...currentWeights };

    let currentMode = MUSIC_MODES.CALM;
    let stepTracker = {
        lastStepIndex: -1,
        startTime: 0,
    };

    // Shared procedural noise buffer for drum transients & river ambiance
    let noiseBuffer = null;

    function getAudioContext() {
        if (!ctx && typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                ctx = new AudioCtx();
            }
        }
        return ctx;
    }

    function initAudioGraph() {
        const audioCtx = getAudioContext();
        if (!audioCtx || masterGain) return;

        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.75, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);

        musicMasterGain = audioCtx.createGain();
        musicMasterGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
        musicMasterGain.connect(masterGain);

        sfxMasterGain = audioCtx.createGain();
        sfxMasterGain.gain.setValueAtTime(0.85, audioCtx.currentTime);
        sfxMasterGain.connect(masterGain);

        // Create individual stem layer gain nodes
        for (const layer of Object.values(TRACK_LAYERS)) {
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(currentWeights[layer], audioCtx.currentTime);
            gainNode.connect(musicMasterGain);
            layerGains[layer] = gainNode;
        }

        // Generate 2 seconds of pink/white noise buffer for percussion & ambiance
        const bufferSize = audioCtx.sampleRate * 2;
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Filter slightly for pink noise texture
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.15;
        }
    }

    /**
     * Unlock / resume AudioContext on user gesture
     */
    function unlock() {
        const audioCtx = getAudioContext();
        if (!audioCtx) return Promise.resolve();
        initAudioGraph();
        if (audioCtx.state === 'suspended') {
            return audioCtx.resume();
        }
        return Promise.resolve();
    }

    /**
     * Toggle Mute on/off
     */
    function toggleMute() {
        isMuted = !isMuted;
        if (masterGain && ctx) {
            const t = ctx.currentTime;
            masterGain.gain.cancelScheduledValues(t);
            masterGain.gain.linearRampToValueAtTime(isMuted ? 0 : 0.75, t + 0.05);
        }
        return isMuted;
    }

    function setMasterVolume(volume) {
        if (masterGain && ctx) {
            const t = ctx.currentTime;
            const target = isMuted ? 0 : clamp(volume, 0, 1) * 0.75;
            masterGain.gain.cancelScheduledValues(t);
            masterGain.gain.linearRampToValueAtTime(target, t + 0.05);
        }
    }

    // =========================================================================
    // Multi-track Synth Voice Generators
    // =========================================================================

    /**
     * Synth Voice 1: Deep Bass Note
     */
    function playBassNote(freq, startTime, duration = 0.25) {
        if (!ctx || !layerGains[TRACK_LAYERS.BASS] || !freq) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = currentMode === MUSIC_MODES.COMBAT ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(currentMode === MUSIC_MODES.COMBAT ? 450 : 280, startTime);
        filter.frequency.exponentialRampToValueAtTime(80, startTime + duration);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(filter).connect(gain).connect(layerGains[TRACK_LAYERS.BASS]);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    /**
     * Synth Voice 2: Percussion / Taiko Drum
     */
    function playPercussionHit(velocity, startTime, mode = MUSIC_MODES.CALM) {
        if (!ctx || !layerGains[TRACK_LAYERS.PERCUSSION] || velocity <= 0) return;

        if (mode === MUSIC_MODES.COMBAT || mode === MUSIC_MODES.RAPIDS) {
            // Heavy Taiko Drum Body
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const baseFreq = mode === MUSIC_MODES.COMBAT ? 120 : 150;
            osc.frequency.setValueAtTime(baseFreq, startTime);
            osc.frequency.exponentialRampToValueAtTime(32, startTime + 0.28);

            const v = velocity * (mode === MUSIC_MODES.COMBAT ? 0.7 : 0.55);
            gain.gain.setValueAtTime(v, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

            osc.connect(gain).connect(layerGains[TRACK_LAYERS.PERCUSSION]);
            osc.start(startTime);
            osc.stop(startTime + 0.32);
        } else if (mode === MUSIC_MODES.HARBOR_LOFI) {
            // Lo-Fi Rimshot / Hi-Hat Shaker
            if (noiseBuffer) {
                const noise = ctx.createBufferSource();
                noise.buffer = noiseBuffer;
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(3500, startTime);
                filter.Q.setValueAtTime(2.5, startTime);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(velocity * 0.25, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

                noise.connect(filter).connect(gain).connect(layerGains[TRACK_LAYERS.PERCUSSION]);
                noise.start(startTime);
                noise.stop(startTime + 0.09);
            }
        } else {
            // Calm River Water Shaker
            if (noiseBuffer) {
                const noise = ctx.createBufferSource();
                noise.buffer = noiseBuffer;
                const filter = ctx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.setValueAtTime(4500, startTime);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(velocity * 0.12, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

                noise.connect(filter).connect(gain).connect(layerGains[TRACK_LAYERS.PERCUSSION]);
                noise.start(startTime);
                noise.stop(startTime + 0.07);
            }
        }
    }

    /**
     * Synth Voice 3: Arp / Lead Melodic Synth
     */
    function playLeadNote(freq, startTime, duration = 0.2) {
        if (!ctx || !layerGains[TRACK_LAYERS.LEAD] || !freq) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = currentMode === MUSIC_MODES.HARBOR_LOFI ? 'sine' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(currentMode === MUSIC_MODES.HARBOR_LOFI ? 1800 : 3200, startTime);
        filter.Q.setValueAtTime(3.0, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.35, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(filter).connect(gain).connect(layerGains[TRACK_LAYERS.LEAD]);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
    }

    /**
     * Synth Voice 4: Danger Brass Stabs
     */
    function playBrassStab(freq, startTime, duration = 0.4) {
        if (!ctx || !layerGains[TRACK_LAYERS.BRASS] || !freq) return;
        // Dual oscillator for rich brass detune
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, startTime);
        osc2.frequency.setValueAtTime(freq * 1.008, startTime); // subtle chorus detune

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, startTime);
        filter.frequency.exponentialRampToValueAtTime(2400, startTime + 0.08); // Brass envelope bite
        filter.frequency.exponentialRampToValueAtTime(600, startTime + duration);
        filter.Q.setValueAtTime(4.0, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.45, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain).connect(layerGains[TRACK_LAYERS.BRASS]);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration + 0.05);
        osc2.stop(startTime + duration + 0.05);
    }

    /**
     * Dynamic state update called from the game loop:
     * Crossfades stem weights smoothly based on player speed, shop zone, and enemy combat proximity.
     */
    function update(dt, gameState = {}) {
        const {
            playerPos = null,
            speed = 0,
            enemies = null,
            forcedMode = null,
        } = gameState;

        const evaluated = calculateLayerWeights({
            playerPos,
            speed,
            enemies,
            forcedMode,
        });

        currentMode = evaluated.mode;
        targetWeights = evaluated.weights;

        // Smooth crossfading
        currentWeights = smoothCrossfadeWeights(currentWeights, targetWeights, dt, 3.5);

        // Apply updated gains to WebAudio stem nodes
        if (ctx) {
            const t = ctx.currentTime;
            for (const layer of Object.values(TRACK_LAYERS)) {
                if (layerGains[layer]) {
                    layerGains[layer].gain.cancelScheduledValues(t);
                    layerGains[layer].gain.setValueAtTime(clamp(currentWeights[layer], 0, 1), t);
                }
            }
        }

        return {
            mode: currentMode,
            weights: { ...currentWeights },
        };
    }

    /**
     * Main step scheduler loop: schedules notes ahead of time for jitter-free audio
     */
    function schedulerTick() {
        if (!isRunning || !ctx) return;

        const bpm = MODE_BPM[currentMode] || 120;
        const now = ctx.currentTime;
        if (stepTracker.startTime === 0) {
            stepTracker.startTime = now;
        }

        const elapsed = now - stepTracker.startTime;
        const { stepIndex, stepDuration } = getSequenceStep(elapsed, bpm);

        if (stepIndex !== stepTracker.lastStepIndex) {
            stepTracker.lastStepIndex = stepIndex;
            const patterns = MUSIC_PATTERNS[currentMode] || MUSIC_PATTERNS[MUSIC_MODES.CALM];
            const scheduleTime = now + 0.02; // Small lookahead

            // 1. Bassline
            const bassNote = patterns.bass[stepIndex];
            if (bassNote && NOTE_FREQS[bassNote]) {
                playBassNote(NOTE_FREQS[bassNote], scheduleTime, stepDuration * 1.8);
            }

            // 2. Percussion
            const percVelocity = patterns.percussion[stepIndex];
            if (percVelocity > 0) {
                playPercussionHit(percVelocity, scheduleTime, currentMode);
            }

            // 3. Lead / Arp
            const leadNote = patterns.lead[stepIndex];
            if (leadNote && NOTE_FREQS[leadNote]) {
                playLeadNote(NOTE_FREQS[leadNote], scheduleTime, stepDuration * 0.9);
            }

            // 4. Danger Brass
            const brassNote = patterns.brass[stepIndex];
            if (brassNote && NOTE_FREQS[brassNote]) {
                playBrassStab(NOTE_FREQS[brassNote], scheduleTime, stepDuration * 2.2);
            }
        }
    }

    function start() {
        if (isRunning) return;
        isRunning = true;
        unlock().then(() => {
            if (loopTimerId === null && typeof setInterval !== 'undefined') {
                loopTimerId = setInterval(schedulerTick, 25);
            }
        });
    }

    function stop() {
        isRunning = false;
        if (loopTimerId !== null) {
            clearInterval(loopTimerId);
            loopTimerId = null;
        }
    }

    // =========================================================================
    // Spatial 3D Sound Event Emitters
    // =========================================================================

    /**
     * Play spatial 3D procedural river water ambiance
     */
    function playSpatialRiverAmbiance(listener, emitterPos, options = {}) {
        if (!ctx || isMuted || !sfxMasterGain) return;
        const spatial = calculateRiverAmbianceSpatial(listener, { position: emitterPos });
        if (spatial.gain <= 0.005) return;

        const startTime = ctx.currentTime;
        const duration = options.duration || 0.4;

        if (noiseBuffer) {
            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;
            noise.loop = true;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(spatial.filterFreq, startTime);

            const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            if (panner) panner.pan.setValueAtTime(spatial.pan, startTime);

            const gain = ctx.createGain();
            const vol = spatial.gain * 0.22 * (options.volume || 1.0);
            gain.gain.setValueAtTime(0.001, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            let chain = noise.connect(filter);
            if (panner) {
                chain = chain.connect(panner);
            }
            chain.connect(gain).connect(sfxMasterGain);

            noise.start(startTime);
            noise.stop(startTime + duration + 0.05);
        }
    }

    /**
     * Play spatial 3D procedural waterfall roar
     */
    function playSpatialWaterfall(listener, emitterPos, options = {}) {
        if (!ctx || isMuted || !sfxMasterGain) return;
        const spatial = calculateWaterfallSpatial(listener, { position: emitterPos });
        if (spatial.gain <= 0.005) return;

        const startTime = ctx.currentTime;
        const duration = options.duration || 0.6;

        // Sub bass rumble + rushing noise
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(55, startTime);
        osc.frequency.linearRampToValueAtTime(42, startTime + duration);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(spatial.filterFreq, startTime);

        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (panner) panner.pan.setValueAtTime(spatial.pan, startTime);

        const gain = ctx.createGain();
        const vol = spatial.gain * 0.35 * (options.volume || 1.0);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        let chain = osc.connect(filter);
        if (panner) chain = chain.connect(panner);
        chain.connect(gain).connect(sfxMasterGain);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
    }

    /**
     * Play spatial 3D harbor police siren
     */
    function playSpatialPoliceSiren(listener, emitterPos, options = {}) {
        if (!ctx || isMuted || !sfxMasterGain) return;
        const spatial = calculatePoliceSirenSpatial(listener, { position: emitterPos });
        if (spatial.gain <= 0.005) return;

        const startTime = ctx.currentTime;
        const duration = options.duration || 0.8;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        // Classic two-tone siren wail
        osc.frequency.setValueAtTime(650, startTime);
        osc.frequency.linearRampToValueAtTime(920, startTime + duration * 0.5);
        osc.frequency.linearRampToValueAtTime(650, startTime + duration);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(spatial.filterFreq, startTime);

        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (panner) panner.pan.setValueAtTime(spatial.pan, startTime);

        const gain = ctx.createGain();
        const vol = spatial.gain * 0.28 * (options.volume || 1.0);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        let chain = osc.connect(filter);
        if (panner) chain = chain.connect(panner);
        chain.connect(gain).connect(sfxMasterGain);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
    }

    /**
     * Play spatial 3D Abyssal Leviathan / Swamp Behemoth monster roar
     */
    function playSpatialMonsterRoar(listener, emitterPos, options = {}) {
        if (!ctx || isMuted || !sfxMasterGain) return;
        const spatial = calculateMonsterRoarSpatial(listener, { position: emitterPos });
        if (spatial.gain <= 0.005) return;

        const startTime = ctx.currentTime;
        const duration = options.duration || 1.2;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';

        osc1.frequency.setValueAtTime(110, startTime);
        osc1.frequency.exponentialRampToValueAtTime(38, startTime + duration);
        osc2.frequency.setValueAtTime(55, startTime);
        osc2.frequency.exponentialRampToValueAtTime(26, startTime + duration);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(spatial.filterFreq, startTime);
        filter.Q.setValueAtTime(5.0, startTime);

        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (panner) panner.pan.setValueAtTime(spatial.pan, startTime);

        const gain = ctx.createGain();
        const vol = spatial.gain * 0.5 * (options.volume || 1.0);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        let chain = filter;
        if (panner) chain = chain.connect(panner);
        chain.connect(gain).connect(sfxMasterGain);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration + 0.05);
        osc2.stop(startTime + duration + 0.05);
    }

    return {
        unlock,
        toggleMute,
        setMasterVolume,
        start,
        stop,
        update,
        playSpatialRiverAmbiance,
        playSpatialWaterfall,
        playSpatialPoliceSiren,
        playSpatialMonsterRoar,
        // State inspectors
        getMode: () => currentMode,
        getWeights: () => ({ ...currentWeights }),
        isMuted: () => isMuted,
        isRunning: () => isRunning,
    };
}
