/**
 * Biome Shoreline Landmarks & World Curation Engine
 * (`shared/biome-shoreline-landmarks.js`)
 *
 * Sovereign Core & Videogame Helmet 07 Directive:
 * Synthetic José World Connoisseur & Purist Curator.
 *
 * 3-TIER WORLD CURATION LAW:
 * 1. TIER_QUIET_TEXTURE ('quiet_texture'):
 *    Simple, grounded background details that sit quietly in the environment.
 *    Asks nothing, does nothing. Because they don't scream for attention, they
 *    don't need an interaction — they just give the world subtle texture.
 * 2. TIER_TRUE_SIGNPOST ('true_signpost'):
 *    Background landmarks and structures that ONLY appear when they genuinely
 *    signal a change in the journey ahead (progression thresholds).
 *    Never scattered at random.
 * 3. TIER_CENTERPIECE_MAGNET ('centerpiece_magnet'):
 *    Anything that glows, moves, or demands the player's focus MUST deliver a real,
 *    satisfying interaction or consequence the moment the player reaches it
 *    (non-empty payoffType) — or have its fake spotlight stripped away / demoted.
 *
 * Pure, deterministic ES module. Headless-safe.
 */

export const TIER_QUIET_TEXTURE = 'quiet_texture';
export const TIER_TRUE_SIGNPOST = 'true_signpost';
export const TIER_CENTERPIECE_MAGNET = 'centerpiece_magnet';

export const CURATION_TIERS = Object.freeze([
    TIER_QUIET_TEXTURE,
    TIER_TRUE_SIGNPOST,
    TIER_CENTERPIECE_MAGNET,
]);

/**
 * Valid payoff types for centerpiece magnet landmarks.
 * A centerpiece magnet MUST provide one of these payoff types.
 */
export const VALID_PAYOFF_TYPES = Object.freeze([
    'sanctuary_heal',
    'armory_dock',
    'police_aggro_zone',
    'speed_flume',
]);

/**
 * Genuine progression thresholds along the river run (Z downriver).
 * True signposts are only permitted near these genuine thresholds.
 *
 * - WHITE_GUY_ZONE: Warning before the White Guy wizard hat zone (Act 1, targetZ: -80)
 * - WALLED_HARBOR_CITY: Signaling the Walled Harbor City pier & Police sanctuary (Act 2 entry, targetZ: -145)
 * - NOKIA_WORM_CANYON: Marking the Nokia-Worm canyon (Act 3, targetZ: -760)
 * - DREAD_KRAKEN_ARENA: Heralding the Dread Kraken arena (Act 4, targetZ: -1320)
 */
export const PROGRESSION_THRESHOLDS = Object.freeze([
    {
        id: 'threshold_white_guy_zone',
        name: 'White Guy Wizard Zone',
        targetZ: -80,
        toleranceZ: 45,
        signpostType: 'warning_white_guy',
        description: 'Warning before the White Guy wizard hat hunting zone in Act 1.',
    },
    {
        id: 'threshold_walled_harbor_city',
        name: 'Walled Harbor City & Police Haven',
        targetZ: -145,
        toleranceZ: 40,
        signpostType: 'harbor_city_pylons',
        description: 'Signaling the Walled Harbor City pier, drydock and Police sanctuary.',
    },
    {
        id: 'threshold_nokia_worm_canyon',
        name: 'Nokia-Worm Abyss Canyon',
        targetZ: -760,
        toleranceZ: 50,
        signpostType: 'worm_canyon_totems',
        description: 'Marking the entrance to the Nokia-Vector Long Worm canyon.',
    },
    {
        id: 'threshold_dread_kraken_arena',
        name: 'Dread Kraken Caldera Arena',
        targetZ: -1320,
        toleranceZ: 60,
        signpostType: 'kraken_caldera_beacons',
        description: 'Heralding the volcanic Dread Kraken leviathan arena.',
    },
]);

/**
 * Checks if a given Z coordinate is within tolerance of any genuine progression threshold.
 *
 * @param {number} z - River Z position.
 * @param {Array<object>} [thresholds=PROGRESSION_THRESHOLDS] - List of valid thresholds.
 * @returns {object|null} The matched threshold or null if not near any genuine progression threshold.
 */
export function getProgressionThresholdNearZ(z, thresholds = PROGRESSION_THRESHOLDS) {
    if (!Number.isFinite(z)) return null;
    for (const t of thresholds) {
        const tol = Number.isFinite(t.toleranceZ) ? t.toleranceZ : 40;
        if (Math.abs(z - t.targetZ) <= tol) {
            return t;
        }
    }
    return null;
}

/**
 * Checks if a landmark is near any genuine progression threshold.
 *
 * @param {object} landmark
 * @param {Array<object>} [thresholds=PROGRESSION_THRESHOLDS]
 * @returns {boolean}
 */
export function isNearProgressionThreshold(landmark, thresholds = PROGRESSION_THRESHOLDS) {
    if (!landmark) return false;
    const z = landmark.z ?? landmark.position?.z ?? landmark.center?.z;
    if (!Number.isFinite(z)) return false;
    return getProgressionThresholdNearZ(z, thresholds) !== null;
}

/**
 * Helper to determine if a payoff type is valid.
 *
 * @param {string} payoff
 * @returns {boolean}
 */
export function isValidPayoffType(payoff) {
    return typeof payoff === 'string' && VALID_PAYOFF_TYPES.includes(payoff);
}

/**
 * Classifies a landmark into one of Helmet 07's 3 Curation Tiers:
 * - 'centerpiece_magnet': Must have glowing/interactive visual pull AND a valid, non-empty payoffType.
 *   If an object has loud visual signals (glowing, spinning, pulsing, beacon) but lacks a valid payoffType,
 *   it is a "Spotlight Without Flavor" violation and is demoted or stripped of magnet status.
 * - 'true_signpost': Landmarks explicitly marked as signposts, beacons, or guides that signal progression.
 *   Must be situated at a genuine progression threshold.
 * - 'quiet_texture': Subtle decorative background setpieces (rocks, bluffs, basic trees, quiet docks).
 *
 * @param {object} landmark - The raw or candidate landmark definition.
 * @param {object} [options={}] - Optional configuration / threshold registry.
 * @returns {string} One of TIER_QUIET_TEXTURE, TIER_TRUE_SIGNPOST, TIER_CENTERPIECE_MAGNET.
 */
export function classifyLandmarkCurationTier(landmark, options = {}) {
    if (!landmark || typeof landmark !== 'object') {
        return TIER_QUIET_TEXTURE;
    }

    const thresholds = options.thresholds || PROGRESSION_THRESHOLDS;
    const z = Number.isFinite(landmark.z)
        ? landmark.z
        : Number.isFinite(landmark.position?.z)
            ? landmark.position.z
            : Number.isFinite(landmark.center?.z)
                ? landmark.center.z
                : NaN;

    const rawTier = landmark.tier || landmark.curationTier;
    const hasPayoff = isValidPayoffType(landmark.payoffType);

    // Loud visual cues: glowing, beacon, pulsing, spotlight, spinning centerpiece, interactive
    const isVisuallyLoud = Boolean(
        landmark.isGlow ||
        landmark.glowing ||
        landmark.isBeacon ||
        landmark.isMagnet ||
        landmark.spotlight ||
        landmark.hasGlow ||
        landmark.emissiveIntensity > 1.2 ||
        landmark.type === 'centerpiece' ||
        landmark.type === 'beacon' ||
        landmark.category === 'magnet' ||
        rawTier === TIER_CENTERPIECE_MAGNET
    );

    // 1. Centerpiece Magnet evaluation:
    // If it claims or attempts to be a centerpiece magnet, check if it delivers a real payoff.
    // Helmet 07 Visceral Disgust Receptor: Spotlight Without Flavor!
    // If loud signal with zero payoff, it cannot be a centerpiece magnet; demote it.
    if (isVisuallyLoud && hasPayoff) {
        return TIER_CENTERPIECE_MAGNET;
    }

    // Explicit or implicit signpost candidates:
    const isSignpostCandidate = Boolean(
        rawTier === TIER_TRUE_SIGNPOST ||
        landmark.type === 'signpost' ||
        landmark.type === 'beacon_pylon' ||
        landmark.type === 'landmark_signpost' ||
        landmark.isSignpost ||
        landmark.signalsZone ||
        landmark.signpostType ||
        (typeof landmark.name === 'string' && /signpost|beacon|warning|herald|threshold/i.test(landmark.name))
    );

    // 2. True Signpost evaluation:
    // Helmet 07 Rule: True Signposts only appear when they genuinely signal a change in the journey ahead.
    // If placed away from genuine progression thresholds, it's a "Lying Signpost" and gets demoted to quiet texture.
    if (isSignpostCandidate) {
        if (Number.isFinite(z) && getProgressionThresholdNearZ(z, thresholds) !== null) {
            return TIER_TRUE_SIGNPOST;
        }
        // Meaningless placement / lying signpost -> demoted to quiet texture
        return TIER_QUIET_TEXTURE;
    }

    // If it had loud visuals but lacked a payoff, it's stripped down to quiet texture
    return TIER_QUIET_TEXTURE;
}

/**
 * Curates a world landmarks array according to Helmet 07's World Curation Law:
 * 1. Strips out redundant / noisy visual clutter and aimless props.
 * 2. Enforces minimum longitudinal spacing (minSignpostSpacingZ) between true signposts
 *    per distinct threshold so landmarks never bunch up or feel spammy.
 * 3. Strips fake spotlights from centerpieces without payoffs (demotes or removes empty promises).
 * 4. Ensures every remaining centerpiece magnet landmark includes a valid payoffType.
 * 5. Guarantees true signposts appear exclusively at genuine progression thresholds.
 *
 * @param {Array<object>} landmarks - Input list of raw landmarks or candidate setpieces.
 * @param {object} [options={}] - Curation options.
 * @param {number} [options.minSignpostSpacingZ=85] - Minimum Z distance between signposts within the same threshold or zone.
 * @param {Array<object>} [options.thresholds=PROGRESSION_THRESHOLDS] - Custom progression thresholds.
 * @param {boolean} [options.stripEmptyCenterpieces=true] - If true, strip or demote centerpiece magnets lacking payoff.
 * @returns {Array<object>} Clean, curated landmarks with verified tiers and genuine intent.
 */
export function curateWorldLandmarks(landmarks, options = {}) {
    if (!Array.isArray(landmarks)) {
        return [];
    }

    const minSignpostSpacingZ = Number.isFinite(options.minSignpostSpacingZ)
        ? Math.max(10, options.minSignpostSpacingZ)
        : 85;
    const thresholds = options.thresholds || PROGRESSION_THRESHOLDS;
    const stripEmptyCenterpieces = options.stripEmptyCenterpieces !== false;

    const curated = [];
    const claimedThresholds = new Map(); // thresholdId -> lastZ

    // Sort landmarks downriver by Z (from high/less-negative to low/more-negative)
    const sorted = [...landmarks].sort((a, b) => {
        const za = Number.isFinite(a?.z) ? a.z : Number.isFinite(a?.position?.z) ? a.position.z : 0;
        const zb = Number.isFinite(b?.z) ? b.z : Number.isFinite(b?.position?.z) ? b.position.z : 0;
        return zb - za; // Z goes downriver towards negative
    });

    for (const rawItem of sorted) {
        if (!rawItem || typeof rawItem !== 'object') continue;

        // Clone item shallowly so we don't mutate input objects unexpectedly
        const item = { ...rawItem };
        const z = Number.isFinite(item.z)
            ? item.z
            : Number.isFinite(item.position?.z)
                ? item.position.z
                : Number.isFinite(item.center?.z)
                    ? item.center.z
                    : 0;

        // Classify tier
        let tier = classifyLandmarkCurationTier(item, { thresholds });

        // Evaluate Centerpiece Magnet or demoted fake spotlight
        if (!isValidPayoffType(item.payoffType) && stripEmptyCenterpieces) {
            if (item.isGlow !== undefined) item.isGlow = false;
            if (item.glowing !== undefined) item.glowing = false;
            if (item.isBeacon !== undefined) item.isBeacon = false;
            if (item.isMagnet !== undefined) item.isMagnet = false;
            if (item.emissiveIntensity !== undefined) item.emissiveIntensity = Math.min(item.emissiveIntensity || 0, 0.4);
            if (tier === TIER_CENTERPIECE_MAGNET) {
                tier = TIER_QUIET_TEXTURE;
            }
        } else if (tier === TIER_CENTERPIECE_MAGNET && !isValidPayoffType(item.payoffType)) {
            continue;
        }

        // Evaluate True Signpost
        if (tier === TIER_TRUE_SIGNPOST) {
            const matchedThreshold = getProgressionThresholdNearZ(z, thresholds);
            if (!matchedThreshold) {
                // Not at a genuine threshold -> demote to quiet texture
                tier = TIER_QUIET_TEXTURE;
            } else {
                // Check if this specific threshold already has a signpost within minSignpostSpacingZ
                const lastZ = claimedThresholds.get(matchedThreshold.id);
                if (lastZ !== undefined && Math.abs(lastZ - z) < minSignpostSpacingZ) {
                    // Redundant signpost noise -> demote to quiet texture
                    tier = TIER_QUIET_TEXTURE;
                } else {
                    claimedThresholds.set(matchedThreshold.id, z);
                    item.signpostThresholdId = matchedThreshold.id;
                    item.signpostZone = matchedThreshold.name;
                }
            }
        }

        // Assign curated tier
        item.tier = tier;
        item.curationTier = tier;

        // Additional hygiene: ensure coordinates and metadata are clean
        if (Number.isFinite(z)) {
            item.z = z;
        }

        curated.push(item);
    }

    return curated;
}

