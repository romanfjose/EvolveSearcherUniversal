/**
 * Unit Test Suite for River Route Landmark & Zone Payoff Verifier
 * (`test/landmark-payoff-verifier.test.js`)
 *
 * Verifies Helmet 07 & Sovereign Core World Curation:
 *   1. RIVER_KEY_ZONES completeness across all 8 required landmarks:
 *      - Tutorial Sanctuary Dock (z = -42)
 *      - Centreline Whirlpool (z = -76)
 *      - Whitewater Rapids (z = -112)
 *      - Walled Harbor City & Police Promenade (z = -145..-255)
 *      - Sunken Crystal Temples (z = -750)
 *      - Volcanic Caldera (z = -1150)
 *      - Dread Kraken Gate (z = -1420)
 *      - Finish Arch (z = -1500)
 *   2. Curation tiers ('true_signpost', 'centerpiece_magnet') and gameplay payoffs
 *      ('sanctuary_heal', 'vortex_slingshot', 'downriver_speed_boost', 'police_crossfire_and_armory', 'boss_encounter', 'run_victory').
 *   3. verifyZonePayoffAtPosition behavioral contract, fallback to quiet texture outside zones,
 *      nearest zone telemetry, boundary edge cases, and robust handling of invalid inputs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    RIVER_KEY_ZONES,
    CURATION_TIERS,
    GAMEPLAY_PAYOFFS,
    isPositionInKeyZone,
    findActiveKeyZone,
    getNearestKeyZone,
    verifyZonePayoffAtPosition,
} from '../shared/landmark-payoff-verifier.js';

describe('Videogame Helmet 07 — River Route Landmark & Zone Payoff Verifier', () => {

    describe('RIVER_KEY_ZONES Registry Completeness', () => {
        it('exports frozen RIVER_KEY_ZONES array containing exactly 8 key river landmarks', () => {
            assert.ok(Array.isArray(RIVER_KEY_ZONES), 'RIVER_KEY_ZONES must be an array');
            assert.ok(Object.isFrozen(RIVER_KEY_ZONES), 'RIVER_KEY_ZONES must be frozen');
            assert.equal(RIVER_KEY_ZONES.length, 8, 'Expected 8 key zones along the 1500m river course');
        });

        it('covers Tutorial Sanctuary Dock at z = -42 with sanctuary_heal payoff', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'tutorial_sanctuary_dock');
            assert.ok(zone, 'Tutorial Sanctuary Dock zone must exist');
            assert.equal(zone.targetZ, -42);
            assert.equal(zone.curationTier, CURATION_TIERS.CENTERPIECE_MAGNET);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.SANCTUARY_HEAL);
            assert.ok(zone.zRange.minZ <= -42 && zone.zRange.maxZ >= -42);
        });

        it('covers Centreline Whirlpool at z = -76 with vortex_slingshot payoff', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'centreline_whirlpool');
            assert.ok(zone, 'Centreline Whirlpool zone must exist');
            assert.equal(zone.targetZ, -76);
            assert.equal(zone.curationTier, CURATION_TIERS.CENTERPIECE_MAGNET);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.VORTEX_SLINGSHOT);
            assert.ok(zone.zRange.minZ <= -76 && zone.zRange.maxZ >= -76);
        });

        it('covers Whitewater Rapids at z = -112 with downriver_speed_boost payoff', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'whitewater_rapids');
            assert.ok(zone, 'Whitewater Rapids zone must exist');
            assert.equal(zone.targetZ, -112);
            assert.equal(zone.curationTier, CURATION_TIERS.CENTERPIECE_MAGNET);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.DOWNRIVER_SPEED_BOOST);
            assert.ok(zone.zRange.minZ <= -112 && zone.zRange.maxZ >= -112);
        });

        it('covers Walled Harbor City & Police Promenade spanning z = -145..-255 with police_crossfire_and_armory', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'walled_harbor_city_police_promenade');
            assert.ok(zone, 'Walled Harbor City & Police Promenade zone must exist');
            assert.equal(zone.curationTier, CURATION_TIERS.CENTERPIECE_MAGNET);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.POLICE_CROSSFIRE_AND_ARMORY);
            assert.equal(zone.zRange.minZ, -255);
            assert.equal(zone.zRange.maxZ, -145);
        });

        it('covers Sunken Crystal Temples at z = -750 with sanctuary_heal payoff', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'sunken_crystal_temples');
            assert.ok(zone, 'Sunken Crystal Temples zone must exist');
            assert.equal(zone.targetZ, -750);
            assert.equal(zone.curationTier, CURATION_TIERS.TRUE_SIGNPOST);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.SANCTUARY_HEAL);
            assert.ok(zone.zRange.minZ <= -750 && zone.zRange.maxZ >= -750);
        });

        it('covers Volcanic Caldera at z = -1150 with downriver_speed_boost payoff', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'volcanic_caldera');
            assert.ok(zone, 'Volcanic Caldera zone must exist');
            assert.equal(zone.targetZ, -1150);
            assert.equal(zone.curationTier, CURATION_TIERS.TRUE_SIGNPOST);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.DOWNRIVER_SPEED_BOOST);
            assert.ok(zone.zRange.minZ <= -1150 && zone.zRange.maxZ >= -1150);
        });

        it('covers Dread Kraken Gate at z = -1420 with boss_encounter payoff', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'dread_kraken_gate');
            assert.ok(zone, 'Dread Kraken Gate zone must exist');
            assert.equal(zone.targetZ, -1420);
            assert.equal(zone.curationTier, CURATION_TIERS.CENTERPIECE_MAGNET);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.BOSS_ENCOUNTER);
            assert.ok(zone.zRange.minZ <= -1420 && zone.zRange.maxZ >= -1420);
        });

        it('covers Finish Arch at z = -1500 with run_victory payoff', () => {
            const zone = RIVER_KEY_ZONES.find((z) => z.id === 'finish_arch');
            assert.ok(zone, 'Finish Arch zone must exist');
            assert.equal(zone.targetZ, -1500);
            assert.equal(zone.curationTier, CURATION_TIERS.TRUE_SIGNPOST);
            assert.equal(zone.payoff, GAMEPLAY_PAYOFFS.RUN_VICTORY);
            assert.ok(zone.zRange.minZ <= -1500 && zone.zRange.maxZ >= -1500);
        });

        it('enforces that every key zone has immutable sub-objects', () => {
            for (const zone of RIVER_KEY_ZONES) {
                assert.ok(Object.isFrozen(zone), `Zone ${zone.id} must be frozen`);
                assert.ok(Object.isFrozen(zone.center), `Zone ${zone.id} center must be frozen`);
                assert.ok(Object.isFrozen(zone.zRange), `Zone ${zone.id} zRange must be frozen`);
                assert.ok(Object.isFrozen(zone.xRange), `Zone ${zone.id} xRange must be frozen`);
            }
        });
    });

    describe('Spatial Zone Testing Helpers', () => {
        it('isPositionInKeyZone accurately bounds points inside and outside', () => {
            const whirlpool = RIVER_KEY_ZONES.find((z) => z.id === 'centreline_whirlpool');
            assert.equal(isPositionInKeyZone(whirlpool, 0, -76), true);
            assert.equal(isPositionInKeyZone(whirlpool, 10, -70), true);
            // Out of X corridor
            assert.equal(isPositionInKeyZone(whirlpool, 35, -76), false);
            // Out of Z range
            assert.equal(isPositionInKeyZone(whirlpool, 0, -30), false);
            // Graceful handling of invalid values
            assert.equal(isPositionInKeyZone(null, 0, 0), false);
            assert.equal(isPositionInKeyZone(whirlpool, NaN, -76), false);
            assert.equal(isPositionInKeyZone(whirlpool, 0, Infinity), false);
        });

        it('findActiveKeyZone returns matched zone or null', () => {
            const match = findActiveKeyZone(0, -112);
            assert.ok(match);
            assert.equal(match.id, 'whitewater_rapids');

            const noMatch = findActiveKeyZone(0, 0);
            assert.equal(noMatch, null);
        });

        it('getNearestKeyZone calculates closest key zone along Z corridor', () => {
            const nearestToStart = getNearestKeyZone(-10);
            assert.equal(nearestToStart.zone.id, 'tutorial_sanctuary_dock');
            assert.equal(nearestToStart.distanceZ, 32);

            const nearestToEnd = getNearestKeyZone(-1480);
            assert.equal(nearestToEnd.zone.id, 'finish_arch');
            assert.equal(nearestToEnd.distanceZ, 20);

            // Robust fallback for non-finite numbers
            const fallback = getNearestKeyZone(NaN);
            assert.ok(fallback.zone);
            assert.equal(fallback.distanceZ, Math.abs(0 - fallback.zone.center.z));
        });
    });

    describe('verifyZonePayoffAtPosition Functionality', () => {
        it('verifies active zone descriptor, tier, and payoff at Tutorial Sanctuary Dock (z = -42)', () => {
            const result = verifyZonePayoffAtPosition({ x: 0, z: -42 });
            assert.equal(result.active, true);
            assert.equal(result.zoneId, 'tutorial_sanctuary_dock');
            assert.equal(result.curationTier, 'centerpiece_magnet');
            assert.equal(result.payoff, 'sanctuary_heal');
            assert.equal(result.targetZ, -42);
            assert.equal(result.verified, true);
            assert.ok(result.zone && typeof result.zone === 'object');
        });

        it('verifies active zone descriptor, tier, and payoff at Centreline Whirlpool (z = -76)', () => {
            const result = verifyZonePayoffAtPosition({ x: 0, z: -76 });
            assert.equal(result.active, true);
            assert.equal(result.zoneId, 'centreline_whirlpool');
            assert.equal(result.curationTier, 'centerpiece_magnet');
            assert.equal(result.payoff, 'vortex_slingshot');
            assert.equal(result.verified, true);
        });

        it('verifies active zone descriptor, tier, and payoff at Whitewater Rapids (z = -112)', () => {
            const result = verifyZonePayoffAtPosition({ x: 5, z: -112 });
            assert.equal(result.active, true);
            assert.equal(result.zoneId, 'whitewater_rapids');
            assert.equal(result.curationTier, 'centerpiece_magnet');
            assert.equal(result.payoff, 'downriver_speed_boost');
            assert.equal(result.verified, true);
        });

        it('verifies Walled Harbor City & Police Promenade across entire span (z = -145..-255)', () => {
            const testPoints = [-145, -180, -200, -230, -255];
            for (const z of testPoints) {
                const res = verifyZonePayoffAtPosition({ x: 0, z });
                assert.equal(res.active, true, `Expected active at z = ${z}`);
                assert.equal(res.zoneId, 'walled_harbor_city_police_promenade');
                assert.equal(res.curationTier, 'centerpiece_magnet');
                assert.equal(res.payoff, 'police_crossfire_and_armory');
                assert.equal(res.verified, true);
            }
        });

        it('verifies active zone descriptor, tier, and payoff at Sunken Crystal Temples (z = -750)', () => {
            const result = verifyZonePayoffAtPosition({ x: 0, z: -750 });
            assert.equal(result.active, true);
            assert.equal(result.zoneId, 'sunken_crystal_temples');
            assert.equal(result.curationTier, 'true_signpost');
            assert.equal(result.payoff, 'sanctuary_heal');
            assert.equal(result.verified, true);
        });

        it('verifies active zone descriptor, tier, and payoff at Volcanic Caldera (z = -1150)', () => {
            const result = verifyZonePayoffAtPosition({ x: 0, z: -1150 });
            assert.equal(result.active, true);
            assert.equal(result.zoneId, 'volcanic_caldera');
            assert.equal(result.curationTier, 'true_signpost');
            assert.equal(result.payoff, 'downriver_speed_boost');
            assert.equal(result.verified, true);
        });

        it('verifies active zone descriptor, tier, and payoff at Dread Kraken Gate (z = -1420)', () => {
            const result = verifyZonePayoffAtPosition({ x: 0, z: -1420 });
            assert.equal(result.active, true);
            assert.equal(result.zoneId, 'dread_kraken_gate');
            assert.equal(result.curationTier, 'centerpiece_magnet');
            assert.equal(result.payoff, 'boss_encounter');
            assert.equal(result.verified, true);
        });

        it('verifies active zone descriptor, tier, and payoff at Finish Arch (z = -1500)', () => {
            const result = verifyZonePayoffAtPosition({ x: 0, z: -1500 });
            assert.equal(result.active, true);
            assert.equal(result.zoneId, 'finish_arch');
            assert.equal(result.curationTier, 'true_signpost');
            assert.equal(result.payoff, 'run_victory');
            assert.equal(result.verified, true);
        });
    });

    describe('Boundary, Invariant, and Empty State Fallbacks', () => {
        it('returns quiet_texture and null payoff when outside all key zones with nearestZone telemetry', () => {
            const result = verifyZonePayoffAtPosition({ x: 0, z: -500 });
            assert.equal(result.active, false);
            assert.equal(result.zone, null);
            assert.equal(result.zoneId, null);
            assert.equal(result.curationTier, 'quiet_texture');
            assert.equal(result.payoff, null);
            assert.equal(result.verified, false);
            assert.ok(result.nearestZone);
            assert.ok(typeof result.nearestZone.distanceZ === 'number');
        });

        it('handles default call verifyZonePayoffAtPosition() cleanly with x=0, z=0', () => {
            const result = verifyZonePayoffAtPosition();
            assert.equal(result.active, false);
            assert.equal(result.curationTier, 'quiet_texture');
            assert.equal(result.payoff, null);
            assert.equal(result.nearestZone.id, 'tutorial_sanctuary_dock');
            assert.equal(result.nearestZone.distanceZ, 42);
        });

        it('safely handles non-object, undefined, null, or NaN coordinate arguments', () => {
            const r1 = verifyZonePayoffAtPosition(null);
            assert.equal(r1.active, false);
            assert.equal(r1.curationTier, 'quiet_texture');

            const r2 = verifyZonePayoffAtPosition({ x: NaN, z: -42 });
            // x becomes 0 (safe default) and matches z = -42
            assert.equal(r2.active, true);
            assert.equal(r2.zoneId, 'tutorial_sanctuary_dock');

            const r3 = verifyZonePayoffAtPosition({ x: 0, z: NaN });
            // z becomes 0 and is outside all zones
            assert.equal(r3.active, false);
        });

        it('verifies that all valid gameplay payoffs correspond to the required specification set', () => {
            const requiredPayoffs = new Set([
                'sanctuary_heal',
                'vortex_slingshot',
                'downriver_speed_boost',
                'police_crossfire_and_armory',
                'boss_encounter',
                'run_victory',
            ]);

            for (const zone of RIVER_KEY_ZONES) {
                assert.ok(
                    requiredPayoffs.has(zone.payoff),
                    `Zone ${zone.id} payoff "${zone.payoff}" must be in the required payoff set`
                );
            }
        });

        it('verifies that all curation tiers are either true_signpost or centerpiece_magnet', () => {
            const allowedTiers = new Set(['true_signpost', 'centerpiece_magnet']);

            for (const zone of RIVER_KEY_ZONES) {
                assert.ok(
                    allowedTiers.has(zone.curationTier),
                    `Zone ${zone.id} tier "${zone.curationTier}" must be true_signpost or centerpiece_magnet`
                );
            }
        });
    });
});
