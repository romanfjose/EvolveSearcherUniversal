/**
 * Don't Sink, Don't Die — Playable Crew Classes & Cosmetic Rig Customization
 * Shared deterministic module for class definitions, passive perks, and stat formulas.
 */

export const CREW_CLASS_IDS = ['helmsman', 'bruiser', 'tinkerer', 'mystic'];

export const CREW_CLASSES = {
    helmsman: {
        id: 'helmsman',
        name: 'Helmsman',
        title: 'Master Navigator',
        description: 'Captain tricorn hat + trenchcoat, +15% turn responsiveness & current reading.',
        outfit: {
            headwear: 'tricorn_hat',
            body: 'trenchcoat',
            accessory: 'compass_gauge',
            hatStyle: 'captain_tricorn',
            coatStyle: 'naval_trenchcoat',
            primaryColor: 0x1e3a5f,   // Deep naval blue
            secondaryColor: 0xd4af37, // Gold captain trim / epaulets
            accentColor: 0xf4f4f5,    // Crisp white cravat
            leatherColor: 0x3d2714,   // Dark leather boot & belt
        },
        perks: {
            turnResponsivenessMultiplier: 1.15, // +15% turn responsiveness
            currentReading: true,               // River current reading HUD radar active
            currentReadingAccuracy: 1.15,       // +15% telemetry / eddy prediction
            meleeKnockbackMultiplier: 1.0,
            swingArcMultiplier: 1.0,
            shopCostMultiplier: 1.0,            // Normal shop pricing
            shopCostDiscount: 0.0,
            motorSpeedMultiplier: 1.0,
            blockDamageReductionBonus: 0.0,
            reviveAuraMultiplier: 1.0,
        },
    },
    bruiser: {
        id: 'bruiser',
        name: 'Bruiser',
        title: 'Viking Berserker',
        description: 'Viking horned helmet + shoulder pauldrons, +25% melee knockback & wider swing arc.',
        outfit: {
            headwear: 'horned_helmet',
            body: 'shoulder_pauldrons',
            accessory: 'spiked_bracers',
            hatStyle: 'viking_horned_helm',
            coatStyle: 'fur_trimmed_harness',
            primaryColor: 0x5a201a,   // Crimson / rust raider tunic
            secondaryColor: 0x8c8f94, // Forged iron steel pauldrons & horn caps
            accentColor: 0xd97706,    // Amber fur lining
            leatherColor: 0x2b1e17,   // Studded dark leather
        },
        perks: {
            turnResponsivenessMultiplier: 1.0,
            currentReading: false,
            currentReadingAccuracy: 1.0,
            meleeKnockbackMultiplier: 1.25,     // +25% melee knockback
            swingArcMultiplier: 1.25,           // +25% wider swing arc
            shopCostMultiplier: 1.0,
            shopCostDiscount: 0.0,
            motorSpeedMultiplier: 1.0,
            blockDamageReductionBonus: 0.0,
            reviveAuraMultiplier: 1.0,
        },
    },
    tinkerer: {
        id: 'tinkerer',
        name: 'Tinkerer',
        title: 'Steampunk Artificer',
        description: 'Brass steampunk welding goggles + backpack crane, -20% shop upgrade cost & faster motor.',
        outfit: {
            headwear: 'welding_goggles',
            body: 'backpack_crane',
            accessory: 'utility_toolbelt',
            hatStyle: 'steampunk_brass_goggles',
            coatStyle: 'artificer_work_apron',
            primaryColor: 0x78350f,   // Oiled brown work leather
            secondaryColor: 0xb45309, // Polished brass & copper gears
            accentColor: 0x06b6d4,    // Glowing cyan aether-fuel conduits
            leatherColor: 0x451a03,   // Heavy riveted harness
        },
        perks: {
            turnResponsivenessMultiplier: 1.0,
            currentReading: false,
            currentReadingAccuracy: 1.0,
            meleeKnockbackMultiplier: 1.0,
            swingArcMultiplier: 1.0,
            shopCostMultiplier: 0.80,           // -20% shop upgrade cost
            shopCostDiscount: 0.20,
            motorSpeedMultiplier: 1.25,         // Faster outboard motor (+25% thrust/speed)
            blockDamageReductionBonus: 0.0,
            reviveAuraMultiplier: 1.0,
        },
    },
    mystic: {
        id: 'mystic',
        name: 'Mystic',
        title: 'Lantern Shaman',
        description: 'Lantern monk hood + rune talisman, +25% block damage reduction & wider checkpoint revive aura.',
        outfit: {
            headwear: 'monk_hood',
            body: 'rune_talisman',
            accessory: 'spirit_lantern',
            hatStyle: 'shadow_monk_cowl',
            coatStyle: 'flowing_monastic_vestments',
            primaryColor: 0x312e81,   // Mystic deep indigo cowl
            secondaryColor: 0x10b981, // Glowing emerald runes & talisman gem
            accentColor: 0xa7f3d0,    // Pale jade spiritual aura
            leatherColor: 0x1e1b4b,   // Dark woven sash
        },
        perks: {
            turnResponsivenessMultiplier: 1.0,
            currentReading: false,
            currentReadingAccuracy: 1.0,
            meleeKnockbackMultiplier: 1.0,
            swingArcMultiplier: 1.0,
            shopCostMultiplier: 1.0,
            shopCostDiscount: 0.0,
            motorSpeedMultiplier: 1.0,
            blockDamageReductionBonus: 0.25,    // +25% block damage reduction (takes 25% less damage while blocking)
            reviveAuraMultiplier: 1.25,         // +25% wider checkpoint revive aura
        },
    },
};

/**
 * Normalizes input string to canonical class id ('helmsman', 'bruiser', 'tinkerer', 'mystic').
 * Returns null if not recognized.
 */
export function normalizeCrewClassId(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim().toLowerCase();
    return CREW_CLASS_IDS.includes(clean) ? clean : null;
}

/**
 * Returns class definition by name or id (case-insensitive). Defaults to Helmsman if unknown.
 */
export function getCrewClass(idOrName, fallbackId = 'helmsman') {
    const id = normalizeCrewClassId(idOrName);
    if (id && CREW_CLASSES[id]) return CREW_CLASSES[id];
    const fallback = normalizeCrewClassId(fallbackId) || 'helmsman';
    return CREW_CLASSES[fallback];
}

/**
 * Checks whether an id or name corresponds to a valid playable class.
 */
export function isValidCrewClass(idOrName) {
    return normalizeCrewClassId(idOrName) !== null;
}

/**
 * Calculates modified turn responsiveness (rad/s or yaw response factor).
 * Helmsman gains +15% turn responsiveness.
 */
export function calculateTurnResponsiveness(baseRate, classId) {
    const cls = getCrewClass(classId);
    return baseRate * cls.perks.turnResponsivenessMultiplier;
}

/**
 * Calculates melee knockback force applied to enemies or rafts.
 * Bruiser gains +25% melee knockback.
 */
export function calculateMeleeKnockback(baseKnockback, classId) {
    const cls = getCrewClass(classId);
    return baseKnockback * cls.perks.meleeKnockbackMultiplier;
}

/**
 * Calculates melee weapon swing arc (in radians or normalized span).
 * Bruiser gains +25% wider swing arc.
 */
export function calculateSwingArc(baseArc, classId) {
    const cls = getCrewClass(classId);
    return baseArc * cls.perks.swingArcMultiplier;
}

/**
 * Calculates shop upgrade purchase price.
 * Tinkerer receives a 20% discount (pays 80%, floored to integer coins).
 */
export function calculateShopCost(baseCost, classId) {
    const cls = getCrewClass(classId);
    return Math.max(1, Math.floor(baseCost * cls.perks.shopCostMultiplier));
}

/**
 * Calculates motor boost speed / force.
 * Tinkerer gains +25% faster motor.
 */
export function calculateMotorSpeed(baseMotorSpeed, classId) {
    const cls = getCrewClass(classId);
    return baseMotorSpeed * cls.perks.motorSpeedMultiplier;
}

/**
 * Calculates damage taken when blocking an attack.
 * Base blocking absorbs (1 - baseBlockFactor), e.g. taking 20% of damage.
 * Mystic gains +25% block damage reduction:
 * Damage taken while blocking is reduced by an extra 25% (taking 15% instead of 20%).
 */
export function calculateBlockedDamage(damage, isBlocking, classId, baseBlockFactor = 0.2) {
    if (!isBlocking) return damage;
    const cls = getCrewClass(classId);
    const reductionMultiplier = 1.0 - cls.perks.blockDamageReductionBonus;
    const effectiveFactor = baseBlockFactor * reductionMultiplier;
    return Math.floor(damage * effectiveFactor);
}

/**
 * Calculates revive checkpoint aura radius.
 * Mystic gains +25% wider revive aura radius.
 */
export function calculateReviveAuraRadius(baseRadius, classId) {
    const cls = getCrewClass(classId);
    return baseRadius * cls.perks.reviveAuraMultiplier;
}

/**
 * Checks if class has current reading HUD perk active.
 */
export function hasCurrentReading(classId) {
    const cls = getCrewClass(classId);
    return !!cls.perks.currentReading;
}

/**
 * Applies all class passive perks onto an entity stats snapshot.
 */
export function applyCrewClassPerks(baseStats, classId) {
    const cls = getCrewClass(classId);
    const perks = cls.perks;

    const turnRate = (baseStats.turnRate ?? 2.2) * perks.turnResponsivenessMultiplier;
    const yawResponse = (baseStats.yawResponse ?? 16) * perks.turnResponsivenessMultiplier;
    const meleeKnockback = (baseStats.knockback ?? 1.0) * perks.meleeKnockbackMultiplier;
    const swingArc = (baseStats.swingArc ?? (Math.PI * 0.5)) * perks.swingArcMultiplier;
    const motorBoost = (baseStats.motorBoost ?? 100) * perks.motorSpeedMultiplier;
    const shopDiscount = perks.shopCostDiscount;
    const blockFactor = (baseStats.blockFactor ?? 0.2) * (1.0 - perks.blockDamageReductionBonus);
    const reviveAuraRadius = (baseStats.reviveAuraRadius ?? 25) * perks.reviveAuraMultiplier;
    const canReadCurrent = perks.currentReading;

    return {
        ...baseStats,
        classId: cls.id,
        className: cls.name,
        turnRate,
        yawResponse,
        meleeKnockback,
        swingArc,
        motorBoost,
        shopDiscount,
        blockFactor,
        reviveAuraRadius,
        canReadCurrent,
    };
}

/**
 * Generates descriptive perk summary bullets for HUD / loadout UI.
 */
export function formatPerkSummary(classId) {
    const cls = getCrewClass(classId);
    switch (cls.id) {
        case 'helmsman':
            return [
                '+15% Turn Responsiveness',
                'River Current Telemetry & Reading',
                'Captain Tricorn Hat & Naval Trenchcoat',
            ];
        case 'bruiser':
            return [
                '+25% Melee Knockback',
                '+25% Wider Swing Arc',
                'Viking Horned Helmet & Iron Pauldrons',
            ];
        case 'tinkerer':
            return [
                '-20% Harbor Shop Upgrade Cost',
                '+25% Motor Boost Speed',
                'Brass Steampunk Goggles & Backpack Crane',
            ];
        case 'mystic':
            return [
                '+25% Block Damage Reduction',
                '+25% Checkpoint Revive Aura Radius',
                'Lantern Monk Hood & Rune Talisman',
            ];
        default:
            return [];
    }
}
