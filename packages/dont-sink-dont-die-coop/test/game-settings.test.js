import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    GAME_MODES,
    GAME_MODE_IDS,
    SILLY_HATS,
    SILLY_HAT_IDS,
    GRAPHICS_PRESETS,
    GRAPHICS_PRESET_IDS,
    DEFAULT_SETTINGS,
    STORAGE_KEY,
    clamp,
    isValidGameMode,
    normalizeGameMode,
    isValidSillyHat,
    normalizeSillyHat,
    isValidGraphicsPreset,
    normalizeGraphicsPreset,
    clampBotCount,
    clampVolume,
    clampFov,
    clampCameraShake,
    sanitizeSettings,
    buildChallengeSeedUrl,
    parseChallengeSeedUrl,
    generateRandomSeed,
    getDailySeed,
    loadGameSettings,
    saveGameSettings,
    resetGameSettings,
} from '../shared/game-settings.js';

// Mock in-memory storage for localStorage testing
function createMockStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
    };
}

describe('Game Settings: Modes & Metadata', () => {
    test('defines all 5 required game modes', () => {
        const expected = ['campaign', 'daily', 'endless', 'boss_rush', 'splitscreen'];
        assert.deepEqual(GAME_MODE_IDS, expected);
        for (const id of expected) {
            const m = GAME_MODES[id];
            assert.ok(m, `Missing mode definition for ${id}`);
            assert.equal(m.id, id);
            assert.ok(typeof m.name === 'string' && m.name.length > 0);
            assert.ok(typeof m.description === 'string' && m.description.length > 0);
            assert.ok(typeof m.icon === 'string');
        }
    });

    test('validates mode names and ids accurately', () => {
        assert.equal(isValidGameMode('campaign'), true);
        assert.equal(isValidGameMode('daily'), true);
        assert.equal(isValidGameMode('endless'), true);
        assert.equal(isValidGameMode('boss_rush'), true);
        assert.equal(isValidGameMode('splitscreen'), true);
        assert.equal(isValidGameMode('CAMPAIGN'), true);
        assert.equal(isValidGameMode('invalid_mode'), false);
        assert.equal(isValidGameMode(''), false);
        assert.equal(isValidGameMode(null), false);
    });

    test('normalizes game mode strings with fallbacks', () => {
        assert.equal(normalizeGameMode('campaign'), 'campaign');
        assert.equal(normalizeGameMode('  DAILY  '), 'daily');
        assert.equal(normalizeGameMode('splitscreen'), 'splitscreen');
        assert.equal(normalizeGameMode('nonexistent', 'campaign'), 'campaign');
        assert.equal(normalizeGameMode(null, 'endless'), 'endless');
    });
});

describe('Game Settings: Silly Hats Definitions', () => {
    test('defines all 6 silly hats with icons and descriptions', () => {
        const expected = [
            'captain_tricorn',
            'viking_horns',
            'traffic_cone',
            'giant_frog_hat',
            'wizard_beard',
            'disco_afro',
        ];
        assert.deepEqual(SILLY_HAT_IDS, expected);
        for (const hatId of expected) {
            const hat = SILLY_HATS[hatId];
            assert.ok(hat, `Missing hat definition for ${hatId}`);
            assert.equal(hat.id, hatId);
            assert.ok(typeof hat.name === 'string');
            assert.ok(typeof hat.description === 'string');
            assert.ok(typeof hat.icon === 'string');
            assert.ok(typeof hat.color === 'number');
            assert.ok(typeof hat.accentColor === 'number');
        }
    });

    test('validates silly hat id strings correctly', () => {
        assert.equal(isValidSillyHat('captain_tricorn'), true);
        assert.equal(isValidSillyHat('viking_horns'), true);
        assert.equal(isValidSillyHat('traffic_cone'), true);
        assert.equal(isValidSillyHat('giant_frog_hat'), true);
        assert.equal(isValidSillyHat('wizard_beard'), true);
        assert.equal(isValidSillyHat('disco_afro'), true);
        assert.equal(isValidSillyHat('sombrero'), false);
        assert.equal(isValidSillyHat(123), false);
    });

    test('normalizes silly hat ids with fallback', () => {
        assert.equal(normalizeSillyHat('TRAFFIC_CONE'), 'traffic_cone');
        assert.equal(normalizeSillyHat('disco_afro'), 'disco_afro');
        assert.equal(normalizeSillyHat('unknown_hat'), 'captain_tricorn');
        assert.equal(normalizeSillyHat(undefined, 'wizard_beard'), 'wizard_beard');
    });
});

describe('Game Settings: Graphics Presets', () => {
    test('defines Ultra, Balanced, and Laptop presets', () => {
        const expected = ['ultra', 'balanced', 'laptop'];
        assert.deepEqual(GRAPHICS_PRESET_IDS, expected);
        for (const pid of expected) {
            const p = GRAPHICS_PRESETS[pid];
            assert.ok(p);
            assert.equal(p.id, pid);
            assert.ok(p.pixelRatioCap > 0);
            assert.ok(p.shadowMapSize > 0);
            assert.equal(typeof p.shadowsEnabled, 'boolean');
        }
    });

    test('validates graphics preset ids', () => {
        assert.equal(isValidGraphicsPreset('ultra'), true);
        assert.equal(isValidGraphicsPreset('balanced'), true);
        assert.equal(isValidGraphicsPreset('laptop'), true);
        assert.equal(isValidGraphicsPreset('4k_extreme'), false);
    });

    test('normalizes graphics presets with fallback', () => {
        assert.equal(normalizeGraphicsPreset('balanced'), 'balanced');
        assert.equal(normalizeGraphicsPreset('  LAPTOP  '), 'laptop');
        assert.equal(normalizeGraphicsPreset('unknown', 'balanced'), 'balanced');
    });
});

describe('Game Settings: Clamping & Validation Utilities', () => {
    test('clamp restricts number to range', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-3, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
        assert.equal(clamp(NaN, 0, 10), 0);
    });

    test('clampBotCount restricts bots between 1 and 3', () => {
        assert.equal(clampBotCount(1), 1);
        assert.equal(clampBotCount(2), 2);
        assert.equal(clampBotCount(3), 3);
        assert.equal(clampBotCount(0), 1);
        assert.equal(clampBotCount(5), 3);
        assert.equal(clampBotCount('2.8'), 3);
        assert.equal(clampBotCount(undefined), 2);
    });

    test('clampVolume restricts audio volume to 0.0 - 2.0 (0% - 200%)', () => {
        assert.equal(clampVolume(1.0), 1.0);
        assert.equal(clampVolume(0.0), 0.0);
        assert.equal(clampVolume(2.0), 2.0);
        assert.equal(clampVolume(2.5), 2.0);
        assert.equal(clampVolume(-0.5), 0.0);
        assert.equal(clampVolume('1.5'), 1.5);
        assert.equal(clampVolume(null), 1.0);
    });

    test('clampFov restricts camera field of view between 50 and 110 degrees', () => {
        assert.equal(clampFov(75), 75);
        assert.equal(clampFov(40), 50);
        assert.equal(clampFov(120), 110);
        assert.equal(clampFov(90.4), 90);
        assert.equal(clampFov('85'), 85);
        assert.equal(clampFov(NaN), 75);
    });

    test('clampCameraShake restricts shake multiplier between 0.0 and 2.0', () => {
        assert.equal(clampCameraShake(1.0), 1.0);
        assert.equal(clampCameraShake(0.0), 0.0);
        assert.equal(clampCameraShake(2.0), 2.0);
        assert.equal(clampCameraShake(3.5), 2.0);
        assert.equal(clampCameraShake(-1.0), 0.0);
        assert.equal(clampCameraShake('0.5'), 0.5);
    });
});

describe('Game Settings: sanitizeSettings', () => {
    test('returns exact default settings when given null or empty object', () => {
        const s1 = sanitizeSettings(null);
        const s2 = sanitizeSettings({});
        assert.deepEqual(s1, DEFAULT_SETTINGS);
        assert.deepEqual(s2, DEFAULT_SETTINGS);
    });

    test('sanitizes valid custom settings cleanly', () => {
        const input = {
            mode: 'daily',
            classId: 'bruiser',
            hatId: 'viking_horns',
            botCount: 3,
            playerName: 'Ragnar',
            seed: 'FEVER-2026',
            graphicsPreset: 'balanced',
            fov: 90,
            cameraShake: 0.5,
            audio: {
                master: 0.8,
                music: 0.6,
                sfx: 1.2,
                squeakyHammer: 1.8,
                muted: false,
            },
        };
        const sanitized = sanitizeSettings(input);
        assert.equal(sanitized.mode, 'daily');
        assert.equal(sanitized.classId, 'bruiser');
        assert.equal(sanitized.hatId, 'viking_horns');
        assert.equal(sanitized.botCount, 3);
        assert.equal(sanitized.playerName, 'Ragnar');
        assert.equal(sanitized.seed, 'FEVER-2026');
        assert.equal(sanitized.graphicsPreset, 'balanced');
        assert.equal(sanitized.fov, 90);
        assert.equal(sanitized.cameraShake, 0.5);
        assert.equal(sanitized.audio.master, 0.8);
        assert.equal(sanitized.audio.squeakyHammer, 1.8);
    });

    test('clamps out-of-range parameters during sanitization', () => {
        const input = {
            botCount: 10,
            fov: 150,
            cameraShake: 5.0,
            audio: {
                master: 4.0,
                sfx: -1.0,
                squeakyHammer: 3.5,
            },
        };
        const sanitized = sanitizeSettings(input);
        assert.equal(sanitized.botCount, 3);
        assert.equal(sanitized.fov, 110);
        assert.equal(sanitized.cameraShake, 2.0);
        assert.equal(sanitized.audio.master, 2.0);
        assert.equal(sanitized.audio.sfx, 0.0);
        assert.equal(sanitized.audio.squeakyHammer, 2.0);
    });

    test('replaces invalid enum values with safe defaults', () => {
        const input = {
            mode: 'alien_invasion',
            classId: 'ninja',
            hatId: 'baseball_cap',
            graphicsPreset: '8k_raytracing',
        };
        const sanitized = sanitizeSettings(input);
        assert.equal(sanitized.mode, 'campaign');
        assert.equal(sanitized.classId, 'helmsman');
        assert.equal(sanitized.hatId, 'captain_tricorn');
        assert.equal(sanitized.graphicsPreset, 'ultra');
    });

    test('truncates overly long player names and seeds', () => {
        const longName = 'A'.repeat(50);
        const longSeed = 'B'.repeat(100);
        const sanitized = sanitizeSettings({ playerName: longName, seed: longSeed });
        assert.equal(sanitized.playerName.length, 24);
        assert.equal(sanitized.seed.length, 32);
    });
});

describe('Game Settings: Challenge Seed URL Generation & Parsing', () => {
    test('generateRandomSeed creates string matching pattern', () => {
        const seed1 = generateRandomSeed('RIVER');
        assert.ok(/^RIVER-\d{4}$/.test(seed1));
        const seed2 = generateRandomSeed('FEVER');
        assert.ok(/^FEVER-\d{4}$/.test(seed2));
    });

    test('getDailySeed produces deterministic UTC date seed', () => {
        const date = new Date(Date.UTC(2026, 5, 15));
        const dailySeed = getDailySeed(date);
        assert.equal(dailySeed, 'FEVER-2026-06-15');
    });

    test('buildChallengeSeedUrl creates URL with search params', () => {
        const settings = {
            mode: 'daily',
            classId: 'tinkerer',
            hatId: 'traffic_cone',
            botCount: 1,
            seed: 'CHALLENGE-999',
        };
        const urlStr = buildChallengeSeedUrl(settings, 'https://dontsink.game/lobby');
        const url = new URL(urlStr);

        assert.equal(url.searchParams.get('seed'), 'CHALLENGE-999');
        assert.equal(url.searchParams.get('mode'), 'daily');
        assert.equal(url.searchParams.get('bots'), '1');
        assert.equal(url.searchParams.get('class'), 'tinkerer');
        assert.equal(url.searchParams.get('hat'), 'traffic_cone');
    });

    test('parseChallengeSeedUrl parses full URL query string correctly', () => {
        const url = 'https://dontsink.game/?seed=GORGE-4021&mode=boss_rush&bots=3&class=mystic&hat=wizard_beard';
        const parsed = parseChallengeSeedUrl(url);

        assert.ok(parsed);
        assert.equal(parsed.seed, 'GORGE-4021');
        assert.equal(parsed.mode, 'boss_rush');
        assert.equal(parsed.botCount, 3);
        assert.equal(parsed.classId, 'mystic');
        assert.equal(parsed.hatId, 'wizard_beard');
    });

    test('parseChallengeSeedUrl parses raw search query string', () => {
        const query = '?seed=TEST-123&mode=endless&bots=2';
        const parsed = parseChallengeSeedUrl(query);

        assert.ok(parsed);
        assert.equal(parsed.seed, 'TEST-123');
        assert.equal(parsed.mode, 'endless');
        assert.equal(parsed.botCount, 2);
    });

    test('parseChallengeSeedUrl returns null on invalid or malformed string', () => {
        assert.equal(parseChallengeSeedUrl(''), null);
        assert.equal(parseChallengeSeedUrl(null), null);
        assert.equal(parseChallengeSeedUrl('not-a-valid-url-or-param'), null);
    });

    test('parseChallengeSeedUrl ignores unknown params and clamps invalid bot count', () => {
        const query = '?foo=bar&bots=99';
        const parsed = parseChallengeSeedUrl(query);
        assert.ok(parsed);
        assert.equal(parsed.botCount, 3);
        assert.equal(parsed.foo, undefined);
    });
});

describe('Game Settings: Storage Persistence', () => {
    test('loadGameSettings returns defaults when storage is empty or null', () => {
        const mock = createMockStorage();
        const settings = loadGameSettings(mock);
        assert.deepEqual(settings, DEFAULT_SETTINGS);

        const nullStorageSettings = loadGameSettings(null);
        assert.deepEqual(nullStorageSettings, DEFAULT_SETTINGS);
    });

    test('saveGameSettings writes sanitized settings JSON to storage', () => {
        const mock = createMockStorage();
        const toSave = {
            mode: 'boss_rush',
            hatId: 'disco_afro',
            audio: {
                squeakyHammer: 1.75,
            },
        };

        const result = saveGameSettings(toSave, mock);
        assert.equal(result.mode, 'boss_rush');
        assert.equal(result.hatId, 'disco_afro');
        assert.equal(result.audio.squeakyHammer, 1.75);

        const rawInStorage = mock.getItem(STORAGE_KEY);
        assert.ok(rawInStorage);
        const parsed = JSON.parse(rawInStorage);
        assert.equal(parsed.mode, 'boss_rush');
        assert.equal(parsed.hatId, 'disco_afro');
    });

    test('loadGameSettings restores previously saved settings', () => {
        const mock = createMockStorage();
        saveGameSettings({ mode: 'endless', botCount: 1, fov: 100 }, mock);

        const loaded = loadGameSettings(mock);
        assert.equal(loaded.mode, 'endless');
        assert.equal(loaded.botCount, 1);
        assert.equal(loaded.fov, 100);
        // Defaults for unsaved fields remain intact
        assert.equal(loaded.classId, DEFAULT_SETTINGS.classId);
    });

    test('loadGameSettings gracefully handles corrupt JSON in storage', () => {
        const mock = createMockStorage();
        mock.setItem(STORAGE_KEY, '{ corrupt-json ::: invalid');

        const loaded = loadGameSettings(mock);
        assert.deepEqual(loaded, DEFAULT_SETTINGS);
    });

    test('resetGameSettings clears storage and returns defaults', () => {
        const mock = createMockStorage();
        saveGameSettings({ mode: 'splitscreen', fov: 95 }, mock);
        assert.ok(mock.getItem(STORAGE_KEY));

        const reset = resetGameSettings(mock);
        assert.deepEqual(reset, DEFAULT_SETTINGS);
        assert.equal(mock.getItem(STORAGE_KEY), null);
    });
});
