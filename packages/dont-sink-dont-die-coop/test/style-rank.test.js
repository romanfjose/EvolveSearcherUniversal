import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    STYLE_RANKS,
    RANK_ORDER,
    STYLE_ACTIONS,
    STYLE_CONFIG,
    createStyleRankState,
    getRankForPoints,
    getRankProgress,
    recordStyleAction,
    stepStyleRank,
    getStyleCoinBoost,
    checkRankAnnouncer,
    createHelmetFlameCrown,
} from '../shared/style-rank.js';

// ─── Deterministic Mock Three.js Factory ───────────────────────────────────
function createMockThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }

    class Euler {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }

    class Color {
        constructor(hex = 0) { this.hex = hex; }
        setHex(hex) { this.hex = hex; return this; }
    }

    class BufferGeometry {
        dispose() {}
    }

    class TorusGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }
    class ConeGeometry extends BufferGeometry { constructor(...args) { super(); this.args = args; } }

    class Material {
        constructor(opts = {}) {
            this.color = opts.color ? new Color(opts.color) : new Color(0);
            this.opacity = opts.opacity ?? 1.0;
            this.transparent = opts.transparent ?? false;
        }
        clone() {
            return new Material({ color: this.color.hex, opacity: this.opacity, transparent: this.transparent });
        }
        dispose() {}
    }

    class MeshBasicMaterial extends Material {}

    class Object3D {
        constructor() {
            this.position = new Vector3();
            this.rotation = new Euler();
            this.scale = new Vector3(1, 1, 1);
            this.visible = true;
            this.children = [];
            this.name = '';
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

    class Group extends Object3D {}
    class Mesh extends Object3D {
        constructor(geo, mat) {
            super();
            this.geometry = geo;
            this.material = mat;
        }
    }

    return {
        Vector3,
        Euler,
        Color,
        TorusGeometry,
        ConeGeometry,
        BufferGeometry,
        MeshBasicMaterial,
        Group,
        Mesh,
        DoubleSide: 2,
    };
}

describe('Style Rank Constants & Configuration', () => {
    it('defines all 5 standard arcade ranks with exact titles and thresholds', () => {
        assert.deepEqual(RANK_ORDER, ['D', 'C', 'B', 'A', 'S']);

        assert.equal(STYLE_RANKS.D.title, 'DRIFTING');
        assert.equal(STYLE_RANKS.D.coinMultiplier, 1.0);
        assert.equal(STYLE_RANKS.D.flameAura, false);

        assert.equal(STYLE_RANKS.C.title, 'CRUISING');
        assert.equal(STYLE_RANKS.C.coinMultiplier, 1.1);
        assert.equal(STYLE_RANKS.C.flameAura, false);

        assert.equal(STYLE_RANKS.B.title, 'BRAWLING!');
        assert.equal(STYLE_RANKS.B.coinMultiplier, 1.25);
        assert.equal(STYLE_RANKS.B.flameAura, false);

        assert.equal(STYLE_RANKS.A.title, 'ANCHOR SMASHER!!');
        assert.equal(STYLE_RANKS.A.coinMultiplier, 1.5);
        assert.equal(STYLE_RANKS.A.flameAura, true);
        assert.equal(STYLE_RANKS.A.flameColorName, 'gold');

        assert.equal(STYLE_RANKS.S.title, 'SOVEREIGN FEVER DREAM!!!');
        assert.equal(STYLE_RANKS.S.coinMultiplier, 2.0);
        assert.equal(STYLE_RANKS.S.flameAura, true);
        assert.equal(STYLE_RANKS.S.flameColorName, 'cyan');
    });

    it('defines aggressive play style actions and point values', () => {
        assert.equal(STYLE_ACTIONS.KICKFLIP.points, 75);
        assert.equal(STYLE_ACTIONS.WATERFALL_JUMP.points, 90);
        assert.equal(STYLE_ACTIONS.MALLET_SMASH.points, 60);
        assert.equal(STYLE_ACTIONS.PARRY.points, 100);
        assert.equal(STYLE_ACTIONS.HIGH_SPEED.threshold, 14.0);
    });
});

describe('Rank Point Mapping & Progress Calculations', () => {
    it('correctly maps points to rank bands', () => {
        assert.equal(getRankForPoints(0).key, 'D');
        assert.equal(getRankForPoints(99).key, 'D');
        assert.equal(getRankForPoints(100).key, 'C');
        assert.equal(getRankForPoints(249).key, 'C');
        assert.equal(getRankForPoints(250).key, 'B');
        assert.equal(getRankForPoints(449).key, 'B');
        assert.equal(getRankForPoints(450).key, 'A');
        assert.equal(getRankForPoints(699).key, 'A');
        assert.equal(getRankForPoints(700).key, 'S');
        assert.equal(getRankForPoints(1200).key, 'S');
    });

    it('computes rank progress percentage and points required to next rank', () => {
        const progD = getRankProgress(50);
        assert.equal(progD.rank, 'D');
        assert.equal(progD.progress, 0.5);
        assert.equal(progD.pointsToNext, 50);

        const progB = getRankProgress(350); // B span is 250..450 (span 200), 350 is 100/200 = 0.5
        assert.equal(progB.rank, 'B');
        assert.equal(progB.progress, 0.5);
        assert.equal(progB.pointsToNext, 100);

        const progS = getRankProgress(850);
        assert.equal(progS.rank, 'S');
        assert.equal(progS.progress, 1.0);
        assert.equal(progS.pointsToNext, 0);
    });
});

describe('Aggressive Action Tracking & Rank Climbing', () => {
    it('tracks aggressive actions from D -> C -> B -> A -> S', () => {
        const state = createStyleRankState();
        assert.equal(state.rank, 'D');
        assert.equal(state.points, 0);

        // 1. Kickflip (+75 pts) -> Still D (75 < 100)
        let res = recordStyleAction(state, 'kickflip');
        assert.equal(res.pointsAwarded, 75);
        assert.equal(res.newPoints, 75);
        assert.equal(res.newRank, 'D');
        assert.equal(res.rankUp, false);
        assert.equal(state.actionStats.kickflips, 1);

        // 2. Waterfall Jump (+90 pts) -> 165 pts -> Rank C
        res = recordStyleAction(state, 'waterfall_jump');
        assert.equal(res.pointsAwarded, 90);
        assert.equal(res.newPoints, 165);
        assert.equal(res.prevRank, 'D');
        assert.equal(res.newRank, 'C');
        assert.equal(res.rankUp, true);
        assert.equal(state.actionStats.waterfallJumps, 1);
        assert.equal(checkRankAnnouncer(state), 'CRUISING!');

        // 3. Perfect Parry (+100 pts) -> 265 pts -> Rank B
        res = recordStyleAction(state, 'parry');
        assert.equal(res.pointsAwarded, 100);
        assert.equal(res.newPoints, 265);
        assert.equal(res.newRank, 'B');
        assert.equal(res.rankUp, true);
        assert.equal(state.actionStats.parries, 1);
        assert.equal(checkRankAnnouncer(state), 'BRAWLING!!');

        // 4. War Mallet Smash (+60 pts) and another Parry (+100) and Kickflip (+75) -> 500 pts -> Rank A
        recordStyleAction(state, 'mallet_smash');
        recordStyleAction(state, 'parry');
        res = recordStyleAction(state, 'kickflip');
        assert.equal(state.points, 500);
        assert.equal(res.newRank, 'A');
        assert.equal(res.rankUp, true);
        assert.equal(res.flameAura, true);
        assert.equal(res.multiplier, 1.5);
        assert.equal(checkRankAnnouncer(state), 'ANCHOR SMASHER!!!');

        // 5. Additional aggressive plays to reach S (>= 700 pts)
        recordStyleAction(state, 'parry'); // +100 -> 600
        recordStyleAction(state, 'waterfall_jump'); // +90 -> 690
        res = recordStyleAction(state, 'mallet_smash'); // +60 -> 750 -> Rank S!
        assert.equal(res.newRank, 'S');
        assert.equal(res.rankUp, true);
        assert.equal(res.flameAura, true);
        assert.equal(res.multiplier, 2.0);
        assert.equal(checkRankAnnouncer(state), 'SOVEREIGN FEVER DREAM!!!!');
    });

    it('caps point total at MAX_POINTS (1000)', () => {
        const state = createStyleRankState();
        for (let i = 0; i < 20; i++) {
            recordStyleAction(state, 'parry');
        }
        assert.equal(state.points, STYLE_CONFIG.MAX_POINTS);
        assert.equal(state.rank, 'S');
    });
});

describe('Continuous Step, High-Speed (>14 m/s), and Decay', () => {
    it('awards style points continuously while speed > 14 m/s', () => {
        const state = createStyleRankState();
        // Speed at 15 m/s for 2 seconds
        const step1 = stepStyleRank(state, 1.0, 15.0);
        assert.equal(step1.highSpeedActive, true);
        assert.equal(step1.isDecaying, false);
        assert.equal(state.actionStats.highSpeedSeconds, 1.0);
        assert.equal(state.points, 25);

        const step2 = stepStyleRank(state, 1.0, 16.0);
        assert.equal(state.points, 50);
        assert.equal(state.decayTimer, 0); // Speed sustains combo
    });

    it('does not award speed bonus when speed <= 14 m/s', () => {
        const state = createStyleRankState();
        const step = stepStyleRank(state, 1.0, 13.5);
        assert.equal(step.highSpeedActive, false);
        assert.equal(state.points, 0);
        assert.equal(state.decayTimer, 1.0);
    });

    it('decays points only after grace period of inactivity', () => {
        const state = createStyleRankState();
        recordStyleAction(state, 'parry'); // +100 pts -> Rank C
        assert.equal(state.points, 100);

        // Inactivity within grace period (1.5s <= 1.8s)
        let step = stepStyleRank(state, 1.5, 5.0);
        assert.equal(step.isDecaying, false);
        assert.equal(state.points, 100);

        // Stepping past grace period (another 1.0s -> total 2.5s > 1.8s)
        step = stepStyleRank(state, 1.0, 5.0);
        assert.equal(step.isDecaying, true);
        assert.ok(state.points < 100, 'Points should decay after grace period');
    });
});

describe('Coin Drop Boost Multipliers (1.5x at A, 2.0x at S)', () => {
    it('applies 1.0x at Rank D', () => {
        const state = createStyleRankState();
        state.rank = 'D';
        const boost = getStyleCoinBoost(state, 40);
        assert.equal(boost.baseCoins, 40);
        assert.equal(boost.boostedCoins, 40);
        assert.equal(boost.multiplier, 1.0);
        assert.equal(boost.bonusCoins, 0);
    });

    it('applies 1.5x at Rank A (Anchor Smasher)', () => {
        const state = createStyleRankState();
        state.rank = 'A';
        const boost = getStyleCoinBoost(state, 40);
        assert.equal(boost.baseCoins, 40);
        assert.equal(boost.boostedCoins, 60); // 40 * 1.5 = 60
        assert.equal(boost.multiplier, 1.5);
        assert.equal(boost.bonusCoins, 20);
    });

    it('applies 2.0x at Rank S (Sovereign Fever Dream)', () => {
        const state = createStyleRankState();
        state.rank = 'S';
        const boost = getStyleCoinBoost(state, 50);
        assert.equal(boost.baseCoins, 50);
        assert.equal(boost.boostedCoins, 100); // 50 * 2.0 = 100
        assert.equal(boost.multiplier, 2.0);
        assert.equal(boost.bonusCoins, 50);
    });
});

describe('Procedural 3D Viking Helmet Flame Crown Aura (Three.js integration)', () => {
    it('creates flame crown with 8 procedural flame tongues and core torus ring', () => {
        const THREE = createMockThree();
        const crown = createHelmetFlameCrown(THREE);

        assert.ok(crown.rootGroup);
        assert.equal(crown.rootGroup.visible, false, 'Hidden by default at Rank D');
        assert.equal(crown.flameTongues.length, 8);
        assert.ok(crown.ringMesh);
    });

    it('ignites golden flame aura at Rank A and cyan flame aura at Rank S', () => {
        const THREE = createMockThree();
        const crown = createHelmetFlameCrown(THREE);

        // At Rank B, flame aura is not ignited
        crown.setRank('B');
        assert.equal(crown.rootGroup.visible, false);

        // At Rank A, ignite golden flame
        crown.setRank('A');
        assert.equal(crown.rootGroup.visible, true);
        assert.equal(crown.ringMesh.material.color.hex, STYLE_RANKS.A.flameColorHex);
        for (const t of crown.flameTongues) {
            assert.equal(t.mesh.material.color.hex, 0xffb703);
        }

        // At Rank S, ignite divine cyan flame
        crown.setRank('S');
        assert.equal(crown.rootGroup.visible, true);
        assert.equal(crown.ringMesh.material.color.hex, STYLE_RANKS.S.flameColorHex);
        for (const t of crown.flameTongues) {
            assert.equal(t.mesh.material.color.hex, 0x00f5d4);
        }
    });

    it('animates flame tongues and ring pulse during continuous update', () => {
        const THREE = createMockThree();
        const crown = createHelmetFlameCrown(THREE);
        crown.setRank('S');

        const initialY = crown.flameTongues[0].mesh.position.y;
        crown.update(0.1, 1.25);

        // Check that flame tongues flicker and scale
        assert.ok(crown.flameTongues[0].mesh.scale.y !== 1.0 || crown.flameTongues[0].mesh.position.y !== initialY);
        // Base ring pulses
        assert.ok(crown.ringMesh.scale.x > 0.5);
    });

    it('disposes materials and geometries cleanly on dispose()', () => {
        const THREE = createMockThree();
        const crown = createHelmetFlameCrown(THREE);
        assert.doesNotThrow(() => {
            crown.dispose();
        });
    });
});
