import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    CREW_CLASS_IDS,
    CREW_CLASSES,
    normalizeCrewClassId,
    getCrewClass,
    isValidCrewClass,
    calculateTurnResponsiveness,
    calculateMeleeKnockback,
    calculateSwingArc,
    calculateShopCost,
    calculateMotorSpeed,
    calculateBlockedDamage,
    calculateReviveAuraRadius,
    hasCurrentReading,
    applyCrewClassPerks,
    formatPerkSummary,
} from '../shared/crew-classes.js';
import { createCrewClassMesh } from '../public/js/entities/crew-classes-mesh.js';

/**
 * Mock Three.js implementation for deterministic headless unit tests.
 */
function createMockThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
    }

    class Euler {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
    }

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.name = '';
            this.castShadow = false;
            this.receiveShadow = false;
        }
        add(...objs) {
            for (const obj of objs) {
                if (obj) this.children.push(obj);
            }
            return this;
        }
        clone() {
            const copy = new Object3D();
            copy.name = this.name ? `${this.name}_clone` : '';
            return copy;
        }
    }

    class Group extends Object3D {
        constructor() {
            super();
            this.type = 'Group';
        }
    }

    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.type = 'Mesh';
            this.geometry = geometry;
            this.material = material;
        }
        clone() {
            const copy = new Mesh(this.geometry, this.material);
            copy.name = this.name ? `${this.name}_clone` : '';
            return copy;
        }
    }

    class Material {
        constructor(params = {}) {
            Object.assign(this, params);
        }
    }

    class Geometry {
        constructor(type, ...args) {
            this.type = type;
            this.args = args;
        }
    }

    return {
        Group,
        Mesh,
        MeshStandardMaterial: class extends Material { constructor(p) { super(p); this.type = 'MeshStandardMaterial'; } },
        MeshBasicMaterial: class extends Material { constructor(p) { super(p); this.type = 'MeshBasicMaterial'; } },
        BoxGeometry: class extends Geometry { constructor(...a) { super('BoxGeometry', ...a); } },
        CylinderGeometry: class extends Geometry { constructor(...a) { super('CylinderGeometry', ...a); } },
        SphereGeometry: class extends Geometry { constructor(...a) { super('SphereGeometry', ...a); } },
        ConeGeometry: class extends Geometry { constructor(...a) { super('ConeGeometry', ...a); } },
        CapsuleGeometry: class extends Geometry { constructor(...a) { super('CapsuleGeometry', ...a); } },
        TorusGeometry: class extends Geometry { constructor(...a) { super('TorusGeometry', ...a); } },
        OctahedronGeometry: class extends Geometry { constructor(...a) { super('OctahedronGeometry', ...a); } },
    };
}

describe('Crew Classes & Customization: Shared Definitions', () => {
    test('defines all 4 core playable crew classes', () => {
        assert.equal(CREW_CLASS_IDS.length, 4);
        assert.deepEqual(CREW_CLASS_IDS, ['helmsman', 'bruiser', 'tinkerer', 'mystic']);
    });

    test('each class definition contains id, name, title, description, outfit, and perks', () => {
        for (const id of CREW_CLASS_IDS) {
            const cls = CREW_CLASSES[id];
            assert.ok(cls, `Missing class definition for ${id}`);
            assert.equal(cls.id, id);
            assert.ok(typeof cls.name === 'string' && cls.name.length > 0);
            assert.ok(typeof cls.title === 'string' && cls.title.length > 0);
            assert.ok(typeof cls.description === 'string' && cls.description.length > 0);
            assert.ok(cls.outfit && typeof cls.outfit === 'object');
            assert.ok(cls.perks && typeof cls.perks === 'object');
        }
    });

    test('Helmsman outfit & passive perk values match requirements', () => {
        const helmsman = CREW_CLASSES.helmsman;
        assert.equal(helmsman.name, 'Helmsman');
        assert.equal(helmsman.outfit.headwear, 'tricorn_hat');
        assert.equal(helmsman.outfit.body, 'trenchcoat');
        assert.equal(helmsman.perks.turnResponsivenessMultiplier, 1.15); // +15% turn responsiveness
        assert.equal(helmsman.perks.currentReading, true); // current reading
        assert.equal(helmsman.perks.currentReadingAccuracy, 1.15);
    });

    test('Bruiser outfit & passive perk values match requirements', () => {
        const bruiser = CREW_CLASSES.bruiser;
        assert.equal(bruiser.name, 'Bruiser');
        assert.equal(bruiser.outfit.headwear, 'horned_helmet');
        assert.equal(bruiser.outfit.body, 'shoulder_pauldrons');
        assert.equal(bruiser.perks.meleeKnockbackMultiplier, 1.25); // +25% melee knockback
        assert.equal(bruiser.perks.swingArcMultiplier, 1.25); // +25% wider swing arc
    });

    test('Tinkerer outfit & passive perk values match requirements', () => {
        const tinkerer = CREW_CLASSES.tinkerer;
        assert.equal(tinkerer.name, 'Tinkerer');
        assert.equal(tinkerer.outfit.headwear, 'welding_goggles');
        assert.equal(tinkerer.outfit.body, 'backpack_crane');
        assert.equal(tinkerer.perks.shopCostMultiplier, 0.80); // -20% shop upgrade cost
        assert.equal(tinkerer.perks.motorSpeedMultiplier, 1.25); // faster motor
    });

    test('Mystic outfit & passive perk values match requirements', () => {
        const mystic = CREW_CLASSES.mystic;
        assert.equal(mystic.name, 'Mystic');
        assert.equal(mystic.outfit.headwear, 'monk_hood');
        assert.equal(mystic.outfit.body, 'rune_talisman');
        assert.equal(mystic.perks.blockDamageReductionBonus, 0.25); // +25% block damage reduction
        assert.equal(mystic.perks.reviveAuraMultiplier, 1.25); // wider checkpoint revive aura
    });
});

describe('Crew Classes: Lookups, Normalization & Validation', () => {
    test('normalizeCrewClassId correctly sanitizes input strings', () => {
        assert.equal(normalizeCrewClassId('helmsman'), 'helmsman');
        assert.equal(normalizeCrewClassId('  BRUISER  '), 'bruiser');
        assert.equal(normalizeCrewClassId('Tinkerer'), 'tinkerer');
        assert.equal(normalizeCrewClassId('MYSTIC'), 'mystic');
        assert.equal(normalizeCrewClassId('wizard'), null);
        assert.equal(normalizeCrewClassId(''), null);
        assert.equal(normalizeCrewClassId(null), null);
        assert.equal(normalizeCrewClassId(undefined), null);
    });

    test('getCrewClass retrieves canonical class by id or returns fallback', () => {
        assert.equal(getCrewClass('bruiser').id, 'bruiser');
        assert.equal(getCrewClass('tinkerer').id, 'tinkerer');
        assert.equal(getCrewClass('unknown_class').id, 'helmsman');
        assert.equal(getCrewClass('unknown_class', 'mystic').id, 'mystic');
    });

    test('isValidCrewClass returns boolean appropriately', () => {
        assert.equal(isValidCrewClass('helmsman'), true);
        assert.equal(isValidCrewClass('bruiser'), true);
        assert.equal(isValidCrewClass('tinkerer'), true);
        assert.equal(isValidCrewClass('mystic'), true);
        assert.equal(isValidCrewClass('pirate'), false);
    });
});

describe('Crew Classes: Pure Perk Calculation Helpers', () => {
    test('calculateTurnResponsiveness boosts Helmsman by +15% and leaves others base', () => {
        const base = 2.0;
        assert.equal(calculateTurnResponsiveness(base, 'helmsman'), 2.3);
        assert.equal(calculateTurnResponsiveness(base, 'bruiser'), 2.0);
        assert.equal(calculateTurnResponsiveness(base, 'tinkerer'), 2.0);
        assert.equal(calculateTurnResponsiveness(base, 'mystic'), 2.0);
    });

    test('calculateMeleeKnockback boosts Bruiser by +25% and leaves others base', () => {
        const base = 100;
        assert.equal(calculateMeleeKnockback(base, 'bruiser'), 125);
        assert.equal(calculateMeleeKnockback(base, 'helmsman'), 100);
        assert.equal(calculateMeleeKnockback(base, 'tinkerer'), 100);
        assert.equal(calculateMeleeKnockback(base, 'mystic'), 100);
    });

    test('calculateSwingArc widens Bruiser swing arc by +25%', () => {
        const baseArc = Math.PI * 0.5;
        assert.equal(calculateSwingArc(baseArc, 'bruiser'), baseArc * 1.25);
        assert.equal(calculateSwingArc(baseArc, 'helmsman'), baseArc);
    });

    test('calculateShopCost applies -20% discount for Tinkerer and rounds correctly', () => {
        assert.equal(calculateShopCost(10, 'tinkerer'), 8);  // Motor upgrade (10 -> 8)
        assert.equal(calculateShopCost(15, 'tinkerer'), 12); // Hammer upgrade (15 -> 12)
        assert.equal(calculateShopCost(20, 'tinkerer'), 16); // Armor upgrade (20 -> 16)

        // Other classes pay standard prices
        assert.equal(calculateShopCost(10, 'helmsman'), 10);
        assert.equal(calculateShopCost(15, 'bruiser'), 15);
        assert.equal(calculateShopCost(20, 'mystic'), 20);
    });

    test('calculateMotorSpeed boosts Tinkerer motor boost by +25%', () => {
        const baseSpeed = 100;
        assert.equal(calculateMotorSpeed(baseSpeed, 'tinkerer'), 125);
        assert.equal(calculateMotorSpeed(baseSpeed, 'helmsman'), 100);
        assert.equal(calculateMotorSpeed(baseSpeed, 'bruiser'), 100);
    });

    test('calculateBlockedDamage reduces blocked damage further for Mystic', () => {
        const damage = 40;
        // Not blocking: full damage
        assert.equal(calculateBlockedDamage(damage, false, 'mystic'), 40);
        assert.equal(calculateBlockedDamage(damage, false, 'helmsman'), 40);

        // Blocking with baseBlockFactor = 0.2:
        // Standard takes 40 * 0.2 = 8 damage
        assert.equal(calculateBlockedDamage(damage, true, 'helmsman'), 8);
        assert.equal(calculateBlockedDamage(damage, true, 'bruiser'), 8);

        // Mystic (+25% block damage reduction bonus) takes:
        // factor = 0.2 * (1 - 0.25) = 0.15 -> 40 * 0.15 = 6 damage
        assert.equal(calculateBlockedDamage(damage, true, 'mystic'), 6);
    });

    test('calculateReviveAuraRadius extends Mystic aura by +25%', () => {
        const baseRadius = 20;
        assert.equal(calculateReviveAuraRadius(baseRadius, 'mystic'), 25);
        assert.equal(calculateReviveAuraRadius(baseRadius, 'helmsman'), 20);
    });

    test('hasCurrentReading checks navigation perk correctly', () => {
        assert.equal(hasCurrentReading('helmsman'), true);
        assert.equal(hasCurrentReading('bruiser'), false);
        assert.equal(hasCurrentReading('tinkerer'), false);
        assert.equal(hasCurrentReading('mystic'), false);
    });

    test('applyCrewClassPerks modifies complete stats block cleanly', () => {
        const base = {
            turnRate: 2.2,
            yawResponse: 16,
            knockback: 10,
            swingArc: 1.5,
            motorBoost: 100,
            blockFactor: 0.2,
            reviveAuraRadius: 20,
        };

        const helmsmanStats = applyCrewClassPerks(base, 'helmsman');
        assert.equal(helmsmanStats.classId, 'helmsman');
        assert.ok(helmsmanStats.turnRate > 2.2);
        assert.equal(helmsmanStats.canReadCurrent, true);

        const bruiserStats = applyCrewClassPerks(base, 'bruiser');
        assert.equal(bruiserStats.meleeKnockback, 12.5);
        assert.equal(bruiserStats.swingArc, 1.5 * 1.25);

        const tinkererStats = applyCrewClassPerks(base, 'tinkerer');
        assert.equal(tinkererStats.motorBoost, 125);
        assert.equal(tinkererStats.shopDiscount, 0.2);

        const mysticStats = applyCrewClassPerks(base, 'mystic');
        assert.equal(mysticStats.blockFactor, 0.2 * 0.75);
        assert.equal(mysticStats.reviveAuraRadius, 25);
    });

    test('formatPerkSummary returns readable array of bullets for all classes', () => {
        for (const id of CREW_CLASS_IDS) {
            const summary = formatPerkSummary(id);
            assert.ok(Array.isArray(summary));
            assert.ok(summary.length >= 3);
            for (const bullet of summary) {
                assert.ok(typeof bullet === 'string' && bullet.length > 0);
            }
        }
    });
});

describe('Crew Classes Mesh Rig: Articulated Three.js Character Builder', () => {
    const mockThree = createMockThree();

    test('builds valid rig for Helmsman with captain tricorn and trenchcoat', () => {
        const rig = createCrewClassMesh(mockThree, 'helmsman');
        assert.ok(rig.root);
        assert.equal(rig.classId, 'helmsman');
        assert.equal(rig.root.name, 'CrewClassRig_helmsman');

        // Check skeleton bones
        assert.ok(rig.bones.pelvis);
        assert.ok(rig.bones.spine);
        assert.ok(rig.bones.headGroup);
        assert.ok(rig.bones.leftArm);
        assert.ok(rig.bones.rightArm);

        // Check Helmsman cosmetics
        assert.ok(rig.cosmetics.hat);
        assert.equal(rig.cosmetics.hat.name, 'captainTricorn');
        assert.ok(rig.cosmetics.coat);
        assert.equal(rig.cosmetics.coat.name, 'navalTrenchcoat');
        assert.ok(rig.cosmetics.accessory);
        assert.equal(rig.cosmetics.accessory.name, 'compassGauge');
    });

    test('builds valid rig for Bruiser with horned helmet, pauldrons, and broader frame', () => {
        const rig = createCrewClassMesh(mockThree, 'bruiser');
        assert.equal(rig.classId, 'bruiser');
        assert.equal(rig.root.name, 'CrewClassRig_bruiser');

        // Check Bruiser cosmetics
        assert.ok(rig.cosmetics.hat);
        assert.equal(rig.cosmetics.hat.name, 'vikingHornedHelm');
        assert.ok(Array.isArray(rig.cosmetics.pauldrons));
        assert.equal(rig.cosmetics.pauldrons.length, 2);
        assert.equal(rig.cosmetics.pauldrons[0].name, 'pauldronLeft');
        assert.equal(rig.cosmetics.pauldrons[1].name, 'pauldronRight');
    });

    test('builds valid rig for Tinkerer with brass welding goggles and backpack crane', () => {
        const rig = createCrewClassMesh(mockThree, 'tinkerer');
        assert.equal(rig.classId, 'tinkerer');

        // Check Tinkerer cosmetics
        assert.ok(rig.cosmetics.hat);
        assert.equal(rig.cosmetics.hat.name, 'steampunkBrassGoggles');
        assert.ok(rig.cosmetics.backpack);
        assert.equal(rig.cosmetics.backpack.name, 'backpackCrane');
        assert.ok(rig.cosmetics.craneBase);
    });

    test('builds valid rig for Mystic with monk cowl, talisman, and spirit lantern', () => {
        const rig = createCrewClassMesh(mockThree, 'mystic');
        assert.equal(rig.classId, 'mystic');

        // Check Mystic cosmetics
        assert.ok(rig.cosmetics.hat);
        assert.equal(rig.cosmetics.hat.name, 'shadowMonkCowl');
        assert.ok(rig.cosmetics.talisman);
        assert.equal(rig.cosmetics.talisman.name, 'runeTalisman');
        assert.ok(rig.cosmetics.accessory);
        assert.equal(rig.cosmetics.accessory.name, 'spiritLantern');
    });

    test('rig update animates rowing cycle during normal movement', () => {
        const rig = createCrewClassMesh(mockThree, 'helmsman');
        rig.update(0.1, { speed: 10, turn: 0.5 });

        // Arms and spine should have been positioned
        assert.notEqual(rig.bones.leftArm.rotation.x, 0);
        assert.notEqual(rig.bones.rightArm.rotation.x, 0);
        assert.notEqual(rig.bones.spine.rotation.z, 0);
    });

    test('rig update adapts posture for blocking stance', () => {
        const rig = createCrewClassMesh(mockThree, 'mystic');
        rig.update(0.016, { block: true });

        // Arms raised in guard
        assert.ok(rig.bones.leftArm.rotation.x > 1.0);
        assert.ok(rig.bones.rightArm.rotation.x > 1.0);
    });

    test('rig update adapts posture for melee swing', () => {
        const rig = createCrewClassMesh(mockThree, 'bruiser');
        rig.update(0.016, { swing: 0.5 });

        // Right arm lunging forward
        assert.notEqual(rig.bones.rightArm.rotation.x, 0);
        assert.notEqual(rig.bones.spine.rotation.y, 0);
    });

    test('rig update adapts posture for airborne jumps', () => {
        const rig = createCrewClassMesh(mockThree, 'tinkerer');
        rig.update(0.016, { airborne: true });

        // Legs tucked
        assert.equal(rig.bones.leftLeg.rotation.x, -0.7);
        assert.equal(rig.bones.rightLeg.rotation.x, -0.7);
    });

    test('supports custom options such as playerColor and scale factor', () => {
        const customColor = 0xff00ff;
        const rig = createCrewClassMesh(mockThree, 'helmsman', { playerColor: customColor, scale: 1.5 });

        assert.equal(rig.materials.primary.color, customColor);
        assert.equal(rig.root.scale.x, 1.5);
        assert.equal(rig.root.scale.y, 1.5);
        assert.equal(rig.root.scale.z, 1.5);
    });
});
