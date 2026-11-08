/**
 * Procedural WebAudio Physical Sound Effects Engine
 * (`public/js/audio-sfx.js`)
 *
 * Sovereign Core & Videogame Helmet 06 (Synthetic José World-Believability & Immersion Director):
 * "Broken Promises & Dead Vacuums: Everything placed in the world makes an implicit promise to the player's senses."
 *
 * Implements 100% procedural, weight-matched WebAudio synthesis for acoustic-physical cause-and-effect:
 * - Hollow wood thud when landing on safe planks / harbor promenade piers
 * - Rubber-tube slap and heavy water plunge when splashing back into the river
 * - Pressurized low-frequency vortex rumble in whirlpools and turbulent rapids
 * - Material-specific impact acoustics: organic wood splinter crunch vs metallic hull clangs
 * - Harbor City diegetic law enforcement acoustics: wailing police sirens and supersonic gunshot cracks
 * - Backward-compatible API for legacy game loops: hit, hurt, kill, wave, splash, down, upgrade, toggle, unlock
 *
 * Zero external audio assets required: 100% synthesized oscillators, white/pink noise buffers, and biquad filters.
 */

export function createSfx(options = {}) {
    let ctx = options.audioContext || null;
    let muted = Boolean(options.muted);
    let sfxVolume = Number.isFinite(options.volume) ? options.volume : 1.0;
    let squeakyVolume = Number.isFinite(options.squeakyVolume) ? options.squeakyVolume : 1.25;

    // Cache pre-generated 1-second white noise buffer for crisp procedural cracks, splinters & turbulence
    let noiseBuffer = null;
    const getNoiseBuffer = () => {
        if (!ctx) return null;
        if (noiseBuffer) return noiseBuffer;
        try {
            const bufferSize = ctx.sampleRate * 1.5;
            noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
            return noiseBuffer;
        } catch {
            return null;
        }
    };

    /**
     * Internal tone generator with randomized pitch jitter and lowpass filtering.
     * Enforces Sovereign Sound & Atmosphere constraints (< 850 Hz cutoff on impacts).
     */
    const tone = ({
        from,
        to = from,
        dur = 0.12,
        type = 'triangle',
        gain = 0.12,
        delay = 0,
        lpFreq = 780,
    } = {}) => {
        if (muted || !ctx || ctx.state === 'closed') return;
        try {
            const pitchJitter = 0.9 + Math.random() * 0.2;
            const t = ctx.currentTime + delay;
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const g = ctx.createGain();

            osc.type = type === 'square' || type === 'sawtooth' ? 'triangle' : type;
            osc.frequency.setValueAtTime(Math.max(30, from * pitchJitter), t);
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, to * pitchJitter), t + dur);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(lpFreq, t);

            const targetGain = Math.min(0.35, gain * sfxVolume);
            g.gain.setValueAtTime(Math.max(0.0001, targetGain), t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

            osc.connect(filter).connect(g).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        } catch {
            // Defensive catch against edge-case audio context aborts
        }
    };

    /**
     * Procedural noise burst generator with bandpass/lowpass shaping
     */
    const noiseBurst = ({
        dur = 0.08,
        filterType = 'bandpass',
        filterFreq = 800,
        q = 1.0,
        gain = 0.15,
        delay = 0,
    } = {}) => {
        if (muted || !ctx || ctx.state === 'closed') return;
        const buf = getNoiseBuffer();
        if (!buf) return;

        try {
            const t = ctx.currentTime + delay;
            const src = ctx.createBufferSource();
            src.buffer = buf;

            const filter = ctx.createBiquadFilter();
            filter.type = filterType;
            filter.frequency.setValueAtTime(filterFreq, t);
            filter.Q.setValueAtTime(q, t);

            const g = ctx.createGain();
            const targetGain = Math.min(0.4, gain * sfxVolume);
            g.gain.setValueAtTime(targetGain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

            src.connect(filter).connect(g).connect(ctx.destination);
            src.start(t);
            src.stop(t + dur + 0.02);
        } catch {
            // Defensive catch
        }
    };

    return {
        getAudioContext: () => ctx,
        isMuted: () => muted,
        setMuted(val) {
            muted = Boolean(val);
            return muted;
        },
        getVolume: () => sfxVolume,
        setVolume(vol) {
            if (Number.isFinite(vol)) sfxVolume = Math.max(0, Math.min(2, vol));
        },
        getSqueakyVolume: () => squeakyVolume,
        setSqueakyVolume(vol) {
            if (Number.isFinite(vol)) squeakyVolume = Math.max(0, Math.min(2, vol));
        },
        unlock() {
            if (typeof AudioContext !== 'undefined') {
                ctx ??= new AudioContext();
            }
            if (ctx && ctx.state === 'suspended') {
                ctx.resume();
            }
            return ctx;
        },
        toggle() {
            muted = !muted;
            return muted;
        },

        // =========================================================================
        // HELMET 06: PHYSICAL ACOUSTIC CONSEQUENCE & BELIEVABILITY
        // =========================================================================

        /**
         * Hollow Wood Thud: Deep resonant impact when landing on safe dock planks or pier decking.
         * Dual harmonic body resonance (85 Hz -> 42 Hz) with wood deck body knock.
         */
        woodThud(strength = 1.0) {
            const s = Math.max(0.2, Math.min(2.0, strength));
            // Deep acoustic wood hollow resonance
            tone({ from: 135, to: 44, dur: 0.18, type: 'triangle', gain: 0.22 * s, lpFreq: 420 });
            // Secondary wooden plank harmonic slap
            tone({ from: 260, to: 95, dur: 0.09, type: 'sine', gain: 0.12 * s, delay: 0.015, lpFreq: 650 });
            // Subtle wood grain friction click
            noiseBurst({ dur: 0.04, filterType: 'bandpass', filterFreq: 680, q: 2.5, gain: 0.08 * s });
        },

        /**
         * Rubber-Tube Slap & Water Plunge: Distinct acoustic feedback when slamming back into the river.
         * High taut rubber slap transient followed by a deep gurgling water cavity displacement.
         */
        rubberSlap(strength = 1.0) {
            const s = Math.max(0.2, Math.min(2.0, strength));
            // Taut rubber membrane slap (sharp high transient)
            tone({ from: 380, to: 160, dur: 0.05, type: 'triangle', gain: 0.16 * s, lpFreq: 850 });
            // Compressed air pocket inside PVC chamber
            tone({ from: 180, to: 75, dur: 0.12, type: 'sine', gain: 0.14 * s, delay: 0.02, lpFreq: 500 });
            // Water foam spray
            noiseBurst({ dur: 0.14, filterType: 'lowpass', filterFreq: 580, q: 1.0, gain: 0.12 * s, delay: 0.025 });
        },

        /**
         * Water Plunge: Heavy hydrodynamic displacement when falling from height into deep river channel.
         */
        waterPlunge(strength = 1.0) {
            const s = Math.max(0.2, Math.min(2.0, strength));
            // Low sub-bass cavity bubble
            tone({ from: 92, to: 34, dur: 0.35, type: 'sine', gain: 0.24 * s, lpFreq: 320 });
            // Mid water surge whoosh
            tone({ from: 210, to: 65, dur: 0.22, type: 'triangle', gain: 0.15 * s, delay: 0.02, lpFreq: 480 });
            // Frothing whitewater displacement
            noiseBurst({ dur: 0.25, filterType: 'bandpass', filterFreq: 420, q: 1.2, gain: 0.16 * s, delay: 0.04 });
        },

        /**
         * Pressurized Whirlpool / Rapids Rumble: Low vortex frequency suction and turbulent froth.
         */
        whirlpoolRumble(intensity = 1.0) {
            const s = Math.max(0.2, Math.min(1.8, intensity));
            // Low churning sub-bass vortex (< 120 Hz)
            tone({ from: 68, to: 38, dur: 0.38, type: 'triangle', gain: 0.20 * s, lpFreq: 260 });
            // Pressurized swirling cavitation
            noiseBurst({ dur: 0.32, filterType: 'bandpass', filterFreq: 310, q: 3.5, gain: 0.14 * s });
        },

        /**
         * Rapids Rumble: Rapid whitewater frothing and bubbling under hull.
         */
        rapidsRumble(speedNorm = 1.0) {
            const s = Math.max(0.2, Math.min(1.5, speedNorm));
            tone({ from: 110, to: 55, dur: 0.16, type: 'triangle', gain: 0.12 * s, lpFreq: 380 });
            noiseBurst({ dur: 0.18, filterType: 'bandpass', filterFreq: 520, q: 1.8, gain: 0.10 * s });
        },

        /**
         * Wood Splinter Crunch: Breaking timber or colliding with riverbank pine trees.
         */
        woodSplinter(strength = 1.0) {
            const s = Math.max(0.2, Math.min(2.0, strength));
            // Bark cracking and fibrous stress fracture
            noiseBurst({ dur: 0.07, filterType: 'highpass', filterFreq: 450, q: 2.0, gain: 0.18 * s });
            // Dull wooden body shudder
            tone({ from: 165, to: 58, dur: 0.14, type: 'triangle', gain: 0.19 * s, delay: 0.015, lpFreq: 540 });
            // Secondary splinter crack
            noiseBurst({ dur: 0.05, filterType: 'bandpass', filterFreq: 750, q: 4.0, gain: 0.12 * s, delay: 0.04 });
        },

        /**
         * Metal Clang / Shield Deflect: Iron hull armor impact, buoy collision, or parry.
         */
        metalClang(strength = 1.0) {
            const s = Math.max(0.2, Math.min(2.0, strength));
            // Metallic ring fundamental
            tone({ from: 680, to: 620, dur: 0.22, type: 'sine', gain: 0.15 * s, lpFreq: 850 });
            // Metallic overtone harmonic
            tone({ from: 1040, to: 980, dur: 0.14, type: 'triangle', gain: 0.09 * s, lpFreq: 850 });
            // Heavy anvil body thud
            tone({ from: 140, to: 52, dur: 0.15, type: 'triangle', gain: 0.18 * s, lpFreq: 420 });
        },

        /**
         * Police Siren: Harbor City cruiser siren wail when law enforcement aggros on threats.
         */
        policeSiren(duration = 0.6) {
            if (muted || !ctx || ctx.state === 'closed') return;
            try {
                const startTime = ctx.currentTime;
                const osc = ctx.createOscillator();
                const filter = ctx.createBiquadFilter();
                const g = ctx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(640, startTime);
                osc.frequency.linearRampToValueAtTime(880, startTime + duration * 0.5);
                osc.frequency.linearRampToValueAtTime(640, startTime + duration);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(840, startTime);

                const vol = Math.min(0.22, 0.14 * sfxVolume);
                g.gain.setValueAtTime(0.001, startTime);
                g.gain.linearRampToValueAtTime(vol, startTime + 0.04);
                g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

                osc.connect(filter).connect(g).connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration + 0.02);
            } catch {
                // Defensive catch
            }
        },

        /**
         * Gunshot Crack: Supersonic muzzle report when harbor police fire tracers at Mud Alien.
         */
        gunshotCrack(volume = 1.0) {
            const s = Math.max(0.2, Math.min(2.0, volume));
            // Supersonic ballistic crack transient (punchy noise spike)
            noiseBurst({ dur: 0.04, filterType: 'bandpass', filterFreq: 820, q: 3.0, gain: 0.25 * s });
            // Powder detonation blast thud
            tone({ from: 240, to: 42, dur: 0.14, type: 'triangle', gain: 0.22 * s, lpFreq: 520 });
            // Canyon echo dissipation
            noiseBurst({ dur: 0.18, filterType: 'lowpass', filterFreq: 420, q: 1.0, gain: 0.08 * s, delay: 0.03 });
        },

        // =========================================================================
        // LEGACY COMPATIBILITY METHODS
        // =========================================================================

        hit(squeaky, volume = 1) {
            if (squeaky) {
                const sqVol = volume * squeakyVolume;
                tone({ from: 420, to: 580, dur: 0.08, type: 'sine', gain: 0.09 * sqVol, lpFreq: 850 });
                tone({ from: 580, to: 380, dur: 0.07, type: 'sine', gain: 0.07 * sqVol, delay: 0.06, lpFreq: 750 });
            } else {
                tone({ from: 190, to: 68, dur: 0.11, type: 'triangle', gain: 0.18 * volume, lpFreq: 520 });
            }
        },
        hurt(blocked) {
            tone(blocked
                ? { from: 320, to: 180, dur: 0.08, type: 'triangle', gain: 0.12, lpFreq: 620 }
                : { from: 145, to: 48, dur: 0.22, type: 'triangle', gain: 0.16, lpFreq: 420 });
        },
        kill() {
            [293, 370, 440].forEach((f, i) => tone({ from: f, dur: 0.12, type: 'sine', gain: 0.08, delay: i * 0.07, lpFreq: 720 }));
        },
        wave() {
            tone({ from: 130, to: 98, dur: 0.45, type: 'sine', gain: 0.09, lpFreq: 380 });
        },
        splash(strength = 1) {
            tone({ from: 360, to: 95, dur: 0.18, type: 'sine', gain: 0.06 * Math.min(1.4, strength), lpFreq: 540 });
        },
        down() {
            tone({ from: 180, to: 52, dur: 0.55, type: 'triangle', gain: 0.12, lpFreq: 360 });
        },
        upgrade() {
            [329, 440, 587].forEach((f, i) => tone({ from: f, dur: 0.11, type: 'sine', gain: 0.07, delay: i * 0.06, lpFreq: 780 }));
        },
    };
}
