/**
 * High-Performance River Water Particle & Splash Simulation System
 * (`public/js/particles.js`)
 *
 * Implements GPU-accelerated watercraft foam wakes, expanding landing splash rings,
 * airborne droplets, and water wake emitters for players and river entities
 * (Videogame Helmet 06: Physical Common-Sense & World-Believability).
 *
 * Features:
 *   1. Ring splash bursts scaling with impact strength (heavy landings trigger up to 4 concentric rings).
 *   2. Entity water wakes for the Nokia-Vector Long Worm and 3-Legged Mud Alien when moving in water.
 *   3. Zero wake emission on dry land / Harbor City promenade.
 *   4. Zero GC allocations in frame loops via pre-allocated typed arrays.
 */

import * as THREE from 'three';
import { RIVER, PHYSICS, WATER_SURFACE_Y, headingOf } from '../../shared/game-core.js';

export const FOAM_Y = RIVER.waterLevel + 0.03;
export const FOAM_MAX = 2048;
export const RING_COUNT = 32;

/**
 * Creates the complete particle & splash system controller.
 *
 * @param {object} options
 * @param {THREE.Scene} options.scene
 * @param {number} [options.foamY]
 * @param {number} [options.foamMax]
 * @param {number} [options.ringCount]
 * @returns {object} Particle controller instance
 */
export function createRiverParticleSystem(options = {}) {
    const scene = options.scene;
    const foamY = options.foamY ?? FOAM_Y;
    const foamMax = options.foamMax ?? FOAM_MAX;
    const ringCount = options.ringCount ?? RING_COUNT;

    const foam = {
        pos: new Float32Array(foamMax * 3),
        vel: new Float32Array(foamMax * 3),
        alpha: new Float32Array(foamMax),
        size: new Float32Array(foamMax),
        base: new Float32Array(foamMax),
        life: new Float32Array(foamMax),
        maxLife: new Float32Array(foamMax).fill(1),
        next: 0,
    };

    const foamGeo = new THREE.BufferGeometry();
    foamGeo.setAttribute('position', new THREE.BufferAttribute(foam.pos, 3).setUsage(THREE.DynamicDrawUsage));
    foamGeo.setAttribute('alpha', new THREE.BufferAttribute(foam.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    foamGeo.setAttribute('size', new THREE.BufferAttribute(foam.size, 1).setUsage(THREE.DynamicDrawUsage));

    const initialScale = typeof window !== 'undefined' ? (window.innerHeight / 2) : 400;
    const foamMaterial = new THREE.ShaderMaterial({
        uniforms: { scale: { value: initialScale } },
        vertexShader: `
            attribute float alpha;
            attribute float size;
            uniform float scale;
            varying float vAlpha;
            void main() {
                vAlpha = alpha;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * scale / -mv.z;
                mv.xyz *= max(0.0, 1.0 - 3.0 * size / length(mv.xyz));
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: `
            varying float vAlpha;
            void main() {
                vec2 c = gl_PointCoord - 0.5;
                float d = dot(c, c);
                if (d > 0.25) discard;
                gl_FragColor = vec4(0.94, 0.98, 1.0, vAlpha * smoothstep(0.25, 0.04, d));
            }
        `,
        transparent: true,
        depthWrite: false,
    });

    const foamPoints = new THREE.Points(foamGeo, foamMaterial);
    foamPoints.frustumCulled = false;
    if (scene) scene.add(foamPoints);

    function emitFoam(x, y, z, vx, vy, vz, life, size) {
        const i = foam.next;
        foam.next = (i + 1) % foamMax;
        const k = i * 3;
        foam.pos[k] = x;
        foam.pos[k + 1] = y;
        foam.pos[k + 2] = z;
        foam.vel[k] = vx;
        foam.vel[k + 1] = vy;
        foam.vel[k + 2] = vz;
        foam.life[i] = foam.maxLife[i] = life;
        foam.base[i] = size;
    }

    function updateFoam(dt) {
        const drag = Math.exp(-1.8 * dt);
        for (let i = 0; i < foamMax; i++) {
            if (foam.life[i] <= 0) {
                foam.alpha[i] = 0;
                continue;
            }
            foam.life[i] -= dt;
            const k = i * 3;
            const p = foam.pos;
            const v = foam.vel;
            if (p[k + 1] > foamY) v[k + 1] -= PHYSICS.gravity * dt; // airborne droplet
            p[k] += v[k] * dt;
            p[k + 1] += v[k + 1] * dt;
            p[k + 2] += v[k + 2] * dt;
            if (p[k + 1] < foamY) {
                p[k + 1] = foamY;
                v[k + 1] = 0;
            } // droplets settle into surface foam
            v[k] *= drag;
            v[k + 2] *= drag;
            const age = 1 - Math.max(0, foam.life[i]) / foam.maxLife[i];
            foam.alpha[i] = 0.6 * (1 - age) * Math.min(1, age * 12);
            foam.size[i] = foam.base[i] * (1 + 1.6 * age);
        }
        for (const name of ['position', 'alpha', 'size']) {
            foamGeo.attributes[name].needsUpdate = true;
        }
    }

    const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
    const rings = Array.from({ length: ringCount }, () => {
        const mesh = new THREE.Mesh(
            ringGeo,
            new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0, depthWrite: false })
        );
        mesh.visible = false;
        if (scene) scene.add(mesh);
        return { mesh, t: 0, dur: 1, grow: 1 };
    });
    let nextRing = 0;

    /**
     * Triggers a splash at (x, z): expanding concentric rings plus an explosive droplet plume.
     * Scales proportionally with strength:
     *   - Light landing (< 0.8): 1 ring
     *   - Medium impact (0.8 - 1.4): 2 rings
     *   - Heavy impact (1.4 - 2.2): 3 rings
     *   - Colossal slam (> 2.2): 4 rings
     *
     * @param {number} x
     * @param {number} z
     * @param {number} [strength=1]
     */
    function splash(x, z, strength = 1) {
        const ringTotal = strength > 2.2 ? 4 : strength > 1.4 ? 3 : strength > 0.8 ? 2 : 1;
        for (let n = 0; n < ringTotal; n++) {
            const r = rings[nextRing];
            nextRing = (nextRing + 1) % ringCount;
            Object.assign(r, {
                t: -n * 0.1,
                dur: 0.9 + 0.45 * strength,
                grow: 2.2 + (2.5 + n * 0.8) * strength,
            });
            r.mesh.position.set(x, foamY + 0.01 + n * 0.002, z);
            r.mesh.visible = true;
        }

        const drops = Math.round(14 * strength);
        for (let i = 0; i < drops; i++) {
            const a = Math.random() * Math.PI * 2;
            const out = (1.5 + Math.random() * 3.5) * strength;
            emitFoam(
                x + Math.cos(a) * 0.6,
                foamY + 0.1,
                z + Math.sin(a) * 0.6,
                Math.cos(a) * out,
                (4 + Math.random() * 6) * strength,
                Math.sin(a) * out,
                0.9 + Math.random() * 0.5,
                0.22 + Math.min(0.18, strength * 0.05)
            );
        }
    }

    function updateRings(dt) {
        for (const r of rings) {
            if (!r.mesh.visible) continue;
            r.t += dt;
            const u = Math.max(0, r.t) / r.dur;
            if (u >= 1) {
                r.mesh.visible = false;
                continue;
            }
            r.mesh.scale.setScalar(0.4 + r.grow * (1 - (1 - u) ** 2));
            r.mesh.material.opacity = r.t < 0 ? 0 : 0.85 * (1 - u) ** 1.5;
        }
    }

    /**
     * V-shaped wake foam emitted from raft stern corners.
     */
    function emitRaftWake(vis, dt) {
        const { x, y, z } = vis.group.position;
        const speed = Math.abs(vis.anim.speed);
        if (y > WATER_SURFACE_Y + 0.3 || speed < 1) return;
        const f = headingOf(vis.anim.yaw);
        const dir = Math.sign(vis.anim.speed) || 1;
        vis.anim.wakeAcc = (vis.anim.wakeAcc || 0) + dt * (8 + speed * 4);
        const n = Math.floor(vis.anim.wakeAcc);
        for (let j = 0; j < n; j++) {
            vis.anim.wakeAcc -= 1;
            const back = 1.5 + speed * dt * (j / n) + Math.random() * 0.2;
            for (const side of [-1, 1]) {
                const sx = x - f.x * back * dir + -f.z * side * 0.95;
                const sz = z - f.z * back * dir + f.x * side * 0.95;
                const spread = speed * (0.22 + Math.random() * 0.08);
                emitFoam(
                    sx,
                    foamY,
                    sz,
                    -f.z * side * spread,
                    0,
                    f.x * side * spread,
                    1.4 + speed * 0.06,
                    0.28 + speed * 0.012
                );
            }
            if (speed > 8 && Math.random() < 0.5) {
                const side = Math.random() < 0.5 ? -1 : 1;
                emitFoam(
                    x + f.x * 1.6 * dir,
                    foamY + 0.15,
                    z + f.z * 1.6 * dir,
                    -f.z * side * 2.5 + f.x * speed * 0.4,
                    2 + Math.random() * 2,
                    f.x * side * 2.5 + f.z * speed * 0.4,
                    0.6,
                    0.18
                );
            }
        }
    }

    /**
     * Water wake emitter for 3-Legged Mud Alien.
     * Emits water churn only when wading in the river. Stops immediately on dry land/Harbor City.
     */
    function emitMudAlienWake(mudPos, isMoving, dt) {
        if (!isMoving) return;
        // Dry land check: Harbor City promenade is at z in [-140, -260] and x >= 12.5, or elevated y > 0.8
        const onDryLand = (mudPos.z < -140 && mudPos.z > -260 && mudPos.x > 12.5) || mudPos.y > 0.85;
        if (onDryLand) return;

        // Tripod legs churn the river surface with foaming splashes
        if (Math.random() < 0.65) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 0.8 + Math.random() * 1.2;
            const wx = mudPos.x + Math.cos(angle) * dist;
            const wz = mudPos.z + Math.sin(angle) * dist;
            emitFoam(
                wx,
                foamY,
                wz,
                Math.cos(angle) * 1.5,
                0.8 + Math.random() * 1.4,
                Math.sin(angle) * 1.5,
                1.1,
                0.24 + Math.random() * 0.1
            );
        }
    }

    /**
     * Water wake emitter for Nokia-Vector Long Worm.
     * Emits a wake ripple along the moving snake segments as they carve through the river water.
     */
    function emitLongWormWake(wormHeadPos, segments = [], dt) {
        // Check if worm is in the river
        const onDryLand = (wormHeadPos.z < -140 && wormHeadPos.z > -260 && wormHeadPos.x > 12.5) || wormHeadPos.y > 0.85;
        if (onDryLand) return;

        // Head wake churn
        emitFoam(
            wormHeadPos.x + (Math.random() - 0.5) * 1.2,
            foamY,
            wormHeadPos.z + (Math.random() - 0.5) * 1.2,
            (Math.random() - 0.5) * 1.8,
            0.6 + Math.random() * 0.8,
            (Math.random() - 0.5) * 1.8,
            1.2,
            0.26
        );

        // Periodic foam ribbons along body segments (sample every 4th segment to maintain high FPS)
        for (let s = 2; s < segments.length; s += 4) {
            const seg = segments[s];
            if (!seg) continue;
            const segWorldX = wormHeadPos.x + seg.position.x;
            const segWorldZ = wormHeadPos.z + seg.position.z;
            if (Math.random() < 0.4) {
                emitFoam(
                    segWorldX + (Math.random() - 0.5) * 0.6,
                    foamY,
                    segWorldZ + (Math.random() - 0.5) * 0.6,
                    (Math.random() - 0.5) * 0.8,
                    0.2,
                    (Math.random() - 0.5) * 0.8,
                    0.8,
                    0.20
                );
            }
        }
    }

    function setScale(scale) {
        if (foamMaterial.uniforms?.scale) {
            foamMaterial.uniforms.scale.value = scale;
        }
    }

    function dispose() {
        if (scene) {
            if (foamPoints) scene.remove(foamPoints);
            for (const r of rings) {
                if (r.mesh) scene.remove(r.mesh);
                if (r.mesh?.geometry) r.mesh.geometry.dispose();
                if (r.mesh?.material) r.mesh.material.dispose();
            }
        }
        if (foamGeo) foamGeo.dispose();
        if (foamMaterial) foamMaterial.dispose();
        if (ringGeo) ringGeo.dispose();
    }

    return {
        foam,
        rings,
        foamPoints,
        foamMaterial,
        emitFoam,
        updateFoam,
        splash,
        updateRings,
        emitRaftWake,
        emitMudAlienWake,
        emitLongWormWake,
        setScale,
        dispose,
    };
}
