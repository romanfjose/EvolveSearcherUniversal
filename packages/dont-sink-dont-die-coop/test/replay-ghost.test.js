import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    REPLAY_VERSION,
    DAILY_MUTATORS,
    DAILY_MUTATOR_KEYS,
    getDailySeed,
    getDailyMutator,
    applyMutatorModifiers,
    compressRunFrames,
    decompressRunFrames,
    computeChecksum,
    stringToBase64,
    base64ToString,
    exportRunReplay,
    importRunReplay,
    formatSplitDelta,
    getCheckpointSplit,
    getPBStorageKey,
    savePersonalBest,
    loadPersonalBest,
    clearPersonalBest,
    isNewPersonalBest,
    RunRecorder,
    GhostPlayback,
    lerpAngle,
} from '../shared/replay-ghost.js';

import {
    GHOST_DEFAULT_COLOR,
    GHOST_AHEAD_COLOR,
    GHOST_BEHIND_COLOR,
    createHologramMaterial,
    createGhostRaftMesh,
    createGhostSplitBadge,
    GhostRaftController,
} from '../public/js/entities/ghost-raft.js';

/**
 * Headless mock Three.js for testing ghost raft meshes and controllers.
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
            this.name = '';
            this.visible = true;
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
        lookAt(x, y, z) {
            this.lookedAt = { x, y, z };
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
        dispose() {}
    }
    class Material {
        constructor(type, p = {}) {
            this.type = type;
            Object.assign(this, p);
        }
        dispose() {}
    }

    return {
        Group,
        Mesh,
        Vector3,
        Euler,
        CylinderGeometry: class extends Geometry { constructor(...a) { super('CylinderGeometry', ...a); } },
        BoxGeometry: class extends Geometry { constructor(...a) { super('BoxGeometry', ...a); } },
        SphereGeometry: class extends Geometry { constructor(...a) { super('SphereGeometry', ...a); } },
        RingGeometry: class extends Geometry { constructor(...a) { super('RingGeometry', ...a); } },
        MeshBasicMaterial: class extends Material { constructor(p) { super('MeshBasicMaterial', p); } },
        MeshStandardMaterial: class extends Material { constructor(p) { super('MeshStandardMaterial', p); } },
        MeshPhysicalMaterial: class extends Material { constructor(p) { super('MeshPhysicalMaterial', p); } },
    };
}

describe('1. Daily Challenge Mutators and Deterministic Seeding', () => {
    test('defines all 10 required Daily Challenge Mutators', () => {
        const required = [
            'Turbo Rapids',
            'Glass Cannon',
            'Double Wizard',
            'Low Gravity Jumps',
            'Golden Rush',
            'Nitro Drift',
            'Nightmare Swarm',
            'Heavy Anvil',
            'Bouncy Hull',
            'Vampiric Oar',
        ];
        assert.equal(DAILY_MUTATOR_KEYS.length, 10);
        for (const name of required) {
            assert.ok(DAILY_MUTATORS[name], `Missing daily mutator: ${name}`);
            assert.equal(DAILY_MUTATORS[name].name, name);
            assert.ok(DAILY_MUTATORS[name].modifiers, `Mutator ${name} missing modifiers`);
        }
    });

    test('getDailySeed produces deterministic 32-bit unsigned integer from date', () => {
        const d1 = new Date('2026-06-15T00:00:00Z');
        const d2 = new Date('2026-06-15T23:59:59Z');
        const d3 = new Date('2026-06-16T00:00:00Z');

        const seed1 = getDailySeed(d1);
        const seed2 = getDailySeed(d2);
        const seed3 = getDailySeed(d3);

        assert.equal(typeof seed1, 'number');
        assert.ok(seed1 >= 0 && seed1 <= 0xffffffff);
        assert.equal(seed1, seed2, 'Same UTC date must produce identical seeds');
        assert.notEqual(seed1, seed3, 'Different UTC dates produce different seeds');
    });

    test('getDailyMutator resolves deterministic mutator from date or seed', () => {
        const d = new Date('2026-01-01T12:00:00Z');
        const mut1 = getDailyMutator(d);
        const mut2 = getDailyMutator(d);

        assert.equal(mut1.name, mut2.name);
        assert.equal(mut1.seed, mut2.seed);
        assert.ok(DAILY_MUTATOR_KEYS.includes(mut1.name));

        const directMut = getDailyMutator(mut1.seed);
        assert.equal(directMut.name, mut1.name);
    });

    test('applyMutatorModifiers correctly modifies core parameters', () => {
        const baseParams = {
            baseCurrent: 100,
            basePaddle: 200,
            gravity: 30,
            jumpVelocity: 18,
            turnRate: 2.2,
        };

        const turbo = DAILY_MUTATORS['Turbo Rapids'];
        const modifiedTurbo = applyMutatorModifiers(baseParams, turbo);
        assert.equal(modifiedTurbo.baseCurrent, 100 * 1.75);
        assert.equal(modifiedTurbo.basePaddle, 200 * 1.75);

        const lowGrav = DAILY_MUTATORS['Low Gravity Jumps'];
        const modifiedGrav = applyMutatorModifiers(baseParams, lowGrav);
        assert.equal(modifiedGrav.gravity, 30 * 0.4);
        assert.equal(modifiedGrav.jumpVelocity, 18 * 1.4);
    });

    test('applyMutatorModifiers handles null or empty mutators safely', () => {
        const base = { baseCurrent: 100 };
        assert.deepEqual(applyMutatorModifiers(base, null), base);
        assert.deepEqual(applyMutatorModifiers(base, {}), base);
    });
});

describe('2. RunRecorder and Frame Capture', () => {
    test('initializes with default settings and empty frames', () => {
        const recorder = new RunRecorder({ playerName: 'Speedster' });
        assert.equal(recorder.playerName, 'Speedster');
        assert.equal(recorder.isRecording, false);
        assert.equal(recorder.frames.length, 0);
    });

    test('does not record frames before start() is called', () => {
        const recorder = new RunRecorder();
        const recorded = recorder.recordFrame({ position: { x: 1, y: 0, z: -5 }, yaw: 0.1 }, 100);
        assert.equal(recorded, false);
        assert.equal(recorder.frames.length, 0);
    });

    test('records frames at specified sample intervals', () => {
        const recorder = new RunRecorder({ sampleIntervalMs: 50 });
        recorder.start({ startTimeMs: 1000 });

        const craft = { position: { x: 2, y: 0.25, z: -10 }, yaw: 0.5, airborne: false, swing: false };

        assert.equal(recorder.recordFrame(craft, 1000), true);
        // Too soon (< 50ms)
        assert.equal(recorder.recordFrame(craft, 1030), false);
        // Reached 50ms interval
        assert.equal(recorder.recordFrame(craft, 1050), true);
        // Force recording ignores interval
        assert.equal(recorder.recordFrame(craft, 1060, { force: true }), true);

        assert.equal(recorder.frames.length, 3);
        assert.equal(recorder.frames[0].timestamp, 0);
        assert.equal(recorder.frames[1].timestamp, 50);
        assert.equal(recorder.frames[2].timestamp, 60);
    });

    test('records checkpoints at elapsed relative time', () => {
        const recorder = new RunRecorder();
        recorder.start({ startTimeMs: 500 });

        recorder.recordCheckpoint(-150, 6200);
        recorder.recordCheckpoint(-300, 12500);
        // Duplicate checkpoint crossed should not overwrite
        recorder.recordCheckpoint(-150, 7000);

        assert.equal(recorder.checkpoints['-150'], 5700);
        assert.equal(recorder.checkpoints['-300'], 12000);
    });

    test('finish() stops recording and calculates total duration', () => {
        const recorder = new RunRecorder();
        recorder.start({ startTimeMs: 200 });
        recorder.recordFrame({ position: { x: 0, y: 0, z: -10 }, yaw: 0 }, 200);
        recorder.recordFrame({ position: { x: 0, y: 0, z: -50 }, yaw: 0 }, 1200);

        const replay = recorder.finish(1400);
        assert.equal(recorder.isRecording, false);
        assert.equal(replay.finalTimeMs, 1200);
        assert.equal(replay.frames.length, 2);
    });
});

describe('3. Delta Compression and Decompression', () => {
    test('handles empty and null frame arrays gracefully', () => {
        const emptyComp = compressRunFrames([]);
        assert.equal(emptyComp.count, 0);
        assert.deepEqual(emptyComp.deltas, []);
        assert.deepEqual(decompressRunFrames(emptyComp), []);
        assert.deepEqual(decompressRunFrames(null), []);
    });

    test('lossless roundtrip for positions, yaw, flags, and timestamps within quantization tolerance', () => {
        const originalFrames = [
            { position: { x: 0.12, y: 0.25, z: -10.55 }, yaw: 0.123, airborne: false, swing: false, timestamp: 0 },
            { position: { x: 0.35, y: 0.25, z: -25.80 }, yaw: 0.185, airborne: false, swing: true, timestamp: 50 },
            { position: { x: 0.82, y: 2.15, z: -48.20 }, yaw: 0.254, airborne: true, swing: false, timestamp: 100 },
            { position: { x: 1.10, y: 0.25, z: -70.05 }, yaw: 0.312, airborne: false, swing: false, timestamp: 150 },
        ];

        const compressed = compressRunFrames(originalFrames);
        assert.equal(compressed.count, 4);
        assert.equal(compressed.deltas.length, 4);

        const decompressed = decompressRunFrames(compressed);
        assert.equal(decompressed.length, 4);

        for (let i = 0; i < originalFrames.length; i++) {
            const orig = originalFrames[i];
            const dec = decompressed[i];

            assert.ok(Math.abs(orig.position.x - dec.position.x) <= 0.01);
            assert.ok(Math.abs(orig.position.y - dec.position.y) <= 0.01);
            assert.ok(Math.abs(orig.position.z - dec.position.z) <= 0.01);
            assert.ok(Math.abs(orig.yaw - dec.yaw) <= 0.002);
            assert.equal(orig.airborne, dec.airborne);
            assert.equal(orig.swing, dec.swing);
            assert.equal(orig.timestamp, dec.timestamp);
        }
    });

    test('delta compression packs flags bitmask correctly (airborne & swing)', () => {
        const frames = [
            { position: { x: 0, y: 0, z: 0 }, yaw: 0, airborne: false, swing: false, timestamp: 0 },
            { position: { x: 0, y: 0, z: 0 }, yaw: 0, airborne: true, swing: false, timestamp: 50 },
            { position: { x: 0, y: 0, z: 0 }, yaw: 0, airborne: false, swing: true, timestamp: 100 },
            { position: { x: 0, y: 0, z: 0 }, yaw: 0, airborne: true, swing: true, timestamp: 150 },
        ];

        const compressed = compressRunFrames(frames);
        assert.equal(compressed.deltas[0][5], 0);
        assert.equal(compressed.deltas[1][5], 1);
        assert.equal(compressed.deltas[2][5], 2);
        assert.equal(compressed.deltas[3][5], 3);

        const decomp = decompressRunFrames(compressed);
        assert.deepEqual(decomp.map((f) => [f.airborne, f.swing]), [
            [false, false],
            [true, false],
            [false, true],
            [true, true],
        ]);
    });

    test('achieves significant payload reduction over raw uncompressed JSON', () => {
        const frames = [];
        for (let i = 0; i < 200; i++) {
            frames.push({
                position: { x: Math.sin(i * 0.1) * 5, y: 0.25, z: -i * 7.5 },
                yaw: (i * 0.02) % (Math.PI * 2),
                airborne: i % 10 === 0,
                swing: i % 15 === 0,
                timestamp: i * 50,
            });
        }

        const rawJson = JSON.stringify(frames);
        const comp = compressRunFrames(frames);
        const compJson = JSON.stringify(comp);

        assert.ok(compJson.length < rawJson.length * 0.65, `Compressed JSON (${compJson.length}) should be < 65% of raw (${rawJson.length})`);
    });
});

describe('4. Base64 and JSON Serialization, Checksum, and Integrity', () => {
    test('stringToBase64 and base64ToString encode and decode UTF-8 correctly', () => {
        const sample = 'Personal Best 🌟 — 1:24.5 - [Turbo Rapids]';
        const b64 = stringToBase64(sample);
        const decoded = base64ToString(b64);
        assert.equal(decoded, sample);
    });

    test('computeChecksum generates deterministic non-empty hex hash', () => {
        const h1 = computeChecksum('test-string-abc');
        const h2 = computeChecksum('test-string-abc');
        const h3 = computeChecksum('test-string-xyz');
        assert.equal(h1, h2);
        assert.notEqual(h1, h3);
        assert.equal(typeof h1, 'string');
    });

    test('exportRunReplay and importRunReplay roundtrip via JSON envelope', () => {
        const runData = {
            playerName: 'Captain River',
            color: 0xff4444,
            finalTimeMs: 45200,
            checkpoints: { '-150': 5200, '-300': 10400 },
            mutator: 'Turbo Rapids',
            seed: 42,
            frames: [
                { position: { x: 0, y: 0.25, z: 0 }, yaw: 0, airborne: false, swing: false, timestamp: 0 },
                { position: { x: 1, y: 0.25, z: -20 }, yaw: 0.1, airborne: false, swing: true, timestamp: 50 },
            ],
        };

        const jsonExport = exportRunReplay(runData, { format: 'json' });
        assert.ok(jsonExport.includes('"checksum"'));
        assert.ok(jsonExport.includes('"version":1'));

        const imported = importRunReplay(jsonExport);
        assert.equal(imported.playerName, 'Captain River');
        assert.equal(imported.finalTimeMs, 45200);
        assert.equal(imported.mutator, 'Turbo Rapids');
        assert.equal(imported.checkpoints['-150'], 5200);
        assert.equal(imported.frames.length, 2);
    });

    test('exportRunReplay and importRunReplay roundtrip via GHOST_ Base64 string', () => {
        const runData = {
            playerName: 'Ghost Sailor',
            finalTimeMs: 32000,
            frames: [
                { position: { x: 0, y: 0.25, z: 0 }, yaw: 0, airborne: false, swing: false, timestamp: 0 },
                { position: { x: 0, y: 0.25, z: -50 }, yaw: 0, airborne: false, swing: false, timestamp: 1000 },
            ],
        };

        const b64Export = exportRunReplay(runData, { format: 'base64' });
        assert.ok(b64Export.startsWith('GHOST_'));

        const imported = importRunReplay(b64Export);
        assert.equal(imported.playerName, 'Ghost Sailor');
        assert.equal(imported.finalTimeMs, 32000);
        assert.equal(imported.frames.length, 2);
    });

    test('importRunReplay throws on corrupted checksum or invalid input', () => {
        assert.throws(() => importRunReplay(''), /Invalid replay string/);
        assert.throws(() => importRunReplay('not-json'), /Failed to parse replay/);

        const validJson = exportRunReplay({
            playerName: 'Legit',
            finalTimeMs: 10000,
            frames: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0, timestamp: 0 }],
        });

        // Corrupt finalTimeMs in JSON without changing checksum
        const tampered = validJson.replace('"finalTimeMs":10000', '"finalTimeMs":5000');
        assert.throws(() => importRunReplay(tampered), /integrity check failed/);
    });
});

describe('5. Checkpoint Split Deltas', () => {
    test('formatSplitDelta produces "-1.4s" when faster than ghost', () => {
        // Player at 10.6s, Ghost at 12.0s -> 1.4s faster
        const formatted = formatSplitDelta(10600, 12000);
        assert.equal(formatted, '-1.4s');
    });

    test('formatSplitDelta produces "+0.8s" when slower than ghost', () => {
        // Player at 12.8s, Ghost at 12.0s -> 0.8s slower
        const formatted = formatSplitDelta(12800, 12000);
        assert.equal(formatted, '+0.8s');
    });

    test('formatSplitDelta returns "-0.0s" on exact tie', () => {
        const formatted = formatSplitDelta(15000, 15000);
        assert.equal(formatted, '-0.0s');
    });

    test('formatSplitDelta returns null when either time is missing', () => {
        assert.equal(formatSplitDelta(null, 12000), null);
        assert.equal(formatSplitDelta(12000, undefined), null);
    });

    test('getCheckpointSplit accurately compares splits for a gate', () => {
        const currentSplits = { '-150': 5200, '-300': 11800 };
        const ghostSplits = { '-150': 6600, '-300': 11000 };

        const split150 = getCheckpointSplit(-150, currentSplits, ghostSplits);
        assert.equal(split150.isAhead, true);
        assert.equal(split150.deltaMs, -1400);
        assert.equal(split150.splitText, '-1.4s');

        const split300 = getCheckpointSplit(-300, currentSplits, ghostSplits);
        assert.equal(split300.isAhead, false);
        assert.equal(split300.deltaMs, 800);
        assert.equal(split300.splitText, '+0.8s');

        const splitUncrossed = getCheckpointSplit(-450, currentSplits, ghostSplits);
        assert.equal(splitUncrossed.splitText, null);
    });
});

describe('6. Personal Best Storage Management', () => {
    function createMockStorage() {
        const map = new Map();
        return {
            getItem: (k) => map.get(k) ?? null,
            setItem: (k, v) => map.set(k, String(v)),
            removeItem: (k) => map.delete(k),
            clear: () => map.clear(),
        };
    }

    test('saves new PB and respects mutator keys', () => {
        const storage = createMockStorage();
        const run1 = {
            playerName: 'Racer1',
            finalTimeMs: 60000,
            frames: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0, timestamp: 0 }],
        };

        const saved = savePersonalBest(run1, { mutatorId: 'turbo-rapids', storage });
        assert.equal(saved, true);

        const loaded = loadPersonalBest({ mutatorId: 'turbo-rapids', storage });
        assert.equal(loaded.playerName, 'Racer1');
        assert.equal(loaded.finalTimeMs, 60000);

        // Different mutator has no PB yet
        assert.equal(loadPersonalBest({ mutatorId: 'glass-cannon', storage }), null);
    });

    test('overwrites existing PB only when run is faster', () => {
        const storage = createMockStorage();
        const pb1 = { playerName: 'First', finalTimeMs: 50000, frames: [{ position: { x: 0, y: 0, z: 0 }, timestamp: 0 }] };
        const slower = { playerName: 'Second', finalTimeMs: 55000, frames: [{ position: { x: 0, y: 0, z: 0 }, timestamp: 0 }] };
        const faster = { playerName: 'Third', finalTimeMs: 42000, frames: [{ position: { x: 0, y: 0, z: 0 }, timestamp: 0 }] };

        assert.equal(savePersonalBest(pb1, { storage }), true);
        // Slower should be rejected
        assert.equal(savePersonalBest(slower, { storage }), false);
        assert.equal(loadPersonalBest({ storage }).finalTimeMs, 50000);

        // Faster should succeed
        assert.equal(savePersonalBest(faster, { storage }), true);
        assert.equal(loadPersonalBest({ storage }).finalTimeMs, 42000);
        assert.equal(loadPersonalBest({ storage }).playerName, 'Third');
    });

    test('isNewPersonalBest evaluates correctly', () => {
        const storage = createMockStorage();
        assert.equal(isNewPersonalBest(50000, { storage }), true, 'First run is always PB');

        savePersonalBest({ finalTimeMs: 50000, frames: [{ position: { x: 0, y: 0, z: 0 }, timestamp: 0 }] }, { storage });
        assert.equal(isNewPersonalBest(55000, { storage }), false);
        assert.equal(isNewPersonalBest(48000, { storage }), true);
    });

    test('clearPersonalBest removes stored PB', () => {
        const storage = createMockStorage();
        savePersonalBest({ finalTimeMs: 40000, frames: [{ position: { x: 0, y: 0, z: 0 }, timestamp: 0 }] }, { storage });
        assert.ok(loadPersonalBest({ storage }));

        clearPersonalBest({ storage });
        assert.equal(loadPersonalBest({ storage }), null);
    });
});

describe('7. GhostPlayback and Frame Interpolation', () => {
    const testReplay = {
        playerName: 'PB Ghost',
        finalTimeMs: 1000,
        frames: [
            { position: { x: 0, y: 0.25, z: 0 }, yaw: 0, airborne: false, swing: false, timestamp: 0 },
            { position: { x: 10, y: 1.25, z: -100 }, yaw: Math.PI / 2, airborne: true, swing: true, timestamp: 500 },
            { position: { x: 20, y: 0.25, z: -200 }, yaw: Math.PI, airborne: false, swing: false, timestamp: 1000 },
        ],
    };

    test('lerpAngle handles angle wrapping across +/- PI boundary smoothly', () => {
        const angleA = Math.PI * 0.95; // ~+171 deg
        const angleB = -Math.PI * 0.95; // ~-171 deg
        // Shortest path goes forward across PI / -PI
        const mid = lerpAngle(angleA, angleB, 0.5);
        assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.1);
    });

    test('samples exact boundary frames at t = 0 and t = duration', () => {
        const playback = new GhostPlayback(testReplay);
        assert.equal(playback.getFrameCount(), 3);
        assert.equal(playback.getDurationMs(), 1000);

        const startSample = playback.sample(0);
        assert.equal(startSample.position.x, 0);
        assert.equal(startSample.position.z, 0);
        assert.equal(startSample.completed, false);

        const endSample = playback.sample(1000);
        assert.equal(endSample.position.x, 20);
        assert.equal(endSample.position.z, -200);
        assert.equal(endSample.completed, true);
    });

    test('linearly interpolates coordinates and yaw halfway between frames', () => {
        const playback = new GhostPlayback(testReplay);
        // Halfway between t=0 (x=0, z=0) and t=500 (x=10, z=-100) -> t=250 (x=5, z=-50)
        const midSample = playback.sample(250);

        assert.ok(Math.abs(midSample.position.x - 5) < 1e-4);
        assert.ok(Math.abs(midSample.position.y - 0.75) < 1e-4);
        assert.ok(Math.abs(midSample.position.z - (-50)) < 1e-4);
        assert.ok(Math.abs(midSample.yaw - Math.PI / 4) < 1e-4);
    });

    test('handles queries outside timestamp range with edge holding', () => {
        const playback = new GhostPlayback(testReplay);

        const before = playback.sample(-100);
        assert.equal(before.position.x, 0);
        assert.equal(before.position.z, 0);

        const after = playback.sample(2500);
        assert.equal(after.position.x, 20);
        assert.equal(after.position.z, -200);
        assert.equal(after.completed, true);
    });
});

describe('8. Three.js Ghost Raft Mesh and Controller', () => {
    const mockTHREE = createMockTHREE();

    test('createHologramMaterial creates translucent material with emissive glow', () => {
        const mat = createHologramMaterial(mockTHREE, GHOST_DEFAULT_COLOR, 0.4);
        assert.equal(mat.transparent, true);
        assert.equal(mat.opacity, 0.4);
        assert.equal(mat.depthWrite, false);
        assert.equal(mat.color, GHOST_DEFAULT_COLOR);
    });

    test('createGhostRaftMesh builds articulated hierarchy (hull, crew, paddle, wake ring)', () => {
        const ghost = createGhostRaftMesh(mockTHREE, { color: 0x38f2ff });
        assert.equal(ghost.group.type, 'Group');
        assert.equal(ghost.group.name, 'GhostRaft');
        assert.ok(ghost.tilt.children.includes(ghost.hullGroup));
        assert.ok(ghost.tilt.children.includes(ghost.character));
        assert.ok(ghost.tilt.children.includes(ghost.paddle));
        assert.ok(ghost.tilt.children.includes(ghost.ringMesh));
        assert.ok(ghost.materials.length >= 4);
    });

    test('createGhostSplitBadge creates split badge with ahead/behind styling', () => {
        const aheadBadge = createGhostSplitBadge(mockTHREE, '-1.4s', true);
        assert.equal(aheadBadge.userData.splitText, '-1.4s');
        assert.equal(aheadBadge.userData.isAhead, true);
        assert.equal(aheadBadge.userData.colorHex, GHOST_AHEAD_COLOR);

        const behindBadge = createGhostSplitBadge(mockTHREE, '+0.8s', false);
        assert.equal(behindBadge.userData.splitText, '+0.8s');
        assert.equal(behindBadge.userData.isAhead, false);
        assert.equal(behindBadge.userData.colorHex, GHOST_BEHIND_COLOR);
    });

    test('GhostRaftController lifecycle, update transforms and holographic pulsing', () => {
        const scene = new mockTHREE.Group();
        const replayData = {
            playerName: 'TestGhost',
            finalTimeMs: 2000,
            checkpoints: { '-150': 1500 },
            frames: [
                { position: { x: 0, y: 0.25, z: 0 }, yaw: 0, timestamp: 0 },
                { position: { x: 5, y: 0.25, z: -150 }, yaw: 0.2, timestamp: 1500 },
            ],
        };

        const controller = new GhostRaftController(mockTHREE, replayData, { scene });
        assert.ok(scene.children.includes(controller.meshInstance.group));

        // Update at t=750ms
        const sample = controller.update(750, 0.05);
        assert.equal(controller.meshInstance.group.position.x, 2.5);
        assert.equal(controller.meshInstance.group.position.z, -75);
        assert.ok(controller.meshInstance.pulsePhase > 0);

        // Trigger checkpoint split
        const split = controller.triggerCheckpointSplit(-150, { '-150': 1000 });
        assert.equal(split.isAhead, true);
        assert.equal(split.splitText, '-0.5s');
        assert.ok(controller.currentSplitBadge);
        assert.ok(controller.meshInstance.badgeAnchor.children.includes(controller.currentSplitBadge));

        // Cleanup
        controller.dispose();
        assert.equal(scene.children.length, 0);
    });
});
