import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    BIOME_FORCE_CONFIG,
    resolveActIndexFromZ,
    computeBiomeForceAt,
    stepCraftBiomeEnvironmentalForces,
} from '../shared/biome-environmental-forces.js';

describe('BIOME_FORCE_CONFIG definitions & structures', () => {
    test('defines required config tables for all 4 acts', () => {
        assert.ok(Array.isArray(BIOME_FORCE_CONFIG.ACT1_WATERWHEELS));
        assert.ok(Array.isArray(BIOME_FORCE_CONFIG.ACT2_CANAL_LOCKS));
        assert.ok(Array.isArray(BIOME_FORCE_CONFIG.ACT3_BUOYANCY_DOMES));
        assert.ok(Array.isArray(BIOME_FORCE_CONFIG.ACT4_THERMAL_VENTS));
    });

    test('Act 1 waterwheels have valid coordinates, radius, sideSign, and strength', () => {
        for (const wheel of BIOME_FORCE_CONFIG.ACT1_WATERWHEELS) {
            assert.ok(Number.isFinite(wheel.x));
            assert.ok(Number.isFinite(wheel.z) && wheel.z <= 0 && wheel.z >= -375);
            assert.ok(wheel.radius > 5);
            assert.ok(wheel.sideSign === 1 || wheel.sideSign === -1);
            assert.ok(wheel.strength > 0);
        }
    });

    test('Act 2 canal locks have valid dimensions and damping ratios [0..1]', () => {
        for (const lock of BIOME_FORCE_CONFIG.ACT2_CANAL_LOCKS) {
            assert.ok(Number.isFinite(lock.x));
            assert.ok(Number.isFinite(lock.z) && lock.z < -375 && lock.z >= -750);
            assert.ok(lock.width > 10);
            assert.ok(lock.length > 20);
            assert.ok(lock.currentDamping > 0 && lock.currentDamping <= 1.0);
        }
    });

    test('Act 3 buoyancy domes have positive liftForce, jumpBoost > 1.0, and positive altitude', () => {
        for (const dome of BIOME_FORCE_CONFIG.ACT3_BUOYANCY_DOMES) {
            assert.ok(Number.isFinite(dome.x));
            assert.ok(Number.isFinite(dome.z) && dome.z < -750 && dome.z >= -1125);
            assert.ok(dome.radius > 5);
            assert.ok(dome.liftForce > 10);
            assert.ok(dome.jumpBoost > 1.5);
            assert.ok(dome.maxAltitude > 5);
        }
    });

    test('Act 4 thermal vents have positive period, eruption duration, and updraft force', () => {
        for (const vent of BIOME_FORCE_CONFIG.ACT4_THERMAL_VENTS) {
            assert.ok(Number.isFinite(vent.x));
            assert.ok(Number.isFinite(vent.z) && vent.z < -1125);
            assert.ok(vent.radius > 5);
            assert.ok(vent.surgePeriod > vent.eruptionDuration);
            assert.ok(vent.eruptionDuration > 0.5);
            assert.ok(vent.maxUpdraft > 20);
            assert.ok(vent.lateralDispersal > 5);
        }
    });
});

describe('resolveActIndexFromZ Act boundaries resolution', () => {
    test('resolves Act 1 for z >= -375', () => {
        assert.equal(resolveActIndexFromZ(100), 1);
        assert.equal(resolveActIndexFromZ(0), 1);
        assert.equal(resolveActIndexFromZ(-150), 1);
        assert.equal(resolveActIndexFromZ(-374.9), 1);
    });

    test('resolves Act 2 for -375 down to -749.9', () => {
        assert.equal(resolveActIndexFromZ(-375), 2);
        assert.equal(resolveActIndexFromZ(-500), 2);
        assert.equal(resolveActIndexFromZ(-749.9), 2);
    });

    test('resolves Act 3 for -750 down to -1124.9', () => {
        assert.equal(resolveActIndexFromZ(-750), 3);
        assert.equal(resolveActIndexFromZ(-900), 3);
        assert.equal(resolveActIndexFromZ(-1124.9), 3);
    });

    test('resolves Act 4 for -1125 and beyond', () => {
        assert.equal(resolveActIndexFromZ(-1125), 4);
        assert.equal(resolveActIndexFromZ(-1400), 4);
        assert.equal(resolveActIndexFromZ(-3000), 4);
    });

    test('handles non-finite inputs safely with fallback to Act 1', () => {
        assert.equal(resolveActIndexFromZ(NaN), 1);
        assert.equal(resolveActIndexFromZ(undefined), 1);
        assert.equal(resolveActIndexFromZ(null), 1);
    });
});

describe('computeBiomeForceAt physical simulation', () => {
    test('returns inactive status when outside any environmental feature', () => {
        // Safe channel center away from Act 1 waterwheels
        const res = computeBiomeForceAt({ x: 0, z: -20, time: 0 });
        assert.equal(res.actIndex, 1);
        assert.equal(res.active, false);
        assert.equal(res.activeFeatureType, null);
        assert.equal(res.force.x, 0);
        assert.equal(res.force.y, 0);
        assert.equal(res.force.z, 0);
        assert.equal(res.jumpBoostMultiplier, 1.0);
        assert.equal(res.currentDampingFactor, 0.0);
    });

    test('Act 1: waterwheel millrace produces lateral side-currents pushing outward into channel', () => {
        const wheel = BIOME_FORCE_CONFIG.ACT1_WATERWHEELS[0]; // x = -16, sideSign = 1 (pushes +x)
        const res = computeBiomeForceAt({ x: wheel.x, z: wheel.z, time: 0 });

        assert.equal(res.actIndex, 1);
        assert.equal(res.active, true);
        assert.equal(res.activeFeatureType, 'waterwheel_millrace');
        assert.equal(res.activeFeatureId, wheel.id);
        assert.ok(res.intensity > 0.9);
        assert.ok(res.force.x > 0, 'Left wheel should push raft rightward (+x) into channel');
        assert.ok(res.force.z < 0, 'Millrace discharge pushes forward downriver (-z)');
        assert.ok(res.torque.y > 0, 'Should exert yaw rotational torque');

        // Right side wheel pushes leftward (-x)
        const wheelRight = BIOME_FORCE_CONFIG.ACT1_WATERWHEELS[1]; // x = 16, sideSign = -1
        const resRight = computeBiomeForceAt({ x: wheelRight.x, z: wheelRight.z, time: 0 });
        assert.ok(resRight.force.x < 0, 'Right wheel should push raft leftward (-x)');
    });

    test('Act 2: calm canal locks dampen current and center raft', () => {
        const lock = BIOME_FORCE_CONFIG.ACT2_CANAL_LOCKS[0]; // x = 0, z = -430
        const res = computeBiomeForceAt({ x: 0, z: lock.z });

        assert.equal(res.actIndex, 2);
        assert.equal(res.active, true);
        assert.equal(res.activeFeatureType, 'canal_lock_basin');
        assert.equal(res.activeFeatureId, lock.id);
        assert.ok(res.currentDampingFactor >= lock.currentDamping * 0.85);

        // Off-center raft experiences centering drift force back to canal lock line
        const offCenterRes = computeBiomeForceAt({ x: 4, z: lock.z });
        assert.ok(offCenterRes.force.x < 0, 'Raft at +x should be nudged back left (-x) toward center');
    });

    test('Act 3: crystal anti-gravity buoyancy domes apply vertical lift and multiply jump height', () => {
        const dome = BIOME_FORCE_CONFIG.ACT3_BUOYANCY_DOMES[0]; // x = -6, z = -820
        const waterRes = computeBiomeForceAt({ x: dome.x, z: dome.z, y: 0 });

        assert.equal(waterRes.actIndex, 3);
        assert.equal(waterRes.active, true);
        assert.equal(waterRes.activeFeatureType, 'crystal_buoyancy_dome');
        assert.equal(waterRes.activeFeatureId, dome.id);
        assert.ok(waterRes.force.y > 20, 'Should exert strong vertical upward buoyancy');
        assert.ok(waterRes.jumpBoostMultiplier >= dome.jumpBoost * 0.95, 'Jump boost should be >= 2.0x');

        // High in the air approaching maxAltitude, buoyancy field attenuates
        const highRes = computeBiomeForceAt({ x: dome.x, z: dome.z, y: dome.maxAltitude });
        assert.equal(highRes.force.y, 0, 'Above dome max altitude, vertical lift should attenuate to 0');
    });

    test('Act 4: thermal geyser vents cycle between rumble and explosive airborne updrafts', () => {
        const vent = BIOME_FORCE_CONFIG.ACT4_THERMAL_VENTS[0]; // eruptionDuration = 1.2, surgePeriod = 3.0
        // Eruption peak at time = 0.6s (halfway through 1.2s eruption)
        const eruptRes = computeBiomeForceAt({ x: vent.x, z: vent.z, time: 0.6 });

        assert.equal(eruptRes.actIndex, 4);
        assert.equal(eruptRes.active, true);
        assert.equal(eruptRes.activeFeatureType, 'thermal_updraft_vent');
        assert.equal(eruptRes.activeFeatureId, vent.id);
        assert.ok(eruptRes.force.y > 30, 'Thermal vent eruption should blast upwards with >30 force');

        // Dormant phase between eruptions (e.g. at time = 2.0s)
        const dormantRes = computeBiomeForceAt({ x: vent.x, z: vent.z, time: 2.0 });
        assert.ok(dormantRes.force.y < 5.0, 'Dormant phase should have no violent updraft');

        // Raft slightly off-center during eruption gets blasted radially outward
        const offsetRes = computeBiomeForceAt({ x: vent.x + 2.0, z: vent.z, time: 0.6 });
        assert.ok(offsetRes.force.x > 0, 'Off-center blast should push laterally away from vent');
    });

    test('respects explicit actIndex override parameter', () => {
        // At z = 0 (normally Act 1), override to Act 3
        const dome = BIOME_FORCE_CONFIG.ACT3_BUOYANCY_DOMES[0];
        const res = computeBiomeForceAt({ x: dome.x, z: dome.z, actIndex: 3 });
        assert.equal(res.actIndex, 3);
        assert.equal(res.activeFeatureType, 'crystal_buoyancy_dome');
    });

    test('scales force cleanly with craftMass', () => {
        const dome = BIOME_FORCE_CONFIG.ACT3_BUOYANCY_DOMES[0];
        const light = computeBiomeForceAt({ x: dome.x, z: dome.z, craftMass: 1.0 });
        const heavy = computeBiomeForceAt({ x: dome.x, z: dome.z, craftMass: 3.5 });
        assert.ok(Math.abs(heavy.force.y - light.force.y * 3.5) < 1e-4);
    });

    test('handles missing or malformed parameters gracefully without NaN', () => {
        const res = computeBiomeForceAt({});
        assert.ok(Number.isFinite(res.force.x));
        assert.ok(Number.isFinite(res.force.y));
        assert.ok(Number.isFinite(res.force.z));
        assert.ok(Number.isFinite(res.jumpBoostMultiplier));
        assert.ok(Number.isFinite(res.currentDampingFactor));

        const resNaN = computeBiomeForceAt({ x: NaN, z: Infinity, time: null, craftMass: -5 });
        assert.ok(Number.isFinite(resNaN.force.x));
        assert.ok(Number.isFinite(resNaN.force.y));
        assert.ok(Number.isFinite(resNaN.force.z));
    });
});

describe('stepCraftBiomeEnvironmentalForces kinematics stepping', () => {
    test('updates craft velocity when inside an active biome force zone', () => {
        const wheel = BIOME_FORCE_CONFIG.ACT1_WATERWHEELS[0];
        const craft = {
            position: { x: wheel.x, y: 0, z: wheel.z },
            velocity: { x: 0, y: 0, z: 0 },
            angularVelocity: { x: 0, y: 0, z: 0 },
            mass: 2.0,
        };

        const stepRes = stepCraftBiomeEnvironmentalForces(craft, 0.1, { time: 0 });
        assert.equal(stepRes.applied, true);
        assert.ok(craft.velocity.x > 0, 'Velocity x should be accelerated by millrace');
        assert.ok(craft.velocity.z < 0, 'Velocity z should be boosted downriver');
        assert.ok(craft.angularVelocity.y > 0, 'Angular velocity should receive torque');
    });

    test('returns applied: false and leaves velocity unchanged outside any zone', () => {
        const craft = {
            position: { x: 0, y: 0, z: -10 },
            velocity: { x: 5, y: 0, z: -10 },
            mass: 1.0,
        };
        const stepRes = stepCraftBiomeEnvironmentalForces(craft, 1 / 60);
        assert.equal(stepRes.applied, false);
        assert.equal(craft.velocity.x, 5);
        assert.equal(craft.velocity.z, -10);
    });

    test('handles invalid craft objects gracefully', () => {
        assert.deepEqual(stepCraftBiomeEnvironmentalForces(null), { applied: false, environmentalResult: null });
        assert.deepEqual(stepCraftBiomeEnvironmentalForces({}), { applied: false, environmentalResult: null });
    });
});
