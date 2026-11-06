/**
 * Don't Sink, Don't Die — Physical Sound Archetypes & Diegetic WebAudio Recipes
 * (`shared/sound-archetypes.js`)
 *
 * Sovereign Core & Videogame Helmet 02 (Synthetic José Sound & Atmosphere Engineer):
 * - "Silence and warm natural ambiance are infinitely better than annoying noise."
 * - Bans continuous procedural synth arpeggios, raw sawtooth brass stabs, and harsh un-filtered noise.
 * - Enforces warm, low-pass-filtered physical textures (< 720-800 Hz) that let nature breathe.
 * - Delivers weight-matched acoustic recipes for dual-oar mechanics:
 *     1. `oarCatchDip`: warm low-mid water blade entry (240 -> 165 Hz, lpFreq: 520, dur: 0.11)
 *     2. `oarPowerPull`: deep hydrodynamic water pull swell (180 -> 115 Hz, lpFreq: 460, dur: 0.28)
 *     3. `oarChokeSlap`: muffled surface slap when player taps [W] too fast and cancels stroke (310 -> 130 Hz, lpFreq: 580, dur: 0.09)
 *     4. `oarSwingLeft` & `oarSwingRight`: wooden oar whoosh with subtle stereo pan and pitch distinction (lpFreq <= 640)
 * - Safe limits: strictly lpFreq <= 800 Hz, gain <= 0.35, 0.88x..1.12x organic pitch jitter.
 *
 * Pure ES module with zero external dependencies, compatible with Node.js and browser environments.
 */

/**
 * Baseline constraints and ceiling invariants for physical sound generation.
 */
export const SOUND_ARCHETYPE_LIMITS = {
    MAX_LOWPASS_FREQ: 800,        // Absolute high-frequency brickwall ceiling (Hz)
    MAX_GAIN: 0.35,               // Absolute non-fatiguing ear-safety gain ceiling
    MIN_PITCH_JITTER: 0.88,       // Minimum pitch randomization factor
    MAX_PITCH_JITTER: 1.12,       // Maximum pitch randomization factor
    DEFAULT_INTENSITY: 1.0,
};

/**
 * Canonical physical WebAudio synthesis recipes for the dual-oar system.
 * All recipes use warm, heavily low-pass filtered frequencies (lpFreq <= 720 Hz).
 */
export const OAR_SOUND_RECIPES = {
    oarCatchDip: {
        id: 'oar_catch_dip',
        name: 'Oar Catch Dip',
        description: 'Warm low-mid water blade entry as oar pierces the river surface',
        type: 'sine',
        from: 240,
        to: 165,
        dur: 0.11,
        lpFreq: 520,
        gain: 0.18,
        pan: 0.0,
    },
    oarPowerPull: {
        id: 'oar_power_pull',
        name: 'Oar Power Pull',
        description: 'Deep hydrodynamic water pull swell generating forward propulsion',
        type: 'triangle',
        from: 180,
        to: 115,
        dur: 0.28,
        lpFreq: 460,
        gain: 0.22,
        pan: 0.0,
    },
    oarChokeSlap: {
        id: 'oar_choke_slap',
        name: 'Oar Choke Slap',
        description: 'Muffled surface slap when the player presses [W] too fast and cancels/chokes the stroke',
        type: 'triangle',
        from: 310,
        to: 130,
        dur: 0.09,
        lpFreq: 580,
        gain: 0.20,
        pan: 0.0,
    },
    oarSwingLeft: {
        id: 'oar_swing_left',
        name: 'Oar Swing Left',
        description: 'Wooden left-oar melee strike whoosh with subtle port stereo bias',
        type: 'triangle',
        from: 215,
        to: 95,
        dur: 0.14,
        lpFreq: 620,
        gain: 0.19,
        pan: -0.35,
    },
    oarSwingRight: {
        id: 'oar_swing_right',
        name: 'Oar Swing Right',
        description: 'Wooden right-oar melee strike whoosh with subtle starboard stereo bias',
        type: 'triangle',
        from: 225,
        to: 105,
        dur: 0.14,
        lpFreq: 640,
        gain: 0.19,
        pan: 0.35,
    },
};

/**
 * Phase event alias dictionary mapping canonical and alternate phase strings
 * to their respective recipe definitions.
 */
export const OAR_PHASE_ALIASES = {
    catch: 'oarCatchDip',
    dip: 'oarCatchDip',
    oar_catch: 'oarCatchDip',
    oarCatchDip: 'oarCatchDip',

    pull: 'oarPowerPull',
    stroke: 'oarPowerPull',
    oar_pull: 'oarPowerPull',
    oarPowerPull: 'oarPowerPull',

    choke: 'oarChokeSlap',
    cancel: 'oarChokeSlap',
    slap: 'oarChokeSlap',
    oar_choke: 'oarChokeSlap',
    oarChokeSlap: 'oarChokeSlap',

    swing_left: 'oarSwingLeft',
    swingLeft: 'oarSwingLeft',
    strike_left: 'oarSwingLeft',
    oarSwingLeft: 'oarSwingLeft',

    swing_right: 'oarSwingRight',
    swingRight: 'oarSwingRight',
    strike_right: 'oarSwingRight',
    oarSwingRight: 'oarSwingRight',
};

/**
 * Pure math helper: clamp value between min and max.
 */
export function clamp(v, min, max) {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, v));
}

/**
 * Generates an organic pitch jitter factor bounded within [0.88, 1.12].
 *
 * @param {number|null} [randomSeed] - Optional fixed float in [0, 1] for deterministic testing.
 * @returns {number}
 */
export function generatePitchJitter(randomSeed = null) {
    const r = (randomSeed !== null && Number.isFinite(randomSeed))
        ? clamp(randomSeed, 0.0, 1.0)
        : Math.random();
    return SOUND_ARCHETYPE_LIMITS.MIN_PITCH_JITTER +
        r * (SOUND_ARCHETYPE_LIMITS.MAX_PITCH_JITTER - SOUND_ARCHETYPE_LIMITS.MIN_PITCH_JITTER);
}

/**
 * Sanitizes and resolves an oar stroke phase event to its underlying recipe key.
 *
 * @param {string} phaseEvent - 'catch' | 'pull' | 'choke' | 'swing_left' | 'swing_right' (or aliases)
 * @returns {string|null} Canonical recipe key in OAR_SOUND_RECIPES or null if unknown
 */
export function resolveOarPhaseRecipeKey(phaseEvent) {
    if (typeof phaseEvent !== 'string') return null;
    const normalized = phaseEvent.trim().toLowerCase();
    return OAR_PHASE_ALIASES[phaseEvent] || OAR_PHASE_ALIASES[normalized] || null;
}

/**
 * Retrieves a sanitized, randomized, low-pass-filtered WebAudio sound descriptor
 * for an oar stroke phase event.
 *
 * Enforces Helmet 02 audio architecture:
 * - lpFreq strictly clamped <= 800 Hz (guaranteed non-piercing)
 * - gain strictly clamped <= 0.35 (guaranteed non-fatiguing)
 * - pitch randomized by 0.88x..1.12x
 *
 * @param {'catch' | 'pull' | 'choke' | 'swing_left' | 'swing_right' | string} phaseEvent
 * @param {number} [intensity=1] - Stroke intensity multiplier (0.1 .. 2.0)
 * @param {object} [options={}] - Optional configuration (e.g. deterministic { jitterSeed: 0.5 })
 * @returns {object} Audio descriptor ready for WebAudio oscillator/filter nodes
 */
export function getOarStrokeAudioCue(phaseEvent, intensity = 1, options = {}) {
    const recipeKey = resolveOarPhaseRecipeKey(phaseEvent);
    const baseRecipe = recipeKey ? OAR_SOUND_RECIPES[recipeKey] : OAR_SOUND_RECIPES.oarCatchDip;

    // Sanitize intensity
    const safeIntensity = Number.isFinite(intensity) ? clamp(intensity, 0.05, 2.5) : SOUND_ARCHETYPE_LIMITS.DEFAULT_INTENSITY;

    // Compute pitch jitter (0.88x .. 1.12x)
    const jitter = generatePitchJitter(options?.jitterSeed ?? null);

    // Apply pitch jitter to frequencies
    const fromFreq = Math.round(baseRecipe.from * jitter * 10) / 10;
    const toFreq = Math.round(baseRecipe.to * jitter * 10) / 10;

    // Scale duration slightly with intensity (higher intensity = slightly punchier/crisper stroke)
    const durationScale = clamp(1.0 - (safeIntensity - 1.0) * 0.1, 0.75, 1.3);
    const safeDuration = Math.round(baseRecipe.dur * durationScale * 1000) / 1000;

    // Filter frequency: strictly clamped <= 800 Hz
    const rawLpFreq = baseRecipe.lpFreq * (1.0 + (safeIntensity - 1.0) * 0.15);
    const clampedLpFreq = Math.round(clamp(rawLpFreq, 100, SOUND_ARCHETYPE_LIMITS.MAX_LOWPASS_FREQ));

    // Gain: strictly clamped <= 0.35
    const rawGain = baseRecipe.gain * safeIntensity;
    const clampedGain = Math.round(clamp(rawGain, 0.01, SOUND_ARCHETYPE_LIMITS.MAX_GAIN) * 1000) / 1000;

    // Pan: preserve spatial stereophony (-1.0 to 1.0)
    const pan = Number.isFinite(baseRecipe.pan) ? clamp(baseRecipe.pan, -1.0, 1.0) : 0.0;

    return {
        id: baseRecipe.id,
        phase: phaseEvent,
        recipeKey: recipeKey || 'oarCatchDip',
        type: baseRecipe.type,
        from: fromFreq,
        to: toFreq,
        dur: safeDuration,
        lpFreq: clampedLpFreq,
        gain: clampedGain,
        pan,
        pitchJitter: Math.round(jitter * 1000) / 1000,
        intensity: safeIntensity,
    };
}
