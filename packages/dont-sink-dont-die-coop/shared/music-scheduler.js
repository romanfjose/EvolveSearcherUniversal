/**
 * Deterministic music scheduling and spatial 3D audio mathematics for
 * "Don't Sink, Don't Die" WebAudio procedural sound engine.
 * Pure ES module with zero external dependencies, compatible with Node.js and browser.
 */

export const MUSIC_MODES = {
    CALM: 'calm',
    RAPIDS: 'rapids',
    HARBOR_LOFI: 'harbor-lofi',
    COMBAT: 'combat',
};

export const TRACK_LAYERS = {
    BASS: 'bass',
    PERCUSSION: 'percussion',
    LEAD: 'lead',
    BRASS: 'brass',
};

// Distance threshold for triggering Boss/Leviathan combat stems
export const COMBAT_PROXIMITY_METERS = 35;

// Speed threshold above which rapids music layer starts ramping up
export const RAPIDS_SPEED_THRESHOLD = 9.0;
export const RAPIDS_FULL_SPEED = 14.0;

// Shop Dock Zone coordinates (aligned with shared/game-core.js SHOP_ZONE)
export const SHOP_DOCK_ZONE = {
    minX: 10,
    minZ: -250,
    maxZ: -150,
};

// Pure math utility functions
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

/**
 * Standard equal-power crossfade weights for 2 signals [0..1]
 * Maintains constant perceived volume when crossfading between 2 audio signals.
 */
export function equalPowerWeights(t) {
    const clampedT = clamp(t, 0, 1);
    const angle = clampedT * 0.5 * Math.PI;
    return {
        a: Math.cos(angle),
        b: Math.sin(angle),
    };
}

/**
 * Check if a 2D or 3D point is within the Harbor City Shop Dock Zone.
 */
export function isInShopZone(pos) {
    if (!pos || !Number.isFinite(pos.z)) return false;
    const x = Number.isFinite(pos.x) ? pos.x : 0;
    return x >= SHOP_DOCK_ZONE.minX && pos.z >= SHOP_DOCK_ZONE.minZ && pos.z <= SHOP_DOCK_ZONE.maxZ;
}

/**
 * Calculate Euclidean distance between two points in 2D or 3D.
 */
export function distanceBetween(a, b) {
    if (!a || !b) return Infinity;
    const dx = (a.x ?? 0) - (b.x ?? 0);
    const dy = (a.y ?? 0) - (b.y ?? 0);
    const dz = (a.z ?? 0) - (b.z ?? 0);
    return Math.hypot(dx, dy, dz);
}

/**
 * Determine the closest enemy distance from a player position given enemies data.
 * Checks enemies who have health > 0 and valid position.
 */
export function getClosestEnemyDistance(playerPos, enemies) {
    if (!playerPos || !enemies) return Infinity;
    let minDistance = Infinity;
    const enemyList = Array.isArray(enemies) ? enemies : Object.values(enemies);
    for (const enemy of enemyList) {
        if (!enemy || (enemy.health !== undefined && enemy.health <= 0)) continue;
        if (!enemy.position) continue;
        const d = distanceBetween(playerPos, enemy.position);
        if (d < minDistance) {
            minDistance = d;
        }
    }
    return minDistance;
}

/**
 * Determine the primary active music mode based on player state and environment:
 * 1. Boss / Leviathan combat stems if any alive enemy is within COMBAT_PROXIMITY_METERS (35m).
 * 2. Harbor City Shop Lo-Fi Lounge beat when inside the city dock zone.
 * 3. High-Speed Rapids when speed exceeds RAPIDS_SPEED_THRESHOLD.
 * 4. Calm River Paddling otherwise.
 */
export function evaluateMusicMode({ playerPos, speed = 0, enemies = null, forcedMode = null } = {}) {
    if (forcedMode && Object.values(MUSIC_MODES).includes(forcedMode)) {
        return forcedMode;
    }

    const enemyDist = getClosestEnemyDistance(playerPos, enemies);
    if (enemyDist <= COMBAT_PROXIMITY_METERS) {
        return MUSIC_MODES.COMBAT;
    }

    if (playerPos && isInShopZone(playerPos)) {
        return MUSIC_MODES.HARBOR_LOFI;
    }

    if (speed >= RAPIDS_SPEED_THRESHOLD) {
        return MUSIC_MODES.RAPIDS;
    }

    return MUSIC_MODES.CALM;
}

/**
 * Calculate multi-track layer intensity gains [0..1] for the 4 core stems:
 * - bass: Solid foundation (always present, mellow in Calm/Shop, punchy in Rapids/Combat)
 * - percussion: Rhythm & Taiko drums (subtle shaker in Calm, hip-hop lo-fi groove in Shop, fast taiko in Rapids, thundering drums in Combat)
 * - lead: Arp/Lead synth melodic drive (dreamy in Calm, jazz chords in Shop, driving synth in Rapids, heroic arpeggio in Combat)
 * - brass: Danger Brass (heavy stabs in Combat, high-energy punctuation in Rapids, muted in Calm & Shop)
 *
 * Supports smooth crossfading transitions with continuous blend inputs.
 */
export function calculateLayerWeights({
    playerPos,
    speed = 0,
    enemies = null,
    mode = null,
    combatIntensity = null,
    rapidsIntensity = null,
    shopIntensity = null,
} = {}) {
    const determinedMode = mode || evaluateMusicMode({ playerPos, speed, enemies });

    // Derive continuous continuous intensities if not explicitly provided
    let cCombat = combatIntensity;
    if (cCombat === null) {
        const enemyDist = getClosestEnemyDistance(playerPos, enemies);
        if (enemyDist <= COMBAT_PROXIMITY_METERS) {
            // Distance 35m -> 0, distance <= 10m -> 1.0
            cCombat = clamp(1.0 - (enemyDist - 10) / (COMBAT_PROXIMITY_METERS - 10), 0, 1);
        } else {
            cCombat = 0;
        }
    }

    let cRapids = rapidsIntensity;
    if (cRapids === null) {
        if (speed >= RAPIDS_SPEED_THRESHOLD) {
            cRapids = clamp((speed - RAPIDS_SPEED_THRESHOLD) / (RAPIDS_FULL_SPEED - RAPIDS_SPEED_THRESHOLD), 0, 1);
        } else {
            cRapids = 0;
        }
    }

    let cShop = shopIntensity;
    if (cShop === null) {
        cShop = (playerPos && isInShopZone(playerPos)) ? 1.0 : 0.0;
    }

    // Default base weights by discrete mode
    let baseWeights = {
        [TRACK_LAYERS.BASS]: 0.7,
        [TRACK_LAYERS.PERCUSSION]: 0.3,
        [TRACK_LAYERS.LEAD]: 0.4,
        [TRACK_LAYERS.BRASS]: 0.0,
    };

    switch (determinedMode) {
        case MUSIC_MODES.COMBAT:
            baseWeights = {
                [TRACK_LAYERS.BASS]: 0.95,
                [TRACK_LAYERS.PERCUSSION]: 1.0,
                [TRACK_LAYERS.LEAD]: 0.85,
                [TRACK_LAYERS.BRASS]: 0.9,
            };
            break;
        case MUSIC_MODES.HARBOR_LOFI:
            baseWeights = {
                [TRACK_LAYERS.BASS]: 0.8,
                [TRACK_LAYERS.PERCUSSION]: 0.65,
                [TRACK_LAYERS.LEAD]: 0.75,
                [TRACK_LAYERS.BRASS]: 0.05,
            };
            break;
        case MUSIC_MODES.RAPIDS:
            baseWeights = {
                [TRACK_LAYERS.BASS]: 0.85,
                [TRACK_LAYERS.PERCUSSION]: 0.9,
                [TRACK_LAYERS.LEAD]: 0.8,
                [TRACK_LAYERS.BRASS]: 0.4,
            };
            break;
        case MUSIC_MODES.CALM:
        default:
            baseWeights = {
                [TRACK_LAYERS.BASS]: 0.65,
                [TRACK_LAYERS.PERCUSSION]: 0.25,
                [TRACK_LAYERS.LEAD]: 0.45,
                [TRACK_LAYERS.BRASS]: 0.0,
            };
            break;
    }

    // If dynamic analog intensities are active, blend smoothly towards them
    if (cCombat > 0) {
        baseWeights[TRACK_LAYERS.BASS] = lerp(baseWeights[TRACK_LAYERS.BASS], 0.95, cCombat);
        baseWeights[TRACK_LAYERS.PERCUSSION] = lerp(baseWeights[TRACK_LAYERS.PERCUSSION], 1.0, cCombat);
        baseWeights[TRACK_LAYERS.LEAD] = lerp(baseWeights[TRACK_LAYERS.LEAD], 0.85, cCombat);
        baseWeights[TRACK_LAYERS.BRASS] = lerp(baseWeights[TRACK_LAYERS.BRASS], 0.9, cCombat);
    } else if (cShop > 0) {
        baseWeights[TRACK_LAYERS.BASS] = lerp(baseWeights[TRACK_LAYERS.BASS], 0.8, cShop);
        baseWeights[TRACK_LAYERS.PERCUSSION] = lerp(baseWeights[TRACK_LAYERS.PERCUSSION], 0.65, cShop);
        baseWeights[TRACK_LAYERS.LEAD] = lerp(baseWeights[TRACK_LAYERS.LEAD], 0.75, cShop);
        baseWeights[TRACK_LAYERS.BRASS] = lerp(baseWeights[TRACK_LAYERS.BRASS], 0.05, cShop);
    } else if (cRapids > 0) {
        baseWeights[TRACK_LAYERS.BASS] = lerp(baseWeights[TRACK_LAYERS.BASS], 0.85, cRapids);
        baseWeights[TRACK_LAYERS.PERCUSSION] = lerp(baseWeights[TRACK_LAYERS.PERCUSSION], 0.9, cRapids);
        baseWeights[TRACK_LAYERS.LEAD] = lerp(baseWeights[TRACK_LAYERS.LEAD], 0.8, cRapids);
        baseWeights[TRACK_LAYERS.BRASS] = lerp(baseWeights[TRACK_LAYERS.BRASS], 0.4, cRapids);
    }

    return {
        mode: determinedMode,
        combatIntensity: cCombat,
        rapidsIntensity: cRapids,
        shopIntensity: cShop,
        weights: {
            bass: clamp(baseWeights[TRACK_LAYERS.BASS], 0, 1),
            percussion: clamp(baseWeights[TRACK_LAYERS.PERCUSSION], 0, 1),
            lead: clamp(baseWeights[TRACK_LAYERS.LEAD], 0, 1),
            brass: clamp(baseWeights[TRACK_LAYERS.BRASS], 0, 1),
        },
    };
}

/**
 * Smooth exponential or linear step toward target weights.
 * Useful for frame-by-frame smoothing in the audio engine loop.
 */
export function smoothCrossfadeWeights(currentWeights, targetWeights, dt, rate = 3.0) {
    const factor = 1 - Math.exp(-rate * dt);
    const result = {};
    for (const key of Object.keys(targetWeights)) {
        const cur = currentWeights[key] ?? 0;
        const tgt = targetWeights[key] ?? 0;
        result[key] = cur + (tgt - cur) * factor;
    }
    return result;
}

// =========================================================================
// Spatial 3D Audio & Stereo Panning Helpers
// =========================================================================

/**
 * Compute spatial 3D audio parameters (stereo pan [-1, 1], distance attenuation gain [0, 1],
 * and low-pass filter cutoff frequency in Hz) for an emitter relative to a listener.
 *
 * @param {Object} listener - { position: {x, y, z}, yaw: number } (yaw: 0 = looking along -Z)
 * @param {Object} emitter - { position: {x, y, z} }
 * @param {Object} options - { maxDistance: 120, refDistance: 4, rolloff: 1.0, minGain: 0, lpMaxFreq: 18000, lpMinFreq: 1200 }
 * @returns {Object} { pan: number, gain: number, distance: number, filterFreq: number }
 */
export function calculateSpatialAudio(listener, emitter, options = {}) {
    const {
        maxDistance = 120,
        refDistance = 4,
        rolloff = 1.0,
        minGain = 0,
        lpMaxFreq = 18000,
        lpMinFreq = 1200,
    } = options;

    if (!listener || !emitter || !listener.position || !emitter.position) {
        return { pan: 0, gain: 0, distance: Infinity, filterFreq: lpMaxFreq };
    }

    const lx = listener.position.x ?? 0;
    const ly = listener.position.y ?? 0;
    const lz = listener.position.z ?? 0;
    const yaw = listener.yaw ?? 0;

    const ex = emitter.position.x ?? 0;
    const ey = emitter.position.y ?? 0;
    const ez = emitter.position.z ?? 0;

    // Vector from listener to emitter in world coordinates
    const dx = ex - lx;
    const dy = ey - ly;
    const dz = ez - lz;
    const dist = Math.hypot(dx, dy, dz);

    if (dist <= 0.001) {
        return { pan: 0, gain: 1.0, distance: 0, filterFreq: lpMaxFreq };
    }

    // Distance attenuation (inverse distance model clamped between refDistance and maxDistance)
    let gain = 1.0;
    if (dist > refDistance) {
        gain = refDistance / (refDistance + rolloff * (dist - refDistance));
    }
    if (dist >= maxDistance) {
        gain = 0;
    }
    gain = clamp(Math.max(gain, minGain), 0, 1);

    // Transform into listener's local coordinates based on yaw
    // Raft forward is local -Z (yaw = 0 => looking -Z, right is +X).
    // Local forward: fx = -sin(yaw), fz = -cos(yaw)
    // Local right: rx = -fz = cos(yaw), rz = fx = -sin(yaw)
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // Lateral distance projected onto listener right vector
    const lateralDist = dx * rightX + dz * rightZ;
    // Normalized pan [-1..1]
    const pan = clamp(lateralDist / Math.max(dist, 1e-4), -1, 1);

    // High frequency atmospheric dampening over distance (sound gets murkier further away)
    const distRatio = clamp(dist / maxDistance, 0, 1);
    const filterFreq = lpMaxFreq - (lpMaxFreq - lpMinFreq) * Math.pow(distRatio, 1.5);

    return {
        pan,
        gain,
        distance: dist,
        filterFreq: Math.round(filterFreq),
    };
}

/**
 * Specialized spatial preset helpers for the 4 core game audio events:
 * - River ambiance
 * - Waterfalls
 * - Police sirens
 * - Monster roars
 */
export const SPATIAL_PRESETS = {
    RIVER_AMBIANCE: {
        maxDistance: 80,
        refDistance: 6,
        rolloff: 0.8,
        lpMaxFreq: 14000,
        lpMinFreq: 2500,
    },
    WATERFALL: {
        maxDistance: 150,
        refDistance: 10,
        rolloff: 1.1,
        lpMaxFreq: 16000,
        lpMinFreq: 1500,
    },
    POLICE_SIREN: {
        maxDistance: 110,
        refDistance: 8,
        rolloff: 0.9,
        lpMaxFreq: 18000,
        lpMinFreq: 3000,
    },
    MONSTER_ROAR: {
        maxDistance: 200,
        refDistance: 12,
        rolloff: 0.7,
        lpMaxFreq: 12000,
        lpMinFreq: 800,
    },
};

export function calculateRiverAmbianceSpatial(listener, riverEmitter) {
    return calculateSpatialAudio(listener, riverEmitter, SPATIAL_PRESETS.RIVER_AMBIANCE);
}

export function calculateWaterfallSpatial(listener, waterfallEmitter) {
    return calculateSpatialAudio(listener, waterfallEmitter, SPATIAL_PRESETS.WATERFALL);
}

export function calculatePoliceSirenSpatial(listener, sirenEmitter) {
    return calculateSpatialAudio(listener, sirenEmitter, SPATIAL_PRESETS.POLICE_SIREN);
}

export function calculateMonsterRoarSpatial(listener, monsterEmitter) {
    return calculateSpatialAudio(listener, monsterEmitter, SPATIAL_PRESETS.MONSTER_ROAR);
}

// =========================================================================
// Musical Composition & Pattern Tables (Zero Asset WebAudio Synth)
// =========================================================================

// MIDI to Frequency conversion
export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Standard Note name lookup map
export const NOTE_FREQS = {
    C2: midiToFreq(36), D2: midiToFreq(38), E2: midiToFreq(40), F2: midiToFreq(41), G2: midiToFreq(43), A2: midiToFreq(45), B2: midiToFreq(47),
    C3: midiToFreq(48), D3: midiToFreq(50), Eb3: midiToFreq(51), E3: midiToFreq(52), F3: midiToFreq(53), G3: midiToFreq(55), Ab3: midiToFreq(56), A3: midiToFreq(57), Bb3: midiToFreq(58), B3: midiToFreq(59),
    C4: midiToFreq(60), D4: midiToFreq(62), Eb4: midiToFreq(63), E4: midiToFreq(64), F4: midiToFreq(65), G4: midiToFreq(67), Ab4: midiToFreq(68), A4: midiToFreq(69), Bb4: midiToFreq(70), B4: midiToFreq(71),
    C5: midiToFreq(72), D5: midiToFreq(74), Eb5: midiToFreq(75), E5: midiToFreq(76), F5: midiToFreq(77), G5: midiToFreq(79), A5: midiToFreq(81),
};

// Mode-specific BPM settings
export const MODE_BPM = {
    [MUSIC_MODES.CALM]: 92,
    [MUSIC_MODES.HARBOR_LOFI]: 84,
    [MUSIC_MODES.RAPIDS]: 128,
    [MUSIC_MODES.COMBAT]: 144,
};

/**
 * 16-step musical patterns for each layer in each mode.
 * Notes: string note name (e.g. 'C3', 'G3') or null for rest.
 */
export const MUSIC_PATTERNS = {
    [MUSIC_MODES.CALM]: {
        bass: ['C2', null, null, null, 'G2', null, null, null, 'A2', null, null, null, 'F2', null, null, null],
        percussion: [1, 0, 0, 0, 0.4, 0, 0.2, 0, 0.7, 0, 0, 0, 0.4, 0, 0.3, 0], // velocity [0..1]
        lead: ['C4', null, 'E4', null, 'G4', null, 'B4', null, 'A4', null, 'G4', null, 'E4', null, 'D4', null],
        brass: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    },
    [MUSIC_MODES.HARBOR_LOFI]: {
        bass: ['D2', null, 'D2', null, 'G2', null, null, 'A2', 'Bb2', null, 'Bb2', null, 'A2', null, 'G2', null],
        percussion: [1, 0, 0.6, 0, 0.9, 0, 0.4, 0.3, 0.2, 0.8, 0, 0.4, 0.9, 0, 0.5, 0.3],
        lead: ['F4', 'A4', 'C5', null, 'D4', 'F4', 'A4', null, 'G4', 'Bb4', 'D5', null, 'C4', 'E4', 'G4', null],
        brass: ['D3', null, null, null, null, null, null, null, 'G3', null, null, null, null, null, null, null],
    },
    [MUSIC_MODES.RAPIDS]: {
        bass: ['E2', 'E2', null, 'E2', 'G2', 'G2', null, 'G2', 'A2', 'A2', null, 'A2', 'B2', 'B2', 'D3', 'D3'],
        percussion: [1, 0.5, 0.8, 0.5, 1, 0.6, 0.9, 0.6, 1, 0.5, 0.8, 0.5, 1, 0.8, 0.9, 1], // driving taiko rhythm
        lead: ['E4', 'G4', 'B4', 'E5', 'D5', 'B4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'F5', 'D5', 'B4', 'A4'],
        brass: ['E3', null, null, null, 'E3', null, 'G3', null, 'A3', null, null, null, 'B3', null, 'D4', null],
    },
    [MUSIC_MODES.COMBAT]: {
        bass: ['C2', 'C2', 'C2', 'C2', 'Eb2', 'Eb2', 'D2', 'D2', 'C2', 'C2', 'C2', 'C2', 'Ab2', 'Ab2', 'G2', 'G2'],
        percussion: [1, 0.9, 1, 0.8, 1, 0.9, 1, 0.9, 1, 0.9, 1, 0.8, 1, 1, 1, 1], // full battle taiko fury
        lead: ['C4', 'Eb4', 'G4', 'C5', 'Ab4', 'G4', 'Eb4', 'D4', 'C4', 'D4', 'Eb4', 'G4', 'Bb4', 'Ab4', 'G4', 'Eb4'],
        brass: ['C3', null, 'C3', null, 'Eb3', null, 'D3', null, 'Ab3', null, 'G3', null, 'C3', 'Eb3', 'G3', null],
    },
};

/**
 * Step sequencer helper: calculates current 16-step bar position and note triggers for a given time.
 */
export function getSequenceStep(timeSeconds, bpm = 120, stepsPerBeat = 4, totalSteps = 16) {
    const beats = (timeSeconds * bpm) / 60;
    const stepNumber = Math.floor(beats * (stepsPerBeat / 4 * 4));
    const stepIndex = ((stepNumber % totalSteps) + totalSteps) % totalSteps;
    const stepDuration = 60 / (bpm * (stepsPerBeat / 4 * 4));
    const stepProgress = ((beats * (stepsPerBeat / 4 * 4)) % 1 + 1) % 1;
    return {
        stepIndex,
        stepDuration,
        stepProgress,
        totalSteps,
    };
}
