/**
 * Don't Sink, Don't Die — Game Settings & Lobby Configuration
 * Shared deterministic module for persistent game options, party modes,
 * crew cosmetics, and challenge seed link generation.
 */

export const STORAGE_KEY = 'dont_sink_dont_die_settings_v1';

// ── Game Modes ──────────────────────────────────────────────────────────────
export const GAME_MODES = {
    campaign: {
        id: 'campaign',
        name: 'Standard 4-Act Campaign',
        tagline: 'Amber Canyon to Tempest Maelstrom',
        description: 'The definitive 4-act co-op river voyage down to z = -1500 with escalating boss hazards.',
        icon: '🗺️',
        finishZ: -1500,
        hasBossKraken: true,
        allowsSplitScreen: false,
    },
    daily: {
        id: 'daily',
        name: 'Daily Fever-Dream Seed',
        tagline: 'Synchronized Global Daily Challenge',
        description: 'A shared daily random seed with surreal fever-dream encounters and global leaderboard bragging rights.',
        icon: '🌙',
        finishZ: -1500,
        hasBossKraken: true,
        allowsSplitScreen: false,
    },
    endless: {
        id: 'endless',
        name: 'Endless Rogue-River',
        tagline: 'Survive Beyond the Known Map',
        description: 'Infinite procedural river sectors beyond z = -1500 with rogue-lite drafts and escalating dual bosses.',
        icon: '♾️',
        finishZ: -Infinity,
        hasBossKraken: true,
        allowsSplitScreen: false,
    },
    boss_rush: {
        id: 'boss_rush',
        name: 'Boss Rush',
        tagline: 'Rapid-Fire Titan Showdown',
        description: 'Skip the calm waters: back-to-back encounters against the Wizard, Mud Alien, Long Worm, and Kraken.',
        icon: '⚔️',
        finishZ: -1500,
        hasBossKraken: true,
        allowsSplitScreen: false,
    },
    splitscreen: {
        id: 'splitscreen',
        name: '2P Split-Screen',
        tagline: 'Couch Co-Op Dual-Viewport',
        description: 'Dual viewport local multiplayer on a single screen with independent controls for Player 1 & 2.',
        icon: '🎮',
        finishZ: -1500,
        hasBossKraken: true,
        allowsSplitScreen: true,
    },
};

export const GAME_MODE_IDS = Object.keys(GAME_MODES);

// ── Silly Hats ─────────────────────────────────────────────────────────────
export const SILLY_HATS = {
    captain_tricorn: {
        id: 'captain_tricorn',
        name: 'Captain Tricorn',
        icon: '🏴‍☠️',
        description: 'Stately weathered felt with embroidered gold bullion trim and feather plume.',
        color: 0x1e293b,
        accentColor: 0xd4af37,
    },
    viking_horns: {
        id: 'viking_horns',
        name: 'Viking Horns',
        icon: '🪓',
        description: 'Riveted iron spangenhelm equipped with formidable polished ox horns.',
        color: 0x64748b,
        accentColor: 0xfef08a,
    },
    traffic_cone: {
        id: 'traffic_cone',
        name: 'Traffic Cone',
        icon: '🚧',
        description: 'High-visibility safety orange municipal cone with reflective prismatic bands.',
        color: 0xf97316,
        accentColor: 0xffffff,
    },
    giant_frog_hat: {
        id: 'giant_frog_hat',
        name: 'Giant Frog Hat',
        icon: '🐸',
        description: 'Plush lime-green amphibian cap with bulbous googly eyes and felt webbed paws.',
        color: 0x22c55e,
        accentColor: 0xfef9c3,
    },
    wizard_beard: {
        id: 'wizard_beard',
        name: 'Wizard Beard',
        icon: '🧙‍♂️',
        description: 'Pointed star-spangled indigo sorcerer hat with an opulent 3-foot braided silver beard.',
        color: 0x4338ca,
        accentColor: 0xe2e8f0,
    },
    disco_afro: {
        id: 'disco_afro',
        name: 'Disco Afro',
        icon: '🪩',
        description: 'Voluminous 1970s funk afro glistening with subtle iridescent sparkles and golden pick.',
        color: 0x171717,
        accentColor: 0xfacc15,
    },
};

export const SILLY_HAT_IDS = Object.keys(SILLY_HATS);

// ── Graphics Quality Presets ────────────────────────────────────────────────
export const GRAPHICS_PRESETS = {
    ultra: {
        id: 'ultra',
        name: 'Ultra AAA',
        description: 'Full resolution, 2048px cascaded shadows, 3000 weather particles, and full post-fx.',
        pixelRatioCap: 2.0,
        shadowMapSize: 2048,
        shadowsEnabled: true,
        particleCountMultiplier: 1.0,
        postProcessing: true,
        bloom: true,
        waterWaves: 'high',
        targetFps: 60,
    },
    balanced: {
        id: 'balanced',
        name: 'Balanced',
        description: 'Optimized 1024px shadows, 1500 particles, smooth performance on mainstream GPUs.',
        pixelRatioCap: 1.5,
        shadowMapSize: 1024,
        shadowsEnabled: true,
        particleCountMultiplier: 0.5,
        postProcessing: true,
        bloom: false,
        waterWaves: 'medium',
        targetFps: 60,
    },
    laptop: {
        id: 'laptop',
        name: 'Laptop 60fps',
        description: 'Lightweight shaders, shadows disabled, 600 particles for max battery and stable 60fps.',
        pixelRatioCap: 1.0,
        shadowMapSize: 512,
        shadowsEnabled: false,
        particleCountMultiplier: 0.2,
        postProcessing: false,
        bloom: false,
        waterWaves: 'low',
        targetFps: 60,
    },
};

export const GRAPHICS_PRESET_IDS = Object.keys(GRAPHICS_PRESETS);

// ── Default Game Settings ───────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
    // Lobby / Party Settings
    mode: 'campaign', // 'campaign' | 'daily' | 'endless' | 'boss_rush' | 'splitscreen'
    classId: 'helmsman', // 'helmsman' | 'bruiser' | 'tinkerer' | 'mystic'
    hatId: 'captain_tricorn', // silly hat id
    botCount: 2, // 1 - 3 AI bots
    playerName: 'Captain River',
    seed: null, // string seed for custom challenge, or null/empty

    // Graphics Settings
    graphicsPreset: 'ultra', // 'ultra' | 'balanced' | 'laptop'
    fov: 75, // 50 - 110 degrees
    cameraShake: 1.0, // 0.0 - 2.0 (0% - 200%)

    // Audio Mix Sliders (0.0 to 2.0 -> 0% to 200%)
    audio: {
        master: 1.0,
        music: 0.8,
        sfx: 1.0,
        squeakyHammer: 1.25, // 0% - 200% Squeaky Hammer volume!
        muted: false,
    },
};

// ── Helpers & Clamping ──────────────────────────────────────────────────────

export function clamp(v, min, max) {
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

export function isValidGameMode(mode) {
    return typeof mode === 'string' && Object.hasOwn(GAME_MODES, mode.toLowerCase().trim());
}

export function normalizeGameMode(mode, fallback = 'campaign') {
    if (!mode || typeof mode !== 'string') return fallback;
    const clean = mode.toLowerCase().trim();
    return Object.hasOwn(GAME_MODES, clean) ? clean : fallback;
}

export function isValidSillyHat(hatId) {
    return typeof hatId === 'string' && Object.hasOwn(SILLY_HATS, hatId.toLowerCase().trim());
}

export function normalizeSillyHat(hatId, fallback = 'captain_tricorn') {
    if (!hatId || typeof hatId !== 'string') return fallback;
    const clean = hatId.toLowerCase().trim();
    return Object.hasOwn(SILLY_HATS, clean) ? clean : fallback;
}

export function isValidGraphicsPreset(presetId) {
    return typeof presetId === 'string' && Object.hasOwn(GRAPHICS_PRESETS, presetId.toLowerCase().trim());
}

export function normalizeGraphicsPreset(presetId, fallback = 'ultra') {
    if (!presetId || typeof presetId !== 'string') return fallback;
    const clean = presetId.toLowerCase().trim();
    return Object.hasOwn(GRAPHICS_PRESETS, clean) ? clean : fallback;
}

export function clampBotCount(count, min = 1, max = 3) {
    const n = Math.round(Number(count));
    if (Number.isNaN(n)) return 2;
    return clamp(n, min, max);
}

export function clampVolume(volume) {
    if (volume === null || volume === undefined || volume === '') return 1.0;
    const v = Number(volume);
    if (!Number.isFinite(v)) return 1.0;
    return clamp(v, 0.0, 2.0); // 0% to 200%
}

export function clampFov(fov) {
    const f = Number(fov);
    if (!Number.isFinite(f)) return 75;
    return clamp(Math.round(f), 50, 110);
}

export function clampCameraShake(shake) {
    const s = Number(shake);
    if (!Number.isFinite(s)) return 1.0;
    return clamp(Number(s.toFixed(2)), 0.0, 2.0);
}

/**
 * Sanitizes and validates a partial or complete settings object against the schema.
 */
export function sanitizeSettings(rawSettings = {}) {
    if (!rawSettings || typeof rawSettings !== 'object') {
        return structuredClone(DEFAULT_SETTINGS);
    }

    const rawAudio = rawSettings.audio || {};

    const mode = normalizeGameMode(rawSettings.mode, DEFAULT_SETTINGS.mode);
    const hatId = normalizeSillyHat(rawSettings.hatId, DEFAULT_SETTINGS.hatId);
    const graphicsPreset = normalizeGraphicsPreset(rawSettings.graphicsPreset, DEFAULT_SETTINGS.graphicsPreset);
    const botCount = clampBotCount(rawSettings.botCount ?? DEFAULT_SETTINGS.botCount);
    const fov = clampFov(rawSettings.fov ?? DEFAULT_SETTINGS.fov);
    const cameraShake = clampCameraShake(rawSettings.cameraShake ?? DEFAULT_SETTINGS.cameraShake);

    const classId = typeof rawSettings.classId === 'string' && ['helmsman', 'bruiser', 'tinkerer', 'mystic'].includes(rawSettings.classId.toLowerCase().trim())
        ? rawSettings.classId.toLowerCase().trim()
        : DEFAULT_SETTINGS.classId;

    const playerName = typeof rawSettings.playerName === 'string' && rawSettings.playerName.trim().length > 0
        ? rawSettings.playerName.trim().slice(0, 24)
        : DEFAULT_SETTINGS.playerName;

    const seed = rawSettings.seed !== undefined && rawSettings.seed !== null
        ? String(rawSettings.seed).trim().slice(0, 32)
        : null;

    const audio = {
        master: clampVolume(rawAudio.master ?? DEFAULT_SETTINGS.audio.master),
        music: clampVolume(rawAudio.music ?? DEFAULT_SETTINGS.audio.music),
        sfx: clampVolume(rawAudio.sfx ?? DEFAULT_SETTINGS.audio.sfx),
        squeakyHammer: clampVolume(rawAudio.squeakyHammer ?? DEFAULT_SETTINGS.audio.squeakyHammer),
        muted: Boolean(rawAudio.muted ?? DEFAULT_SETTINGS.audio.muted),
    };

    return {
        mode,
        classId,
        hatId,
        botCount,
        playerName,
        seed: seed || null,
        graphicsPreset,
        fov,
        cameraShake,
        audio,
    };
}

// ── Challenge Seed URL Generator & Parser ───────────────────────────────────

/**
 * Generates a challenge seed URL query string or full URL to share with friends.
 * Includes ?seed=..., mode=..., bots=..., class=..., hat=...
 */
export function buildChallengeSeedUrl(settings, baseUrl = 'https://dontsink.game/') {
    const clean = sanitizeSettings(settings);
    const url = new URL(baseUrl, 'https://dontsink.game/');
    const seed = clean.seed || generateRandomSeed();

    url.searchParams.set('seed', seed);
    url.searchParams.set('mode', clean.mode);
    url.searchParams.set('bots', String(clean.botCount));
    url.searchParams.set('class', clean.classId);
    url.searchParams.set('hat', clean.hatId);

    return url.toString();
}

/**
 * Parses challenge query parameters from a URL or query string into partial settings.
 */
export function parseChallengeSeedUrl(urlStringOrSearch) {
    if (!urlStringOrSearch || typeof urlStringOrSearch !== 'string') {
        return null;
    }

    try {
        let params;
        if (urlStringOrSearch.startsWith('?') || !urlStringOrSearch.includes('://')) {
            const query = urlStringOrSearch.startsWith('?') ? urlStringOrSearch.slice(1) : urlStringOrSearch;
            params = new URLSearchParams(query);
        } else {
            const parsed = new URL(urlStringOrSearch);
            params = parsed.searchParams;
        }

        const seed = params.get('seed') || null;
        const mode = params.get('mode');
        const bots = params.get('bots');
        const classId = params.get('class');
        const hat = params.get('hat');

        const result = {};
        if (seed) result.seed = seed.slice(0, 32);
        if (mode && isValidGameMode(mode)) result.mode = mode.toLowerCase();
        if (bots !== null && !Number.isNaN(Number(bots))) result.botCount = clampBotCount(bots);
        if (classId && ['helmsman', 'bruiser', 'tinkerer', 'mystic'].includes(classId.toLowerCase())) {
            result.classId = classId.toLowerCase();
        }
        if (hat && isValidSillyHat(hat)) result.hatId = hat.toLowerCase();

        return Object.keys(result).length > 0 ? result : null;
    } catch {
        return null;
    }
}

/**
 * Generates an alphanumeric daily or random run seed (e.g. "RAPIDS-7749").
 */
export function generateRandomSeed(prefix = 'RIVER') {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
}

/**
 * Returns the deterministic daily seed for the current UTC date (e.g. "FEVER-2026-06-15").
 */
export function getDailySeed(date = new Date()) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `FEVER-${yyyy}-${mm}-${dd}`;
}

// ── Persistence Helpers ─────────────────────────────────────────────────────

/**
 * Loads saved settings from localStorage, or falls back to defaults.
 */
export function loadGameSettings(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    if (!storage) return structuredClone(DEFAULT_SETTINGS);
    try {
        const item = storage.getItem(STORAGE_KEY);
        if (!item) return structuredClone(DEFAULT_SETTINGS);
        const parsed = JSON.parse(item);
        return sanitizeSettings(parsed);
    } catch {
        return structuredClone(DEFAULT_SETTINGS);
    }
}

/**
 * Saves settings to localStorage.
 */
export function saveGameSettings(settings, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    const clean = sanitizeSettings(settings);
    if (storage) {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(clean));
        } catch (e) {
            console.warn('Unable to persist game settings:', e);
        }
    }
    return clean;
}

/**
 * Resets settings in localStorage to defaults.
 */
export function resetGameSettings(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    const defaults = structuredClone(DEFAULT_SETTINGS);
    if (storage) {
        try {
            storage.removeItem(STORAGE_KEY);
        } catch {}
    }
    return defaults;
}
