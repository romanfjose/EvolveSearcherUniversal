import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildVolcanicShipwreckCalderaBiome,
    stepVolcanicShipwreckCalderaBiome,
    createPrng,
} from '../public/js/world/biome-act4-volcanic-shipwreck-caldera.js';

// Minimal Mock of Three.js matching repo testing conventions
function createMockTHREE() {
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
        copy(v) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }
        clone() {
            return new Vector3(this.x, this.y, this.z);
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

    class Color {
        constructor(hex = 0xffffff) {
            this.hex = hex;
        }
        setHex(hex) {
            this.hex = hex;
            return this;
        }
    }

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.scale.set = (x, y, z) => {
                this.scale.x = x;
                this.scale.y = y;
                this.scale.z = z;
                return this.scale;
            };
            this.children = [];
            this.visible = true;
            this.userData = {};
            this.name = '';
        }
        add(...objs) {
            for (const o of objs) {
                if (o) this.children.push(o);
            }
            return this;
        }
    }

    class Group extends Object3D {
        constructor() {
            super();
            this.type = 'Group';
        }
    }

    class Mesh extends Object3D {
        constructor(geo, mat) {
            super();
            this.type = 'Mesh';
            this.geometry = geo;
            this.material = mat;
        }
    }

    class Material {
        constructor(opts = {}) {
            Object.assign(this, opts);
            if (opts.color !== undefined) this.color = new Color(opts.color);
            if (opts.emissive !== undefined) this.emissive = new Color(opts.emissive);
            this.emissiveIntensity = opts.emissiveIntensity ?? 1.0;
        }
    }

    class Geometry {
        constructor(...args) {
            this.type = this.constructor.name;
            this.args = args;
        }
    }

    return {
        Vector3,
        Euler,
        Color,
        Object3D,
        Group,
        Mesh,
        Material,
        MeshStandardMaterial: class extends Material {},
        MeshBasicMaterial: class extends Material {},
        BoxGeometry: class extends Geometry {},
        CylinderGeometry: class extends Geometry {},
        SphereGeometry: class extends Geometry {},
        TorusGeometry: class extends Geometry {},
        OctahedronGeometry: class extends Geometry {},
        ConeGeometry: class extends Geometry {},
    };
}

describe('Act IV: Volcanic Shipwreck Graveyard & Citadel Mouth Caldera Biome', () => {
    it('creates biome root group with default parameters { riverWidth: 80, zStart: -1150, zEnd: -1600 }', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE);

        assert.ok(root, 'Root group created');
        assert.equal(root.name, 'Act4_VolcanicShipwreckCalderaBiome');
        assert.equal(root.userData.isAct4CalderaBiome, true);
        assert.equal(root.userData.riverWidth, 80);
        assert.equal(root.userData.zStart, -1150);
        assert.equal(root.userData.zEnd, -1600);
        assert.ok(Array.isArray(root.userData.items), 'items is an array');
        assert.ok(root.userData.items.length > 0, 'Contains architectural setpieces');
        assert.ok(root.children.length > 0, 'Children attached to root group');
    });

    it('respects custom configuration options for riverWidth, zStart, zEnd, and seed', () => {
        const THREE = createMockTHREE();
        const custom = buildVolcanicShipwreckCalderaBiome(THREE, {
            riverWidth: 100,
            zStart: -1200,
            zEnd: -1800,
            seed: 9876,
        });

        assert.equal(custom.userData.riverWidth, 100);
        assert.equal(custom.userData.zStart, -1200);
        assert.equal(custom.userData.zEnd, -1800);
    });

    it('instantiates all 5 required architectural setpiece types', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE, { riverWidth: 80, zStart: -1150, zEnd: -1600 });
        const items = root.userData.items;

        const types = new Set(items.map((it) => it.type));
        assert.ok(types.has('galleonRibs'), 'Contains galleon ribs');
        assert.ok(types.has('basaltSeaStacks'), 'Contains basalt magma sea stacks');
        assert.ok(types.has('chainTower'), 'Contains iron chain towers');
        assert.ok(types.has('obsidianBastion'), 'Contains obsidian bastion walls');
        assert.ok(types.has('ironcladDock'), 'Contains ironclad salvage docks');
    });

    it('verifies Colossal Upturned Galleon Hull Ribs architecture and overarching span', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE, { riverWidth: 80 });
        const galleons = root.userData.items.filter((it) => it.type === 'galleonRibs');

        assert.ok(galleons.length >= 3, 'At least 3 overarching galleon hull rib gates');
        for (const galleon of galleons) {
            assert.ok(galleon.keelson, 'Has central keelson spine beam');
            assert.ok(Array.isArray(galleon.ribs), 'Has ribs array');
            assert.ok(galleon.ribs.length >= 7, 'Has at least 7 rib arches per galleon');
            assert.equal(galleon.group.position.x, 0, 'Galleon arch centered over river channel');
        }
    });

    it('verifies Jagged Basalt Sea Stacks with animated glowing magma fissures', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE, { riverWidth: 80 });
        const stacks = root.userData.items.filter((it) => it.type === 'basaltSeaStacks');

        assert.ok(stacks.length >= 5, 'Contains multiple basalt sea stack clusters');
        for (const stack of stacks) {
            assert.ok(stack.columns.length >= 5, 'Columns per cluster >= 5');
            assert.ok(stack.fissures.length >= 5, 'Magma fissures present in cluster');
            assert.ok(stack.magmaMat, 'Has magma material');
            assert.ok(stack.magmaMat.emissiveIntensity >= 1.5, 'Magma has high emissive glow');
            // Stacks should be on the banks (outside river channel)
            assert.ok(Math.abs(stack.position.x) >= 40, 'Stacks placed along riverbanks (|x| >= 40)');
        }
    });

    it('verifies Rusted Iron Chain-Towers with swaying catenary chain links', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE, { riverWidth: 80 });
        const towers = root.userData.items.filter((it) => it.type === 'chainTower');

        assert.ok(towers.length >= 4, 'Contains at least 4 chain towers');
        for (const tower of towers) {
            assert.ok(tower.chainPivot, 'Has chainPivot for physics sway');
            assert.ok(Array.isArray(tower.chainLinks), 'Has chainLinks array');
            assert.ok(tower.chainLinks.length >= 6, 'Has multiple chain links in chain');
            assert.ok(tower.swaySpeed > 0, 'Has valid swaySpeed');
            assert.ok(tower.swayAmplitude > 0, 'Has valid swayAmplitude');
        }
    });

    it('verifies Fortified Obsidian Bastion Walls guarding the river mouth', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE, { riverWidth: 80, zEnd: -1600 });
        const bastions = root.userData.items.filter((it) => it.type === 'obsidianBastion');

        assert.equal(bastions.length, 2, 'Twin bastion fortress walls at river mouth');
        const [leftBastion, rightBastion] = bastions;
        assert.ok(leftBastion.position.x < 0, 'Left bastion positioned on negative bank');
        assert.ok(rightBastion.position.x > 0, 'Right bastion positioned on positive bank');
        assert.ok(leftBastion.brazier, 'Bastion has ward brazier');
        assert.ok(leftBastion.wardMat, 'Bastion has ward glow material');
        assert.ok(leftBastion.wardMat.emissiveIntensity >= 1.0, 'Bastion ward has emissive intensity');
    });

    it('verifies Reinforced Ironclad Salvage Docks with smelters and derrick cranes', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE, { riverWidth: 80 });
        const docks = root.userData.items.filter((it) => it.type === 'ironcladDock');

        assert.ok(docks.length >= 2, 'Contains at least 2 salvage docks');
        for (const dock of docks) {
            assert.ok(dock.cranePivot, 'Dock has derrick crane pivot');
            assert.ok(dock.furnaceMat, 'Dock has smelter furnace material');
            assert.ok(dock.grate, 'Dock has furnace grate');
            assert.ok(dock.craneSwingSpeed > 0, 'Crane has swing speed');
        }
    });

    it('stepVolcanicShipwreckCalderaBiome animates magma pulses, chain sway, braziers and cranes', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE);

        const stack = root.userData.items.find((it) => it.type === 'basaltSeaStacks');
        const tower = root.userData.items.find((it) => it.type === 'chainTower');
        const bastion = root.userData.items.find((it) => it.type === 'obsidianBastion');
        const dock = root.userData.items.find((it) => it.type === 'ironcladDock');

        const initialMagma = stack.magmaMat.emissiveIntensity;
        const initialChainZ = tower.chainPivot.rotation.z;
        const initialBrazier = bastion.wardMat.emissiveIntensity;
        const initialCraneY = dock.cranePivot.rotation.y;

        // Step simulation forward
        stepVolcanicShipwreckCalderaBiome(root, 0.05, 1.25);

        assert.notEqual(stack.magmaMat.emissiveIntensity, initialMagma, 'Magma emissive breathed');
        assert.notEqual(tower.chainPivot.rotation.z, initialChainZ, 'Chain swayed');
        assert.notEqual(bastion.wardMat.emissiveIntensity, initialBrazier, 'Brazier flickered');
        assert.notEqual(dock.cranePivot.rotation.y, initialCraneY, 'Crane swiveled');
    });

    it('stepVolcanicShipwreckCalderaBiome handles null, undefined, or missing userData without crashing', () => {
        assert.doesNotThrow(() => {
            stepVolcanicShipwreckCalderaBiome(null, 0.016, 0);
            stepVolcanicShipwreckCalderaBiome(undefined, 0.016, 0);
            stepVolcanicShipwreckCalderaBiome({}, 0.016, 0);
            stepVolcanicShipwreckCalderaBiome({ userData: {} }, 0.016, 0);
        });
    });

    it('ensures no NaN or Infinity coordinates or scales are generated during step', () => {
        const THREE = createMockTHREE();
        const root = buildVolcanicShipwreckCalderaBiome(THREE);

        for (let step = 0; step < 100; step++) {
            const time = step * 0.033;
            stepVolcanicShipwreckCalderaBiome(root, 0.033, time);
        }

        // Check values across items
        for (const it of root.userData.items) {
            assert.ok(!isNaN(it.position.x) && isFinite(it.position.x), 'Item pos X is valid');
            assert.ok(!isNaN(it.position.y) && isFinite(it.position.y), 'Item pos Y is valid');
            assert.ok(!isNaN(it.position.z) && isFinite(it.position.z), 'Item pos Z is valid');
        }
    });

    it('deterministic PRNG generates uniform repeatable random values', () => {
        const prng1 = createPrng(12345);
        const prng2 = createPrng(12345);

        for (let i = 0; i < 20; i++) {
            const v1 = prng1();
            const v2 = prng2();
            assert.equal(v1, v2, `PRNG values differ at index ${i}`);
            assert.ok(v1 >= 0 && v1 <= 1, `PRNG value ${v1} out of [0, 1] bounds`);
        }
    });
});
