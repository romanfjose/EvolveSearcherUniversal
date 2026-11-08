/**
 * Don't Sink, Don't Die — Warm Low-Pass Audio Cues for Orders, Gadgets & Tarot
 * (`shared/audio-branch-cues.js`)
 *
 * Sovereign Core & Videogame Helmet 02 (Synthetic José Sound & Atmosphere Engineer):
 * - "Silence and warm natural ambiance are infinitely better than annoying noise."
 * - Bans continuous procedural synth arpeggios, raw sawtooth brass stabs, and harsh unfiltered noise.
 * - Enforces warm, low-pass-filtered physical textures (lpFreq <= 740 Hz, gain <= 0.32).
 * - Delivers weight-matched acoustic recipes for:
 *     1. Bot orders: `order_form_up`, `order_focus_fire`, `order_scavenge`, `order_rush_checkpoint`
 *     2. Gadget activations: `gadget_harpoon`, `gadget_shield_dome`, `gadget_nitro_keg`, `gadget_repair_drone`
 *     3. Tarot blessing draft: `tarot_blessing_granted`
 *     4. Photo mode shutter: `photo_shutter_click`
 * - Guarantees finite numbers and hard ceiling lpFreq <= 750 Hz across all generated cues.
 *
 * Pure ES module with zero external dependencies, compatible with Node.js and browser environments.
 */

/**
 * Baseline constraints and ceiling invariants for audio branch cues.
 */
export const BRANCH_AUDIO_LIMITS = {
    MAX_RECIPE_LOWPASS_FREQ: 740, // Base recipe low-pass filter ceiling (Hz)
    HARD_CEILING_LOWPASS_FREQ: 750, // Absolute hard ceiling for all resolved cues (Hz)
    MIN_LOWPASS_FREQ: 100, // Minimum low-pass frequency floor (Hz)
    MAX_GAIN: 0.32, // Non-fatiguing ear-safety gain ceiling
    MIN_GAIN: 0.01, // Minimum audible gain floor
    MIN_PITCH_JITTER: -0.15, // Minimum allowable relative pitch jitter offset
    MAX_PITCH_JITTER: 0.15, // Maximum allowable relative pitch jitter offset
};

/**
 * Canonical synthesis recipes for branch cues.
 * All recipes adhere to:
 * - lpFreq <= 740 Hz (warm low-pass filter)
 * - gain <= 0.32 (non-fatiguing volume)
 */
export const BRANCH_AUDIO_RECIPES = {
    // -------------------------------------------------------------------------
    // 1. AI Companion Bot Tactical Orders
    // -------------------------------------------------------------------------
    order_form_up: {
        id: 'order_form_up',
        category: 'bot_order',
        name: 'Order: Form Up & Protect Rear',
        description: 'Warm resonant wooden drum rally thump signaling crew to tighten formation',
        type: 'triangle',
        from: 140,
        to: 85,
        dur: 0.22,
        lpFreq: 480,
        gain: 0.24,
        pan: 0.0,
    },
    order_focus_fire: {
        id: 'order_focus_fire',
        category: 'bot_order',
        name: 'Order: Focus Fire Boss',
        description: 'Deep punchy taiko strike directing all artillery at the apex threat',
        type: 'sine',
        from: 180,
        to: 75,
        dur: 0.26,
        lpFreq: 520,
        gain: 0.28,
        pan: 0.0,
    },
    order_scavenge: {
        id: 'order_scavenge',
        category: 'bot_order',
        name: 'Order: Spread Out & Scavenge',
        description: 'Mellow hollow gourd chime prompting bots to fan out for coins and salvage',
        type: 'sine',
        from: 260,
        to: 195,
        dur: 0.18,
        lpFreq: 620,
        gain: 0.20,
        pan: 0.0,
    },
    order_rush_checkpoint: {
        id: 'order_rush_checkpoint',
        category: 'bot_order',
        name: 'Order: Rush Next Checkpoint',
        description: 'Urgent yet warm low-mid horn call signaling overdrive paddling',
        type: 'triangle',
        from: 220,
        to: 160,
        dur: 0.25,
        lpFreq: 580,
        gain: 0.26,
        pan: 0.0,
    },

    // -------------------------------------------------------------------------
    // 2. Raft Gadget Activations
    // -------------------------------------------------------------------------
    gadget_harpoon: {
        id: 'gadget_harpoon',
        category: 'gadget',
        name: 'Gadget: Harpoon Ballista Launch',
        description: 'Heavy wooden ratchet clack followed by deep mechanical cable snap',
        type: 'triangle',
        from: 210,
        to: 90,
        dur: 0.16,
        lpFreq: 640,
        gain: 0.25,
        pan: 0.1,
    },
    gadget_shield_dome: {
        id: 'gadget_shield_dome',
        category: 'gadget',
        name: 'Gadget: Arcane Shockwave Bell',
        description: 'Subterranean bronze temple bell resonance expanding a kinetic safety dome',
        type: 'sine',
        from: 150,
        to: 60,
        dur: 0.38,
        lpFreq: 420,
        gain: 0.30,
        pan: 0.0,
    },
    gadget_nitro_keg: {
        id: 'gadget_nitro_keg',
        category: 'gadget',
        name: 'Gadget: Twin Nitro Hydro-Jets Ignite',
        description: 'Low-frequency muffled water-jet thrust surge propelling the raft forward',
        type: 'triangle',
        from: 130,
        to: 95,
        dur: 0.32,
        lpFreq: 460,
        gain: 0.27,
        pan: 0.0,
    },
    gadget_repair_drone: {
        id: 'gadget_repair_drone',
        category: 'gadget',
        name: 'Gadget: Clockwork Pelican Pulse',
        description: 'Gentle wood-flute warm chirp accompanying lantern repair field pulse',
        type: 'sine',
        from: 320,
        to: 240,
        dur: 0.20,
        lpFreq: 700,
        gain: 0.18,
        pan: -0.1,
    },

    // -------------------------------------------------------------------------
    // 3. Rogue-Lite Checkpoint Dream Tarot Blessing Draft
    // -------------------------------------------------------------------------
    tarot_blessing_granted: {
        id: 'tarot_blessing_granted',
        category: 'tarot',
        name: 'Tarot Blessing Granted',
        description: 'Subtle ethereal mystic chord swell grounding a newly drafted river arcana',
        type: 'sine',
        from: 196,
        to: 147,
        dur: 0.45,
        lpFreq: 540,
        gain: 0.25,
        pan: 0.0,
    },

    // -------------------------------------------------------------------------
    // 4. Photo Mode Shutter
    // -------------------------------------------------------------------------
    photo_shutter_click: {
        id: 'photo_shutter_click',
        category: 'photo_mode',
        name: 'Photo Mode Shutter Click',
        description: 'Warm tactile mechanical camera aperture click without harsh treble',
        type: 'triangle',
        from: 280,
        to: 110,
        dur: 0.08,
        lpFreq: 720,
        gain: 0.22,
        pan: 0.0,
    },
};

/**
 * Key aliases dictionary mapping alternative strings, hyphens, and shorthand
 * to canonical recipe keys in BRANCH_AUDIO_RECIPES.
 */
export const BRANCH_AUDIO_ALIASES = {
    // Bot order aliases
    order_form_up: 'order_form_up',
    'order-form-up': 'order_form_up',
    form_up: 'order_form_up',
    'form-up': 'order_form_up',

    order_focus_fire: 'order_focus_fire',
    'order-focus-fire': 'order_focus_fire',
    focus_fire: 'order_focus_fire',
    'focus-fire': 'order_focus_fire',

    order_scavenge: 'order_scavenge',
    'order-scavenge': 'order_scavenge',
    scavenge: 'order_scavenge',

    order_rush_checkpoint: 'order_rush_checkpoint',
    'order-rush-checkpoint': 'order_rush_checkpoint',
    rush_checkpoint: 'order_rush_checkpoint',
    'rush-checkpoint': 'order_rush_checkpoint',

    // Gadget aliases
    gadget_harpoon: 'gadget_harpoon',
    'gadget-harpoon': 'gadget_harpoon',
    harpoon: 'gadget_harpoon',

    gadget_shield_dome: 'gadget_shield_dome',
    'gadget-shield-dome': 'gadget_shield_dome',
    shield_dome: 'gadget_shield_dome',
    'shield-dome': 'gadget_shield_dome',

    gadget_nitro_keg: 'gadget_nitro_keg',
    'gadget-nitro-keg': 'gadget_nitro_keg',
    nitro_keg: 'gadget_nitro_keg',
    'nitro-keg': 'gadget_nitro_keg',

    gadget_repair_drone: 'gadget_repair_drone',
    'gadget-repair-drone': 'gadget_repair_drone',
    repair_drone: 'gadget_repair_drone',
    'repair-drone': 'gadget_repair_drone',

    // Tarot aliases
    tarot_blessing_granted: 'tarot_blessing_granted',
    'tarot-blessing-granted': 'tarot_blessing_granted',
    tarot_blessing: 'tarot_blessing_granted',
    tarot: 'tarot_blessing_granted',

    // Photo mode shutter aliases
    photo_shutter_click: 'photo_shutter_click',
    'photo-shutter-click': 'photo_shutter_click',
    shutter_click: 'photo_shutter_click',
    photo_shutter: 'photo_shutter_click',
    camera_shutter: 'photo_shutter_click',
};

/**
 * Math utility: Clamps value to finite [min, max] range.
 *
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
    if (!Number.isFinite(val)) return min;
    return Math.min(max, Math.max(min, val));
}

/**
 * Resolves a cue identifier or alias to its canonical recipe key.
 *
 * @param {string} cueId - Canonical id or alias
 * @returns {string|null} Canonical key in BRANCH_AUDIO_RECIPES or null
 */
export function resolveBranchAudioRecipeKey(cueId) {
    if (typeof cueId !== 'string') return null;
    const clean = cueId.trim().toLowerCase();
    return BRANCH_AUDIO_ALIASES[cueId] || BRANCH_AUDIO_ALIASES[clean] || (BRANCH_AUDIO_RECIPES[clean] ? clean : null);
}

/**
 * Retrieves a sanitized, warm, low-pass-filtered WebAudio sound descriptor
 * for bot orders, gadgets, tarot draft blessings, and photo mode shutter.
 *
 * Adheres to Sovereign Core & Helmet 02:
 * - lpFreq is strictly guaranteed <= 750 Hz hard ceiling
 * - gain is strictly guaranteed <= 0.32 ear-safety ceiling
 * - all numeric properties are guaranteed finite numbers
 *
 * @param {string} cueId - Identifier matching BRANCH_AUDIO_RECIPES or aliases
 * @param {number} [pitchJitter=0] - Relative pitch shift offset (-0.15 .. +0.15, e.g. 0.05 for +5%)
 * @returns {object} Sanitized audio descriptor ready for WebAudio node synthesis
 */
export function getBranchAudioCue(cueId, pitchJitter = 0) {
    const recipeKey = resolveBranchAudioRecipeKey(cueId);
    const base = (recipeKey && BRANCH_AUDIO_RECIPES[recipeKey])
        ? BRANCH_AUDIO_RECIPES[recipeKey]
        : BRANCH_AUDIO_RECIPES.order_form_up; // Safe fallback

    // Sanitize pitchJitter: clamp to [-0.15, 0.15], default to 0 on non-finite
    const safeJitter = Number.isFinite(pitchJitter)
        ? clamp(pitchJitter, BRANCH_AUDIO_LIMITS.MIN_PITCH_JITTER, BRANCH_AUDIO_LIMITS.MAX_PITCH_JITTER)
        : 0;

    const pitchFactor = 1.0 + safeJitter;

    // Apply pitch scaling to frequency sweep
    const rawFrom = base.from * pitchFactor;
    const rawTo = base.to * pitchFactor;

    // Sanitize duration
    const safeDur = Number.isFinite(base.dur) ? Math.max(0.01, base.dur) : 0.2;

    // Filter frequency: strictly clamped between MIN_LOWPASS_FREQ and HARD_CEILING_LOWPASS_FREQ (750 Hz)
    const rawLpFreq = base.lpFreq * (1.0 + safeJitter * 0.25);
    const safeLpFreq = Math.round(clamp(
        rawLpFreq,
        BRANCH_AUDIO_LIMITS.MIN_LOWPASS_FREQ,
        BRANCH_AUDIO_LIMITS.HARD_CEILING_LOWPASS_FREQ
    ));

    // Gain: strictly clamped <= 0.32
    const safeGain = Number.isFinite(base.gain)
        ? clamp(base.gain, BRANCH_AUDIO_LIMITS.MIN_GAIN, BRANCH_AUDIO_LIMITS.MAX_GAIN)
        : 0.2;

    // Stereo panning: clamped [-1, 1]
    const safePan = Number.isFinite(base.pan) ? clamp(base.pan, -1.0, 1.0) : 0.0;

    return {
        id: base.id,
        category: base.category,
        recipeKey: recipeKey || 'order_form_up',
        type: base.type || 'sine',
        from: Math.round(rawFrom * 10) / 10,
        to: Math.round(rawTo * 10) / 10,
        dur: Math.round(safeDur * 1000) / 1000,
        lpFreq: safeLpFreq,
        gain: Math.round(safeGain * 1000) / 1000,
        pan: Math.round(safePan * 100) / 100,
        pitchJitter: Math.round(safeJitter * 1000) / 1000,
    };
}
