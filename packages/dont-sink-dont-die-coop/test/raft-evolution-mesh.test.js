import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    EVOLUTION_UPGRADE_KEYS,
    normalizeEvolutionUpgrades,
    buildIronHullAttachment,
    buildOutboardMotorAttachment,
    buildWarMalletAttachment,
    buildHealingTotemAttachment,
    buildRaftEvolutionAttachments,
    updateRaftEvolutionVis,
} from '../public/js/entities/raft-evolution-mesh.js';

/**
 * Headless Three.js mock for deterministic unit testing.
 */
function createMockTHREE() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }
    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }
    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.visible = true;
            this.name = '';
            this.userData = {};
        }
        add(...objs) {
            for (const o of objs) if (o) this.children.push(o);
            return this;
        }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx !== -1) this.children.splice(idx, 1);
        }
    }
    class Group extends Object3D { constructor() { super(); this.type = 'Group'; } }
    class Mesh extends Object3D {
        constructor(geo, mat) {
            super();
            this.type = 'Mesh';
            this.geometry = geo;
            this.material = mat;
        }
    }
    class Geometry {
        constructor(type, ...args) { this.type = type; this.args = args; }
        rotateX() { return this; }
    }
    class Material {
        constructor(type, p = {}) {
            this.type = type;
            this.opacity = 1.0;
            this.transparent = false;
            Object.assign(this, p);
        }
    }

    return {
        Group,
        Mesh,
        MeshStandardMaterial: class extends Material { constructor(p) { super('MeshStandardMaterial', p); } },
        MeshBasicMaterial: class extends Material { constructor(p) { super('MeshBasicMaterial', p); } },
        CylinderGeometry: class extends Geometry { constructor(...a) { super('CylinderGeometry', ...a); } },
        BoxGeometry: class extends Geometry { constructor(...a) { super('BoxGeometry', ...a); } },
        ConeGeometry: class extends Geometry { constructor(...a) { super('ConeGeometry', ...a); } },
        SphereGeometry: class extends Geometry { constructor(...a) { super('SphereGeometry', ...a); } },
        TorusGeometry: class extends Geometry { constructor(...a) { super('TorusGeometry', ...a); } },
        RingGeometry: class extends Geometry { constructor(...a) { super('RingGeometry', ...a); } },
        DoubleSide: 2,
    };
}

describe('Raft Evolution Key Normalization & Mapping', () => {
    it('normalizes canonical full-string upgrade names', () => {
        const input = ['Iron Hull', 'Outboard Motor', 'War Mallet', 'Healing Totem'];
        const keys = normalizeEvolutionUpgrades(input);

        assert.equal(keys.size, 4);
        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.IRON_HULL));
        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.OUTBOARD_MOTOR));
        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.WAR_MALLET));
        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.HEALING_TOTEM));
    });

    it('normalizes legacy armory slot keys and tiered IDs', () => {
        const input = ['armor_1', 'motor_mk2', 'weapon_3', 'totem'];
        const keys = normalizeEvolutionUpgrades(input);

        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.IRON_HULL));
        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.OUTBOARD_MOTOR));
        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.WAR_MALLET));
        assert.ok(keys.has(EVOLUTION_UPGRADE_KEYS.HEALING_TOTEM));
    });

    it('handles Sets, boolean maps, empty arrays, null, and unknown upgrades cleanly', () => {
        const setInput = new Set(['Iron Hull', 'unknown_powerup']);
        const setKeys = normalizeEvolutionUpgrades(setInput);
        assert.equal(setKeys.size, 1);
        assert.ok(setKeys.has(EVOLUTION_UPGRADE_KEYS.IRON_HULL));

        const objInput = { 'Outboard Motor': true, 'War Mallet': false, 'Healing Totem': true };
        const objKeys = normalizeEvolutionUpgrades(objInput);
        assert.equal(objKeys.size, 2);
        assert.ok(objKeys.has(EVOLUTION_UPGRADE_KEYS.OUTBOARD_MOTOR));
        assert.ok(objKeys.has(EVOLUTION_UPGRADE_KEYS.HEALING_TOTEM));
        assert.ok(!objKeys.has(EVOLUTION_UPGRADE_KEYS.WAR_MALLET));

        assert.equal(normalizeEvolutionUpgrades([]).size, 0);
        assert.equal(normalizeEvolutionUpgrades(null).size, 0);
        assert.equal(normalizeEvolutionUpgrades(undefined).size, 0);
    });
});

describe('3D Raft Evolution Individual Attachment Builders', () => {
    const mockTHREE = createMockTHREE();
    const materials = {
        ironProw: new mockTHREE.MeshStandardMaterial(),
        spikes: new mockTHREE.MeshStandardMaterial(),
        brassProp: new mockTHREE.MeshStandardMaterial(),
        exhaustPipe: new mockTHREE.MeshStandardMaterial(),
        woodRack: new mockTHREE.MeshStandardMaterial(),
        hammerHead: new mockTHREE.MeshStandardMaterial(),
        runeGlow: new mockTHREE.MeshBasicMaterial(),
        totemWood: new mockTHREE.MeshStandardMaterial(),
        totemCarving: new mockTHREE.MeshStandardMaterial(),
        emeraldGlow: new mockTHREE.MeshBasicMaterial(),
        emeraldLanternGlass: new mockTHREE.MeshBasicMaterial(),
        haloRing: new mockTHREE.MeshBasicMaterial(),
    };

    it('builds Iron Hull with spiked prow plating, ramming beak, and spikes', () => {
        const iron = buildIronHullAttachment(mockTHREE, materials);
        assert.equal(iron.group.name, 'RaftEvolution_IronHull');
        assert.equal(iron.group.visible, false);
        assert.ok(iron.prowPlates);
        assert.ok(iron.rammingBeak);
        assert.ok(iron.spikes.length >= 3);
    });

    it('builds Outboard Motor with engine block, twin exhaust pipes, and twin spinning brass props', () => {
        const motor = buildOutboardMotorAttachment(mockTHREE, materials);
        assert.equal(motor.group.name, 'RaftEvolution_OutboardMotor');
        assert.equal(motor.group.visible, false);
        assert.equal(motor.exhaustPipes.length, 2);
        assert.equal(motor.propellers.length, 2);
        assert.equal(motor.propellers[0].blades.length, 3);
        assert.equal(motor.propellers[1].blades.length, 3);
        assert.equal(motor.propellers[0].side, 'port');
        assert.equal(motor.propellers[1].side, 'starboard');
    });

    it('builds War Mallet with weapons rack and multiple glowing rune hammers', () => {
        const mallet = buildWarMalletAttachment(mockTHREE, materials);
        assert.equal(mallet.group.name, 'RaftEvolution_WarMallet');
        assert.equal(mallet.group.visible, false);
        assert.ok(mallet.rack);
        assert.equal(mallet.hammers.length, 3);
        for (const h of mallet.hammers) {
            assert.ok(h.head);
            assert.equal(h.runes.length, 2);
        }
    });

    it('builds Healing Totem with carved totem pole, emerald lantern, core, and halo ring', () => {
        const totem = buildHealingTotemAttachment(mockTHREE, materials);
        assert.equal(totem.group.name, 'RaftEvolution_HealingTotem');
        assert.equal(totem.group.visible, false);
        assert.ok(totem.poleGroup);
        assert.ok(totem.lanternRig);
        assert.ok(totem.lanternCore);
        assert.ok(totem.haloRing);
    });
});

describe('buildRaftEvolutionAttachments Root Assembler & Structure', () => {
    const mockTHREE = createMockTHREE();

    it('instantiates all 4 upgrade attachments into the root group', () => {
        const handle = buildRaftEvolutionAttachments(mockTHREE);
        assert.equal(handle.group.type, 'Group');
        assert.equal(handle.group.name, 'RaftEvolution_AttachmentsRoot');
        assert.equal(handle.group.children.length, 4);

        assert.ok(handle.attachments.ironHull);
        assert.ok(handle.attachments.outboardMotor);
        assert.ok(handle.attachments.warMallet);
        assert.ok(handle.attachments.healingTotem);

        // Initially all attachments are hidden until purchased
        assert.equal(handle.attachments.ironHull.group.visible, false);
        assert.equal(handle.attachments.outboardMotor.group.visible, false);
        assert.equal(handle.attachments.warMallet.group.visible, false);
        assert.equal(handle.attachments.healingTotem.group.visible, false);
    });

    it('accepts custom dimensions and custom materials', () => {
        const customMat = {
            ironProw: new mockTHREE.MeshBasicMaterial({ color: 0xff0000 }),
        };
        const handle = buildRaftEvolutionAttachments(mockTHREE, {
            raftDimensions: { w: 4, h: 0.8, d: 5 },
            customMaterials: customMat,
        });

        assert.equal(handle.raftDimensions.w, 4);
        assert.equal(handle.raftDimensions.h, 0.8);
        assert.equal(handle.raftDimensions.d, 5);
        assert.equal(handle.materials.ironProw.color, 0xff0000);
    });
});

describe('updateRaftEvolutionVis Line-of-Sight Upgrades & Animations', () => {
    const mockTHREE = createMockTHREE();

    it('selectively shows visible 3D mutations when upgrades are purchased', () => {
        const handle = buildRaftEvolutionAttachments(mockTHREE);

        // Scenario 1: Only Iron Hull purchased
        updateRaftEvolutionVis(handle, ['Iron Hull'], 0.016);
        assert.equal(handle.attachments.ironHull.group.visible, true);
        assert.equal(handle.attachments.outboardMotor.group.visible, false);
        assert.equal(handle.attachments.warMallet.group.visible, false);
        assert.equal(handle.attachments.healingTotem.group.visible, false);

        // Scenario 2: Iron Hull + Outboard Motor purchased
        updateRaftEvolutionVis(handle, ['Iron Hull', 'Outboard Motor'], 0.016);
        assert.equal(handle.attachments.ironHull.group.visible, true);
        assert.equal(handle.attachments.outboardMotor.group.visible, true);
        assert.equal(handle.attachments.warMallet.group.visible, false);
        assert.equal(handle.attachments.healingTotem.group.visible, false);

        // Scenario 3: All 4 upgrades purchased
        updateRaftEvolutionVis(handle, ['Iron Hull', 'Outboard Motor', 'War Mallet', 'Healing Totem'], 0.016);
        assert.equal(handle.attachments.ironHull.group.visible, true);
        assert.equal(handle.attachments.outboardMotor.group.visible, true);
        assert.equal(handle.attachments.warMallet.group.visible, true);
        assert.equal(handle.attachments.healingTotem.group.visible, true);

        // Scenario 4: Upgrades removed / reset
        updateRaftEvolutionVis(handle, [], 0.016);
        assert.equal(handle.attachments.ironHull.group.visible, false);
        assert.equal(handle.attachments.outboardMotor.group.visible, false);
        assert.equal(handle.attachments.warMallet.group.visible, false);
        assert.equal(handle.attachments.healingTotem.group.visible, false);
    });

    it('spins twin brass propellers counter-directionally when motor is active', () => {
        const handle = buildRaftEvolutionAttachments(mockTHREE);
        const motor = handle.attachments.outboardMotor;

        updateRaftEvolutionVis(handle, ['Outboard Motor'], 0.1);

        assert.ok(motor.spinAngle > 0);
        const portRotZ = motor.propellers[0].hub.rotation.z;
        const starRotZ = motor.propellers[1].hub.rotation.z;

        // Counter-rotating: one positive, one negative
        assert.ok(portRotZ > 0);
        assert.ok(starRotZ < 0);
        assert.equal(portRotZ, -starRotZ);
    });

    it('animates rune glow pulse and hammer floating offset when war mallet is active', () => {
        const handle = buildRaftEvolutionAttachments(mockTHREE);
        const mallet = handle.attachments.warMallet;
        const initialY = mallet.hammers[0].group.position.y;

        updateRaftEvolutionVis(handle, ['War Mallet'], 0.5);

        assert.ok(handle.materials.runeGlow.opacity > 0);
        // Hammer floating offset oscillates
        assert.ok(mallet.hammers[0].group.position.y !== initialY);
    });

    it('animates emerald lantern sway, core pulse, and halo ring rotation when totem is active', () => {
        const handle = buildRaftEvolutionAttachments(mockTHREE);
        const totem = handle.attachments.healingTotem;

        updateRaftEvolutionVis(handle, ['Healing Totem'], 0.25);

        // Lantern sways
        assert.ok(totem.lanternRig.rotation.z !== 0);
        // Core scale breathes
        assert.ok(totem.lanternCore.scale.x > 0);
        // Halo ring rotates
        assert.ok(totem.haloRing.rotation.z > 0);
    });

    it('tolerates undefined or missing handle and negative dt without throwing', () => {
        assert.doesNotThrow(() => updateRaftEvolutionVis(null, ['iron_hull'], 0.016));
        assert.doesNotThrow(() => updateRaftEvolutionVis({}, ['iron_hull'], 0.016));

        const handle = buildRaftEvolutionAttachments(mockTHREE);
        assert.doesNotThrow(() => updateRaftEvolutionVis(handle, ['iron_hull'], -1.0));
    });
});
