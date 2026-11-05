/**
 * Don't Sink, Don't Die — 3D Boss Weakpoint Reticles & Counter-Attack Callouts
 *
 * Visual FX system for Kraken and Major Boss encounters:
 * 1. Pulsing neon-crimson danger rings (#ff0055 / #ff1744) projected on water
 *    before tentacle slams and sweeping barrages.
 * 2. High-contrast glowing emerald (#00ff88 / #10b981) "SMASH WEAKPOINT!" target
 *    reticles (crosshairs, outer spinning bracket, pulsing core ring) when a tentacle
 *    hits the water and lingers in its vulnerable recovery window.
 * 3. 3D Floating Counter-Attack Callout banners ("⚡ SMASH WEAKPOINT! ⚡" / "VULNERABLE!")
 *    hovering directly above vulnerable tentacles or glowing barnacles.
 * 4. Phase 2 glowing barnacle weak-point reticle tracking.
 *
 * Pure ES module, zero external CDN dependencies, fully pooled and zero-GC per frame.
 */

export const TELEGRAPH_COLORS = {
    DANGER_CRIMSON: 0xff1744,
    DANGER_CORE: 0xff5252,
    WEAKPOINT_EMERALD: 0x00ff88,
    WEAKPOINT_CORE: 0x69f0ae,
    WEAKPOINT_CYAN: 0x00e5ff,
    BARNACLE_AMBER: 0xffab00,
};

const MAX_DANGER_RINGS = 6;
const MAX_WEAKPOINT_RETICLES = 6;
const MAX_CALLOUT_BANNERS = 6;

/**
 * Procedural Canvas texture generator for the floating "SMASH WEAKPOINT!" callout banner.
 * Runs in browser or falls back gracefully in headless Node environments without DOM/Canvas.
 */
function createCalloutCanvasTexture(THREE, text = '⚡ SMASH WEAKPOINT! ⚡', color = '#00ff88') {
    if (typeof document === 'undefined' || !document.createElement) {
        return null;
    }
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Background pill
        ctx.fillStyle = 'rgba(5, 20, 15, 0.85)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;

        const r = 24;
        const x = 8, y = 8, w = 512 - 16, h = 128 - 16;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // High-contrast glowing text
        ctx.font = '900 36px monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, 256, 64);

        if (THREE && THREE.CanvasTexture) {
            const tex = new THREE.CanvasTexture(canvas);
            tex.needsUpdate = true;
            return tex;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * Creates the Boss Weakpoint Telegraphs & Reticles VFX System.
 *
 * @param {object} THREE - Three.js instance
 * @param {object} scene - Three.js Scene instance
 * @param {object} [options] - Optional configuration overrides
 * @returns {object} Controller with update(dt, krakenState, elapsedSec) and dispose()
 */
export function createBossTelegraphVFX(THREE, scene, options = {}) {
    if (!THREE || !scene) {
        throw new Error('THREE and scene are required to create Boss Telegraph VFX');
    }

    const rootGroup = new THREE.Group();
    rootGroup.name = 'BossTelegraphVFX_Root';
    scene.add(rootGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. NEON-CRIMSON DANGER RINGS POOL
    // ─────────────────────────────────────────────────────────────────────────
    // Rendered on water before Kraken tentacles slam or sweep
    const dangerRingPool = [];
    const RingGeometryClass = THREE.RingGeometry || THREE.BufferGeometry;
    const MeshBasicMatClass = THREE.MeshBasicMaterial || THREE.Material;

    for (let i = 0; i < MAX_DANGER_RINGS; i++) {
        const ringGroup = new THREE.Group();
        ringGroup.name = `DangerRingGroup_${i}`;
        ringGroup.rotation.x = -Math.PI / 2; // Flat on water surface
        ringGroup.position.y = 0.14; // Slightly above water plane

        // Outer pulsing perimeter ring
        const outerGeo = new RingGeometryClass(4.8, 5.2, 36);
        const outerMat = new MeshBasicMatClass({
            color: TELEGRAPH_COLORS.DANGER_CRIMSON,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide || 2,
            depthWrite: false,
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.name = 'OuterDangerRing';
        ringGroup.add(outerMesh);

        // Inner solid warning zone disc that expands as time elapses
        const innerGeo = new RingGeometryClass(0.1, 4.75, 36);
        const innerMat = new MeshBasicMatClass({
            color: TELEGRAPH_COLORS.DANGER_CORE,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide || 2,
            depthWrite: false,
        });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        innerMesh.name = 'InnerDangerDisc';
        ringGroup.add(innerMesh);

        // Center danger chevron/cross marker
        const crossGeo = new RingGeometryClass(0.3, 0.9, 4);
        const crossMat = new MeshBasicMatClass({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide || 2,
            depthWrite: false,
        });
        const crossMesh = new THREE.Mesh(crossGeo, crossMat);
        crossMesh.name = 'CenterMarker';
        crossMesh.rotation.z = Math.PI / 4;
        ringGroup.add(crossMesh);

        ringGroup.visible = false;
        rootGroup.add(ringGroup);

        dangerRingPool.push({
            group: ringGroup,
            outerMesh,
            innerMesh,
            crossMesh,
            outerGeo,
            innerGeo,
            crossGeo,
            outerMat,
            innerMat,
            crossMat,
            active: false,
            ringId: null,
            maxRadius: 5.5,
            currentRadius: 0.5,
            progress: 0,
            pulseTimer: 0,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GLOWING EMERALD "SMASH WEAKPOINT!" RETICLES POOL
    // ─────────────────────────────────────────────────────────────────────────
    // Flips on when a tentacle slams down and is vulnerable on the water surface
    const weakpointPool = [];

    for (let i = 0; i < MAX_WEAKPOINT_RETICLES; i++) {
        const wpGroup = new THREE.Group();
        wpGroup.name = `WeakpointReticle_${i}`;
        wpGroup.rotation.x = -Math.PI / 2;
        wpGroup.position.y = 0.2; // Above danger ring

        // Outer rotating segmented target ring
        const outerGeo = new RingGeometryClass(3.2, 3.6, 24);
        const outerMat = new MeshBasicMatClass({
            color: TELEGRAPH_COLORS.WEAKPOINT_EMERALD,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide || 2,
            depthWrite: false,
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        wpGroup.add(outerMesh);

        // Inner pulsing bullseye ring
        const innerGeo = new RingGeometryClass(1.2, 1.6, 24);
        const innerMat = new MeshBasicMatClass({
            color: TELEGRAPH_COLORS.WEAKPOINT_CORE,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide || 2,
            depthWrite: false,
        });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        wpGroup.add(innerMesh);

        // Crosshair reticle brackets (4 ticks at 90-degree offsets)
        const tickGeo = new RingGeometryClass(0.2, 2.8, 4);
        const tickMat = new MeshBasicMatClass({
            color: TELEGRAPH_COLORS.WEAKPOINT_CYAN,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide || 2,
            depthWrite: false,
        });
        const tickMesh = new THREE.Mesh(tickGeo, tickMat);
        wpGroup.add(tickMesh);

        // Core diamond / weakpoint focal point
        const coreGeo = new RingGeometryClass(0.1, 0.6, 4);
        const coreMat = new MeshBasicMatClass({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide || 2,
            depthWrite: false,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.rotation.z = Math.PI / 4;
        wpGroup.add(coreMesh);

        wpGroup.visible = false;
        rootGroup.add(wpGroup);

        weakpointPool.push({
            group: wpGroup,
            outerMesh,
            innerMesh,
            tickMesh,
            coreMesh,
            outerGeo,
            innerGeo,
            tickGeo,
            coreGeo,
            outerMat,
            innerMat,
            tickMat,
            coreMat,
            active: false,
            tentacleIndex: null,
            targetId: null,
            timer: 0,
            duration: 2.0,
            rotationAngle: 0,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. 3D FLOATING "SMASH WEAKPOINT!" CALLOUT BANNERS POOL
    // ─────────────────────────────────────────────────────────────────────────
    const bannerPool = [];
    const calloutTexture = createCalloutCanvasTexture(THREE, '⚡ SMASH WEAKPOINT! ⚡', '#00ff88');

    for (let i = 0; i < MAX_CALLOUT_BANNERS; i++) {
        let bannerMesh;
        const SpriteClass = THREE.Sprite;
        const SpriteMatClass = THREE.SpriteMaterial || THREE.Material;

        if (SpriteClass && SpriteMatClass && calloutTexture) {
            const spriteMat = new SpriteMatClass({
                map: calloutTexture,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
            });
            bannerMesh = new SpriteClass(spriteMat);
            bannerMesh.scale.set(6.0, 1.5, 1.0);
        } else {
            // Fallback for headless testing or no-canvas environments: procedural plane/box
            const fallbackGeo = new (THREE.PlaneGeometry || THREE.BufferGeometry)(5.0, 1.4);
            const fallbackMat = new MeshBasicMatClass({
                color: TELEGRAPH_COLORS.WEAKPOINT_EMERALD,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide || 2,
                depthWrite: false,
            });
            bannerMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
        }

        bannerMesh.name = `WeakpointCalloutBanner_${i}`;
        bannerMesh.visible = false;
        rootGroup.add(bannerMesh);

        bannerPool.push({
            mesh: bannerMesh,
            active: false,
            targetId: null,
            timer: 0,
            duration: 2.0,
            basePos: { x: 0, y: 3.5, z: 0 },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE LOOP
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Updates telegraph rings, weakpoint reticles, and counter-attack callouts.
     *
     * @param {number} dt - Delta time in seconds
     * @param {object} krakenState - Deterministic Kraken simulation state
     * @param {number} [elapsedSec=0] - Total accumulated combat time
     */
    function update(dt, krakenState, elapsedSec = 0) {
        if (!krakenState || !krakenState.isSpawned || krakenState.isDefeated) {
            // Hide all visuals when Kraken is absent or dead
            for (const r of dangerRingPool) {
                r.active = false;
                r.group.visible = false;
            }
            for (const w of weakpointPool) {
                w.active = false;
                w.group.visible = false;
            }
            for (const b of bannerPool) {
                b.active = false;
                b.mesh.visible = false;
            }
            return;
        }

        const time = elapsedSec || krakenState.time || 0;

        // 1. Sync & Animate Neon-Crimson Danger Rings from krakenState.telegraphRings
        const rings = krakenState.telegraphRings || [];
        for (let i = 0; i < dangerRingPool.length; i++) {
            const slot = dangerRingPool[i];
            if (i < rings.length) {
                const ringData = rings[i];
                slot.active = true;
                slot.ringId = ringData.id;
                slot.group.visible = true;

                // Position on water
                slot.group.position.x = ringData.position.x;
                slot.group.position.z = ringData.position.z;

                const progress = ringData.duration > 0
                    ? Math.min(1, Math.max(0, ringData.elapsed / ringData.duration))
                    : 1.0;
                slot.progress = progress;

                // Pulsing frequency accelerates as slam impact approaches
                const pulseSpeed = 6.0 + progress * 14.0;
                const pulse = 0.5 + 0.5 * Math.sin(time * pulseSpeed);

                // Scale inner warning zone with currentRadius / maxRadius
                const targetScale = (ringData.maxRadius || 5.5) / 5.2;
                slot.group.scale.set(targetScale, targetScale, targetScale);

                // Inner disc scales up with progress
                if (slot.innerMesh) {
                    const innerS = Math.max(0.05, progress);
                    slot.innerMesh.scale.set(innerS, innerS, 1.0);
                }

                // Dynamic opacity & colors
                if (slot.outerMat) {
                    slot.outerMat.opacity = 0.65 + pulse * 0.35;
                }
                if (slot.innerMat) {
                    slot.innerMat.opacity = 0.25 + progress * 0.5;
                }
                if (slot.crossMesh) {
                    slot.crossMesh.rotation.z = time * 2.0;
                }
            } else {
                slot.active = false;
                slot.group.visible = false;
            }
        }

        // 2. Identify vulnerable tentacles & active barnacles to flip into
        //    glowing emerald "SMASH WEAKPOINT!" target reticles & callout banners
        const vulnerableTargets = [];

        // Check tentacles in slamming / vulnerable recovery state
        if (krakenState.tentacles) {
            for (let i = 0; i < krakenState.tentacles.length; i++) {
                const t = krakenState.tentacles[i];
                // When tentacle is slamming on surface or recovering (slamProgress > 0)
                if (t.state === 'slamming' || (t.state === 'idle' && t.slamTarget && t.slamProgress > 0)) {
                    const pos = t.slamTarget || t.tipPos || t.basePos;
                    if (pos) {
                        vulnerableTargets.push({
                            id: `tentacle_vuln_${t.id || i}`,
                            type: 'tentacle',
                            index: i,
                            position: { x: pos.x, y: 0.1, z: pos.z },
                            radius: 3.5,
                            calloutText: '⚡ SMASH WEAKPOINT! ⚡',
                            color: TELEGRAPH_COLORS.WEAKPOINT_EMERALD,
                        });
                    }
                }
            }
        }

        // Check Phase 2 glowing barnacle weak-points
        if (krakenState.phase === 2 && krakenState.barnacles) {
            for (const b of krakenState.barnacles) {
                if (b.active && !b.destroyed) {
                    vulnerableTargets.push({
                        id: b.id,
                        type: 'barnacle',
                        name: b.name,
                        position: {
                            x: b.worldPos ? b.worldPos.x : (krakenState.position.x + (b.relativePos?.x || 0)),
                            y: b.worldPos ? b.worldPos.y : (krakenState.position.y + (b.relativePos?.y || 0)),
                            z: b.worldPos ? b.worldPos.z : (krakenState.position.z + (b.relativePos?.z || 0)),
                        },
                        radius: 2.2,
                        calloutText: `🎯 ${b.name || 'BARNACLE'}!`,
                        color: TELEGRAPH_COLORS.BARNACLE_AMBER,
                    });
                }
            }
        }

        // 3. Update Weakpoint Reticles Pool
        for (let i = 0; i < weakpointPool.length; i++) {
            const slot = weakpointPool[i];
            if (i < vulnerableTargets.length) {
                const target = vulnerableTargets[i];
                slot.active = true;
                slot.targetId = target.id;
                slot.group.visible = true;

                // Position on water / surface
                slot.group.position.x = target.position.x;
                slot.group.position.y = Math.max(0.18, target.position.y + 0.1);
                slot.group.position.z = target.position.z;

                // High-visibility spinning & pulsing
                slot.rotationAngle += dt * 3.5;
                if (slot.outerMesh) {
                    slot.outerMesh.rotation.z = slot.rotationAngle;
                }
                if (slot.tickMesh) {
                    slot.tickMesh.rotation.z = -slot.rotationAngle * 0.7;
                }

                const pulse = 0.8 + 0.25 * Math.sin(time * 10.0);
                const baseScale = (target.radius || 3.5) / 3.4;
                slot.group.scale.set(baseScale * pulse, baseScale * pulse, 1.0);

                if (slot.outerMat && slot.outerMat.color) {
                    slot.outerMat.color.setHex(target.color || TELEGRAPH_COLORS.WEAKPOINT_EMERALD);
                }
                if (slot.coreMesh) {
                    slot.coreMesh.rotation.z = time * 5.0;
                }
            } else {
                slot.active = false;
                slot.group.visible = false;
            }
        }

        // 4. Update 3D Floating "SMASH WEAKPOINT!" Callout Banners Pool
        for (let i = 0; i < bannerPool.length; i++) {
            const bSlot = bannerPool[i];
            if (i < vulnerableTargets.length) {
                const target = vulnerableTargets[i];
                bSlot.active = true;
                bSlot.targetId = target.id;
                bSlot.mesh.visible = true;

                // Hover above the vulnerable target with a gentle sine-wave bob
                const bob = Math.sin(time * 6.0 + i) * 0.35;
                bSlot.mesh.position.set(
                    target.position.x,
                    (target.position.y || 0) + 3.2 + bob,
                    target.position.z
                );

                // High-intensity scale pulse to catch player attention instantly
                const scalePulse = 1.0 + Math.sin(time * 8.0) * 0.08;
                bSlot.mesh.scale.set(6.0 * scalePulse, 1.5 * scalePulse, 1.0);

                if (bSlot.mesh.material) {
                    bSlot.mesh.material.opacity = 0.95;
                }
            } else {
                bSlot.active = false;
                bSlot.mesh.visible = false;
            }
        }
    }

    /**
     * Completely cleans up all meshes, geometries, and materials from scene.
     */
    function dispose() {
        for (const r of dangerRingPool) {
            r.group.visible = false;
            if (r.outerGeo) r.outerGeo.dispose?.();
            if (r.innerGeo) r.innerGeo.dispose?.();
            if (r.crossGeo) r.crossGeo.dispose?.();
            if (r.outerMat) r.outerMat.dispose?.();
            if (r.innerMat) r.innerMat.dispose?.();
            if (r.crossMat) r.crossMat.dispose?.();
            rootGroup.remove(r.group);
        }
        for (const w of weakpointPool) {
            w.group.visible = false;
            if (w.outerGeo) w.outerGeo.dispose?.();
            if (w.innerGeo) w.innerGeo.dispose?.();
            if (w.tickGeo) w.tickGeo.dispose?.();
            if (w.coreGeo) w.coreGeo.dispose?.();
            if (w.outerMat) w.outerMat.dispose?.();
            if (w.innerMat) w.innerMat.dispose?.();
            if (w.tickMat) w.tickMat.dispose?.();
            if (w.coreMat) w.coreMat.dispose?.();
            rootGroup.remove(w.group);
        }
        for (const b of bannerPool) {
            b.mesh.visible = false;
            if (b.mesh.material) b.mesh.material.dispose?.();
            rootGroup.remove(b.mesh);
        }
        if (calloutTexture) {
            calloutTexture.dispose?.();
        }
        scene.remove(rootGroup);
    }

    return {
        rootGroup,
        dangerRingPool,
        weakpointPool,
        bannerPool,
        update,
        dispose,
    };
}
