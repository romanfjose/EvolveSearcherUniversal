/**
 * Don't Sink, Don't Die — Co-Op Tow-Rope & Teammate Winch Physics Test Suite
 * (`test/coop-tow-winch.test.js`)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    attachTowRope,
    createTowRopePair,
    stepTowRopePhysics,
    releaseTowRope,
    setWinchMode,
    evaluateRescueAssistance,
    TOW_WINCH_CONFIG,
    WINCH_MODES,
    ROPE_STATES,
} from '../shared/coop-tow-winch.js';

function makeCraft(id, x = 0, y = 0.25, z = 0, vx = 0, vy = 0, vz = 0, mass = 5) {
    return {
        id,
        mass,
        position: { x, y, z },
        velocity: { x: vx, y: vy, z: vz },
        health: 100,
        maxHealth: 100,
    };
}

describe('Co-Op Tow-Rope & Teammate Winch Physics (`shared/coop-tow-winch.js`)', () => {
    describe('Tow-Rope Attachment & Initialization', () => {
        it('attaches tow rope between leader and follower with calculated rest length', () => {
            const leader = makeCraft('p1_lead', 0, 0.25, -20);
            const follower = makeCraft('p2_lag', 0, 0.25, -10); // 10m apart

            const rope = attachTowRope(leader, follower);

            assert.equal(rope.active, true);
            assert.equal(rope.leaderId, 'p1_lead');
            assert.equal(rope.followerId, 'p2_lag');
            assert.equal(rope.state, ROPE_STATES.ATTACHED);
            assert.equal(rope.winchMode, WINCH_MODES.IDLE);
            assert.ok(Math.abs(rope.currentLength - 10) < 1e-4);
            assert.equal(follower.isBeingTowed, true);
            assert.equal(follower.towedBy, 'p1_lead');
            assert.equal(follower.towRope, rope);
            assert.ok(leader.activeTows.includes(rope));
        });

        it('throws descriptive error if either leader or follower is missing', () => {
            assert.throws(() => attachTowRope(null, {}), /requires both leader and follower/);
            assert.throws(() => attachTowRope({}, null), /requires both leader and follower/);
        });

        it('supports nested craft.craft.position and craft.craft.velocity structures', () => {
            const leader = {
                id: 'lead_cannon',
                craft: {
                    position: { x: 5, y: 0.5, z: -50 },
                    velocity: { x: 0, y: 0, z: -10 },
                },
            };
            const follower = {
                id: 'follow_cannon',
                craft: {
                    position: { x: 5, y: 0.5, z: -40 },
                    velocity: { x: 0, y: 0, z: -5 },
                },
            };

            const rope = attachTowRope(leader, follower);
            assert.equal(rope.active, true);
            assert.ok(Math.abs(rope.currentLength - 10) < 1e-4);
        });

        it('clamps custom restLength to minRestLength and maxRestLength bounds', () => {
            const leader = makeCraft('lead', 0, 0.25, 0);
            const follower = makeCraft('follow', 0, 0.25, 2);

            const ropeMin = attachTowRope(leader, follower, { restLength: 1.0 });
            assert.equal(ropeMin.restLength, TOW_WINCH_CONFIG.MIN_REST_LENGTH);

            const ropeMax = attachTowRope(leader, follower, { restLength: 100.0 });
            assert.equal(ropeMax.restLength, TOW_WINCH_CONFIG.MAX_REST_LENGTH);
        });
    });

    describe('Slack vs Taut Rope Physics Dynamics', () => {
        it('produces zero tension and acceleration when rope is slack (distance < restLength)', () => {
            const leader = makeCraft('lead', 0, 0.25, -10);
            const follower = makeCraft('follow', 0, 0.25, -6); // 4m apart
            const rope = attachTowRope(leader, follower, { restLength: 8.0 });

            const res = stepTowRopePhysics(leader, follower, 0.05);

            assert.equal(res.active, true);
            assert.equal(res.tension, 0);
            assert.equal(res.state, ROPE_STATES.SLACK);
            assert.equal(res.snapped, false);
            assert.equal(follower.velocity.z, 0);
            assert.equal(leader.velocity.z, 0);
        });

        it('produces restoring tension and accelerates follower forward when rope is stretched taut', () => {
            const leader = makeCraft('lead', 0, 0.25, -20);
            const follower = makeCraft('follow', 0, 0.25, -5); // 15m apart
            // Rest length 10m -> stretch = 5m
            const rope = attachTowRope(leader, follower, { restLength: 10.0, springStiffness: 100.0, damping: 0 });

            const res = stepTowRopePhysics(leader, follower, 0.1);

            assert.equal(res.active, true);
            assert.equal(res.state, ROPE_STATES.TAUT);
            // 5m stretch * 100 N/m = 500 N
            assert.ok(Math.abs(res.tension - 500) < 1e-3);
            assert.ok(res.tensionForce.z < 0, 'Pull on follower should be forward (-Z)');

            // Follower velocity: dv = (F / mass) * dt = (-500 / 5) * 0.1 = -10 m/s
            assert.ok(Math.abs(follower.velocity.z - (-10)) < 1e-3);

            // Leader experiences counter-force (scaled by leaderCounterMassRatio = 0.4):
            // dv_lead = (+500 * 0.4 / 5) * 0.1 = +4 m/s (slows leader down / pulls backward +Z)
            assert.ok(Math.abs(leader.velocity.z - 4) < 1e-3);
        });

        it('damping force resists high relative separation velocity', () => {
            const leader = makeCraft('lead', 0, 0.25, -20, 0, 0, -10); // pulling ahead at 10 m/s
            const follower = makeCraft('follow', 0, 0.25, -5, 0, 0, 0);  // stationary
            // Distance = 15m, restLength = 10m -> stretch = 5m
            // Rel speed along rope: (velLead - velFollow) · n = -10 · (-1) = +10 m/s
            const rope = attachTowRope(leader, follower, {
                restLength: 10.0,
                springStiffness: 100.0,
                damping: 20.0,
            });

            const res = stepTowRopePhysics(leader, follower, 0.05);

            // Spring = 500N, Damping = 20 * 10 = 200N -> Total tension = 700N
            assert.ok(Math.abs(res.tension - 700) < 1e-2);
        });

        it('tension never pushes (never negative even when relative closing speed is high)', () => {
            const leader = makeCraft('lead', 0, 0.25, -12, 0, 0, 0);
            const follower = makeCraft('follow', 0, 0.25, -1, 0, 0, -50); // follower surging forward at 50 m/s
            // Distance = 11m, restLength = 10m -> stretch = 1m -> spring = 100N
            // Rel speed along rope: (0 - (-50)) · (-1) = -50 m/s -> damping = 20 * -50 = -1000N
            // Raw tension = 100 - 1000 = -900N, clamped to 0N
            const rope = attachTowRope(leader, follower, {
                restLength: 10.0,
                springStiffness: 100.0,
                damping: 20.0,
            });

            const res = stepTowRopePhysics(leader, follower, 0.05);
            assert.equal(res.tension, 0);
        });
    });

    describe('Motorized Winch Reeling (REEL_IN, PAY_OUT, FREE_SPOOL)', () => {
        it('REEL_IN shortens restLength over time down to minRestLength', () => {
            const leader = makeCraft('lead', 0, 0.25, -15);
            const follower = makeCraft('follow', 0, 0.25, 0);
            const rope = attachTowRope(leader, follower, { restLength: 15.0, minRestLength: 5.0, winchSpeed: 5.0 });

            setWinchMode(rope, WINCH_MODES.REEL_IN);
            assert.equal(rope.winchMode, WINCH_MODES.REEL_IN);

            // Step 1.0 second: rest length reduces by 5.0m (15 -> 10)
            stepTowRopePhysics(leader, follower, 1.0);
            assert.ok(Math.abs(rope.restLength - 10.0) < 1e-3);
            assert.equal(rope.state, ROPE_STATES.WINCHING);

            // Step 2.0 seconds: rest length clamped at minRestLength = 5.0m
            stepTowRopePhysics(leader, follower, 2.0);
            assert.equal(rope.restLength, 5.0);
        });

        it('PAY_OUT extends restLength over time up to maxRestLength', () => {
            const leader = makeCraft('lead', 0, 0.25, -10);
            const follower = makeCraft('follow', 0, 0.25, 0);
            const rope = attachTowRope(leader, follower, { restLength: 10.0, maxRestLength: 20.0 });

            setWinchMode(rope, WINCH_MODES.PAY_OUT);
            // 6.0 m/s payout speed over 1.0 second -> 10.0 + 6.0 = 16.0
            stepTowRopePhysics(leader, follower, 1.0);
            assert.ok(Math.abs(rope.restLength - 16.0) < 1e-3);

            // Another 2.0 seconds -> clamps to max 20.0
            stepTowRopePhysics(leader, follower, 2.0);
            assert.equal(rope.restLength, 20.0);
        });

        it('FREE_SPOOL allows cable to extend with separation without resistance', () => {
            const leader = makeCraft('lead', 0, 0.25, -25);
            const follower = makeCraft('follow', 0, 0.25, 0);
            const rope = attachTowRope(leader, follower, { restLength: 10.0, maxRestLength: 28.0 });

            setWinchMode(rope, WINCH_MODES.FREE_SPOOL);
            // Distance is 25m -> restLength adapts to 25m, leaving cable slack (0 tension)
            const res = stepTowRopePhysics(leader, follower, 0.05);

            assert.equal(rope.restLength, 25.0);
            assert.equal(res.tension, 0);
            assert.equal(res.state, ROPE_STATES.SLACK);
        });
    });

    describe('Rope Breakage & Tension Limits', () => {
        it('snaps cable when distance exceeds breakingLength', () => {
            const leader = makeCraft('lead', 0, 0.25, -45);
            const follower = makeCraft('follow', 0, 0.25, 0); // 45m apart
            const rope = attachTowRope(leader, follower, { breakingLength: 35.0 });

            const res = stepTowRopePhysics(leader, follower, 0.05);

            assert.equal(res.snapped, true);
            assert.equal(res.active, false);
            assert.equal(res.state, ROPE_STATES.SNAPPED);
            assert.equal(res.snapReason, 'length_exceeded');
            assert.equal(follower.isBeingTowed, false);
            assert.equal(follower.towRope, null);
        });

        it('snaps cable when tension exceeds maxBreakingTension', () => {
            const leader = makeCraft('lead', 0, 0.25, -25);
            const follower = makeCraft('follow', 0, 0.25, 0); // 25m apart
            // Rest length 5m, stretch 20m, k = 100 -> tension = 2000 N > maxBreakingTension (1500 N)
            const rope = attachTowRope(leader, follower, {
                restLength: 5.0,
                springStiffness: 100.0,
                maxBreakingTension: 1500.0,
                breakingLength: 50.0,
            });

            const res = stepTowRopePhysics(leader, follower, 0.05);

            assert.equal(res.snapped, true);
            assert.equal(res.snapReason, 'tension_exceeded');
            assert.equal(rope.state, ROPE_STATES.SNAPPED);
        });
    });

    describe('Detachment via releaseTowRope', () => {
        it('cleans up references on leader, follower, and pair', () => {
            const leader = makeCraft('lead', 0, 0.25, -20);
            const follower = makeCraft('follow', 0, 0.25, -10);
            const rope = attachTowRope(leader, follower);

            assert.equal(leader.activeTows.length, 1);
            assert.equal(follower.isBeingTowed, true);

            const ok = releaseTowRope(rope, leader, follower);

            assert.equal(ok, true);
            assert.equal(rope.active, false);
            assert.equal(rope.state, ROPE_STATES.RELEASED);
            assert.equal(follower.isBeingTowed, false);
            assert.equal(follower.towRope, null);
            assert.equal(leader.activeTows.length, 0);
        });

        it('returns false gracefully when passed null pair', () => {
            assert.equal(releaseTowRope(null), false);
        });
    });

    describe('Edge Cases & Defensive Physics', () => {
        it('handles zero or negative dt cleanly without NaN or movement', () => {
            const leader = makeCraft('lead', 0, 0.25, -20);
            const follower = makeCraft('follow', 0, 0.25, -5);
            const rope = attachTowRope(leader, follower);

            const resZero = stepTowRopePhysics(leader, follower, 0);
            assert.equal(resZero.active, true);
            assert.equal(resZero.snapped, false);

            const resNeg = stepTowRopePhysics(leader, follower, -0.05);
            assert.equal(resNeg.active, true);
        });

        it('handles missing velocity and position fields without crashing', () => {
            const leader = { id: 'sparse_lead', x: 0, z: -10 };
            const follower = { id: 'sparse_follow', x: 0, z: 0 };
            const rope = attachTowRope(leader, follower);

            const res = stepTowRopePhysics(leader, follower, 0.05);
            assert.equal(res.active, true);
            assert.ok(Number.isFinite(res.tension));
        });

        it('tracks accumulated total towed distance accurately', () => {
            const leader = makeCraft('lead', 0, 0.25, -20, 0, 0, -10);
            const follower = makeCraft('follow', 0, 0.25, -5, 0, 0, -5); // moving at 5 m/s
            const rope = attachTowRope(leader, follower, { restLength: 10.0, springStiffness: 50.0 });

            // Over 2 steps of 0.1s at followSpeed ~5m/s
            stepTowRopePhysics(leader, follower, 0.1);
            stepTowRopePhysics(leader, follower, 0.1);

            assert.ok(rope.totalTowedDistance > 0.5);
        });
    });

    describe('Rescue Assistance Evaluator (`evaluateRescueAssistance`)', () => {
        it('detects lagging teammate falling behind lead raft', () => {
            const leader = makeCraft('lead', 0, 0.25, -100);
            const follower = makeCraft('follow', 0, 0.25, -70); // 30m behind (in +Z direction)

            const evalRes = evaluateRescueAssistance(follower, leader, 20.0);
            assert.equal(evalRes.needsRescue, true);
            assert.equal(evalRes.reason, 'lagging_behind_lead');
            assert.ok(evalRes.urgency > 0.5);
        });

        it('detects critical hull health and escalates urgency to 1.0 when lagging', () => {
            const leader = makeCraft('lead', 0, 0.25, -100);
            const follower = makeCraft('follow', 0, 0.25, -85); // 15m behind
            follower.health = 20; // 20% health <= 35%

            const evalRes = evaluateRescueAssistance(follower, leader, 18.0);
            assert.equal(evalRes.needsRescue, true);
            assert.equal(evalRes.reason, 'critical_hull_and_lagging');
            assert.equal(evalRes.urgency, 1.0);
        });

        it('returns needsRescue = false when crewmate is healthy and right alongside leader', () => {
            const leader = makeCraft('lead', 0, 0.25, -100);
            const follower = makeCraft('follow', 4, 0.25, -102); // alongside/ahead

            const evalRes = evaluateRescueAssistance(follower, leader, 20.0);
            assert.equal(evalRes.needsRescue, false);
            assert.equal(evalRes.urgency, 0);
        });
    });
});
