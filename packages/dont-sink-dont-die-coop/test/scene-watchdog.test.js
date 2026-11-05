import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SAFE_DEFAULTS,
    isFiniteNumber,
    findCorruptedKeys,
    sanitizeObject3DTree,
    verifyRaftVisibilityInvariants,
    checkFrustumProjection,
} from '../shared/scene-watchdog.js';

function createMockObject3D(name = 'Node', type = 'Object3D') {
    return {
        name,
        type,
        visible: true,
        children: [],
        position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
        rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
        quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } },
        scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
        matrixWorld: {
            elements: [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1,
            ],
            identity() {
                for (let i = 0; i < 16; i++) {
                    this.elements[i] = (i % 5 === 0) ? 1 : 0;
                }
            },
        },
        updateMatrixWorldCalled: 0,
        updateMatrixWorld() {
            this.updateMatrixWorldCalled++;
        },
        add(...children) {
            for (const c of children) {
                if (c) this.children.push(c);
            }
            return this;
        },
    };
}

describe('Runtime 3D Scene-Graph NaN Watchdog & Self-Healer', () => {
    describe('isFiniteNumber and findCorruptedKeys', () => {
        it('identifies finite numbers and filters NaN, Infinity, -Infinity, strings, and null', () => {
            assert.equal(isFiniteNumber(0), true);
            assert.equal(isFiniteNumber(-42.5), true);
            assert.equal(isFiniteNumber(1e8), true);

            assert.equal(isFiniteNumber(NaN), false);
            assert.equal(isFiniteNumber(Infinity), false);
            assert.equal(isFiniteNumber(-Infinity), false);
            assert.equal(isFiniteNumber('42'), false);
            assert.equal(isFiniteNumber(null), false);
            assert.equal(isFiniteNumber(undefined), false);
        });

        it('finds corrupted keys on vector-like objects', () => {
            const cleanVec = { x: 1, y: 2, z: 3 };
            assert.deepEqual(findCorruptedKeys(cleanVec), []);

            const badVec = { x: NaN, y: 2, z: Infinity };
            assert.deepEqual(findCorruptedKeys(badVec), ['x', 'z']);

            const missingVec = null;
            assert.deepEqual(findCorruptedKeys(missingVec), ['x', 'y', 'z']);
        });
    });

    describe('sanitizeObject3DTree — detection and self-healing', () => {
        it('returns ok for a pristine scene graph and does not modify it', () => {
            const root = createMockObject3D('Root');
            const childA = createMockObject3D('ChildA');
            const childB = createMockObject3D('ChildB');
            root.add(childA, childB);

            const report = sanitizeObject3DTree(root);
            assert.equal(report.ok, true);
            assert.equal(report.checkedCount, 3);
            assert.equal(report.healedCount, 0);
            assert.equal(report.corruptedNodes.length, 0);
        });

        it('detects and heals NaN in position', () => {
            const node = createMockObject3D('CorruptedPos');
            node.position.x = NaN;
            node.position.z = Infinity;

            const report = sanitizeObject3DTree(node);
            assert.equal(report.ok, false);
            assert.equal(report.healedCount, 1);
            assert.equal(report.corruptedNodes[0].corruptedFields.includes('position'), true);

            // Verified self-healed to safe identity defaults
            assert.equal(node.position.x, SAFE_DEFAULTS.position.x);
            assert.equal(node.position.y, SAFE_DEFAULTS.position.y);
            assert.equal(node.position.z, SAFE_DEFAULTS.position.z);
        });

        it('detects and heals NaN in rotation', () => {
            const node = createMockObject3D('CorruptedRot');
            node.rotation.y = -Infinity;

            const report = sanitizeObject3DTree(node);
            assert.equal(report.ok, false);
            assert.equal(report.corruptedNodes[0].corruptedFields.includes('rotation'), true);
            assert.equal(node.rotation.x, 0);
            assert.equal(node.rotation.y, 0);
            assert.equal(node.rotation.z, 0);
        });

        it('detects and heals degenerate or NaN quaternion (all zero or NaN)', () => {
            const node = createMockObject3D('CorruptedQuat');
            node.quaternion.w = NaN;

            const report1 = sanitizeObject3DTree(node);
            assert.equal(report1.ok, false);
            assert.equal(node.quaternion.x, 0);
            assert.equal(node.quaternion.y, 0);
            assert.equal(node.quaternion.z, 0);
            assert.equal(node.quaternion.w, 1);

            // Test all zero degenerate quaternion
            node.quaternion.x = 0;
            node.quaternion.y = 0;
            node.quaternion.z = 0;
            node.quaternion.w = 0;
            const report2 = sanitizeObject3DTree(node);
            assert.equal(report2.ok, false);
            assert.equal(node.quaternion.w, 1);
        });

        it('detects and heals NaN in scale', () => {
            const node = createMockObject3D('CorruptedScale');
            node.scale.x = NaN;
            node.scale.y = null;

            const report = sanitizeObject3DTree(node);
            assert.equal(report.ok, false);
            assert.equal(report.corruptedNodes[0].corruptedFields.includes('scale'), true);
            assert.equal(node.scale.x, 1);
            assert.equal(node.scale.y, 1);
            assert.equal(node.scale.z, 1);
        });

        it('detects and heals NaN/Infinity in matrixWorld elements', () => {
            const node = createMockObject3D('CorruptedMatrix');
            node.matrixWorld.elements[0] = NaN;
            node.matrixWorld.elements[5] = Infinity;

            const report = sanitizeObject3DTree(node);
            assert.equal(report.ok, false);
            assert.equal(report.corruptedNodes[0].corruptedFields.includes('matrixWorld'), true);
            assert.equal(node.matrixWorld.elements[0], 1);
            assert.equal(node.matrixWorld.elements[5], 1);
            assert.equal(node.matrixWorld.elements[1], 0);
        });

        it('traverses deep hierarchies and reports correct node paths', () => {
            const root = createMockObject3D('RaftGroup');
            const tilt = createMockObject3D('TiltGroup');
            const rig = createMockObject3D('CrewRig');
            const leftArm = createMockObject3D('LeftArmMesh');

            root.add(tilt);
            tilt.add(rig);
            rig.add(leftArm);

            leftArm.position.y = NaN;

            let callbackCount = 0;
            const report = sanitizeObject3DTree(root, {
                onCorruptedNode: (r) => {
                    callbackCount++;
                    assert.equal(r.name, 'LeftArmMesh');
                    assert.equal(r.path, 'RaftGroup/TiltGroup/CrewRig/LeftArmMesh');
                },
            });

            assert.equal(report.ok, false);
            assert.equal(report.healedCount, 1);
            assert.equal(callbackCount, 1);
            assert.equal(root.updateMatrixWorldCalled >= 1, true);
        });

        it('respects autoHeal: false option for dry-run auditing', () => {
            const node = createMockObject3D('AuditOnly');
            node.position.x = NaN;

            const report = sanitizeObject3DTree(node, { autoHeal: false });
            assert.equal(report.ok, false);
            assert.equal(report.healedCount, 0);
            assert.equal(Number.isNaN(node.position.x), true);
            assert.equal(report.corruptedNodes[0].healed, false);
        });

        it('handles null, undefined, or empty root cleanly', () => {
            const reportNull = sanitizeObject3DTree(null);
            assert.equal(reportNull.ok, true);
            assert.equal(reportNull.checkedCount, 0);

            const reportUndef = sanitizeObject3DTree(undefined);
            assert.equal(reportUndef.ok, true);
        });
    });

    describe('verifyRaftVisibilityInvariants', () => {
        it('passes when group, tilt, raft, and character are all visible', () => {
            const raftVis = {
                group: { visible: true },
                tilt: { visible: true },
                raft: { visible: true },
                rig: { character: { visible: true } },
            };

            const result = verifyRaftVisibilityInvariants(raftVis);
            assert.equal(result.ok, true);
            assert.equal(result.violations.length, 0);
            assert.equal(result.healedFlags.length, 0);
            assert.equal(result.groupVisible, true);
            assert.equal(result.tiltVisible, true);
            assert.equal(result.raftHullVisible, true);
            assert.equal(result.charVisible, true);
        });

        it('detects false visibility and auto-heals them to true', () => {
            const raftVis = {
                group: { visible: false },
                tilt: { visible: false },
                raft: { visible: false },
                rig: { character: { visible: false } },
            };

            const result = verifyRaftVisibilityInvariants(raftVis, { autoHeal: true });
            assert.equal(result.ok, false);
            assert.equal(result.violations.length, 4);
            assert.equal(result.healedFlags.length, 4);

            assert.equal(raftVis.group.visible, true);
            assert.equal(raftVis.tilt.visible, true);
            assert.equal(raftVis.raft.visible, true);
            assert.equal(raftVis.rig.character.visible, true);
        });

        it('supports alternative raftHull and char property naming conventions', () => {
            const raftVis = {
                group: { visible: true },
                tilt: { visible: true },
                raftHull: { visible: false },
                char: { visible: false },
            };

            const result = verifyRaftVisibilityInvariants(raftVis, { autoHeal: true });
            assert.equal(raftVis.raftHull.visible, true);
            assert.equal(raftVis.char.visible, true);
            assert.equal(result.raftHullVisible, true);
            assert.equal(result.charVisible, true);
        });

        it('allows mid-air airborne raft hide when allowAirborneRaftHide is enabled', () => {
            const raftVis = {
                group: { visible: true },
                tilt: { visible: true },
                raft: { visible: false },
                rig: { character: { visible: true } },
                anim: { airborne: true },
            };

            const result = verifyRaftVisibilityInvariants(raftVis, {
                autoHeal: true,
                allowAirborneRaftHide: true,
            });

            assert.equal(result.ok, true);
            assert.equal(raftVis.raft.visible, false);
        });

        it('gracefully fails and reports violation when raftVis is null or malformed', () => {
            const result = verifyRaftVisibilityInvariants(null);
            assert.equal(result.ok, false);
            assert.ok(result.violations[0].includes('null'));
        });
    });

    describe('checkFrustumProjection', () => {
        function createMockCamera(projectFn) {
            return {
                updateMatrixWorld() {},
                project: projectFn,
            };
        }

        it('validates a point in the center of the viewport frustum', () => {
            const camera = createMockCamera((target) => {
                target.x = 0.1;
                target.y = -0.2;
                target.z = 0.5;
                return target;
            });

            const res = checkFrustumProjection({ x: 0, y: 1, z: -100 }, camera, { width: 1440, height: 900 });
            assert.equal(res.ok, true);
            assert.equal(res.inFrustum, true);
            assert.equal(res.inFront, true);
            assert.ok(res.screenPx.x > 0 && res.screenPx.x < 1440);
            assert.ok(res.screenPx.y > 0 && res.screenPx.y < 900);
        });

        it('rejects a point behind the camera (z <= 0)', () => {
            const camera = createMockCamera((target) => {
                target.x = 0.0;
                target.y = 0.0;
                target.z = -0.1;
                return target;
            });

            const res = checkFrustumProjection({ x: 0, y: 1, z: 50 }, camera);
            assert.equal(res.ok, false);
            assert.equal(res.inFront, false);
            assert.equal(res.inFrustum, false);
        });

        it('rejects points projecting outside horizontal or vertical NDC threshold (> 0.85)', () => {
            const camera = createMockCamera((target) => {
                target.x = 0.95; // too far right
                target.y = 0.1;
                target.z = 0.5;
                return target;
            });

            const res = checkFrustumProjection({ x: 45, y: 0, z: -100 }, camera);
            assert.equal(res.ok, false);
            assert.equal(res.inFrustum, false);
        });

        it('handles non-finite coordinates or invalid camera gracefully', () => {
            const camera = createMockCamera((t) => t);
            const badPos = { x: NaN, y: 0, z: -100 };
            const res1 = checkFrustumProjection(badPos, camera);
            assert.equal(res1.ok, false);

            const res2 = checkFrustumProjection({ x: 0, y: 0, z: 0 }, null);
            assert.equal(res2.ok, false);
        });
    });
});
