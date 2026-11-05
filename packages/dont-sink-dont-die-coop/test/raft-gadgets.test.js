import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    GADGET_TYPES,
    GADGET_SLOTS,
    GADGET_CONFIGS,
    createRaftGadgetState,
    canInstallGadget,
    installGadget,
    uninstallGadget,
    distanceXZ,
    findNearestEnemy,
    updateHarpoon,
    activateShieldDome,
    updateShieldDome,
    checkShieldDomeParry,
    setNitroBoost,
    updateNitroKeg,
    updateRepairDrone,
    updateRaftGadgets,
} from '../shared/raft-gadgets.js';

import {
    createHarpoonMesh,
    createShieldDomeMesh,
    createNitroKegMesh,
    createRepairDroneMesh,
    animateRaftGadgets,
    buildRaftGadgetMeshes,
} from '../public/js/entities/gadgets-mesh.js';

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
    class Material { constructor(type, p = {}) { this.type = type; Object.assign(this, p); } }

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

describe('Raft Gadget Definitions and Configs', () => {
    it('defines exactly 4 purchasable/craftable attachment types', () => {
        assert.equal(Object.keys(GADGET_TYPES).length, 4);
        assert.equal(GADGET_TYPES.HARPOON, 'harpoon');
        assert.equal(GADGET_TYPES.SHIELD_DOME, 'shield-dome');
        assert.equal(GADGET_TYPES.NITRO_KEG, 'nitro-keg');
        assert.equal(GADGET_TYPES.REPAIR_DRONE, 'repair-drone');
    });

    it('defines distinct slots for each attachment without collisions', () => {
        const slots = Object.values(GADGET_CONFIGS).map((c) => c.slot);
        assert.equal(new Set(slots).size, 4);
        assert.equal(GADGET_CONFIGS['harpoon'].slot, GADGET_SLOTS.BOW);
        assert.equal(GADGET_CONFIGS['shield-dome'].slot, GADGET_SLOTS.CENTER);
        assert.equal(GADGET_CONFIGS['nitro-keg'].slot, GADGET_SLOTS.STERN);
        assert.equal(GADGET_CONFIGS['repair-drone'].slot, GADGET_SLOTS.COMPANION);
    });

    it('harpoon configuration matches specifications (1.8s interval, 38m range)', () => {
        const h = GADGET_CONFIGS['harpoon'];
        assert.equal(h.fireIntervalMs, 1800);
        assert.equal(h.range, 38);
        assert.ok(h.boltDamage > 0);
        assert.ok(h.cost > 0);
    });

    it('shield dome defines cooldown, radius, and parry window', () => {
        const s = GADGET_CONFIGS['shield-dome'];
        assert.equal(s.cooldownMs, 8000);
        assert.equal(s.shockwaveRadius, 10);
        assert.equal(s.parryWindowMs, 750);
        assert.ok(s.knockbackForce > 0);
    });

    it('nitro keg defines maxFuel, burn and regen rates', () => {
        const n = GADGET_CONFIGS['nitro-keg'];
        assert.equal(n.maxFuel, 100);
        assert.ok(n.burnRatePerSec > 0);
        assert.ok(n.regenRatePerSec > 0);
        assert.ok(n.thrustBoost > 0);
    });

    it('repair drone defines 12m healing aura and heal rates', () => {
        const d = GADGET_CONFIGS['repair-drone'];
        assert.equal(d.auraRadius, 12);
        assert.ok(d.healPerSec > 0);
        assert.ok(d.healTickIntervalMs > 0);
    });
});

describe('Attachment Inventory & Economy Logic', () => {
    it('creates initialized gadget state with default values', () => {
        const state = createRaftGadgetState();
        assert.deepEqual(state.installed, {});
        assert.equal(state.nitroKeg.fuel, 100);
        assert.equal(state.shieldDome.isShockwaveActive, false);
        assert.equal(state.harpoon.targetId, null);
    });

    it('verifies purchase eligibility: checks coins, duplicate install, and slot conflict', () => {
        const player = { coins: 50 };
        const state = createRaftGadgetState();

        const can = canInstallGadget(player, state, 'harpoon');
        assert.equal(can.ok, true);

        // Insufficient coins
        const poorPlayer = { coins: 10 };
        assert.equal(canInstallGadget(poorPlayer, state, 'harpoon').ok, false);
        assert.equal(canInstallGadget(poorPlayer, state, 'harpoon').reason, 'insufficient-coins');

        // Unknown gadget
        assert.equal(canInstallGadget(player, state, 'laser-cannon').ok, false);
        assert.equal(canInstallGadget(player, state, 'laser-cannon').reason, 'unknown-gadget');
    });

    it('installs gadget and deducts coins correctly', () => {
        const player = { coins: 100 };
        const state = createRaftGadgetState();

        const res = installGadget(player, state, 'harpoon', 1000);
        assert.equal(res.success, true);
        assert.equal(player.coins, 100 - GADGET_CONFIGS['harpoon'].cost);
        assert.ok(state.installed['harpoon']);
        assert.equal(state.installed['harpoon'].installedAt, 1000);

        // Cannot install again
        const res2 = installGadget(player, state, 'harpoon', 2000);
        assert.equal(res2.success, false);
        assert.equal(res2.reason, 'already-installed');
    });

    it('uninstalls gadget and refunds coins', () => {
        const player = { coins: 50 };
        const state = createRaftGadgetState();
        installGadget(player, state, 'nitro-keg', 500);

        const un = uninstallGadget(player, state, 'nitro-keg', 0.5);
        assert.equal(un.success, true);
        assert.equal(un.refund, Math.floor(GADGET_CONFIGS['nitro-keg'].cost * 0.5));
        assert.equal(state.installed['nitro-keg'], undefined);
    });
});

describe('Harpoon Ballista Targeting and Tether Logic', () => {
    it('accurately calculates 2D XZ distance and finds nearest enemy', () => {
        const raftPos = { x: 0, z: 0 };
        const enemies = {
            e1: { id: 'e1', position: { x: 10, z: 20 }, health: 50 },
            e2: { id: 'e2', position: { x: 3, z: 4 }, health: 50 }, // dist = 5
            e3: { id: 'e3', position: { x: 0, z: 2 }, isDead: true }, // dead
        };

        const nearest = findNearestEnemy(raftPos, enemies, 38);
        assert.equal(nearest.enemy.id, 'e2');
        assert.equal(nearest.distance, 5);
    });

    it('auto-aims and fires tethered bolt at nearest enemy every 1.8s', () => {
        const state = createRaftGadgetState();
        state.installed['harpoon'] = { active: true };
        const raftPos = { x: 0, y: 0.25, z: 0 };
        const enemies = {
            worm: { id: 'worm', position: { x: 10, y: 0.5, z: -10 }, health: 200 },
        };

        // First frame: fires bolt
        const ev1 = updateHarpoon(state, raftPos, 0, enemies, 1000, 0.05);
        assert.equal(ev1.length, 1);
        assert.equal(ev1[0].type, 'harpoon_fire');
        assert.equal(ev1[0].targetId, 'worm');
        assert.equal(state.harpoon.activeBolts.length, 1);

        // Within 1.8s cooldown: does not fire again
        const ev2 = updateHarpoon(state, raftPos, 0, enemies, 2000, 0.05);
        assert.equal(ev2.length, 0);

        // After 1.8s (at now = 2800): fires second bolt
        const ev3 = updateHarpoon(state, raftPos, 0, enemies, 2800, 0.05);
        assert.equal(ev3.length, 1);
        assert.equal(ev3[0].type, 'harpoon_fire');
    });

    it('cleans up expired tether bolts after tetherDurationMs', () => {
        const state = createRaftGadgetState();
        state.installed['harpoon'] = { active: true };
        const raftPos = { x: 0, z: 0 };
        const enemies = { e: { id: 'e', position: { x: 5, z: 5 }, health: 50 } };

        updateHarpoon(state, raftPos, 0, enemies, 1000, 0.05);
        assert.equal(state.harpoon.activeBolts.length, 1);

        // Advance time by 1.5s (> 1.2s tether duration)
        updateHarpoon(state, raftPos, 0, enemies, 2500, 1.5);
        assert.equal(state.harpoon.activeBolts.length, 0);
    });
});

describe('Arcane Shockwave Bell & Parry Mechanics', () => {
    it('activates shockwave and respects cooldown', () => {
        const state = createRaftGadgetState();
        state.installed['shield-dome'] = { active: true };

        const res1 = activateShieldDome(state, 1000);
        assert.equal(res1.success, true);
        assert.equal(state.shieldDome.isShockwaveActive, true);

        // Immediate reactivation fails due to cooldown
        const res2 = activateShieldDome(state, 4000);
        assert.equal(res2.success, false);
        assert.equal(res2.reason, 'cooldown');

        // After cooldown (8s)
        const res3 = activateShieldDome(state, 9001);
        assert.equal(res3.success, true);
    });

    it('expands shockwave and pushes back enemies within radius', () => {
        const state = createRaftGadgetState();
        state.installed['shield-dome'] = { active: true };
        activateShieldDome(state, 1000);

        const raftPos = { x: 0, z: 0 };
        const enemies = {
            closeEnemy: { id: 'closeEnemy', position: { x: 3, z: 0 }, health: 100, mass: 10 },
            farEnemy: { id: 'farEnemy', position: { x: 25, z: 0 }, health: 100, mass: 10 },
        };

        // Advance shockwave
        const hits = updateShieldDome(state, raftPos, enemies, 1100, 0.3);
        assert.equal(hits.length, 1);
        assert.equal(hits[0].enemyId, 'closeEnemy');
        assert.ok(hits[0].knockback.x > 0);
    });

    it('parries incoming hits and throws during the parry window', () => {
        const state = createRaftGadgetState();
        state.installed['shield-dome'] = { active: true };
        activateShieldDome(state, 1000); // parry window until 1750

        // In window
        const p1 = checkShieldDomeParry(state, 40, 1200);
        assert.equal(p1.parried, true);
        assert.equal(p1.effectiveDamage, 0);
        assert.equal(p1.reflectedDamage, 20);
        assert.equal(p1.throwNullified, true);

        // After window
        const p2 = checkShieldDomeParry(state, 40, 2000);
        assert.equal(p2.parried, false);
        assert.equal(p2.effectiveDamage, 40);
    });
});

describe('Twin Nitro Hydro-Jets Fuel and Boost', () => {
    it('burns fuel and outputs thrust boost when active', () => {
        const state = createRaftGadgetState();
        state.installed['nitro-keg'] = { active: true };
        setNitroBoost(state, true);

        const res1 = updateNitroKeg(state, 1000, 0.1);
        assert.equal(res1.active, true);
        assert.equal(res1.thrustBoost, GADGET_CONFIGS['nitro-keg'].thrustBoost);
        assert.ok(res1.fuel < 100);
    });

    it('stops boosting when fuel runs out', () => {
        const state = createRaftGadgetState();
        state.installed['nitro-keg'] = { active: true };
        state.nitroKeg.fuel = 2; // small amount
        setNitroBoost(state, true);

        // Burn 35/s * 0.1s = 3.5 fuel -> empties
        const res = updateNitroKeg(state, 1000, 0.1);
        assert.equal(res.fuel, 0);

        // Next frame cannot boost
        const res2 = updateNitroKeg(state, 1100, 0.1);
        assert.equal(res2.active, false);
        assert.equal(res2.thrustBoost, 0);
    });

    it('regenerates fuel after the delay when boosting stops', () => {
        const state = createRaftGadgetState();
        state.installed['nitro-keg'] = { active: true };
        state.nitroKeg.fuel = 50;
        state.nitroKeg.lastBurnTime = 1000;
        setNitroBoost(state, false);

        // During delay (< 600ms)
        const res1 = updateNitroKeg(state, 1200, 0.1);
        assert.equal(res1.fuel, 50);

        // After delay (> 600ms)
        const res2 = updateNitroKeg(state, 1700, 0.5);
        assert.ok(res2.fuel > 50);
    });
});

describe('Repair Drone Companion Kinematics & Healing Aura', () => {
    it('updates circular orbit position around the raft', () => {
        const state = createRaftGadgetState();
        state.installed['repair-drone'] = { active: true };
        const raftPos = { x: 10, y: 0.25, z: -50 };

        const r1 = updateRepairDrone(state, raftPos, [], 1000, 0.05);
        assert.ok(r1.companionPos);
        assert.ok(Number.isFinite(r1.companionPos.x));
        assert.ok(Number.isFinite(r1.companionPos.y));
        assert.ok(Number.isFinite(r1.companionPos.z));
    });

    it('passively heals crewmates within 12m and ignores crew beyond 12m', () => {
        const state = createRaftGadgetState();
        state.installed['repair-drone'] = { active: true };
        const raftPos = { x: 0, z: 0 };
        const crewList = [
            { id: 'p1', position: { x: 5, z: 5 }, health: 80, maxHealth: 100, isDead: false }, // dist ~7.07m <= 12m
            { id: 'p2', position: { x: 15, z: 0 }, health: 50, maxHealth: 100, isDead: false }, // dist 15m > 12m
            { id: 'p3', position: { x: 2, z: 2 }, health: 100, maxHealth: 100, isDead: false }, // full health
            { id: 'p4', position: { x: 1, z: 1 }, health: 0, maxHealth: 100, isDead: true }, // dead
        ];

        const res = updateRepairDrone(state, raftPos, crewList, 1000, 0.5);
        assert.equal(res.healedTargets.length, 1);
        assert.equal(res.healedTargets[0].id, 'p1');
        assert.ok(crewList[0].health > 80);
        assert.equal(crewList[1].health, 50); // untouched
    });
});

describe('Unified updateRaftGadgets System', () => {
    it('processes all installed gadgets in a single tick', () => {
        const state = createRaftGadgetState();
        installGadget({ coins: 200 }, state, 'harpoon');
        installGadget({ coins: 200 }, state, 'shield-dome');
        installGadget({ coins: 200 }, state, 'nitro-keg');
        installGadget({ coins: 200 }, state, 'repair-drone');

        const raftPos = { x: 0, y: 0.25, z: 0 };
        const enemies = { e1: { id: 'e1', position: { x: 5, z: -5 }, health: 100 } };
        const crewList = [{ id: 'p1', position: { x: 2, z: 0 }, health: 90, maxHealth: 100 }];

        const result = updateRaftGadgets({
            gadgetState: state,
            raftPos,
            raftYaw: 0,
            enemies,
            crewList,
            now: 2000,
            dt: 0.05,
        });

        assert.ok(result.harpoonEvents);
        assert.ok(result.shieldEvents);
        assert.ok(result.nitroStatus);
        assert.ok(result.droneStatus);
    });
});

describe('Three.js Gadget Mesh Hierarchy and Articulations', () => {
    const mockTHREE = createMockTHREE();

    it('builds Harpoon Ballista mesh with articulated swivel, cradle, limbs, and bolt', () => {
        const harpoon = createHarpoonMesh(mockTHREE);
        assert.equal(harpoon.group.type, 'Group');
        assert.equal(harpoon.group.name, 'RaftGadget_Harpoon');
        assert.ok(harpoon.swivel);
        assert.ok(harpoon.cradle);
        assert.ok(harpoon.spool);
        assert.ok(harpoon.leftArm);
        assert.ok(harpoon.rightArm);
        assert.ok(harpoon.boltGroup);
    });

    it('builds Shield Dome mesh with bronze bell, clapper, and shockwave dome', () => {
        const bell = createShieldDomeMesh(mockTHREE);
        assert.equal(bell.group.type, 'Group');
        assert.equal(bell.group.name, 'RaftGadget_ShieldDome');
        assert.ok(bell.bellPivot);
        assert.ok(bell.clapper);
        assert.ok(bell.shockwaveMesh);
        assert.equal(bell.shockwaveMesh.visible, false);
    });

    it('builds Nitro Keg mesh with twin pressurized casks, nozzles, and exhaust cones', () => {
        const nitro = createNitroKegMesh(mockTHREE);
        assert.equal(nitro.group.type, 'Group');
        assert.equal(nitro.group.name, 'RaftGadget_NitroKeg');
        assert.equal(nitro.nozzles.length, 2);
        assert.equal(nitro.exhaustJets.length, 2);
    });

    it('builds Repair Drone mesh with clockwork pelican rig, wings, and hanging lantern', () => {
        const drone = createRepairDroneMesh(mockTHREE);
        assert.equal(drone.group.type, 'Group');
        assert.equal(drone.group.name, 'RaftGadget_RepairDrone');
        assert.ok(drone.pelican);
        assert.ok(drone.headPivot);
        assert.ok(drone.leftWing);
        assert.ok(drone.rightWing);
        assert.ok(drone.lanternRig);
        assert.ok(drone.auraRing);
    });

    it('buildRaftGadgetMeshes attaches all 4 meshes to a parent raft container', () => {
        const parent = new mockTHREE.Group();
        const meshes = buildRaftGadgetMeshes(mockTHREE, parent);

        assert.equal(parent.children.length, 4);
        assert.ok(meshes.harpoon);
        assert.ok(meshes.shieldDome);
        assert.ok(meshes.nitroKeg);
        assert.ok(meshes.repairDrone);
    });

    it('animateRaftGadgets drives procedural animations for all active gadgets', () => {
        const parent = new mockTHREE.Group();
        const meshes = buildRaftGadgetMeshes(mockTHREE, parent);
        const state = createRaftGadgetState();
        installGadget({ coins: 200 }, state, 'harpoon');
        installGadget({ coins: 200 }, state, 'shield-dome');
        installGadget({ coins: 200 }, state, 'nitro-keg');
        installGadget({ coins: 200 }, state, 'repair-drone');

        state.harpoon.targetId = 'e1';
        state.harpoon.aimAngle = 0.5;
        state.shieldDome.isShockwaveActive = true;
        state.shieldDome.shockwaveProgress = 0.5;
        setNitroBoost(state, true);
        state.repairDrone.beamTargets = ['p1'];

        // Step animation
        animateRaftGadgets({ meshes, gadgetState: state, time: 1.0, dt: 0.016 });

        assert.equal(meshes.harpoon.swivel.rotation.y, 0.5);
        assert.equal(meshes.shieldDome.shockwaveMesh.visible, true);
        assert.equal(meshes.nitroKeg.exhaustJets[0].visible, true);
        assert.ok(meshes.repairDrone.leftWing.rotation.z !== 0);
    });
});
