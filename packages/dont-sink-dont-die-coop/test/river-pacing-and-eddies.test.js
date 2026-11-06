import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PACING_ZONES,
    isInHarborBasin,
    isInIslandEddy,
    computeBankCurrentFactor,
    computeLocalRiverCurrent,
    toggleRaftAnchor,
} from '../shared/river-pacing-and-eddies.js';

test('Deliberate River Pacing, Calm Eddies & Drop-Anchor Hydrodynamics Suite', async (t) => {
    await t.test('PACING_ZONES configuration constants integrity', () => {
        // Main channel gentle drift constants
        assert.equal(PACING_ZONES.MAIN_CHANNEL.MIN_FORCE, 26.0);
        assert.equal(PACING_ZONES.MAIN_CHANNEL.MAX_FORCE, 34.0);
        assert.equal(PACING_ZONES.MAIN_CHANNEL.DEFAULT_BASE_FORCE, 30.0);
        assert.equal(PACING_ZONES.MAIN_CHANNEL.WAVE_FORCE_SCALE, 0.8);

        // Harbor City Basin bounds: z = -135 to -275
        assert.equal(PACING_ZONES.HARBOR_BASIN.Z_START, -135);
        assert.equal(PACING_ZONES.HARBOR_BASIN.Z_END, -275);
        assert.equal(PACING_ZONES.HARBOR_BASIN.MIN_Z, -275);
        assert.equal(PACING_ZONES.HARBOR_BASIN.MAX_Z, -135);
        assert.equal(PACING_ZONES.HARBOR_BASIN.CURRENT_FORCE, 0.0);

        // Bank damping configuration (15m shores)
        assert.equal(PACING_ZONES.BANK_DAMPING.SHORE_WIDTH, 15.0);
        assert.equal(PACING_ZONES.BANK_DAMPING.MIN_CURRENT_RATIO, 0.25);
        assert.equal(PACING_ZONES.BANK_DAMPING.DEFAULT_CHANNEL_WIDTH, 30.0);

        // Island eddy slipstream defaults
        assert.equal(PACING_ZONES.ISLAND_EDDY.DEFAULT_SHADOW_LENGTH, 22.0);
        assert.equal(PACING_ZONES.ISLAND_EDDY.DEFAULT_ISLAND_RADIUS, 6.0);

        // Anchor configuration
        assert.equal(PACING_ZONES.ANCHOR.HOLD_FORCE, 0.0);
        assert.ok(PACING_ZONES.ANCHOR.DRAG_MULTIPLIER > 1.0);
    });

    await t.test('isInHarborBasin detects harbor boundaries precisely', () => {
        assert.equal(isInHarborBasin(-135), true, 'Exact start of harbor basin');
        assert.equal(isInHarborBasin(-200), true, 'Deep inside harbor basin');
        assert.equal(isInHarborBasin(-275), true, 'Exact end of harbor basin');

        assert.equal(isInHarborBasin(-50), false, 'Upstream before harbor basin');
        assert.equal(isInHarborBasin(-134.9), false, 'Just outside upper harbor boundary');
        assert.equal(isInHarborBasin(-275.1), false, 'Just past downstream harbor boundary');
        assert.equal(isInHarborBasin(-350), false, 'Far downstream');

        // Non-numeric or edge values
        assert.equal(isInHarborBasin(NaN), false);
        assert.equal(isInHarborBasin(Infinity), false);
        assert.equal(isInHarborBasin(null), false);
        assert.equal(isInHarborBasin(undefined), false);
    });

    await t.test('isInIslandEddy detects downstream wake shadow and core radius', () => {
        const testIslands = [
            { x: 0, z: -500, radius: 6.0, shadowLength: 20.0 },
            { x: -5, z: -800, radius: 4.0, shadowLength: 25.0 },
        ];

        // Craft directly at or inside island 1 body
        assert.equal(isInIslandEddy(0, -500, testIslands), true, 'Center of island 1');
        assert.equal(isInIslandEddy(4, -500, testIslands), true, 'Inside island 1 circular radius');

        // Downstream wake shadow behind island 1 (z between -500 and -520)
        assert.equal(isInIslandEddy(0, -510, testIslands), true, 'In wake shadow behind island 1');
        assert.equal(isInIslandEddy(3, -518, testIslands), true, 'In lateral shadow buffer behind island 1');
        assert.equal(isInIslandEddy(0, -520, testIslands), true, 'At tail edge of wake shadow');

        // Outside shadow of island 1
        assert.equal(isInIslandEddy(0, -521, testIslands), false, 'Past downstream wake shadow');
        assert.equal(isInIslandEddy(0, -490, testIslands), false, 'Upstream of island 1 (not in wake)');
        assert.equal(isInIslandEddy(12, -510, testIslands), false, 'Too far laterally from island 1');

        // Island 2 tests
        assert.equal(isInIslandEddy(-5, -815, testIslands), true, 'In wake of island 2');
        assert.equal(isInIslandEddy(5, -815, testIslands), false, 'Far from island 2');

        // Edge inputs
        assert.equal(isInIslandEddy(0, 0, []), false);
        assert.equal(isInIslandEddy(0, 0, null), false);
        assert.equal(isInIslandEddy(NaN, -500, testIslands), false);
    });

    await t.test('computeBankCurrentFactor handles channel center, shore gradient, and out of bounds', () => {
        const halfWidth = 30.0; // 60m total channel, shoreWidth = 15m => inner 15m is deep channel
        const shoreWidth = 15.0;

        // In deep central channel (|x| <= 15) -> factor 1.0
        assert.equal(computeBankCurrentFactor(0, halfWidth, shoreWidth), 1.0);
        assert.equal(computeBankCurrentFactor(10, halfWidth, shoreWidth), 1.0);
        assert.equal(computeBankCurrentFactor(-15, halfWidth, shoreWidth), 1.0);

        // Near-bank shore gradient (|x| between 15 and 30)
        // At midway (distanceToBank = 7.5) -> t = 0.5 -> 0.25 + 0.75 * 0.5 = 0.625
        const midFactor = computeBankCurrentFactor(22.5, halfWidth, shoreWidth);
        assert.ok(Math.abs(midFactor - 0.625) < 1e-4);

        // At extreme bank boundary (distanceToBank -> 0, |x| = 29.99)
        const edgeFactor = computeBankCurrentFactor(29.99, halfWidth, shoreWidth);
        assert.ok(edgeFactor >= 0.25 && edgeFactor < 0.26);

        // Outside channel (|x| >= 30) -> 0.0
        assert.equal(computeBankCurrentFactor(30.0, halfWidth, shoreWidth), 0.0);
        assert.equal(computeBankCurrentFactor(-35.0, halfWidth, shoreWidth), 0.0);
    });

    await t.test('computeLocalRiverCurrent delivers deliberate ~26-34 force in main channel', () => {
        // Wave 1 main-channel current
        const resWave1 = computeLocalRiverCurrent({ x: 0, z: -50, wave: 1, riverWidth: 60 });
        assert.equal(resWave1.forceX, 0);
        assert.equal(resWave1.forceZ, -26.0);
        assert.equal(resWave1.magnitude, 26.0);
        assert.equal(resWave1.zone, 'main-channel');
        assert.equal(resWave1.isCalm, false);
        assert.equal(resWave1.anchorActive, false);

        // Wave 5 main-channel current: 26 + 4 * 0.8 = 29.2
        const resWave5 = computeLocalRiverCurrent({ x: 0, z: -50, wave: 5, riverWidth: 60 });
        assert.ok(Math.abs(resWave5.magnitude - 29.2) < 1e-4);
        assert.ok(resWave5.magnitude >= 26.0 && resWave5.magnitude <= 34.0);

        // Wave 10 main-channel current: 26 + 9 * 0.8 = 33.2 (clamped <= 34.0)
        const resWave10 = computeLocalRiverCurrent({ x: 0, z: -50, wave: 10, riverWidth: 60 });
        assert.ok(Math.abs(resWave10.magnitude - 33.2) < 1e-4);
        assert.ok(resWave10.magnitude >= 26.0 && resWave10.magnitude <= 34.0);

        // Custom base force override within range
        const resCustom = computeLocalRiverCurrent({ x: 0, z: -50, customBaseForce: 31.5 });
        assert.equal(resCustom.magnitude, 31.5);
        assert.equal(resCustom.forceZ, -31.5);
    });

    await t.test('computeLocalRiverCurrent provides zero-current calm water in Harbor City Basin', () => {
        const harborPoints = [-135, -150, -200, -250, -275];
        for (const z of harborPoints) {
            const res = computeLocalRiverCurrent({ x: 0, z, wave: 5 });
            assert.equal(res.forceX, 0, `forceX at z=${z}`);
            assert.equal(res.forceZ, 0, `forceZ at z=${z}`);
            assert.equal(res.magnitude, 0, `magnitude at z=${z}`);
            assert.equal(res.zone, 'harbor-basin');
            assert.equal(res.isCalm, true);
        }
    });

    await t.test('computeLocalRiverCurrent provides zero-current in mid-river island wake shadows', () => {
        const islands = [{ x: 0, z: -600, radius: 6.0, shadowLength: 25.0 }];

        // Behind island at z = -610
        const resEddy = computeLocalRiverCurrent({ x: 0, z: -610, wave: 3, islands });
        assert.equal(resEddy.forceX, 0);
        assert.equal(resEddy.forceZ, 0);
        assert.equal(resEddy.magnitude, 0);
        assert.equal(resEddy.zone, 'island-eddy');
        assert.equal(resEddy.isCalm, true);

        // Outside eddy shadow at z = -635
        const resOpen = computeLocalRiverCurrent({ x: 0, z: -635, wave: 3, islands });
        assert.ok(resOpen.magnitude > 0);
        assert.equal(resOpen.zone, 'main-channel');
    });

    await t.test('computeLocalRiverCurrent dampens near banks along 15m shores', () => {
        const riverWidth = 50.0; // halfWidth = 25.0, shoreWidth = 15m -> bank begins at |x| = 10
        const resCenter = computeLocalRiverCurrent({ x: 0, z: -50, wave: 1, riverWidth });
        const resBank = computeLocalRiverCurrent({ x: 20, z: -50, wave: 1, riverWidth });

        assert.equal(resCenter.zone, 'main-channel');
        assert.equal(resBank.zone, 'near-bank');
        assert.ok(resBank.magnitude < resCenter.magnitude, 'Shore current must be reduced');
        assert.ok(resBank.magnitude >= resCenter.magnitude * 0.25, 'Shore current within expected range');
    });

    await t.test('computeLocalRiverCurrent halts immediately on drop anchor or solid ground', () => {
        // Anchor dropped
        const resAnchor = computeLocalRiverCurrent({ x: 0, z: -50, wave: 8, anchorDropped: true });
        assert.equal(resAnchor.forceX, 0);
        assert.equal(resAnchor.forceZ, 0);
        assert.equal(resAnchor.magnitude, 0);
        assert.equal(resAnchor.zone, 'anchored');
        assert.equal(resAnchor.isCalm, true);
        assert.equal(resAnchor.anchorActive, true);

        // On solid ground (e.g. dock platform, plank)
        const resSolid = computeLocalRiverCurrent({ x: 0, z: -50, wave: 8, onSolid: true });
        assert.equal(resSolid.forceX, 0);
        assert.equal(resSolid.forceZ, 0);
        assert.equal(resSolid.magnitude, 0);
        assert.equal(resSolid.zone, 'solid');
        assert.equal(resSolid.isCalm, true);
        assert.equal(resSolid.anchorActive, false);
    });

    await t.test('toggleRaftAnchor manages anchor state and stabilizes craft velocity', () => {
        const player = {
            id: 'player_1',
            anchorDropped: false,
            velocity: { x: 5.0, y: 0.0, z: -14.0 },
        };

        // 1. Toggle anchor ON
        const toggleOn = toggleRaftAnchor(player, { timestamp: 1000 });
        assert.equal(toggleOn.anchorDropped, true);
        assert.equal(toggleOn.toggled, true);
        assert.equal(player.anchorDropped, true);
        assert.equal(player.anchorTimestamp, 1000);
        // Velocity stabilized
        assert.equal(player.velocity.x, 1.0);
        assert.ok(Math.abs(player.velocity.z - (-2.8)) < 1e-6);

        // 2. Toggle anchor OFF
        const toggleOff = toggleRaftAnchor(player, { timestamp: 2000 });
        assert.equal(toggleOff.anchorDropped, false);
        assert.equal(toggleOff.toggled, true);
        assert.equal(player.anchorDropped, false);
        assert.equal(player.anchorTimestamp, 2000);

        // 3. Force state idempotently
        const forceState = toggleRaftAnchor(player, { forceState: false });
        assert.equal(forceState.anchorDropped, false);
        assert.equal(forceState.toggled, false, 'Should report no change if already false');

        // 4. Null / safe handling
        const nullRes = toggleRaftAnchor(null);
        assert.equal(nullRes.anchorDropped, false);
        assert.equal(nullRes.toggled, false);
    });
});
