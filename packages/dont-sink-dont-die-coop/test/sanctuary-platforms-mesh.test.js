import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildSanctuaryPlatformMesh,
    updateSanctuaryPlatformMesh,
} from '../public/js/world/sanctuary-platforms-mesh.js';

/**
 * Headless Three.js mock for deterministic unit testing.
 */
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
            this.children = [];
            this.visible = true;
            this.name = '';
            this.userData = {};
        }
        add(...objs) {
            for (const o of objs) {
                if (o) this.children.push(o);
            }
            return this;
        }
        remove(obj) {
            const idx = this.children.indexOf(obj);
            if (idx !== -1) this.children.splice(idx, 1);
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

    class Geometry {
        constructor(type, ...args) {
            this.type = type;
            this.args = args;
        }
        rotateX() {
            return this;
        }
    }

    class Material {
        constructor(type, p = {}) {
            this.type = type;
            this.opacity = 1.0;
            this.transparent = false;
            Object.assign(this, p);
            if (p.color !== undefined && !(p.color instanceof Color)) {
                this.color = new Color(p.color);
            }
            if (p.emissive !== undefined && !(p.emissive instanceof Color)) {
                this.emissive = new Color(p.emissive);
            }
        }
    }

    return {
        Vector3,
        Euler,
        Color,
        Group,
        Mesh,
        MeshStandardMaterial: class extends Material {
            constructor(p) {
                super('MeshStandardMaterial', p);
            }
        },
        MeshBasicMaterial: class extends Material {
            constructor(p) {
                super('MeshBasicMaterial', p);
            }
        },
        CylinderGeometry: class extends Geometry {
            constructor(...a) {
                super('CylinderGeometry', ...a);
            }
        },
        BoxGeometry: class extends Geometry {
            constructor(...a) {
                super('BoxGeometry', ...a);
            }
        },
        ConeGeometry: class extends Geometry {
            constructor(...a) {
                super('ConeGeometry', ...a);
            }
        },
        SphereGeometry: class extends Geometry {
            constructor(...a) {
                super('SphereGeometry', ...a);
            }
        },
        TorusGeometry: class extends Geometry {
            constructor(...a) {
                super('TorusGeometry', ...a);
            }
        },
        RingGeometry: class extends Geometry {
            constructor(...a) {
                super('RingGeometry', ...a);
            }
        },
        DoubleSide: 2,
    };
}

describe('Sanctuary Platform Mesh Builder & Safe Haven System', () => {
    it('throws when THREE is not provided', () => {
        assert.throws(() => buildSanctuaryPlatformMesh(null), /requires a valid THREE instance/);
    });

    it('builds a default sanctuary platform with all 6 architectural subsystems', () => {
        const THREE = createMockTHREE();
        const meshGroup = buildSanctuaryPlatformMesh(THREE);

        assert.ok(meshGroup instanceof THREE.Group);
        assert.equal(meshGroup.name, 'SanctuaryPlatform_sanctuary_0');
        assert.equal(meshGroup.userData.type, 'sanctuaryPlatform');
        assert.equal(meshGroup.userData.id, 'sanctuary_0');

        const { components, materials, dimensions } = meshGroup.userData;
        assert.ok(components);
        assert.ok(materials);
        assert.ok(dimensions);

        // 1. Heavy Timber Pilings
        assert.ok(components.pilingsGroup);
        assert.ok(components.pilingPoles.length >= 9, 'Should have multiple pilings driven into bed');
        for (const p of components.pilingPoles) {
            assert.equal(p.geometry.type, 'CylinderGeometry');
        }

        // 2. Boarded Deck Planks
        assert.ok(components.deckGroup);
        assert.ok(components.planks.length >= 8, 'Should have weathered deck planks');
        for (const plank of components.planks) {
            assert.equal(plank.geometry.type, 'BoxGeometry');
        }

        // 3. Corner Mooring Bollards & Coiled Ropes
        assert.ok(components.bollardsGroup);
        assert.equal(components.bollards.length, 4, 'Should have 4 corner mooring bollards');
        for (const b of components.bollards) {
            assert.ok(b.post, 'Bollard has post');
            assert.ok(b.cap, 'Bollard has mushroom cap');
            assert.ok(b.ropeCoils.length >= 3, 'Bollard has coiled ropes');
        }

        // 4. Campfire & Brazier
        assert.ok(components.fireGroup);
        assert.ok(components.basin);
        assert.ok(components.emberMound);
        assert.ok(components.flameMeshes.length >= 3, 'Multiple composite flame cones');
        for (const f of components.flameMeshes) {
            assert.ok(f.outer);
            assert.ok(f.inner);
        }

        // 5. Upriver Boarding Ramp
        assert.ok(components.rampGroup);
        assert.ok(components.rampDeck);
        assert.ok(components.slats.length >= 3, 'Should have anti-slip wooden grip slats');

        // 6. Emerald Protective Ward Ring
        assert.ok(components.wardRingGroup);
        assert.ok(components.wardRing);
        assert.ok(components.innerWardRing);
        assert.equal(components.wardRing.geometry.type, 'RingGeometry');
    });

    it('respects custom platform specifications for position, dimensions, and rotation', () => {
        const THREE = createMockTHREE();
        const customSpec = {
            id: 'checkpoint_haven_act2',
            x: -15.5,
            y: 0.5,
            z: -750.0,
            width: 18.0,
            length: 24.0,
            deckThickness: 0.5,
            pilingDepth: 8.0,
            rampLength: 6.0,
            wardRadius: 14.0,
            rotationY: Math.PI / 4,
        };

        const meshGroup = buildSanctuaryPlatformMesh(THREE, customSpec);

        assert.equal(meshGroup.name, 'SanctuaryPlatform_checkpoint_haven_act2');
        assert.equal(meshGroup.position.x, -15.5);
        assert.equal(meshGroup.position.y, 0.5);
        assert.equal(meshGroup.position.z, -750.0);
        assert.equal(meshGroup.rotation.y, Math.PI / 4);

        assert.equal(meshGroup.userData.dimensions.width, 18.0);
        assert.equal(meshGroup.userData.dimensions.length, 24.0);
        assert.equal(meshGroup.userData.dimensions.wardRadius, 14.0);
    });

    it('animates campfire flames and ember glow pulse on updateSanctuaryPlatformMesh', () => {
        const THREE = createMockTHREE();
        const meshGroup = buildSanctuaryPlatformMesh(THREE);

        const flame0 = meshGroup.userData.components.flameMeshes[0];
        const initialScaleY = flame0.outer.scale.y;
        const initialRotZ = flame0.outer.rotation.z;

        // Step simulation time forward
        updateSanctuaryPlatformMesh(meshGroup, { isDocked: false }, 1.5);

        assert.notEqual(flame0.outer.scale.y, initialScaleY, 'Flame scale animated');
        assert.notEqual(flame0.outer.rotation.z, initialRotZ, 'Flame sway animated');
        assert.ok(meshGroup.userData.materials.emberMat.emissiveIntensity > 0);
    });

    it('brightens emerald protective ward ring when crewmates are docked', () => {
        const THREE = createMockTHREE();
        const meshGroup = buildSanctuaryPlatformMesh(THREE);

        // Undocked state
        updateSanctuaryPlatformMesh(meshGroup, { isDocked: false }, 2.0);
        const undockedWardOpacity = meshGroup.userData.materials.wardMat.opacity;
        const undockedInnerOpacity = meshGroup.userData.materials.innerWardMat.opacity;

        // Docked state via isDocked: true
        updateSanctuaryPlatformMesh(meshGroup, { isDocked: true }, 2.0);
        const dockedWardOpacity = meshGroup.userData.materials.wardMat.opacity;
        const dockedInnerOpacity = meshGroup.userData.materials.innerWardMat.opacity;

        assert.ok(
            dockedWardOpacity > undockedWardOpacity,
            `Docked ward opacity (${dockedWardOpacity}) should exceed undocked (${undockedWardOpacity})`
        );
        assert.ok(
            dockedInnerOpacity > undockedInnerOpacity,
            `Docked inner ward opacity (${dockedInnerOpacity}) should exceed undocked (${undockedInnerOpacity})`
        );

        // Also test docked state via crewCount > 0
        updateSanctuaryPlatformMesh(meshGroup, { crewCount: 2 }, 2.0);
        assert.ok(meshGroup.userData.materials.wardMat.opacity > undockedWardOpacity);
    });

    it('rotates protective ward rings slowly over time', () => {
        const THREE = createMockTHREE();
        const meshGroup = buildSanctuaryPlatformMesh(THREE);
        const { wardRing, innerWardRing } = meshGroup.userData.components;

        updateSanctuaryPlatformMesh(meshGroup, {}, 10.0);
        assert.ok(wardRing.rotation.z !== 0);
        assert.ok(innerWardRing.rotation.z !== 0);
        // Rings rotate counter to each other
        assert.ok(wardRing.rotation.z * innerWardRing.rotation.z < 0);
    });

    it('gracefully handles null, undefined, or malformed meshGroup and time inputs without crashing', () => {
        assert.doesNotThrow(() => updateSanctuaryPlatformMesh(null, {}, 1.0));
        assert.doesNotThrow(() => updateSanctuaryPlatformMesh(undefined, {}, 1.0));
        assert.doesNotThrow(() => updateSanctuaryPlatformMesh({}, {}, 1.0));
        assert.doesNotThrow(() => updateSanctuaryPlatformMesh({ userData: {} }, {}, 1.0));

        const THREE = createMockTHREE();
        const meshGroup = buildSanctuaryPlatformMesh(THREE);
        assert.doesNotThrow(() => updateSanctuaryPlatformMesh(meshGroup, null, NaN));
        assert.doesNotThrow(() => updateSanctuaryPlatformMesh(meshGroup, undefined, undefined));
    });
});
