import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHALLENGE_MODES,
    DEFAULT_CHALLENGE_SETTINGS,
    toBase64Url,
    fromBase64Url,
    distanceToZ,
    zToDistance,
    sanitizeChallengePayload,
    encodeChallengeUrl,
    decodeChallengeUrl,
    evaluateRivalryProgress,
    createRivalTargetBanner,
} from '../shared/challenge-link.js';

// ── Mock Three.js for Node unit tests ────────────────────────────────────────

function createMockTHREE() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        clone() { return new Vector3(this.x, this.y, this.z); }
    }
    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }
    class Color {
        constructor(hex = 0xffffff) { this.hex = hex; }
        setHex(hex) { this.hex = hex; return this; }
    }
    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.children = [];
            this.parent = null;
            this.visible = true;
            this.name = '';
        }
        add(...objs) {
            for (const o of objs) {
                if (o) {
                    o.parent = this;
                    this.children.push(o);
                }
            }
            return this;
        }
        remove(...objs) {
            for (const o of objs) {
                const idx = this.children.indexOf(o);
                if (idx >= 0) {
                    o.parent = null;
                    this.children.splice(idx, 1);
                }
            }
            return this;
        }
        traverse(cb) {
            cb(this);
            for (const child of this.children) {
                if (child.traverse) child.traverse(cb);
            }
        }
    }
    class Group extends Object3D {}
    class Mesh extends Object3D {
        constructor(geometry, material) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }
    class Geometry {
        dispose() { this.disposed = true; }
    }
    class Material {
        constructor(params = {}) {
            this.color = new Color(params.color || 0xffffff);
            this.opacity = params.opacity ?? 1;
            this.transparent = !!params.transparent;
        }
        dispose() { this.disposed = true; }
    }

    return {
        Vector3,
        Euler,
        Color,
        Object3D,
        Group,
        Mesh,
        DoubleSide: 2,
        BoxGeometry: class extends Geometry {},
        CylinderGeometry: class extends Geometry {},
        ConeGeometry: class extends Geometry {},
        SphereGeometry: class extends Geometry {},
        PlaneGeometry: class extends Geometry {},
        MeshStandardMaterial: class extends Material {},
        MeshBasicMaterial: class extends Material {},
    };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Challenge Link Module - Base64 & Base64URL conversions', () => {
    it('correctly round-trips ASCII and UTF-8 strings', () => {
        const samples = [
            'hello world',
            'Jose & The 4-Act River Maelstrom!!',
            '{"seed":42069,"score":3200}',
            '🧙‍♂️🪵❤️‍🔥🦑🔨',
        ];

        for (const sample of samples) {
            const b64url = toBase64Url(sample);
            assert.ok(!b64url.includes('+'), 'should not contain + in base64url');
            assert.ok(!b64url.includes('/'), 'should not contain / in base64url');
            assert.ok(!b64url.includes('='), 'should not contain padding = in base64url');

            const decoded = fromBase64Url(b64url);
            assert.strictEqual(decoded, sample);
        }
    });

    it('handles empty and null inputs safely', () => {
        assert.strictEqual(toBase64Url(null), '');
        assert.strictEqual(toBase64Url(''), '');
        assert.strictEqual(fromBase64Url(''), '');
        assert.strictEqual(fromBase64Url(null), '');
    });
});

describe('Challenge Link Module - Distance & River Coordinate Mapping', () => {
    it('converts distance in meters to negative river Z coordinate', () => {
        assert.strictEqual(distanceToZ(0), -0);
        assert.strictEqual(distanceToZ(1450), -1450);
        assert.strictEqual(distanceToZ(375), -375);
        assert.strictEqual(distanceToZ(-100), -0); // clamped to non-negative
    });

    it('converts river Z coordinate to positive downriver distance in meters', () => {
        assert.strictEqual(zToDistance(0), 0);
        assert.strictEqual(zToDistance(-1450), 1450);
        assert.strictEqual(zToDistance(-375), 375);
        assert.strictEqual(zToDistance(50), 0);
    });
});

describe('Challenge Link Module - Payload Sanitization & Defaults', () => {
    it('fills default settings when given empty or partial payload', () => {
        const clean = sanitizeChallengePayload({});
        assert.strictEqual(clean.seed, DEFAULT_CHALLENGE_SETTINGS.seed);
        assert.strictEqual(clean.mode, DEFAULT_CHALLENGE_SETTINGS.mode);
        assert.strictEqual(clean.rival, DEFAULT_CHALLENGE_SETTINGS.rival);
        assert.strictEqual(clean.targetDist, DEFAULT_CHALLENGE_SETTINGS.targetDist);
        assert.strictEqual(clean.targetScore, DEFAULT_CHALLENGE_SETTINGS.targetScore);
        assert.strictEqual(clean.targetZ, -1450);
        assert.strictEqual(clean.ghost, null);
    });

    it('sanitizes invalid mode to coop', () => {
        const clean = sanitizeChallengePayload({ mode: 'invalid_mode_xyz' });
        assert.strictEqual(clean.mode, CHALLENGE_MODES.COOP);
    });

    it('encodes object ghost payload to base64url string', () => {
        const ghostObj = { frames: [[0, 0, 0]] };
        const clean = sanitizeChallengePayload({ ghost: ghostObj });
        assert.ok(typeof clean.ghost === 'string');
        const restored = JSON.parse(fromBase64Url(clean.ghost));
        assert.deepStrictEqual(restored, ghostObj);
    });
});

describe('Challenge Link Module - URL Query Encoding & Decoding', () => {
    it('encodes and decodes the exact mission specification query', () => {
        const input = {
            seed: 42069,
            mode: 'coop',
            rival: 'Jose',
            targetDist: 1450,
            targetScore: 3200,
            ghost: 'base64url_test_token',
        };

        const encodedQuery = encodeChallengeUrl(input);
        assert.strictEqual(
            encodedQuery,
            '?seed=42069&mode=coop&rival=Jose&targetDist=1450&targetScore=3200&ghost=base64url_test_token'
        );

        const decoded = decodeChallengeUrl(encodedQuery);
        assert.strictEqual(decoded.seed, 42069);
        assert.strictEqual(decoded.mode, 'coop');
        assert.strictEqual(decoded.rival, 'Jose');
        assert.strictEqual(decoded.targetDist, 1450);
        assert.strictEqual(decoded.targetScore, 3200);
        assert.strictEqual(decoded.targetZ, -1450);
        assert.strictEqual(decoded.ghost, 'base64url_test_token');
    });

    it('prepends baseUrl when provided', () => {
        const url = encodeChallengeUrl({ seed: 777, rival: 'Captain' }, 'https://dontsink.game/play');
        assert.ok(url.startsWith('https://dontsink.game/play?'));
        assert.ok(url.includes('seed=777'));
        assert.ok(url.includes('rival=Captain'));

        const decoded = decodeChallengeUrl(url);
        assert.strictEqual(decoded.seed, 777);
        assert.strictEqual(decoded.rival, 'Captain');
    });

    it('decodes alternative alias parameter names (dist, score, hash url)', () => {
        const hashUrl = 'https://dontsink.game/#dist=900&score=2500&rival=Viking&seed=123';
        const decoded = decodeChallengeUrl(hashUrl);
        assert.strictEqual(decoded.targetDist, 900);
        assert.strictEqual(decoded.targetZ, -900);
        assert.strictEqual(decoded.targetScore, 2500);
        assert.strictEqual(decoded.rival, 'Viking');
        assert.strictEqual(decoded.seed, 123);
    });

    it('returns null for empty or non-challenge URLs', () => {
        assert.strictEqual(decodeChallengeUrl(''), null);
        assert.strictEqual(decodeChallengeUrl('https://example.com/'), null);
        assert.strictEqual(decodeChallengeUrl('?foo=bar&test=1'), null);
        assert.strictEqual(decodeChallengeUrl(null), null);
    });
});

describe('Challenge Link Module - Rivalry Progress & Telemetry Evaluation', () => {
    const challenge = sanitizeChallengePayload({
        rival: 'Jose',
        targetDist: 1450,
        targetScore: 3200,
    });

    it('evaluates approach before target line', () => {
        // Player is at z = -1400 (dist 1400m), target is z = -1450 (dist 1450m)
        const progress = evaluateRivalryProgress(-1400, 2000, challenge);
        assert.strictEqual(progress.playerDist, 1400);
        assert.strictEqual(progress.targetDist, 1450);
        assert.strictEqual(progress.remainingMeters, 50);
        assert.strictEqual(progress.hasPassedLine, false);
        assert.strictEqual(progress.hasBeatenScore, false);
        assert.strictEqual(progress.isRivalCrushed, false);
        assert.ok(progress.statusText.includes('CLOSING IN ON JOSE'));
    });

    it('evaluates distance beaten but score not yet beaten', () => {
        // Player at z = -1460 (dist 1460m), passed 1450m line, score 2800 < 3200
        const progress = evaluateRivalryProgress(-1460, 2800, challenge);
        assert.strictEqual(progress.hasPassedLine, true);
        assert.strictEqual(progress.hasBeatenScore, false);
        assert.strictEqual(progress.isRivalCrushed, false);
        assert.ok(progress.statusText.includes("PASSED JOSE'S DISTANCE"));
    });

    it('evaluates total victory when both distance and score are surpassed', () => {
        // Player at z = -1480 (dist 1480m), score 3500 >= 3200
        const progress = evaluateRivalryProgress(-1480, 3500, challenge);
        assert.strictEqual(progress.hasPassedLine, true);
        assert.strictEqual(progress.hasBeatenScore, true);
        assert.strictEqual(progress.isRivalCrushed, true);
        assert.strictEqual(progress.scoreDiff, 300);
        assert.ok(progress.statusText.includes('CRUSHED JOSE! (+300 PTS)'));
        assert.strictEqual(progress.statusColor, '#ffd700');
    });

    it('returns null if challenge is not provided', () => {
        assert.strictEqual(evaluateRivalryProgress(-100, 500, null), null);
    });
});

describe('Challenge Link Module - Procedural 3D Rival Target Banner Rig', () => {
    it('constructs 3D banner rig placed at exact target Z coordinate', () => {
        const THREE = createMockTHREE();
        const challenge = {
            rival: 'Jose',
            targetDist: 1450,
            targetScore: 3200,
        };

        const banner = createRivalTargetBanner(THREE, {
            challenge,
            riverWidth: 32,
        });

        assert.ok(banner.group);
        assert.strictEqual(banner.targetZ, -1450);
        assert.strictEqual(banner.group.position.z, -1450);
        assert.strictEqual(banner.isCrossed(), false);
        assert.strictEqual(banner.group.name, 'RivalTargetLineGroup');

        // Verify child nodes (pylons, laser, billboard)
        assert.ok(banner.group.children.length >= 3);
    });

    it('steps update() animation and triggers markLineCrossed() when crossing target Z', () => {
        const THREE = createMockTHREE();
        const challenge = {
            rival: 'Jose',
            targetDist: 1450,
            targetScore: 3200,
        };

        const banner = createRivalTargetBanner(THREE, { challenge });

        // Update before crossing line (craft at z = -1200)
        const res1 = banner.update(0.016, { position: { x: 0, y: 0, z: -1200 } }, 1000);
        assert.strictEqual(res1.hasPassedLine, false);
        assert.strictEqual(banner.isCrossed(), false);

        // Update when crossing line (craft at z = -1455)
        const res2 = banner.update(0.016, { position: { x: 0, y: 0, z: -1455 } }, 3400);
        assert.strictEqual(res2.hasPassedLine, true);
        assert.strictEqual(banner.isCrossed(), true);
        assert.strictEqual(res2.isRivalCrushed, true);
    });

    it('cleanly disposes all geometry, materials, and hierarchy', () => {
        const THREE = createMockTHREE();
        const banner = createRivalTargetBanner(THREE, {
            challenge: { targetDist: 500 },
        });

        assert.doesNotThrow(() => {
            banner.dispose();
        });
    });

    it('throws error if THREE instance is missing', () => {
        assert.throws(() => {
            createRivalTargetBanner(null);
        }, /requires a THREE instance/);
    });
});
