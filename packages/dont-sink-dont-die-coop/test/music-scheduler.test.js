import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MUSIC_MODES,
    TRACK_LAYERS,
    COMBAT_PROXIMITY_METERS,
    RAPIDS_SPEED_THRESHOLD,
    RAPIDS_FULL_SPEED,
    SHOP_DOCK_ZONE,
    clamp,
    lerp,
    equalPowerWeights,
    isInShopZone,
    distanceBetween,
    getClosestEnemyDistance,
    evaluateMusicMode,
    calculateLayerWeights,
    smoothCrossfadeWeights,
    calculateSpatialAudio,
    calculateRiverAmbianceSpatial,
    calculateWaterfallSpatial,
    calculatePoliceSirenSpatial,
    calculateMonsterRoarSpatial,
    midiToFreq,
    NOTE_FREQS,
    MODE_BPM,
    MUSIC_PATTERNS,
    getSequenceStep,
    SPATIAL_PRESETS,
} from '../shared/music-scheduler.js';

describe('Music Modes and Constants Definition', () => {
    test('defines the 4 core music modes', () => {
        assert.equal(MUSIC_MODES.CALM, 'calm');
        assert.equal(MUSIC_MODES.RAPIDS, 'rapids');
        assert.equal(MUSIC_MODES.HARBOR_LOFI, 'harbor-lofi');
        assert.equal(MUSIC_MODES.COMBAT, 'combat');
    });

    test('defines the 4 required multi-track audio layers', () => {
        assert.equal(TRACK_LAYERS.BASS, 'bass');
        assert.equal(TRACK_LAYERS.PERCUSSION, 'percussion');
        assert.equal(TRACK_LAYERS.LEAD, 'lead');
        assert.equal(TRACK_LAYERS.BRASS, 'brass');
    });

    test('combat proximity threshold is exactly 35 meters', () => {
        assert.equal(COMBAT_PROXIMITY_METERS, 35);
    });

    test('rapids speed thresholds are positive and ordered', () => {
        assert.ok(RAPIDS_SPEED_THRESHOLD > 0);
        assert.ok(RAPIDS_FULL_SPEED > RAPIDS_SPEED_THRESHOLD);
    });

    test('shop dock zone coordinates match game-core dimensions', () => {
        assert.equal(SHOP_DOCK_ZONE.minX, 10);
        assert.equal(SHOP_DOCK_ZONE.minZ, -250);
        assert.equal(SHOP_DOCK_ZONE.maxZ, -150);
    });
});

describe('Pure Math & Distance Helpers', () => {
    test('clamp restricts values strictly inside bounds', () => {
        assert.equal(clamp(5, 0, 10), 5);
        assert.equal(clamp(-3, 0, 10), 0);
        assert.equal(clamp(15, 0, 10), 10);
    });

    test('lerp interpolates values linearly and handles edge t values', () => {
        assert.equal(lerp(10, 20, 0), 10);
        assert.equal(lerp(10, 20, 1), 20);
        assert.equal(lerp(10, 20, 0.5), 15);
        assert.equal(lerp(10, 20, -1), 10); // clamped
        assert.equal(lerp(10, 20, 2), 20); // clamped
    });

    test('equalPowerWeights maintains constant acoustic power (a^2 + b^2 ≈ 1)', () => {
        for (let t = 0; t <= 1.0; t += 0.1) {
            const { a, b } = equalPowerWeights(t);
            const sumOfSquares = a * a + b * b;
            assert.ok(Math.abs(sumOfSquares - 1.0) < 1e-6, `Power not preserved at t=${t}`);
        }
        assert.equal(equalPowerWeights(0).a, 1);
        assert.equal(equalPowerWeights(0).b, 0);
        assert.ok(Math.abs(equalPowerWeights(1).a) < 1e-6);
        assert.equal(equalPowerWeights(1).b, 1);
    });

    test('distanceBetween computes accurate 3D Euclidean distances and handles nulls', () => {
        assert.equal(distanceBetween(null, { x: 0, y: 0, z: 0 }), Infinity);
        assert.equal(distanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
        assert.equal(distanceBetween({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), 0);
        assert.equal(distanceBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 }), 10);
    });

    test('isInShopZone detects point membership accurately', () => {
        assert.equal(isInShopZone(null), false);
        assert.equal(isInShopZone({ x: 15, z: -200 }), true); // inside
        assert.equal(isInShopZone({ x: 10, z: -250 }), true); // boundary min
        assert.equal(isInShopZone({ x: 20, z: -150 }), true); // boundary max
        assert.equal(isInShopZone({ x: 9.9, z: -200 }), false); // too far left
        assert.equal(isInShopZone({ x: 15, z: -251 }), false); // before shop
        assert.equal(isInShopZone({ x: 15, z: -149 }), false); // after shop
    });
});

describe('Closest Enemy Proximity & Mode Evaluation', () => {
    test('getClosestEnemyDistance ignores dead enemies or missing positions', () => {
        const playerPos = { x: 0, y: 0, z: -50 };
        const enemies = {
            whiteGuy: { health: 0, position: { x: 0, y: 0, z: -52 } }, // dead
            mudAlien: { health: 100, position: { x: 0, y: 0, z: -80 } }, // dist = 30
            longWorm: { health: 200, position: { x: 0, y: 0, z: -100 } }, // dist = 50
        };
        const dist = getClosestEnemyDistance(playerPos, enemies);
        assert.equal(dist, 30);
    });

    test('getClosestEnemyDistance returns Infinity when no active enemies exist', () => {
        assert.equal(getClosestEnemyDistance({ x: 0, y: 0, z: 0 }, {}), Infinity);
        assert.equal(getClosestEnemyDistance({ x: 0, y: 0, z: 0 }, null), Infinity);
    });

    test('evaluateMusicMode prioritizes Combat when enemy is within 35m', () => {
        const playerPos = { x: 0, y: 0, z: -200 }; // In shop zone coordinate
        const enemies = {
            mudAlien: { health: 50, position: { x: 0, y: 0, z: -230 } }, // 30m away (<= 35m)
        };
        const mode = evaluateMusicMode({ playerPos, speed: 15, enemies });
        assert.equal(mode, MUSIC_MODES.COMBAT);
    });

    test('evaluateMusicMode switches to Harbor Lo-Fi when inside shop dock zone and no enemy within 35m', () => {
        const playerPos = { x: 15, y: 0, z: -200 };
        const enemies = {
            mudAlien: { health: 50, position: { x: 15, y: 0, z: -250 } }, // 50m away (> 35m)
        };
        const mode = evaluateMusicMode({ playerPos, speed: 12, enemies });
        assert.equal(mode, MUSIC_MODES.HARBOR_LOFI);
    });

    test('evaluateMusicMode activates Rapids when speed >= 9m/s outside shop/combat', () => {
        const playerPos = { x: 0, y: 0, z: -50 }; // Outside shop
        const enemies = {};
        const modeCalm = evaluateMusicMode({ playerPos, speed: 8.5, enemies });
        const modeRapids = evaluateMusicMode({ playerPos, speed: 9.5, enemies });
        assert.equal(modeCalm, MUSIC_MODES.CALM);
        assert.equal(modeRapids, MUSIC_MODES.RAPIDS);
    });

    test('evaluateMusicMode defaults to Calm River Paddling', () => {
        const mode = evaluateMusicMode({ playerPos: { x: 0, y: 0, z: 0 }, speed: 5 });
        assert.equal(mode, MUSIC_MODES.CALM);
    });

    test('evaluateMusicMode respects forcedMode override if provided', () => {
        const mode = evaluateMusicMode({
            playerPos: { x: 0, y: 0, z: 0 },
            speed: 0,
            forcedMode: MUSIC_MODES.COMBAT,
        });
        assert.equal(mode, MUSIC_MODES.COMBAT);
    });
});

describe('calculateLayerWeights & Continuous Crossfades', () => {
    test('Calm mode has strong mellow bass, subtle percussion, moderate lead, and muted brass', () => {
        const result = calculateLayerWeights({ mode: MUSIC_MODES.CALM });
        assert.equal(result.mode, MUSIC_MODES.CALM);
        assert.ok(result.weights.bass >= 0.6 && result.weights.bass <= 0.8);
        assert.ok(result.weights.percussion <= 0.4);
        assert.ok(result.weights.lead >= 0.35 && result.weights.lead <= 0.6);
        assert.equal(result.weights.brass, 0.0);
    });

    test('Combat mode raises percussion, lead, and danger brass to peak intensity', () => {
        const result = calculateLayerWeights({ mode: MUSIC_MODES.COMBAT });
        assert.equal(result.mode, MUSIC_MODES.COMBAT);
        assert.equal(result.weights.percussion, 1.0);
        assert.ok(result.weights.brass >= 0.85);
        assert.ok(result.weights.bass >= 0.9);
        assert.ok(result.weights.lead >= 0.8);
    });

    test('Rapids mode ramps percussion and danger brass proportional to high speed', () => {
        const slowRapids = calculateLayerWeights({ speed: 9.5 });
        const fastRapids = calculateLayerWeights({ speed: 14.0 });
        assert.ok(fastRapids.weights.percussion >= slowRapids.weights.percussion);
        assert.ok(fastRapids.weights.brass >= slowRapids.weights.brass);
    });

    test('Harbor Lo-Fi mode features prominent bass, groove percussion, jazz lead, and minimal brass', () => {
        const result = calculateLayerWeights({ mode: MUSIC_MODES.HARBOR_LOFI });
        assert.equal(result.mode, MUSIC_MODES.HARBOR_LOFI);
        assert.ok(result.weights.lead >= 0.7);
        assert.ok(result.weights.brass <= 0.1);
    });

    test('smoothCrossfadeWeights converges smoothly towards target weights over time', () => {
        const current = { bass: 0.5, percussion: 0.1, lead: 0.2, brass: 0.0 };
        const target = { bass: 1.0, percussion: 1.0, lead: 1.0, brass: 1.0 };
        const step1 = smoothCrossfadeWeights(current, target, 0.1, 4.0);
        assert.ok(step1.bass > current.bass && step1.bass < target.bass);
        assert.ok(step1.percussion > current.percussion && step1.percussion < target.percussion);

        // After long dt, should closely approach target
        const stepEnd = smoothCrossfadeWeights(current, target, 5.0, 4.0);
        assert.ok(Math.abs(stepEnd.brass - 1.0) < 1e-4);
        assert.ok(Math.abs(stepEnd.percussion - 1.0) < 1e-4);
    });
});

describe('Spatial 3D Audio & Stereo Panning Mathematics', () => {
    test('calculateSpatialAudio returns centered pan and full gain at zero distance', () => {
        const listener = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
        const emitter = { position: { x: 0, y: 0, z: 0 } };
        const spatial = calculateSpatialAudio(listener, emitter);
        assert.equal(spatial.pan, 0);
        assert.equal(spatial.gain, 1.0);
        assert.equal(spatial.distance, 0);
    });

    test('emitter directly to the right pans positive (towards +1)', () => {
        // Listener at origin, looking along -Z (yaw = 0)
        // Emitter at (+10, 0, 0)
        const listener = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
        const emitter = { position: { x: 10, y: 0, z: 0 } };
        const spatial = calculateSpatialAudio(listener, emitter);
        assert.ok(spatial.pan > 0.9, `Expected positive pan, got ${spatial.pan}`);
    });

    test('emitter directly to the left pans negative (towards -1)', () => {
        const listener = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
        const emitter = { position: { x: -10, y: 0, z: 0 } };
        const spatial = calculateSpatialAudio(listener, emitter);
        assert.ok(spatial.pan < -0.9, `Expected negative pan, got ${spatial.pan}`);
    });

    test('stereo pan rotates correctly when listener yaws 90 degrees', () => {
        // Listener at origin rotated 90 degrees left (yaw = +PI/2)
        // Looking along -X, so an emitter at (+10, 0, 0) is now directly BEHIND listener
        // An emitter at (0, 0, +10) is to the listener's RIGHT
        const listener = { position: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2 };
        const emitterBehind = { position: { x: 10, y: 0, z: 0 } };
        const emitterRight = { position: { x: 0, y: 0, z: -10 } }; // listener facing -X, so right is -Z

        const spatialBehind = calculateSpatialAudio(listener, emitterBehind);
        assert.ok(Math.abs(spatialBehind.pan) < 0.1, `Expected near center pan for behind emitter, got ${spatialBehind.pan}`);

        const spatialRight = calculateSpatialAudio(listener, emitterRight);
        assert.ok(spatialRight.pan > 0.9, `Expected right pan, got ${spatialRight.pan}`);
    });

    test('attenuates gain over distance and clamps to 0 at maxDistance', () => {
        const listener = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
        const nearEmitter = { position: { x: 0, y: 0, z: -10 } };
        const farEmitter = { position: { x: 0, y: 0, z: -100 } };
        const beyondEmitter = { position: { x: 0, y: 0, z: -150 } };

        const near = calculateSpatialAudio(listener, nearEmitter, { maxDistance: 120, refDistance: 5 });
        const far = calculateSpatialAudio(listener, farEmitter, { maxDistance: 120, refDistance: 5 });
        const beyond = calculateSpatialAudio(listener, beyondEmitter, { maxDistance: 120, refDistance: 5 });

        assert.ok(near.gain > far.gain, `Near gain (${near.gain}) should be > far gain (${far.gain})`);
        assert.equal(beyond.gain, 0);
    });

    test('low-pass filter frequency dampens higher frequencies with distance', () => {
        const listener = { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
        const near = calculateSpatialAudio(listener, { position: { x: 0, y: 0, z: -5 } }, { maxDistance: 100 });
        const far = calculateSpatialAudio(listener, { position: { x: 0, y: 0, z: -90 } }, { maxDistance: 100 });
        assert.ok(near.filterFreq > far.filterFreq, `Near freq (${near.filterFreq}) should be higher than far freq (${far.filterFreq})`);
    });
});

describe('Spatial Presets for Game Audio Events', () => {
    const listener = { position: { x: 0, y: 0, z: -100 }, yaw: 0 };

    test('calculateRiverAmbianceSpatial applies river ambiance preset parameters', () => {
        const riverEdge = { position: { x: 15, y: 0, z: -100 } };
        const res = calculateRiverAmbianceSpatial(listener, riverEdge);
        assert.ok(res.pan > 0);
        assert.ok(res.gain > 0 && res.gain <= 1.0);
        assert.ok(res.filterFreq >= SPATIAL_PRESETS.RIVER_AMBIANCE.lpMinFreq);
    });

    test('calculateWaterfallSpatial handles distant thunderous waterfalls', () => {
        const waterfall = { position: { x: -30, y: 5, z: -200 } };
        const res = calculateWaterfallSpatial(listener, waterfall);
        assert.ok(res.pan < 0); // waterfall on left
        assert.ok(res.distance > 100);
        assert.ok(res.gain > 0); // within 150m maxDistance
    });

    test('calculatePoliceSirenSpatial provides distinct siren roll-off', () => {
        const policeSiren = { position: { x: 25, y: 2, z: -180 } };
        const res = calculatePoliceSirenSpatial(listener, policeSiren);
        assert.ok(res.pan > 0);
        assert.ok(res.filterFreq <= SPATIAL_PRESETS.POLICE_SIREN.lpMaxFreq);
    });

    test('calculateMonsterRoarSpatial has long range propagation up to 200m', () => {
        const leviathan = { position: { x: 0, y: 0, z: -270 } }; // 170m away
        const res = calculateMonsterRoarSpatial(listener, leviathan);
        assert.ok(res.distance === 170);
        assert.ok(res.gain > 0, 'Leviathan roar should be audible at 170m');
        assert.ok(res.filterFreq < 5000, 'Distant roar should have deep low-pass muffled tone');
    });
});

describe('Musical Synthesizer Sequences & Pattern Schedulers', () => {
    test('midiToFreq accurately converts MIDI notes (A4 = 69 = 440Hz, C4 = 60 ≈ 261.63Hz)', () => {
        assert.equal(Math.round(midiToFreq(69)), 440);
        assert.equal(Math.round(midiToFreq(60)), 262);
    });

    test('NOTE_FREQS table contains required bass, lead, and brass frequencies', () => {
        assert.ok(NOTE_FREQS.C2 < 70); // Deep bass note
        assert.ok(NOTE_FREQS.C4 > 250 && NOTE_FREQS.C4 < 270); // Middle C
        assert.ok(NOTE_FREQS.G5 > 750); // High melody lead
    });

    test('MODE_BPM specifies distinct tempo per mode', () => {
        assert.ok(MODE_BPM[MUSIC_MODES.COMBAT] > MODE_BPM[MUSIC_MODES.RAPIDS]);
        assert.ok(MODE_BPM[MUSIC_MODES.RAPIDS] > MODE_BPM[MUSIC_MODES.CALM]);
        assert.ok(MODE_BPM[MUSIC_MODES.CALM] > MODE_BPM[MUSIC_MODES.HARBOR_LOFI]);
    });

    test('MUSIC_PATTERNS contains 16-step patterns for all 4 modes and 4 layers', () => {
        for (const mode of Object.values(MUSIC_MODES)) {
            const pattern = MUSIC_PATTERNS[mode];
            assert.ok(pattern, `Missing pattern for mode: ${mode}`);
            for (const layer of Object.values(TRACK_LAYERS)) {
                assert.ok(Array.isArray(pattern[layer]), `Missing layer ${layer} in mode ${mode}`);
                assert.equal(pattern[layer].length, 16, `Layer ${layer} pattern must have 16 steps`);
            }
        }
    });

    test('getSequenceStep deterministically computes step index and duration from time', () => {
        const step0 = getSequenceStep(0.0, 120);
        assert.equal(step0.stepIndex, 0);
        assert.equal(step0.totalSteps, 16);
        assert.ok(Math.abs(step0.stepDuration - 0.125) < 1e-4); // At 120 BPM, 16th note = 0.125s

        const step1 = getSequenceStep(0.125, 120);
        assert.equal(step1.stepIndex, 1);

        const stepWrap = getSequenceStep(2.0, 120); // 16 steps = 2 seconds
        assert.equal(stepWrap.stepIndex, 0);
    });
});
