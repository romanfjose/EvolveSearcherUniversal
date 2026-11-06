/**
 * Unit Tests for Harbor City Calm Lagoon & Interactive Pier District (w5a-13)
 * (`test/harbor-city-district.test.js`)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    HARBOR_CITY_LAYOUT,
    isInsideHarborBasin,
    getNearestHarborBerth,
    getHarborZoneState,
} from '../shared/harbor-city-district.js';

describe('Harbor City Calm Lagoon & Pier District — Layout Specifications', () => {
    it('defines the Act II City Shop Haven layout correctly', () => {
        assert.equal(HARBOR_CITY_LAYOUT.act, 2);
        assert.equal(HARBOR_CITY_LAYOUT.biome, 'Drowned Harbor');
        assert.equal(HARBOR_CITY_LAYOUT.zRange.entryZ, -140);
        assert.equal(HARBOR_CITY_LAYOUT.zRange.exitZ, -270);
        assert.equal(HARBOR_CITY_LAYOUT.zRange.minZ, -270);
        assert.equal(HARBOR_CITY_LAYOUT.zRange.maxZ, -140);
        assert.equal(HARBOR_CITY_LAYOUT.basin.width, 80);
        assert.equal(HARBOR_CITY_LAYOUT.basin.minX, -40);
        assert.equal(HARBOR_CITY_LAYOUT.basin.maxX, 40);
    });

    it('defines 100% enemy truce barrier and zero ambient current', () => {
        assert.equal(HARBOR_CITY_LAYOUT.seawalls.truceBarrierActive, true);
        assert.equal(HARBOR_CITY_LAYOUT.seawalls.truceDamageImmunity, 1.0);
        assert.equal(HARBOR_CITY_LAYOUT.waterDynamics.ambientRiverCurrent, 0.0);
    });

    it('defines all three distinct mooring berths with unique positions and services', () => {
        assert.equal(HARBOR_CITY_LAYOUT.berths.length, 3);

        const [armory, shipwright, tavern] = HARBOR_CITY_LAYOUT.berths;

        // Armory Wharf
        assert.equal(armory.id, 'armory_wharf');
        assert.equal(armory.name, 'Armory Wharf');
        assert.equal(armory.category, 'weapon_and_turrets');
        assert.equal(armory.position.x, 18.0);
        assert.equal(armory.position.z, -175.0);
        assert.ok(armory.mooringRadius > 0);
        assert.ok(armory.services.includes('weapons'));
        assert.ok(armory.promptText.includes('Armory Wharf'));

        // Shipwright Drydock
        assert.equal(shipwright.id, 'shipwright_drydock');
        assert.equal(shipwright.name, 'Shipwright Drydock');
        assert.equal(shipwright.category, 'hull_and_engine');
        assert.equal(shipwright.position.x, 22.0);
        assert.equal(shipwright.position.z, -215.0);
        assert.ok(shipwright.mooringRadius > 0);
        assert.ok(shipwright.services.includes('hull_repairs'));
        assert.ok(shipwright.promptText.includes('Shipwright Drydock'));

        // Tavern Sanctuary Pier
        assert.equal(tavern.id, 'tavern_sanctuary_pier');
        assert.equal(tavern.name, 'Tavern Sanctuary Pier');
        assert.equal(tavern.category, 'sanctuary_and_tarot');
        assert.equal(tavern.position.x, -20.0);
        assert.equal(tavern.position.z, -195.0);
        assert.ok(tavern.mooringRadius > 0);
        assert.ok(tavern.services.includes('tarot_blessings'));
        assert.ok(tavern.promptText.includes('Tavern Pier'));
    });
});

describe('Harbor City Basin Spatial Bounds — isInsideHarborBasin()', () => {
    it('returns true when craft is inside the 80m wide basin between z = -140 and -270', () => {
        // Center of basin
        assert.equal(isInsideHarborBasin({ x: 0, z: -200 }), true);
        // East bank inside seawall
        assert.equal(isInsideHarborBasin({ x: 39, z: -175 }), true);
        // West bank inside seawall
        assert.equal(isInsideHarborBasin({ x: -39, z: -220 }), true);
        // North gate boundary
        assert.equal(isInsideHarborBasin({ x: 0, z: -140 }), true);
        // South gate boundary
        assert.equal(isInsideHarborBasin({ x: 0, z: -270 }), true);
    });

    it('returns false when craft is outside Z range', () => {
        // Upriver before north gate
        assert.equal(isInsideHarborBasin({ x: 0, z: -139 }), false);
        assert.equal(isInsideHarborBasin({ x: 0, z: -50 }), false);
        // Downriver past south gate
        assert.equal(isInsideHarborBasin({ x: 0, z: -271 }), false);
        assert.equal(isInsideHarborBasin({ x: 0, z: -350 }), false);
    });

    it('returns false when craft is outside lateral seawalls (x < -40 or x > 40)', () => {
        assert.equal(isInsideHarborBasin({ x: 41, z: -200 }), false);
        assert.equal(isInsideHarborBasin({ x: -41, z: -200 }), false);
        assert.equal(isInsideHarborBasin({ x: 100, z: -200 }), false);
    });

    it('handles null, undefined, or missing coordinates gracefully', () => {
        assert.equal(isInsideHarborBasin(null), false);
        assert.equal(isInsideHarborBasin(undefined), false);
        assert.equal(isInsideHarborBasin({}), false);
        assert.equal(isInsideHarborBasin({ x: 0 }), false);
        // z provided without x defaults x to 0 (which is in basin)
        assert.equal(isInsideHarborBasin({ z: -200 }), true);
    });
});

describe('Nearest Harbor Berth & Mooring Detection — getNearestHarborBerth()', () => {
    it('returns null and inactive prompt for invalid position input', () => {
        const res = getNearestHarborBerth(null);
        assert.equal(res.berth, null);
        assert.equal(res.distance, Infinity);
        assert.equal(res.isMoored, false);
        assert.equal(res.promptActive, false);
        assert.equal(res.promptText, null);
        assert.equal(res.promptAction, null);
    });

    it('accurately identifies Armory Wharf when closest', () => {
        const res = getNearestHarborBerth({ x: 18.0, y: 0.25, z: -175.0 });
        assert.equal(res.berth.id, 'armory_wharf');
        assert.equal(res.distance, 0);
        assert.equal(res.isMoored, true);
        assert.equal(res.promptActive, true);
        assert.equal(res.promptAction, 'open_armory');
        assert.ok(res.promptText.includes('Armory Wharf'));
    });

    it('accurately identifies Shipwright Drydock when closest', () => {
        const res = getNearestHarborBerth({ x: 21.0, y: 0.25, z: -214.0 });
        assert.equal(res.berth.id, 'shipwright_drydock');
        assert.ok(res.distance < 2.0);
        assert.equal(res.isMoored, true);
        assert.equal(res.promptActive, true);
        assert.equal(res.promptAction, 'open_shipwright');
    });

    it('accurately identifies Tavern Sanctuary Pier when closest', () => {
        const res = getNearestHarborBerth({ x: -20.0, y: 0.25, z: -195.0 });
        assert.equal(res.berth.id, 'tavern_sanctuary_pier');
        assert.equal(res.distance, 0);
        assert.equal(res.isMoored, true);
        assert.equal(res.promptActive, true);
        assert.equal(res.promptAction, 'open_tavern');
    });

    it('marks isMoored and promptActive false when craft is beyond mooring radius', () => {
        // Center channel at z = -175 (x = 0, Armory Wharf is at x = 18, dist = 18m > radius 9m)
        const res = getNearestHarborBerth({ x: 0, z: -175 });
        assert.equal(res.berth.id, 'armory_wharf');
        assert.equal(res.distance, 18);
        assert.equal(res.isMoored, false);
        assert.equal(res.promptActive, false);
        assert.equal(res.promptText, null);
        assert.equal(res.promptAction, null);
    });
});

describe('Harbor City Environmental & Zone State — getHarborZoneState()', () => {
    it('returns default Open River state when craft is outside harbor or position is missing', () => {
        const nullState = getHarborZoneState(null);
        assert.equal(nullState.isInHarbor, false);
        assert.equal(nullState.isInBasin, false);
        assert.equal(nullState.truceBarrierActive, false);
        assert.equal(nullState.enemyTruceEnforced, false);
        assert.equal(nullState.effectiveCurrent, 12.0);
        assert.equal(nullState.zoneName, 'Open River');

        const openRiverState = getHarborZoneState({ x: 0, z: -50 }, 12.0);
        assert.equal(openRiverState.isInHarbor, false);
        assert.equal(openRiverState.isInBasin, false);
        assert.equal(openRiverState.truceBarrierActive, false);
        assert.equal(openRiverState.enemyTruceEnforced, false);
        assert.equal(openRiverState.effectiveCurrent, 12.0);
    });

    it('enforces 100% zero river current and 100% truce barrier inside calm lagoon basin', () => {
        const basinState = getHarborZoneState({ x: 0, z: -200 }, 12.0);
        assert.equal(basinState.isInHarbor, true);
        assert.equal(basinState.isInBasin, true);
        assert.equal(basinState.effectiveCurrent, 0.0);
        assert.equal(basinState.currentFactor, 0.0);
        assert.equal(basinState.truceBarrierActive, true);
        assert.equal(basinState.enemyTruceEnforced, true);
        assert.equal(basinState.seawallDamageReduction, 1.0);
        assert.equal(basinState.zoneName, 'Harbor City Calm Lagoon');
    });

    it('triggers automatic shop prompt when moored at a pier berth', () => {
        // Moored right at Armory Wharf
        const armoryState = getHarborZoneState({ x: 18.0, z: -175.0 }, 12.0);
        assert.equal(armoryState.isInBasin, true);
        assert.equal(armoryState.isMoored, true);
        assert.equal(armoryState.promptActive, true);
        assert.equal(armoryState.promptAction, 'open_armory');
        assert.ok(armoryState.promptText.includes('Armory Wharf'));
        assert.equal(armoryState.zoneName, 'Harbor Basin: Armory Wharf');

        // Moored at Shipwright Drydock
        const shipwrightState = getHarborZoneState({ x: 22.0, z: -215.0 }, 12.0);
        assert.equal(shipwrightState.isInBasin, true);
        assert.equal(shipwrightState.isMoored, true);
        assert.equal(shipwrightState.promptActive, true);
        assert.equal(shipwrightState.promptAction, 'open_shipwright');
        assert.equal(shipwrightState.zoneName, 'Harbor Basin: Shipwright Drydock');

        // Moored at Tavern Pier
        const tavernState = getHarborZoneState({ x: -20.0, z: -195.0 }, 12.0);
        assert.equal(tavernState.isInBasin, true);
        assert.equal(tavernState.isMoored, true);
        assert.equal(tavernState.promptActive, true);
        assert.equal(tavernState.promptAction, 'open_tavern');
        assert.equal(tavernState.zoneName, 'Harbor Basin: Tavern Sanctuary Pier');
    });

    it('does not trigger mooring or shop prompt when floating in basin center far from docks', () => {
        const centerBasinState = getHarborZoneState({ x: 0, z: -200 }, 12.0);
        assert.equal(centerBasinState.isInBasin, true);
        assert.equal(centerBasinState.isMoored, false);
        assert.equal(centerBasinState.promptActive, false);
        assert.equal(centerBasinState.promptText, null);
    });

    it('smoothly blends current when approaching south exit gate', () => {
        // Approaching exit gate at z = -265 (blendDist is 15m, gate is -270)
        const exitApproachState = getHarborZoneState({ x: 0, z: -265 }, 12.0);
        assert.equal(exitApproachState.isInBasin, true);
        assert.ok(exitApproachState.effectiveCurrent >= 0.0);
        assert.ok(exitApproachState.effectiveCurrent <= 12.0);
    });

    it('handles lateral position outside seawalls (x > 40) within harbor z-band', () => {
        const outerState = getHarborZoneState({ x: 45, z: -200 }, 12.0);
        assert.equal(outerState.isInHarbor, true);
        assert.equal(outerState.isInBasin, false);
        assert.equal(outerState.truceBarrierActive, false);
        assert.equal(outerState.effectiveCurrent, 12.0);
        assert.equal(outerState.zoneName, 'Outer Harbor Approach');
    });
});
