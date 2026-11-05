// Procedural Three.js Translucent Holographic "Personal Best Ghost Raft" Renderer
// Zero external asset dependencies. Renders a sailing ghost craft alongside the player,
// with split-time delta billboards at Checkpoint Gates (-1.4s / +0.8s) and pulsating cyan holographic glow.

import { GhostPlayback, getCheckpointSplit } from '../../../shared/replay-ghost.js';

export const GHOST_DEFAULT_COLOR = 0x38f2ff; // Holographic Cyan
export const GHOST_AHEAD_COLOR = 0x38ff8e;   // Emerald Green (-1.4s ahead)
export const GHOST_BEHIND_COLOR = 0xff4d6d;  // Crimson Red (+0.8s behind)

/**
 * Creates a translucent holographic material.
 * Compatible with standard Three.js materials and headless mock test environments.
 */
export function createHologramMaterial(THREE, colorHex = GHOST_DEFAULT_COLOR, opacity = 0.42, wireframe = false) {
    if (THREE.MeshPhysicalMaterial) {
        return new THREE.MeshPhysicalMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.65,
            transparent: true,
            opacity,
            wireframe,
            roughness: 0.1,
            metalness: 0.8,
            clearcoat: 1.0,
            depthWrite: false,
        });
    }

    if (THREE.MeshStandardMaterial) {
        return new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity,
            wireframe,
            depthWrite: false,
        });
    }

    return new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
        wireframe,
        depthWrite: false,
    });
}

/**
 * Generates an articulated, translucent holographic Ghost Raft and Crew rig.
 * Uses 6-log lashed hull, spectral bow lantern, ghost navigator silhouette, and oar.
 */
export function createGhostRaftMesh(THREE, options = {}) {
    const {
        color = GHOST_DEFAULT_COLOR,
        raftSize = { w: 2.4, h: 0.5, d: 3.2 },
        name = 'Personal Best',
    } = options;

    const group = new THREE.Group();
    group.name = 'GhostRaft';

    const tilt = new THREE.Group();
    tilt.name = 'GhostTilt';
    group.add(tilt);

    // Primary translucent holographic materials
    const holoHullMat = createHologramMaterial(THREE, color, 0.38, false);
    const holoWireMat = createHologramMaterial(THREE, color, 0.22, true);
    const holoGlowMat = createHologramMaterial(THREE, 0x7df9ff, 0.75, false);
    const holoSkinMat = createHologramMaterial(THREE, color, 0.45, false);

    // 1. Ghost Log Hull
    const hullGroup = new THREE.Group();
    hullGroup.name = 'GhostHull';
    const logCount = 6;
    const logRadius = (raftSize.w / logCount) * 0.52;

    for (let i = 0; i < logCount; i++) {
        const lx = (i - (logCount - 1) / 2) * (raftSize.w / logCount);
        const logGeo = new THREE.CylinderGeometry(logRadius, logRadius, raftSize.d, 8);
        const logMesh = new THREE.Mesh(logGeo, holoHullMat);
        logMesh.rotation.x = Math.PI / 2;
        logMesh.position.set(lx, 0, 0);

        const logWire = new THREE.Mesh(logGeo, holoWireMat);
        logWire.rotation.x = Math.PI / 2;
        logWire.position.set(lx, 0, 0);
        logWire.scale.set(1.02, 1.02, 1.02);

        hullGroup.add(logMesh, logWire);
    }

    // Crossbeams
    for (const bz of [-raftSize.d * 0.34, raftSize.d * 0.34]) {
        const beamGeo = new THREE.BoxGeometry(raftSize.w * 1.04, 0.14, 0.22);
        const beam = new THREE.Mesh(beamGeo, holoHullMat);
        beam.position.set(0, logRadius * 0.75, bz);
        hullGroup.add(beam);
    }

    // Ghost Bow Lantern
    const lanternPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.85, 6),
        holoHullMat
    );
    lanternPost.position.set(-raftSize.w * 0.38, 0.45, -raftSize.d * 0.42);
    const lanternOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 8),
        holoGlowMat
    );
    lanternOrb.position.set(-raftSize.w * 0.38, 0.92, -raftSize.d * 0.42);
    hullGroup.add(lanternPost, lanternOrb);

    // 2. Holographic Ghost Crew Silhouette
    const character = new THREE.Group();
    character.name = 'GhostCrew';
    character.position.y = raftSize.h / 2;

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.35), holoSkinMat);
    legs.position.y = 0.32;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.44), holoSkinMat);
    torso.position.y = 0.88;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), holoGlowMat);
    head.position.y = 1.56;

    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6), holoSkinMat);
    leftArm.position.set(-0.48, 0.95, -0.1);
    leftArm.rotation.x = 0.45;
    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6), holoSkinMat);
    rightArm.position.set(0.48, 0.95, -0.1);
    rightArm.rotation.x = 0.45;

    character.add(legs, torso, head, leftArm, rightArm);

    // 3. Ghost Paddle
    const paddle = new THREE.Group();
    paddle.name = 'GhostPaddle';
    const paddleShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.5, 6), holoHullMat);
    paddleShaft.rotation.x = Math.PI / 2;
    const paddleBlade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.85), holoGlowMat);
    paddleBlade.position.z = -1.25;
    paddle.add(paddleShaft, paddleBlade);
    paddle.position.set(0.85, 0.88 + raftSize.h / 2, -0.1);

    // 4. Ground Holographic Scanning Ring / Wake Aura
    const ringGeo = new THREE.RingGeometry(1.6, 1.85, 24);
    if (ringGeo.rotateX) ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, holoGlowMat);
    ringMesh.position.y = 0.05;

    tilt.add(hullGroup, character, paddle, ringMesh);

    // Optional Split Delta Floating Badge Anchor
    const badgeAnchor = new THREE.Group();
    badgeAnchor.name = 'BadgeAnchor';
    badgeAnchor.position.set(0, 2.5, 0);
    tilt.add(badgeAnchor);

    return {
        group,
        tilt,
        hullGroup,
        character,
        paddle,
        ringMesh,
        badgeAnchor,
        materials: [holoHullMat, holoWireMat, holoGlowMat, holoSkinMat],
        color,
        name,
        pulsePhase: 0,
    };
}

/**
 * Creates a 3D procedural billboard badge displaying checkpoint split delta.
 * E.g. "-1.4s" (emerald green, ahead of PB) or "+0.8s" (crimson red, behind PB).
 */
export function createGhostSplitBadge(THREE, splitText, isAhead = true) {
    const group = new THREE.Group();
    group.name = `GhostSplitBadge_${splitText}`;

    const colorHex = isAhead ? GHOST_AHEAD_COLOR : GHOST_BEHIND_COLOR;

    // Background pill frame
    const bgMat = new THREE.MeshBasicMaterial({
        color: 0x0a1118,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.05), bgMat);

    // Glowing border frame
    const borderMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
        wireframe: true,
        depthWrite: false,
    });
    const borderMesh = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.59, 0.06), borderMat);

    // Text bar indicator (procedural visual tick/plus indicator)
    const indMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.08), indMat);
    indicator.position.x = -0.6;

    group.add(bgMesh, borderMesh, indicator);
    group.userData = { splitText, isAhead, colorHex, createdAt: Date.now() };

    return group;
}

/**
 * High-level Ghost Raft Controller managing playback, transforms, holographic pulse,
 * and checkpoint split notifications.
 */
export class GhostRaftController {
    constructor(THREE, replayData, { scene = null, options = {} } = {}) {
        this.THREE = THREE;
        this.scene = scene;
        this.playback = new GhostPlayback(replayData);
        this.meshInstance = createGhostRaftMesh(THREE, {
            color: replayData.color || GHOST_DEFAULT_COLOR,
            name: replayData.playerName || 'PB Ghost',
            ...options,
        });

        if (this.scene) {
            this.scene.add(this.meshInstance.group);
        }

        this.currentSplitBadge = null;
        this.badgeTimeout = null;
        this.activeSplits = new Set();
        this.visible = true;
    }

    setVisible(val) {
        this.visible = !!val;
        this.meshInstance.group.visible = this.visible;
    }

    /**
     * Updates ghost raft transform from recorded playback at the given run timestamp.
     */
    update(timeMs, dt = 0.016, cameraPosition = null) {
        if (!this.visible) return;

        const sample = this.playback.sample(timeMs);
        const { group, tilt, paddle, ringMesh, materials } = this.meshInstance;

        // Position and rotation
        group.position.set(sample.position.x, sample.position.y, sample.position.z);
        group.rotation.y = sample.yaw;

        // Animate rowing oar if not swinging weapon
        if (paddle) {
            if (sample.swing) {
                paddle.rotation.x = Math.sin(timeMs * 0.02) * 0.8;
                paddle.rotation.z = Math.PI * 0.35;
            } else {
                const rowPhase = (timeMs * 0.005) % (Math.PI * 2);
                paddle.rotation.x = Math.sin(rowPhase) * 0.35;
                paddle.rotation.z = 0;
            }
        }

        // Pulse holographic glow
        this.meshInstance.pulsePhase = (this.meshInstance.pulsePhase + dt * 3.0) % (Math.PI * 2);
        const pulse = 0.35 + Math.sin(this.meshInstance.pulsePhase) * 0.15;
        for (const mat of materials) {
            if (mat && mat.opacity !== undefined) {
                mat.opacity = Math.max(0.1, Math.min(0.9, pulse));
            }
        }

        // Expanding ground wake ring
        if (ringMesh) {
            const ringScale = 1.0 + Math.sin(this.meshInstance.pulsePhase) * 0.12;
            ringMesh.scale.set(ringScale, ringScale, ringScale);
        }

        // Billboard split badge toward camera if present
        if (this.currentSplitBadge && cameraPosition) {
            this.currentSplitBadge.lookAt(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        }

        return sample;
    }

    /**
     * Trigger split delta comparison at a Checkpoint Gate and mount visual badge.
     */
    triggerCheckpointSplit(checkpointZ, currentRunSplits) {
        const split = getCheckpointSplit(checkpointZ, currentRunSplits, this.playback.checkpoints);
        if (!split.splitText) return null;

        if (this.activeSplits.has(checkpointZ)) return split;
        this.activeSplits.add(checkpointZ);

        if (this.currentSplitBadge) {
            this.meshInstance.badgeAnchor.remove(this.currentSplitBadge);
            this.currentSplitBadge = null;
        }

        const badge = createGhostSplitBadge(this.THREE, split.splitText, split.isAhead);
        this.currentSplitBadge = badge;
        this.meshInstance.badgeAnchor.add(badge);

        return split;
    }

    dispose() {
        if (this.scene && this.meshInstance.group) {
            this.scene.remove(this.meshInstance.group);
        }
        for (const mat of this.meshInstance.materials) {
            if (mat && typeof mat.dispose === 'function') {
                mat.dispose();
            }
        }
    }
}
