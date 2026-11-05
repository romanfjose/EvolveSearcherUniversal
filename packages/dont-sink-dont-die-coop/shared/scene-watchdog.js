/**
 * Sovereign Core — Seat 3: Runtime 3D Scene-Graph NaN Watchdog & Self-Healer
 * (`shared/scene-watchdog.js`)
 *
 * Autonomous runtime inspector and self-healing subsystem for Three.js Object3D scene graphs.
 * Adheres to Helmet 03 ("Where's the Bathroom?" QA Breaker) standards:
 * - Detects NaN, Infinity, -Infinity, null, and non-numeric corruption in position,
 *   rotation, quaternion, scale, and matrixWorld.
 * - Heals corrupted transforms back to safe identity defaults without crashing the render loop.
 * - Enforces raft visibility invariants: group, tilt, raft/raftHull, and character must remain visible.
 * - Provides frustum projection sanity checks.
 * - Zero external dependencies, pure ES module, headless safe.
 */

export const SAFE_DEFAULTS = Object.freeze({
    position: Object.freeze({ x: 0, y: 0, z: 0 }),
    rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
    quaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
    scale: Object.freeze({ x: 1, y: 1, z: 1 }),
    identityMatrixWorld: Object.freeze([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]),
});

/**
 * Checks if a value is a strictly finite number.
 * @param {*} v
 * @returns {boolean}
 */
export function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Checks a vector-like object { x, y, z } for non-finite values.
 * Returns an array of keys that are not finite.
 * @param {object} vec
 * @param {string[]} keys
 * @returns {string[]}
 */
export function findCorruptedKeys(vec, keys = ['x', 'y', 'z']) {
    if (!vec || typeof vec !== 'object') return [...keys];
    const corrupted = [];
    for (const k of keys) {
        if (!isFiniteNumber(vec[k])) {
            corrupted.push(k);
        }
    }
    return corrupted;
}

/**
 * Traverses any Three.js Object3D hierarchy, detects NaN or Infinity in:
 * - position (x, y, z)
 * - rotation (x, y, z)
 * - quaternion (x, y, z, w)
 * - scale (x, y, z)
 * - matrixWorld (elements array 0..15)
 *
 * When corruption is detected, heals the values back to safe identity defaults:
 * - position: { x: 0, y: 0, z: 0 } (or fallbackPosition if provided)
 * - rotation: { x: 0, y: 0, z: 0 }
 * - quaternion: { x: 0, y: 0, z: 0, w: 1 }
 * - scale: { x: 1, y: 1, z: 1 }
 * - matrixWorld: identity matrix or recomputes via updateMatrixWorld if available
 *
 * @param {object} rootNode - Root Object3D/Group/Mesh to traverse
 * @param {object} [options]
 * @param {boolean} [options.autoHeal=true] - Whether to repair corrupted transforms
 * @param {boolean} [options.recomputeMatrixWorld=true] - Trigger updateMatrixWorld(true) after heal
 * @param {function} [options.onCorruptedNode] - Optional callback(nodeReport)
 * @returns {{
 *   ok: boolean,
 *   checkedCount: number,
 *   healedCount: number,
 *   corruptedNodes: Array<{
 *     id: string|number,
 *     name: string,
 *     type: string,
 *     path: string,
 *     corruptedFields: string[],
 *     details: object,
 *     healed: boolean
 *   }>
 * }}
 */
export function sanitizeObject3DTree(rootNode, options = {}) {
    const {
        autoHeal = true,
        recomputeMatrixWorld = true,
        onCorruptedNode = null,
    } = options;

    const result = {
        ok: true,
        checkedCount: 0,
        healedCount: 0,
        corruptedNodes: [],
    };

    if (!rootNode || typeof rootNode !== 'object') {
        return result;
    }

    const stack = [{ node: rootNode, path: rootNode.name || rootNode.type || 'root' }];
    const visited = new Set();

    while (stack.length > 0) {
        const { node, path } = stack.pop();
        if (!node || typeof node !== 'object' || visited.has(node)) {
            continue;
        }
        visited.add(node);
        result.checkedCount++;

        let nodeHasCorruption = false;
        const corruptedFields = [];
        const details = {};

        // 1. Position Check
        if (node.position) {
            const badPos = findCorruptedKeys(node.position, ['x', 'y', 'z']);
            if (badPos.length > 0) {
                nodeHasCorruption = true;
                corruptedFields.push('position');
                details.position = { corruptedAxes: badPos, original: { x: node.position.x, y: node.position.y, z: node.position.z } };
                if (autoHeal) {
                    if (typeof node.position.set === 'function') {
                        node.position.set(0, 0, 0);
                    } else {
                        node.position.x = 0;
                        node.position.y = 0;
                        node.position.z = 0;
                    }
                }
            }
        }

        // 2. Rotation (Euler) Check
        if (node.rotation) {
            const badRot = findCorruptedKeys(node.rotation, ['x', 'y', 'z']);
            if (badRot.length > 0) {
                nodeHasCorruption = true;
                corruptedFields.push('rotation');
                details.rotation = { corruptedAxes: badRot, original: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z } };
                if (autoHeal) {
                    if (typeof node.rotation.set === 'function') {
                        node.rotation.set(0, 0, 0);
                    } else {
                        node.rotation.x = 0;
                        node.rotation.y = 0;
                        node.rotation.z = 0;
                    }
                }
            }
        }

        // 3. Quaternion Check
        if (node.quaternion) {
            const badQuat = findCorruptedKeys(node.quaternion, ['x', 'y', 'z', 'w']);
            // Also check for degenerate zero-length or non-normalized invalid quaternions if values are all 0
            const isZeroQuat = isFiniteNumber(node.quaternion.x) && isFiniteNumber(node.quaternion.y) &&
                isFiniteNumber(node.quaternion.z) && isFiniteNumber(node.quaternion.w) &&
                node.quaternion.x === 0 && node.quaternion.y === 0 && node.quaternion.z === 0 && node.quaternion.w === 0;

            if (badQuat.length > 0 || isZeroQuat) {
                nodeHasCorruption = true;
                corruptedFields.push('quaternion');
                details.quaternion = {
                    corruptedAxes: badQuat.length > 0 ? badQuat : ['all_zero'],
                    original: { x: node.quaternion.x, y: node.quaternion.y, z: node.quaternion.z, w: node.quaternion.w },
                };
                if (autoHeal) {
                    if (typeof node.quaternion.set === 'function') {
                        node.quaternion.set(0, 0, 0, 1);
                    } else {
                        node.quaternion.x = 0;
                        node.quaternion.y = 0;
                        node.quaternion.z = 0;
                        node.quaternion.w = 1;
                    }
                }
            }
        }

        // 4. Scale Check
        if (node.scale) {
            const badScale = findCorruptedKeys(node.scale, ['x', 'y', 'z']);
            // Scale cannot be 0 in all axes without collapsing to a degenerate singularity
            if (badScale.length > 0) {
                nodeHasCorruption = true;
                corruptedFields.push('scale');
                details.scale = { corruptedAxes: badScale, original: { x: node.scale.x, y: node.scale.y, z: node.scale.z } };
                if (autoHeal) {
                    if (typeof node.scale.set === 'function') {
                        node.scale.set(1, 1, 1);
                    } else {
                        node.scale.x = 1;
                        node.scale.y = 1;
                        node.scale.z = 1;
                    }
                }
            }
        }

        // 5. MatrixWorld Check
        if (node.matrixWorld && Array.isArray(node.matrixWorld.elements)) {
            const elements = node.matrixWorld.elements;
            let badMatrixIndices = [];
            for (let i = 0; i < elements.length; i++) {
                if (!isFiniteNumber(elements[i])) {
                    badMatrixIndices.push(i);
                }
            }
            if (badMatrixIndices.length > 0) {
                nodeHasCorruption = true;
                corruptedFields.push('matrixWorld');
                details.matrixWorld = { badIndicesCount: badMatrixIndices.length, badIndices: badMatrixIndices };
                if (autoHeal) {
                    if (typeof node.matrixWorld.identity === 'function') {
                        node.matrixWorld.identity();
                    } else {
                        for (let i = 0; i < SAFE_DEFAULTS.identityMatrixWorld.length; i++) {
                            elements[i] = SAFE_DEFAULTS.identityMatrixWorld[i];
                        }
                    }
                }
            }
        }

        if (nodeHasCorruption) {
            result.ok = false;
            const report = {
                id: node.id || node.uuid || 'unknown',
                name: node.name || 'unnamed',
                type: node.type || node.constructor?.name || 'Object3D',
                path,
                corruptedFields,
                details,
                healed: autoHeal,
            };
            if (autoHeal) {
                result.healedCount++;
            }
            result.corruptedNodes.push(report);
            if (typeof onCorruptedNode === 'function') {
                try {
                    onCorruptedNode(report, node);
                } catch {}
            }
        }

        // Enqueue children
        if (Array.isArray(node.children)) {
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child) {
                    const childName = child.name || child.type || `child_${i}`;
                    stack.push({ node: child, path: `${path}/${childName}` });
                }
            }
        }
    }

    if (autoHeal && result.healedCount > 0 && recomputeMatrixWorld && typeof rootNode.updateMatrixWorld === 'function') {
        try {
            rootNode.updateMatrixWorld(true);
        } catch {}
    }

    return result;
}

/**
 * Resolves character Object3D node from various known raft visual structures.
 * @param {object} raftVis
 * @returns {object|null}
 */
function resolveCharacterNode(raftVis) {
    if (!raftVis) return null;
    if (raftVis.rig?.character) return raftVis.rig.character;
    if (raftVis.char) return raftVis.char;
    if (raftVis.character) return raftVis.character;
    return null;
}

/**
 * Resolves raft hull Object3D node from various known raft visual structures.
 * @param {object} raftVis
 * @returns {object|null}
 */
function resolveRaftHullNode(raftVis) {
    if (!raftVis) return null;
    if (raftVis.raftHull) return raftVis.raftHull;
    if (raftVis.raft) return raftVis.raft;
    if (raftVis.hull) return raftVis.hull;
    return null;
}

/**
 * Guarantees group.visible, tilt.visible, raftHull.visible, and char.visible remain true
 * during active gameplay. If any visibility invariant is broken, logs a clear diagnostic
 * and auto-heals the visibility flag to true.
 *
 * @param {object} raftVis - The visual raft representation (myRaft.vis)
 * @param {object} [options]
 * @param {boolean} [options.autoHeal=true] - Whether to force visibility to true
 * @param {boolean} [options.allowAirborneRaftHide=false] - Whether mid-air kickflip may temporarily hide hull
 * @returns {{
 *   ok: boolean,
 *   groupVisible: boolean,
 *   tiltVisible: boolean,
 *   raftHullVisible: boolean,
 *   charVisible: boolean,
 *   healedFlags: string[],
 *   violations: string[]
 * }}
 */
export function verifyRaftVisibilityInvariants(raftVis, options = {}) {
    const {
        autoHeal = true,
        allowAirborneRaftHide = false,
    } = options;

    const violations = [];
    const healedFlags = [];

    if (!raftVis || typeof raftVis !== 'object') {
        return {
            ok: false,
            groupVisible: false,
            tiltVisible: false,
            raftHullVisible: false,
            charVisible: false,
            healedFlags: [],
            violations: ['raftVis is null, undefined, or not an object'],
        };
    }

    const groupNode = raftVis.group;
    const tiltNode = raftVis.tilt;
    const hullNode = resolveRaftHullNode(raftVis);
    const charNode = resolveCharacterNode(raftVis);

    // 1. Group visibility
    let groupVisible = Boolean(groupNode && groupNode.visible);
    if (!groupVisible) {
        violations.push('raftVis.group.visible is false or group is missing');
        if (autoHeal && groupNode) {
            groupNode.visible = true;
            groupVisible = true;
            healedFlags.push('group.visible');
        }
    }

    // 2. Tilt visibility
    let tiltVisible = Boolean(tiltNode && tiltNode.visible);
    if (!tiltVisible) {
        violations.push('raftVis.tilt.visible is false or tilt is missing');
        if (autoHeal && tiltNode) {
            tiltNode.visible = true;
            tiltVisible = true;
            healedFlags.push('tilt.visible');
        }
    }

    // 3. Raft Hull visibility
    const isAirborne = Boolean(raftVis.anim?.airborne);
    let raftHullVisible = Boolean(hullNode && hullNode.visible);
    if (!raftHullVisible) {
        const exempt = allowAirborneRaftHide && isAirborne;
        if (!exempt) {
            violations.push('raftVis.raftHull.visible is false or hull is missing');
            if (autoHeal && hullNode) {
                hullNode.visible = true;
                raftHullVisible = true;
                healedFlags.push('raftHull.visible');
            }
        }
    }

    // 4. Character visibility
    let charVisible = Boolean(charNode && charNode.visible);
    if (!charVisible) {
        violations.push('raftVis.char.visible is false or character rig is missing');
        if (autoHeal && charNode) {
            charNode.visible = true;
            charVisible = true;
            healedFlags.push('char.visible');
        }
    }

    const ok = violations.length === 0;

    return {
        ok,
        groupVisible,
        tiltVisible,
        raftHullVisible,
        charVisible,
        healedFlags,
        violations,
    };
}

/**
 * Validates whether a 3D world position projects inside the active camera frustum.
 * Matches Helmet 03 sniper criteria:
 * - NDC z in (0, 1) (in front of near plane and before far plane)
 * - NDC |x| <= xThreshold (default 0.85)
 * - NDC |y| <= yThreshold (default 0.85)
 *
 * @param {object} worldPos - { x, y, z }
 * @param {object} camera - Three.js camera with project(vec) or updateMatrixWorld
 * @param {object} [viewport] - { width: number, height: number }
 * @param {object} [options]
 * @param {number} [options.maxNdcX=0.85]
 * @param {number} [options.maxNdcY=0.85]
 * @returns {{
 *   ok: boolean,
 *   inFrustum: boolean,
 *   inFront: boolean,
 *   ndc: { x: number, y: number, z: number },
 *   screenPx: { x: number, y: number }|null,
 *   reason?: string
 * }}
 */
export function checkFrustumProjection(worldPos, camera, viewport = { width: 1440, height: 900 }, options = {}) {
    const {
        maxNdcX = 0.85,
        maxNdcY = 0.85,
    } = options;

    if (!worldPos || !isFiniteNumber(worldPos.x) || !isFiniteNumber(worldPos.y) || !isFiniteNumber(worldPos.z)) {
        return {
            ok: false,
            inFrustum: false,
            inFront: false,
            ndc: { x: NaN, y: NaN, z: NaN },
            screenPx: null,
            reason: 'worldPos contains non-finite coordinates',
        };
    }

    if (!camera || typeof camera.updateMatrixWorld !== 'function' && typeof camera.project !== 'function') {
        return {
            ok: false,
            inFrustum: false,
            inFront: false,
            ndc: { x: NaN, y: NaN, z: NaN },
            screenPx: null,
            reason: 'camera is missing or invalid',
        };
    }

    // Clone or copy coordinate
    const target = {
        x: worldPos.x,
        y: worldPos.y,
        z: worldPos.z,
        clone() { return { ...this }; },
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    };

    let projected;
    if (typeof camera.project === 'function') {
        try {
            projected = camera.project(target);
        } catch (err) {
            return {
                ok: false,
                inFrustum: false,
                inFront: false,
                ndc: { x: NaN, y: NaN, z: NaN },
                screenPx: null,
                reason: `camera.project failed: ${err.message}`,
            };
        }
    } else {
        return {
            ok: false,
            inFrustum: false,
            inFront: false,
            ndc: { x: NaN, y: NaN, z: NaN },
            screenPx: null,
            reason: 'camera.project is not a function',
        };
    }

    const ndcX = projected.x;
    const ndcY = projected.y;
    const ndcZ = projected.z;

    const inFront = isFiniteNumber(ndcZ) && ndcZ > 0 && ndcZ < 1;
    const inFrustum = inFront &&
        isFiniteNumber(ndcX) && Math.abs(ndcX) <= maxNdcX &&
        isFiniteNumber(ndcY) && Math.abs(ndcY) <= maxNdcY;

    const w = viewport?.width || 1440;
    const h = viewport?.height || 900;
    const screenX = isFiniteNumber(ndcX) ? Math.round(((ndcX + 1) / 2) * w) : null;
    const screenY = isFiniteNumber(ndcY) ? Math.round(((1 - ndcY) / 2) * h) : null;

    return {
        ok: inFrustum,
        inFrustum,
        inFront,
        ndc: { x: ndcX, y: ndcY, z: ndcZ },
        screenPx: (screenX !== null && screenY !== null) ? { x: screenX, y: screenY } : null,
    };
}
