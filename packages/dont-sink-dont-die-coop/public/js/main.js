import * as THREE from 'three';
import {
    RIVER, CHECKPOINTS, FINISH_Z, PHYSICS, PLAYER, ENEMY_TYPES,
    WATER_SURFACE_Y, stepWatercraftKinematics, resolveWorldBoundsAndObstacles,
    watercraftThrust, headingOf, yawOfQuaternion, throwVelocity,
    waterClarity, isInShopZone,
} from '../../shared/game-core.js';
import { createNetSocket } from './net.js';
import { createHud, createSfx } from './hud.js';
import {
    upgradeRendererAndAtmosphere,
    createAAARiverMesh,
    createAAACanyonAndCity,
    createAAAObstacleMesh,
    createAAACheckpointGate,
    createAAAFinishArch,
    createAAARaftAndCrew,
    createAAAEnemyMeshes,
    animateAAAEnemies,
    createAAANpcMesh,
} from './aaa-visuals.js';
import { createAAAFeverDirector } from './aaa-fever-director.js';

// Real Socket.io server when reachable, otherwise the in-browser loopback with AI bots.
const socket = createNetSocket();
const hud = createHud();
const sfx = createSfx();
socket.onMode((mode) => hud.setMode(mode, socket.bots));

for (const btn of document.querySelectorAll('[data-upgrade]')) {
    btn.addEventListener('click', () => socket.emit('buyUpgrade', btn.dataset.upgrade));
}

let myStats = { coins: PLAYER.startCoins, upgrades: [] };
let myColor = 0xffffff;
let myMaxHealth = PLAYER.startHealth;
let shopOpen = false;

// Setup Three.js Scene
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1400);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

upgradeRendererAndAtmosphere(renderer, scene);

// Lighting
const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffe4b5, 1.45);
directionalLight.position.set(35, 65, -45);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 260;
directionalLight.shadow.camera.left = -45;
directionalLight.shadow.camera.right = 55;
directionalLight.shadow.camera.top = 60;
directionalLight.shadow.camera.bottom = -60;
scene.add(directionalLight);
scene.add(directionalLight.target);

// --- Procedural Textures ---
function createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8b4513'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#65330e';
    for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 256, 0);
        ctx.bezierCurveTo(Math.random() * 256, 80, Math.random() * 256, 170, Math.random() * 256, 256);
        ctx.lineWidth = Math.random() * 3;
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function createWaterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1ca3ec'; ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#3cb4e7';
    for(let i=0; i<100; i++) {
        ctx.beginPath();
        ctx.arc(Math.random()*512, Math.random()*512, Math.random()*20+5, 0, Math.PI*2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 100);
    return tex;
}

const woodTex = createWoodTexture();
const waterTex = createWaterTexture();

// Materials
const vegetationMaterial = new THREE.MeshStandardMaterial({ color: 0x2a6f47, roughness: 0.78, flatShading: true });
const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, map: woodTex, roughness: 0.72 });
const paddleMaterial = new THREE.MeshStandardMaterial({ color: 0x9b5a28, map: woodTex, roughness: 0.65 });
const hammerMaterial = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.35, metalness: 0.25 });

// --- Environment (Wide 80m Tactical Co-Op River Basin & Sanctuary Archipelago) ---
const riverWidth = 80;
const playableHalfWidth = riverWidth / 2;
const riverLength = RIVER.length;

directionalLight.shadow.camera.left = -75;
directionalLight.shadow.camera.right = 85;
directionalLight.shadow.camera.top = 80;
directionalLight.shadow.camera.bottom = -80;

const { mesh: riverMesh, mat: riverShaderMat } = createAAARiverMesh(riverWidth, riverLength, waterTex);
scene.add(riverMesh);

createAAACanyonAndCity(scene, riverWidth, riverLength);

// --- Checkpoints ---
const checkpoints = [];
CHECKPOINTS.forEach((cpZ, idx) => {
    const gate = createAAACheckpointGate(riverWidth, cpZ, idx);
    scene.add(gate.group);
    checkpoints.push({ z: cpZ, active: true, gate });
});

// --- Finish Line ---
const finishLineZ = FINISH_Z;
const finishMesh = createAAAFinishArch(riverWidth, finishLineZ);
scene.add(finishMesh);
let gameWon = false;

// --- Sanctuary Platforms, Mid-River Islands & Canyon Pine Obstacles ---
const obstacles = [];

// 1. Deterministic Tactical Sanctuary Havens (Clean Stage 1 Tutorial Dock at z = -42, then Docks every ~45m downriver)
for (let zPos = -42; zPos > -(riverLength - 120); zPos -= 45) {
    // Skip placing mid-river clutter inside the calm Harbor City Marina (z = -145..-260) or across the Stage 2 Whirlpool (z = -76)
    if (Math.abs(zPos - -76) < 22) continue;
    const inHarborBasin = zPos < -145 && zPos > -260;
    const laneChoices = zPos === -42
        ? [-12]
        : inHarborBasin
            ? [-playableHalfWidth + 9, playableHalfWidth - 9]
            : [-playableHalfWidth + 10, 0, playableHalfWidth - 10];
    const laneIdx = Math.abs(Math.round(zPos / 45)) % laneChoices.length;
    const xPos = laneChoices[laneIdx] + (zPos === -42 ? 0 : (Math.random() - 0.5) * 4);
    const width = 9.5 + Math.random() * 4.5;
    const depth = 8.5 + Math.random() * 4.0;
    const height = 0.55;
    const yPos = 1.05;
    const mesh = createAAAObstacleMesh(true, width, height, depth, 0, woodMaterial, vegetationMaterial);
    mesh.position.set(xPos, yPos, zPos);
    scene.add(mesh);
    obstacles.push({
        type: 'plank',
        isSanctuary: true,
        easyRamp: true,
        mesh,
        x: xPos,
        z: zPos,
        halfW: width / 2,
        halfD: depth / 2,
        topY: yPos + height / 2 + PLAYER.restY,
    });
}

// 2. Additional Side Docks & Scenic River Trees across the 80m basin (keep first 105m unbloated for clean onboarding!)
for (let i = 0; i < 180; i++) {
    const isLeft = Math.random() > 0.5;
    const zPos = -Math.random() * (riverLength - 160) - 45;
    const isPlank = zPos < -115 && Math.random() > 0.62;

    if (isPlank) {
        const xPos = (Math.random() - 0.5) * (riverWidth - 16);
        const width = 7 + Math.random() * 4;
        const depth = 6 + Math.random() * 3.5;
        const height = 0.5;
        const yPos = 1.0 + Math.random() * 0.35;
        const mesh = createAAAObstacleMesh(true, width, height, depth, 0, woodMaterial, vegetationMaterial);
        mesh.position.set(xPos, yPos, zPos);
        scene.add(mesh);
        obstacles.push({
            type: 'plank',
            isSanctuary: true,
            mesh,
            x: xPos,
            z: zPos,
            halfW: width / 2,
            halfD: depth / 2,
            topY: yPos + height / 2 + PLAYER.restY,
        });
    } else {
        // In the first 115m, place trees ONLY on the outer riverbanks so the center channel & Stage 2 Whirlpool are crystal-clear
        const bankOnly = zPos > -115 || Math.random() < 0.78;
        const bankSpread = bankOnly
            ? (isLeft ? -playableHalfWidth + Math.random() * 5 : playableHalfWidth - Math.random() * 5)
            : (Math.random() - 0.5) * (riverWidth - 22);
        const size = 2.2 + Math.random() * 3.2;
        const mesh = createAAAObstacleMesh(false, 0, 0, 0, size, woodMaterial, vegetationMaterial);
        mesh.position.set(bankSpread, 0, zPos);
        scene.add(mesh);
        obstacles.push({
            type: 'tree',
            mesh,
            x: bankSpread,
            z: zPos,
            radius: 0.85,
        });
    }
}

// --- Enemies (AAA Boss Meshes) ---
const enemyMeshes = createAAAEnemyMeshes(woodMaterial);

for (let key in enemyMeshes) scene.add(enemyMeshes[key]);
let enemiesData = null;
const hitPulse = { whiteGuy: 0, mudAlien: 0, longWorm: 0 };
let cameraShake = 0;

/** Project a world position to CSS pixels for floating combat text. */
function toScreen(pos, lift = 2) {
    const v = new THREE.Vector3(pos.x, pos.y + lift, pos.z).project(camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
}
function popAt(pos, text, color, lift) {
    const at = toScreen(pos, lift);
    if (at) hud.pop(at, text, color);
}

socket.on('enemiesUpdate', (data) => {
    enemiesData = data;
    for(const key in data) {
        const e = data[key];
        if (e.health > 0) {
            enemyMeshes[key].visible = true;
            enemyMeshes[key].position.set(e.position.x, e.position.y, e.position.z);
            
            // Align worm to movement
            if (key === 'longWorm' && e.state === 'charging' && e.targetPos) {
                 enemyMeshes[key].lookAt(e.targetPos.x, e.position.y, e.targetPos.z);
            }
        } else {
            enemyMeshes[key].visible = false;
        }
    }
});
socket.on('enemyRespawn', (e) => { if(enemyMeshes[e.id]) enemyMeshes[e.id].visible = true; });

socket.on('enemyHit', (d) => {
    const mesh = enemyMeshes[d.id];
    if (!mesh) return;
    hitPulse[d.id] = 1;
    const mine = d.by === socket.id;
    const attacker = mine ? myRaft?.vis : otherPlayers[d.by];
    if (attacker && !mine) attacker.anim.swing = SWING_S;
    if (mesh.position.y < 2) splash(mesh.position.x, mesh.position.z, mine ? 0.7 : 0.4);
    const squeaky = mine ? myStats.upgrades.includes('weapon') : d.damage > PLAYER.baseDamage;
    if (attacker) sfx.hit(squeaky, mine ? 1 : 0.35);
    popAt(mesh.position, `-${d.damage}`, mine ? '#ffd84a' : d.by.startsWith('police') ? '#7fb2ff' : '#ffffff', 3);
});

socket.on('enemyKilled', (d) => {
    if (enemyMeshes[d.id]) popAt(enemyMeshes[d.id].position, 'KO!', '#ff9d3c', 4);
    if (d.by === socket.id) sfx.kill();
});

socket.on('waveChanged', (d) => {
    hud.toast(`WAVE ${d.wave}`);
    sfx.wave();
});

socket.on('teamWiped', (d) => {
    hud.toast(`CREW SUNK — regrouping in ${Math.round(d.respawnInMs / 1000)}s`, d.respawnInMs);
    sfx.down();
});

socket.on('scoreboard', (sb) => hud.renderScoreboard(sb, socket.id));

// --- NPCs ---
let npcMeshes = {};
socket.on('npcsUpdate', (data) => {
    data.forEach(npc => {
        if (!npcMeshes[npc.id]) {
            const mesh = createAAANpcMesh(npc.type);
            scene.add(mesh);
            npcMeshes[npc.id] = mesh;
        }
        if (npc.isDead) npcMeshes[npc.id].visible = false;
        else {
            npcMeshes[npc.id].visible = true;
            npcMeshes[npc.id].position.set(npc.position.x, npc.position.y, npc.position.z);
        }
    });
});


// --- Watercraft FX: V-shaped foam wake, splash droplets and splash rings (visual only) ---
const FOAM_Y = RIVER.waterLevel + 0.03;
const FOAM_MAX = 2000;
const foam = {
    pos: new Float32Array(FOAM_MAX * 3), vel: new Float32Array(FOAM_MAX * 3),
    alpha: new Float32Array(FOAM_MAX), size: new Float32Array(FOAM_MAX),
    base: new Float32Array(FOAM_MAX), life: new Float32Array(FOAM_MAX), maxLife: new Float32Array(FOAM_MAX).fill(1),
    next: 0,
};
const foamGeo = new THREE.BufferGeometry();
foamGeo.setAttribute('position', new THREE.BufferAttribute(foam.pos, 3).setUsage(THREE.DynamicDrawUsage));
foamGeo.setAttribute('alpha', new THREE.BufferAttribute(foam.alpha, 1).setUsage(THREE.DynamicDrawUsage));
foamGeo.setAttribute('size', new THREE.BufferAttribute(foam.size, 1).setUsage(THREE.DynamicDrawUsage));
const foamMaterial = new THREE.ShaderMaterial({
    uniforms: { scale: { value: window.innerHeight / 2 } },
    vertexShader: `attribute float alpha; attribute float size; uniform float scale; varying float vAlpha;
        void main() { vAlpha = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * scale / -mv.z;
            mv.xyz *= max(0.0, 1.0 - 3.0 * size / length(mv.xyz)); // depth bias: the sprite's lower half must not sink into the water plane
            gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vAlpha;
        void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
            gl_FragColor = vec4(0.94, 0.98, 1.0, vAlpha * smoothstep(0.25, 0.04, d)); }`,
    transparent: true, depthWrite: false,
});
const foamPoints = new THREE.Points(foamGeo, foamMaterial);
foamPoints.frustumCulled = false;
scene.add(foamPoints);

function emitFoam(x, y, z, vx, vy, vz, life, size) {
    const i = foam.next;
    foam.next = (i + 1) % FOAM_MAX;
    foam.pos.set([x, y, z], i * 3);
    foam.vel.set([vx, vy, vz], i * 3);
    foam.life[i] = foam.maxLife[i] = life;
    foam.base[i] = size;
}

function updateFoam(dt) {
    const drag = Math.exp(-1.8 * dt);
    for (let i = 0; i < FOAM_MAX; i++) {
        if (foam.life[i] <= 0) { foam.alpha[i] = 0; continue; }
        foam.life[i] -= dt;
        const k = i * 3;
        const p = foam.pos, v = foam.vel;
        if (p[k + 1] > FOAM_Y) v[k + 1] -= PHYSICS.gravity * dt; // airborne droplet
        p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
        if (p[k + 1] < FOAM_Y) { p[k + 1] = FOAM_Y; v[k + 1] = 0; } // droplets settle into surface foam
        v[k] *= drag; v[k + 2] *= drag;
        const age = 1 - Math.max(0, foam.life[i]) / foam.maxLife[i];
        foam.alpha[i] = 0.6 * (1 - age) * Math.min(1, age * 12);
        foam.size[i] = foam.base[i] * (1 + 1.6 * age);
    }
    for (const name of ['position', 'alpha', 'size']) foamGeo.attributes[name].needsUpdate = true;
}

const RING_COUNT = 24;
const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
const rings = Array.from({ length: RING_COUNT }, () => {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0, depthWrite: false }));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, t: 0, dur: 1, grow: 1 };
});
let nextRing = 0;

/** Splash at (x, z): an expanding ring (two for big hits) plus a burst of droplets. strength ≈ 0.3–1.5. */
function splash(x, z, strength = 1) {
    for (let n = 0; n < (strength > 0.8 ? 2 : 1); n++) {
        const r = rings[nextRing];
        nextRing = (nextRing + 1) % RING_COUNT;
        Object.assign(r, { t: -n * 0.12, dur: 0.9 + 0.4 * strength, grow: 2.5 + 3 * strength });
        r.mesh.position.set(x, FOAM_Y + 0.01, z);
        r.mesh.visible = true;
    }
    const drops = Math.round(14 * strength);
    for (let i = 0; i < drops; i++) {
        const a = Math.random() * Math.PI * 2;
        const out = (1.5 + Math.random() * 3) * strength;
        emitFoam(x + Math.cos(a) * 0.6, FOAM_Y + 0.1, z + Math.sin(a) * 0.6,
            Math.cos(a) * out, (4 + Math.random() * 5) * strength, Math.sin(a) * out, 0.9 + Math.random() * 0.5, 0.22);
    }
}

function updateRings(dt) {
    for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.t += dt;
        const u = Math.max(0, r.t) / r.dur;
        if (u >= 1) { r.mesh.visible = false; continue; }
        r.mesh.scale.setScalar(0.4 + r.grow * (1 - (1 - u) ** 2));
        r.mesh.material.opacity = r.t < 0 ? 0 : 0.85 * (1 - u) ** 1.5;
    }
}

/** Foam shed from both stern corners spreads outward: the raft sails on and the trail opens into a V. */
function emitWake(vis, dt) {
    const { x, y, z } = vis.group.position;
    const speed = Math.abs(vis.anim.speed);
    if (y > WATER_SURFACE_Y + 0.3 || speed < 1) return;
    const f = headingOf(vis.anim.yaw);
    const dir = Math.sign(vis.anim.speed) || 1;
    vis.anim.wakeAcc += dt * (8 + speed * 4);
    const n = Math.floor(vis.anim.wakeAcc);
    for (let j = 0; j < n; j++) {
        vis.anim.wakeAcc -= 1;
        const back = 1.5 + speed * dt * (j / n) + Math.random() * 0.2; // spread a frame's worth along the track
        for (const side of [-1, 1]) {
            const sx = x - f.x * back * dir + -f.z * side * 0.95;
            const sz = z - f.z * back * dir + f.x * side * 0.95;
            const spread = speed * (0.22 + Math.random() * 0.08);
            emitFoam(sx, FOAM_Y, sz, -f.z * side * spread, 0, f.x * side * spread, 1.4 + speed * 0.06, 0.28 + speed * 0.012);
        }
        if (speed > 8 && Math.random() < 0.5) { // bow spray when planing
            const side = Math.random() < 0.5 ? -1 : 1;
            emitFoam(x + f.x * 1.6 * dir, FOAM_Y + 0.15, z + f.z * 1.6 * dir,
                -f.z * side * 2.5 + f.x * speed * 0.4, 2 + Math.random() * 2, f.x * side * 2.5 + f.z * speed * 0.4, 0.6, 0.18);
        }
    }
}

// --- Players ---
const otherPlayers = {};
let myRaft = null; // { vis, body }
let isDead = false;
let myHealth = 100;
const raftSize = { w: 2, h: 0.5, d: 3 };
const SWING_S = 0.2;
const yAxis = new THREE.Vector3(0, 1, 0);
const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.4, roughness: 0.5 });
const propMaterial = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, metalness: 0.7, roughness: 0.3 });

// --- Unified AAA Fever-Dream Director (All 25 Wave 1 & Wave 2 Systems) ---
const feverDirector = createAAAFeverDirector({
    THREE,
    scene,
    camera,
    renderer,
    ambientLight,
    directionalLight,
    riverShaderMat,
    obstacles,
    socket,
    hud,
    sfx,
    splash,
    popAt,
    getMyRaft: () => myRaft,
    getOtherPlayers: () => otherPlayers,
    getEnemiesData: () => enemiesData,
    enemyMeshes,
    getMyStats: () => ({ ...myStats, health: myHealth, maxHealth: myMaxHealth }),
    getIsDead: () => isDead,
    riverWidth,
    onGrantCoins: (delta) => {
        const d = Number(delta);
        if (!Number.isFinite(d)) return;
        const cur = Number.isFinite(Number(myStats.coins)) ? Number(myStats.coins) : PLAYER.startCoins;
        myStats.coins = Math.max(0, Math.round(cur + d));
        hud.setStats(myStats);
    },
    onHealPlayer: (amount) => {
        const a = Number(amount);
        if (!Number.isFinite(a) || a <= 0) return;
        myHealth = Math.min(myMaxHealth, Math.round(myHealth + a));
        hud.setHealth(myHealth, myMaxHealth);
    },
    onUpgradePurchased: (item) => {
        if (item?.slot === 'armor' && myMaxHealth < 150) {
            myMaxHealth += 50;
            myHealth = Math.min(myMaxHealth, myHealth + 50);
            hud.setHealth(myHealth, myMaxHealth);
        }
        hud.setStats(myStats);
        if (myRaft?.craft) {
            reRenderMyRaft({ color: myColor, upgrades: myStats.upgrades, position: myRaft.craft.position, quaternion: myRaft.craft.quaternion });
        }
    },
});

/**
 * group (position + yaw, mirrors the physics body) → tilt (visual-only bank/pitch/bob) → multi-log hull, articulated crew, oar/mallet, motor.
 */
function createRaftMesh(color, upgrades = []) {
    const vis = createAAARaftAndCrew(
        color,
        upgrades,
        raftSize,
        woodMaterial,
        paddleMaterial,
        hammerMaterial,
        motorMaterial,
        propMaterial
    );
    scene.add(vis.group);
    return vis;
}

/** Per-frame visual life of a raft: oar strokes, articulated crew limbs, attack swing, banking, planing pitch, bob, propeller, wake. */
function animateRaft(vis, dt, t) {
    const a = vis.anim;
    const ease = (rate) => 1 - Math.exp(-rate * dt);
    const speedN = Math.min(1, Math.abs(a.speed) / 15);

    a.bank += (THREE.MathUtils.clamp(a.turn * (0.08 + 0.12 * speedN), -0.32, 0.32) - a.bank) * ease(7);
    const pitchTarget = a.airborne ? 0.12 : (a.thrust > 0 ? 0.07 : a.thrust < 0 ? -0.05 : 0) + 0.06 * speedN;
    a.pitch += (pitchTarget - a.pitch) * ease(5);
    vis.tilt.rotation.set(a.pitch + Math.sin(t * 1.7) * 0.015, 0, a.bank + Math.sin(t * 2.3 + 1) * 0.02);
    vis.tilt.position.y = a.airborne ? 0 : Math.sin(t * 2.1) * 0.04;
    vis.raft.visible = !a.airborne; // the raft goes into the inventory mid-jump

    const rowing = !a.airborne && (a.thrust !== 0 || Math.abs(a.turn) > 0.3);
    if (rowing) a.rowPhase += dt * 9 * (a.thrust < 0 ? -1 : 1);
    const p = vis.paddle;
    p.position.copy(vis.paddleHome);
    if (a.block) {
        p.position.set(0, vis.paddleHome.y - 0.25, -1.35);
        p.rotation.set(0, Math.PI / 2, 0);
    } else if (a.swing > 0) {
        a.swing = Math.max(0, a.swing - dt);
        const swingArc = Math.sin((a.swing / SWING_S) * Math.PI);
        p.rotation.set(-Math.PI * 0.42 * swingArc, -0.35 * swingArc, 0);
        p.position.z = vis.paddleHome.z - 0.45 * swingArc;
    } else if (rowing && !vis.hammer) {
        // stroke: blade dips (roll), sweeps aft (pitch), lifts out on the recovery
        p.rotation.set(Math.sin(a.rowPhase) * 0.65, 0, 0.35 + Math.cos(a.rowPhase) * 0.3);
        p.position.y = vis.paddleHome.y - 0.25 + Math.cos(a.rowPhase) * 0.2;
    } else {
        p.rotation.x *= 1 - ease(10);
        p.rotation.y *= 1 - ease(10);
        p.rotation.z *= 1 - ease(10);
    }

    // Articulated crew limb animation
    if (vis.rig) {
        const { headGroup, leftArm, rightArm, leftLeg, rightLeg } = vis.rig;
        headGroup.rotation.y = THREE.MathUtils.clamp(-a.turn * 0.22, -0.45, 0.45);
        if (a.block) {
            leftArm.rotation.set(-1.1, 0.3, 0.4);
            rightArm.rotation.set(-1.1, -0.3, -0.4);
        } else if (a.swing > 0) {
            const s = Math.sin((a.swing / SWING_S) * Math.PI);
            rightArm.rotation.set(-1.4 * s + 0.4, 0, -0.35);
            leftArm.rotation.set(-0.6 * s + 0.3, 0, 0.25);
        } else if (rowing) {
            rightArm.rotation.x = 0.45 + Math.sin(a.rowPhase) * 0.55;
            leftArm.rotation.x = 0.45 + Math.sin(a.rowPhase) * 0.35;
        } else {
            rightArm.rotation.x = 0.45 + Math.sin(t * 2.2) * 0.06;
            leftArm.rotation.x = 0.35 + Math.cos(t * 2.2) * 0.06;
        }
        const legTuck = a.airborne ? 0.55 : 0;
        leftLeg.rotation.x = legTuck;
        rightLeg.rotation.x = -legTuck * 0.6;
    }

    if (vis.prop) {
        a.propAngle += dt * (8 + Math.abs(a.speed) * 2.5 + (a.thrust > 0 ? 25 : 0));
        vis.prop.rotation.z = a.propAngle;
        if (a.thrust > 0 && !a.airborne && Math.random() < dt * 30) {
            const f = headingOf(a.yaw);
            const { x, z } = vis.group.position;
            emitFoam(x - f.x * 2.2, FOAM_Y + 0.05, z - f.z * 2.2, -f.x * 3 + (Math.random() - 0.5), 1.5 * Math.random(), -f.z * 3 + (Math.random() - 0.5), 0.8, 0.25);
        }
    }
    if (vis.group.visible) emitWake(vis, dt);
}

function reRenderMyRaft(p) {
    if (myRaft?.vis) scene.remove(myRaft.vis.group);
    const vis = createRaftMesh(p.color, p.upgrades);
    const craft = myRaft?.craft ?? {
        position: new THREE.Vector3(p.position.x, p.position.y, p.position.z),
        velocity: new THREE.Vector3(0, 0, 0),
        angularVelocity: { x: 0, y: 0, z: 0 },
        yaw: yawOfQuaternion(p.quaternion ?? { y: 0, w: 1 }),
        quaternion: new THREE.Quaternion(p.quaternion?.x ?? 0, p.quaternion?.y ?? 0, p.quaternion?.z ?? 0, p.quaternion?.w ?? 1),
    };
    vis.group.position.copy(craft.position);
    vis.group.quaternion.setFromAxisAngle(yAxis, craft.yaw);
    vis.group.visible = !isDead;
    myRaft = { vis, craft };
}

function setRemoteTarget(vis, p) {
    vis.target = { x: p.position.x, y: p.position.y, z: p.position.z, yaw: yawOfQuaternion(p.quaternion ?? { y: 0, w: 1 }), at: performance.now() };
}

function createRemote(p) {
    const vis = createRaftMesh(p.color, p.upgrades);
    vis.group.position.set(p.position.x, p.position.y, p.position.z);
    vis.anim.yaw = yawOfQuaternion(p.quaternion ?? { y: 0, w: 1 });
    vis.group.visible = !p.isDead;
    setRemoteTarget(vis, p);
    otherPlayers[p.id] = vis;
    return vis;
}

let onSolid = false;

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        const p = players[id];
        if (id !== socket.id) { createRemote(p); return; }
        myStats.coins = p.coins;
        myStats.upgrades = p.upgrades;
        myColor = p.color;
        myMaxHealth = p.maxHealth;
        hud.setStats(myStats);
        hud.setHealth(p.health, p.maxHealth);

        const yaw = yawOfQuaternion(p.quaternion ?? { y: 0, w: 1 });
        const craft = {
            position: new THREE.Vector3(p.position.x, p.position.y, p.position.z),
            velocity: new THREE.Vector3(0, 0, 0),
            angularVelocity: { x: 0, y: 0, z: 0 },
            yaw,
            quaternion: new THREE.Quaternion().setFromAxisAngle(yAxis, yaw),
        };
        myRaft = { vis: null, craft };
        reRenderMyRaft(p);
    });
});

socket.on('newPlayer', (p) => createRemote(p));

socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id].group);
        delete otherPlayers[id];
    }
});

socket.on('playerMoved', (p) => {
    const vis = otherPlayers[p.id];
    if (!vis) return;
    const prev = vis.target;
    setRemoteTarget(vis, p);
    const dt = (vis.target.at - prev.at) / 1000;
    if (dt > 0.005 && dt < 0.5) {
        const f = headingOf(vis.target.yaw);
        const fwd = ((vis.target.x - prev.x) * f.x + (vis.target.z - prev.z) * f.z) / dt;
        const dYaw = Math.atan2(Math.sin(vis.target.yaw - prev.yaw), Math.cos(vis.target.yaw - prev.yaw)) / dt;
        vis.anim.speed += (fwd - vis.anim.speed) * 0.5;
        vis.anim.turn += (dYaw - vis.anim.turn) * 0.5;
        vis.anim.thrust = Math.abs(vis.anim.speed) > 1.5 ? Math.sign(vis.anim.speed) : 0;
    }
});

socket.on('playerHealthUpdate', (data) => {
    if (data.id === socket.id) {
        myHealth = data.health;
        if (data.maxHealth) myMaxHealth = data.maxHealth;
        if (!isDead) hud.setHealth(myHealth, myMaxHealth);
        if (data.damage > 0) {
            hud.flashDamage(data.blocked ? 0 : data.damage / 40);
            cameraShake = data.blocked ? 0.15 : 0.5;
            sfx.hurt(data.blocked);
            if (myRaft) {
                const at = myRaft.vis.group.position;
                popAt(at, data.blocked ? `BLOCK -${data.damage}` : `-${data.damage}`, '#ff5a5a', 2.5);
                splash(at.x, at.z, data.blocked ? 0.4 : 0.9);
            }
        }
    } else if (data.damage > 0 && otherPlayers[data.id]) {
        const at = otherPlayers[data.id].group.position;
        popAt(at, `-${data.damage}`, '#ff8a8a', 2.5);
        splash(at.x, at.z, 0.6);
    }
});

socket.on('playerStatsUpdate', (p) => {
    if (Number.isFinite(Number(p?.coins))) {
        myStats.coins = Math.max(0, Math.round(Number(p.coins)));
    }
    if (Array.isArray(p?.upgrades)) {
        for (const u of p.upgrades) {
            if (!myStats.upgrades.includes(u)) myStats.upgrades.push(u);
        }
    }
    hud.setStats(myStats);
});

socket.on('upgradePurchased', () => {
    reRenderMyRaft({ color: myColor, upgrades: myStats.upgrades });
});

socket.on('playerUpgraded', (d) => {
    const old = otherPlayers[d.id];
    if (!old) return;
    const vis = createRaftMesh(d.color, d.upgrades);
    vis.group.position.copy(old.group.position);
    vis.group.quaternion.copy(old.group.quaternion);
    vis.group.visible = old.group.visible;
    Object.assign(vis.anim, old.anim);
    vis.target = old.target;
    scene.remove(old.group);
    otherPlayers[d.id] = vis;
});

socket.on('playerDied', (id) => {
    if (id === socket.id) {
        isDead = true;
        hud.setStatus('DEAD — spectating', 'var(--bad)');
        hud.toast('YOU SANK — reach a checkpoint, crew!');
        sfx.down();
        if (myRaft) myRaft.vis.group.visible = false;
    } else if (otherPlayers[id]) {
        otherPlayers[id].group.visible = false;
    }
});

socket.on('playerRevived', (p) => {
    if (p.id === socket.id) {
        isDead = false;
        myHealth = p.health;
        hud.setStatus('');
        hud.setHealth(myHealth, myMaxHealth);
        if (myRaft?.craft) {
            myRaft.vis.group.visible = true;
            myRaft.craft.position.set(0, 5, p.position.z);
            myRaft.craft.velocity.set(0, 0, 0);
        }
    } else if (otherPlayers[p.id]) {
        const vis = otherPlayers[p.id];
        vis.group.visible = true;
        setRemoteTarget(vis, p);
        vis.group.position.set(p.position.x, p.position.y, p.position.z);
    }
});

// --- River Mage (whiteGuy) Telekinetic Grab -> Slow Spin -> Violent Throw State & 3D Arcane Beam ---
const mageTelekinesisGroup = new THREE.Group();
mageTelekinesisGroup.visible = false;
const mageBeamGeo = new THREE.CylinderGeometry(0.18, 0.42, 1.0, 12, 1, true);
mageBeamGeo.translate(0, 0.5, 0);
mageBeamGeo.rotateX(Math.PI / 2);
const mageBeamMat = new THREE.MeshBasicMaterial({
    color: 0x45f3ff,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
});
const mageBeamMesh = new THREE.Mesh(mageBeamGeo, mageBeamMat);
const mageRuneRingMesh = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.12, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.85 })
);
mageRuneRingMesh.rotation.x = Math.PI / 2;
mageTelekinesisGroup.add(mageBeamMesh, mageRuneRingMesh);
scene.add(mageTelekinesisGroup);

const mageGrab = {
    active: false,
    elapsed: 0,
    duration: 1.35,
    force: null,
    cooldownUntil: 0,
};

socket.on('playerThrown', (data) => {
    if (data.id === socket.id && myRaft?.craft && !isDead) {
        if (!mageGrab.active) {
            mageGrab.active = true;
            mageGrab.elapsed = 0;
            mageGrab.duration = 1.35;
            mageGrab.force = data.force;
            mageTelekinesisGroup.visible = true;
            myRaft.craft.velocity.set(0, 0, 0);
            splash(myRaft.craft.position.x, myRaft.craft.position.z, 0.9);
            sfx.wave?.();
            hud.toast('🧙‍♂️ MAGE TELEKINESIS! GRABBED & SPINNING UP...', 1700);
            popAt(myRaft.craft.position, '🧙‍♂️ TELEKINETIC GRAB!', '#45f3ff', 3.4);
        }
    }
});

socket.on('gameWon', () => {
    gameWon = true;
    hud.setStatus('YOU WIN! CO-OP ESCAPE!', 'var(--ok)');
    sfx.kill();
    document.getElementById('win').hidden = false;
    feverDirector.onGameWon();
});

// --- Intro Sequence (short 1.2s swoop into High-Angle Co-Op Diorama View, immediately skippable on any movement input) ---
let inIntroSequence = true;
let introTime = 0;
const introDuration = 1200;
const introCameraStartOffset = new THREE.Vector3(12, 26, 28);
const introCameraEndOffset = new THREE.Vector3(0, 18, 22);

// --- Controls & Combat ---
const keys = { w: false, a: false, s: false, d: false, space: false };
let isAttacking = false;
let isBlocking = false;

// High-Angle Tactical Co-Op Diorama Camera (~45° overhead angle, wide river visibility, scroll-wheel zoom & dynamic crew framing)
const CAM = { pitch: 0.78, minPitch: 0.25, maxPitch: 1.32, distance: 26, minDistance: 14, maxDistance: 48, stiffness: 9, follow: 3.5, recenterDelayMs: 1400, recenter: 2.2 };
const cam = {
    yaw: 0, orbit: 0, pitch: CAM.pitch, lastInput: -Infinity, live: false,
    vel: new THREE.Vector3(), look: new THREE.Vector3(), fov: camera.fov,
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

window.addEventListener('contextmenu', (e) => e.preventDefault());

const unlockAudio = () => sfx.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Keep the mouse cursor ALWAYS visible (never requestPointerLock on double-click) and support scroll-wheel tactical zoom
window.addEventListener('wheel', (e) => {
    if (feverDirector.armoryShop.isOpen()) return;
    CAM.distance = THREE.MathUtils.clamp(CAM.distance + Math.sign(e.deltaY) * 2.5, CAM.minDistance, CAM.maxDistance);
}, { passive: true });

document.addEventListener('mousemove', (e) => {
    const dragging = (e.buttons & 2) || (e.buttons & 4) || document.pointerLockElement === document.body;
    if (!dragging) return;
    if ((!e.movementX && !e.movementY) || Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
    const sensitivity = 0.003;
    cam.orbit = wrapAngle(cam.orbit - e.movementX * sensitivity);
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * sensitivity, CAM.minPitch, CAM.maxPitch);
    cam.lastInput = performance.now();
});

function triggerAttack() {
    if (isDead || shopOpen || !myRaft || isBlocking) return;
    inIntroSequence = false;
    isAttacking = true;
    myRaft.vis.anim.swing = SWING_S;
    feverDirector.onPlayerAttack();
    if (enemiesData) {
        for (const key in enemiesData) {
            if (enemiesData[key].health > 0 && myRaft.vis.group.position.distanceTo(enemyMeshes[key].position) < PLAYER.attackRange) {
                socket.emit('playerHitEnemy', { enemyId: key });
            }
        }
    }
    setTimeout(() => { isAttacking = false; }, 200);
}

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'm') hud.toast(sfx.toggle() ? 'SOUND OFF' : 'SOUND ON', 800);
    if (k === 'arrowup') keys.w = true;
    if (k === 'arrowdown') keys.s = true;
    if (k === 'arrowleft') keys.a = true;
    if (k === 'arrowright') keys.d = true;
    if (Object.hasOwn(keys, k)) {
        keys[k] = true;
        inIntroSequence = false;
    }
    if (e.key === ' ') {
        keys.space = true;
        inIntroSequence = false;
        e.preventDefault();
    }
    if (k === 'f') triggerAttack();
    if (k === 'shift') {
        if (!isBlocking) feverDirector.onBlockPressed(performance.now());
        isBlocking = true;
    }
    if (k === 'e') {
        if (feverDirector.armoryShop.isOpen()) {
            feverDirector.armoryShop.close();
            shopOpen = false;
        } else if (myRaft?.craft) {
            try { document.exitPointerLock?.(); } catch (_err) { /* ignore */ }
            hud.setStats(myStats);
            feverDirector.armoryShop.updatePlayerData({ coins: myStats.coins, upgrades: myStats.upgrades, isDead });
            feverDirector.armoryShop.open();
            shopOpen = true;
        }
    }
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup') keys.w = false;
    if (k === 'arrowdown') keys.s = false;
    if (k === 'arrowleft') keys.a = false;
    if (k === 'arrowright') keys.d = false;
    if (Object.hasOwn(keys, k)) keys[k] = false;
    if (e.key === ' ') keys.space = false;
    if (k === 'shift') isBlocking = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; isBlocking = false; });

window.addEventListener('mousedown', (e) => {
    if (e.target?.closest?.('#shop') || e.target?.closest?.('#armory-overlay') || e.target?.closest?.('#title-menu-root')) return;
    if (isDead || shopOpen || feverDirector.armoryShop.isOpen() || !myRaft) return;
    if (e.button === 0) {
        triggerAttack();
    } else if (e.button === 2) {
        inIntroSequence = false;
        feverDirector.onBlockPressed(performance.now());
        isBlocking = true;
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isBlocking = false;
});

// --- Game Loop (100% Pure Kinematic Arcade Physics — Zero Cannon-es) ---
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 6;
const clock = new THREE.Clock();
const muddyColor = new THREE.Color('#5c4a3d');
const clearColor = new THREE.Color('#0f5e9c');
let accumulator = 0;
let lastSync = 0;
let lastEnemyHit = 0;
let lastHud = 0;
let wasAirborne = false;

let sanctuaryHealAccum = 0;

function fixedStep() {
    if (!myRaft?.craft || feverDirector.isPaused()) return;
    const craft = myRaft.craft;
    shopOpen = feverDirector.armoryShop.isOpen();
    if (inIntroSequence) {
        craft.velocity.set(0, 0, 0);
        craft.angularVelocity.y = 0;
    }
    const live = !isDead && !inIntroSequence;
    // Deliberate Expedition Pacing:
    // - Harbor City Calm Basin (z = -135..-275) & Sanctuary Platforms (onSolid) have 0 m/s passive drift so you can chill, shop, and think!
    // - Holding [S] drops anchor (0 drift); open river has gentle 0.28x current so co-op positioning matters more than frantic reflexes.
    const inCalmHarbor = craft.position.z < -135 && craft.position.z > -275;
    const currentScale = inCalmHarbor || onSolid || keys.s || shopOpen ? 0 : 0.28;
    const input = live
        ? { ...keys, upgrades: myStats.upgrades, attacking: isAttacking, onSolid, currentScale }
        : { onSolid, currentScale: 0 };
    const { jumped, impact } = stepWatercraftKinematics(craft, input, FIXED_DT);
    const col = resolveWorldBoundsAndObstacles(craft, obstacles, { channelHalfWidth: playableHalfWidth });
    onSolid = col.onSolid;

    // River Mage Telekinetic Grab -> Slow Accelerating Spin in Mid-Air -> Violent Hurl!
    if (live && mageGrab.active) {
        mageGrab.elapsed += FIXED_DT;
        const progress = Math.min(1, mageGrab.elapsed / mageGrab.duration);
        const magePos = enemyMeshes.whiteGuy?.visible ? enemyMeshes.whiteGuy.position : null;

        if (mageGrab.elapsed < mageGrab.duration) {
            // Phase 1: Lift raft into mid-air, hold in arcane orbit & spin from slow to furious!
            onSolid = false;
            const targetY = 2.85 + Math.sin(mageGrab.elapsed * 7.0) * 0.25;
            craft.position.y = THREE.MathUtils.lerp(craft.position.y, targetY, FIXED_DT * 6.5);
            if (magePos) {
                const orbitAngle = mageGrab.elapsed * (1.8 + progress * 2.4);
                const orbitX = magePos.x + Math.cos(orbitAngle) * 4.8;
                const orbitZ = magePos.z + Math.sin(orbitAngle) * 4.8;
                craft.position.x = THREE.MathUtils.lerp(craft.position.x, orbitX, FIXED_DT * 3.8);
                craft.position.z = THREE.MathUtils.lerp(craft.position.z, orbitZ, FIXED_DT * 3.8);
            }
            craft.velocity.set(0, 0, 0);
            // Starts as a slow telekinetic spin and accelerates into a rapid whirl before release
            const spinSpeed = 2.4 + progress * progress * 15.0;
            craft.yaw += spinSpeed * FIXED_DT;
            craft.angularVelocity.y = spinSpeed;
            if (myRaft?.vis?.tilt) {
                myRaft.vis.tilt.rotation.z = Math.sin(mageGrab.elapsed * 10) * 0.28;
                myRaft.vis.tilt.rotation.x = Math.cos(mageGrab.elapsed * 8) * 0.22;
            }
            // Update 3D Arcane Beam & Rune Ring
            mageTelekinesisGroup.visible = true;
            mageRuneRingMesh.position.set(craft.position.x, craft.position.y - 0.15, craft.position.z);
            mageRuneRingMesh.rotation.z = mageGrab.elapsed * 8.0;
            if (magePos) {
                const staffTip = new THREE.Vector3(magePos.x, magePos.y + 3.1, magePos.z);
                const raftCenter = new THREE.Vector3(craft.position.x, craft.position.y + 0.4, craft.position.z);
                const dist = staffTip.distanceTo(raftCenter);
                mageBeamMesh.visible = true;
                mageBeamMesh.position.copy(staffTip);
                mageBeamMesh.lookAt(raftCenter);
                mageBeamMesh.scale.set(1, 1, Math.max(0.5, dist));
            } else {
                mageBeamMesh.visible = false;
            }
        } else {
            // Phase 2: Release &Violently Hurl the Raft Across the River!
            mageGrab.active = false;
            mageGrab.cooldownUntil = performance.now() + 2600;
            mageTelekinesisGroup.visible = false;
            const v = throwVelocity(mageGrab.force || { x: 400, y: 800, z: -400 });
            const dirX = Math.abs(v.x) < 5 ? (craft.position.x >= 0 ? -12 : 12) : v.x * 1.5;
            const dirZ = Math.abs(v.z) < 5 ? -14 : v.z * 1.5;
            craft.velocity.set(dirX, Math.max(14.5, v.y * 1.2), dirZ);
            splash(craft.position.x, craft.position.z, 1.5);
            sfx.splash(1.2);
            cameraShake = Math.max(cameraShake, 0.35);
            popAt(craft.position, '☄️ HURLED BY THE MAGE!', '#c084fc', 3.8);
        }
    }

    craft.quaternion.setFromAxisAngle(yAxis, craft.yaw);

    // Sanctuary Platform & Harbor Haven passive hull repair (+3 HP/sec while resting on a platform or in the Harbor City)
    if (live && (onSolid || inCalmHarbor) && myHealth < myMaxHealth) {
        sanctuaryHealAccum += FIXED_DT * 3.0;
        if (sanctuaryHealAccum >= 1) {
            const healPts = Math.floor(sanctuaryHealAccum);
            sanctuaryHealAccum -= healPts;
            myHealth = Math.min(myMaxHealth, myHealth + healPts);
            hud.setHealth(myHealth, myMaxHealth);
        }
    }

    // Keep AI companion bots from abandoning the player when the human stops at a Sanctuary Platform or the Harbor City
    if (live && (onSolid || inCalmHarbor || !keys.w)) {
        for (const vis of Object.values(otherPlayers)) {
            if (vis?.target && vis.target.z < craft.position.z - 10) {
                vis.target.z = THREE.MathUtils.lerp(vis.target.z, craft.position.z - 4, FIXED_DT * 3.5);
                vis.target.x = THREE.MathUtils.lerp(vis.target.x, craft.position.x + (vis === Object.values(otherPlayers)[0] ? -6 : 6), FIXED_DT * 2.5);
            }
        }
    }

    if (live) {
        feverDirector.fixedStep(FIXED_DT, performance.now());
    }

    if (jumped) { splash(craft.position.x, craft.position.z, 0.8); sfx.splash(0.6); }
    if (impact !== null && wasAirborne && impact > 4) {
        const s = Math.min(1.5, impact / 15);
        splash(craft.position.x, craft.position.z, s);
        sfx.splash(s);
        cameraShake = Math.max(cameraShake, 0.12 * s);
    }
    wasAirborne = craft.position.y > WATER_SURFACE_Y + PHYSICS.surfaceSnap && !onSolid;
}

function updateLocalRaft(dt, now) {
    const { craft, vis } = myRaft;
    const yaw = craft.yaw;
    const f = headingOf(yaw);
    vis.group.position.copy(craft.position);
    vis.group.quaternion.copy(craft.quaternion);
    Object.assign(vis.anim, {
        yaw,
        speed: craft.velocity.x * f.x + craft.velocity.z * f.z,
        turn: craft.angularVelocity.y,
        thrust: isDead ? 0 : Math.sign(watercraftThrust(keys, myStats.upgrades, isAttacking)),
        airborne: wasAirborne,
        block: isBlocking,
    });

    if (isDead || inIntroSequence) return;

    if (enemiesData && now - lastEnemyHit > PLAYER.hitCooldownMs && !mageGrab.active && performance.now() > mageGrab.cooldownUntil) {
        for (const key in enemiesData) {
            const enemy = enemiesData[key];
            // Give the River Mage (whiteGuy) an 8.5m telekinetic staff grab reach at water level
            const reach = key === 'whiteGuy' ? 8.5 : ENEMY_TYPES[key].hitRadius;
            if (enemy.health > 0 && vis.group.position.distanceTo(enemyMeshes[key].position) < reach) {
                const parryCheck = feverDirector.resolvePlayerHit(enemy.damage, enemy.type, performance.now());
                if (!parryCheck.parried) {
                    socket.emit('enemyHitPlayer', { playerId: socket.id, damage: enemy.damage, enemyType: enemy.type, isBlocking });
                }
                lastEnemyHit = now;
            }
        }
    }
    for (let idx = 0; idx < checkpoints.length; idx++) {
        const cp = checkpoints[idx];
        if (cp.active && craft.position.z < cp.z) {
            cp.active = false;
            cp.gate?.markCrossed();
            socket.emit('checkpointCrossed', { checkpointZ: cp.z });
            feverDirector.onCheckpointCrossed(cp.z, idx);
        }
    }
    if (!gameWon && craft.position.z < finishLineZ) {
        gameWon = true;
        socket.emit('crossedFinishLine');
    }
    if (now - lastSync > 1000 / 30) {
        socket.emit('playerMovement', {
            position: { x: craft.position.x, y: craft.position.y, z: craft.position.z },
            quaternion: { x: craft.quaternion.x, y: craft.quaternion.y, z: craft.quaternion.z, w: craft.quaternion.w },
        });
        lastSync = now;
    }
}

function updateRemote(vis, dt) {
    const t = vis.target;
    if (!t) return;
    const k = 1 - Math.exp(-14 * dt);
    vis.group.position.x += (t.x - vis.group.position.x) * k;
    vis.group.position.y += (t.y - vis.group.position.y) * k;
    vis.group.position.z += (t.z - vis.group.position.z) * k;
    vis.anim.yaw += wrapAngle(t.yaw - vis.anim.yaw) * k;
    vis.group.quaternion.setFromAxisAngle(yAxis, vis.anim.yaw);
    vis.anim.airborne = vis.group.position.y > WATER_SURFACE_Y + 0.3;
    if (performance.now() - t.at > 300) { vis.anim.speed *= 1 - k; vis.anim.turn *= 1 - k; vis.anim.thrust = 0; }
}

function updateCamera(dt) {
    const target = myRaft.vis.group.position;
    if (inIntroSequence) {
        const progress = Math.min(1, introTime / introDuration);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
        const offset = new THREE.Vector3().lerpVectors(introCameraStartOffset, introCameraEndOffset, eased);
        camera.position.copy(offset.applyMatrix4(myRaft.vis.group.matrixWorld));
        camera.lookAt(target);
        cam.look.copy(target);
        cam.yaw = myRaft.vis.anim.yaw;
        return;
    }

    const speed = Math.hypot(myRaft.craft.velocity.x, myRaft.craft.velocity.z);
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (isDead) {
        desired.set(0, 55, target.z + 25);
        look.set(0, 0, target.z - 15);
    } else {
        cam.yaw += wrapAngle(myRaft.vis.anim.yaw - cam.yaw) * (1 - Math.exp(-CAM.follow * dt));
        if (performance.now() - cam.lastInput > CAM.recenterDelayMs) {
            const k = Math.exp(-CAM.recenter * dt);
            cam.orbit *= k;
            cam.pitch = CAM.pitch + (cam.pitch - CAM.pitch) * k;
        }
        const yaw = cam.yaw + cam.orbit;
        // Dynamic Co-Op Crew Framing: expand camera height/distance and shift look centroid toward visible teammates
        // so you can see the wide river, side Sanctuary Platforms, and feel your crew sailing together!
        let crewCentroidX = target.x;
        let crewCentroidZ = target.z;
        let maxCrewSpread = 0;
        let visibleCrewCount = 0;
        for (const vis of Object.values(otherPlayers)) {
            if (!vis?.group?.visible) continue;
            const d = Math.hypot(vis.group.position.x - target.x, vis.group.position.z - target.z);
            if (d < 65) {
                crewCentroidX += vis.group.position.x;
                crewCentroidZ += vis.group.position.z;
                visibleCrewCount++;
                if (d > maxCrewSpread) maxCrewSpread = d;
            }
        }
        if (visibleCrewCount > 0) {
            crewCentroidX /= (visibleCrewCount + 1);
            crewCentroidZ /= (visibleCrewCount + 1);
        }
        const focusX = THREE.MathUtils.lerp(target.x, crewCentroidX, 0.32);
        const focusZ = THREE.MathUtils.lerp(target.z, crewCentroidZ, 0.28);
        const coopZoomBonus = Math.min(16, maxCrewSpread * 0.35);
        const dist = CAM.distance + coopZoomBonus + speed * 0.18;
        desired.set(
            focusX + dist * Math.cos(cam.pitch) * Math.sin(yaw),
            target.y + 3.0 + dist * Math.sin(cam.pitch),
            focusZ + dist * Math.cos(cam.pitch) * Math.cos(yaw),
        );
        const f = headingOf(myRaft.vis.anim.yaw);
        look.set(focusX + f.x * 5, target.y + 0.8, focusZ + f.z * 5);
    }

    if (!cam.live) { camera.position.copy(desired); cam.vel.set(0, 0, 0); cam.look.copy(look); cam.live = true; }
    const w = CAM.stiffness;
    for (let left = dt; left > 1e-6; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120);
        const ax = w * w * (desired.x - camera.position.x) - 2 * w * cam.vel.x;
        const ay = w * w * (desired.y - camera.position.y) - 2 * w * cam.vel.y;
        const az = w * w * (desired.z - camera.position.z) - 2 * w * cam.vel.z;
        cam.vel.x += ax * h; cam.vel.y += ay * h; cam.vel.z += az * h;
        camera.position.addScaledVector(cam.vel, h);
    }
    camera.position.y = Math.max(camera.position.y, RIVER.waterLevel + 0.8);
    cam.look.lerp(look, 1 - Math.exp(-12 * dt));
    camera.lookAt(cam.look);

    const fov = 72 + Math.min(12, speed * 0.5);
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix(); }

    if (cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * cameraShake;
        camera.position.y += (Math.random() - 0.5) * cameraShake;
        cameraShake = Math.max(0, cameraShake - dt * 2);
    }
}

function updateHud(now) {
    if (!myRaft?.craft || now - lastHud < 100) return;
    lastHud = now;
    const { velocity: v, position: p, yaw } = myRaft.craft;
    hud.setTelemetry({
        speed: Math.hypot(v.x, v.z),
        heading: (((-yaw * 180) / Math.PI) % 360 + 360) % 360,
        z: p.z,
        altitude: p.y - WATER_SURFACE_Y,
        crew: Object.entries(otherPlayers).filter(([, vis]) => vis.group.visible).map(([id, vis]) => ({ id, z: vis.group.position.z })),
        dead: isDead,
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const now = Date.now();
    const t = clock.elapsedTime;

    accumulator = Math.min(accumulator + delta, MAX_SUBSTEPS * FIXED_DT);
    while (accumulator >= FIXED_DT) {
        fixedStep();
        accumulator -= FIXED_DT;
    }

    if (myRaft && inIntroSequence) {
        introTime += delta * 1000;
        if (introTime > introDuration) inIntroSequence = false;
    }

    waterTex.offset.y -= delta * 0.5;
    riverShaderMat.uniforms.uTime.value = t;
    if (myRaft?.craft) {
        riverShaderMat.uniforms.uClarity.value = waterClarity(myRaft.craft.position.z);
        directionalLight.position.set(myRaft.craft.position.x + 35, 65, myRaft.craft.position.z + 25);
        directionalLight.target.position.copy(myRaft.craft.position);
        updateLocalRaft(delta, now);
        animateRaft(myRaft.vis, delta, t);
    }
    for (const vis of Object.values(otherPlayers)) {
        updateRemote(vis, delta);
        animateRaft(vis, delta, t);
    }

    animateAAAEnemies(enemyMeshes, enemiesData, t);
    for (const key in hitPulse) {
        hitPulse[key] = Math.max(0, hitPulse[key] - delta * 5);
        enemyMeshes[key].scale.setScalar(1 + 0.35 * hitPulse[key]);
    }
    updateFoam(delta);
    updateRings(delta);
    feverDirector.update(delta, t, performance.now());

    if (myRaft?.vis && !feverDirector.photoAndAwards.isActive()) updateCamera(delta);
    updateHud(now);
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    foamMaterial.uniforms.scale.value = window.innerHeight / 2;
});

if (typeof window !== 'undefined') {
    window.__GAME_QA__ = {
        THREE,
        scene,
        camera,
        renderer,
        getMyRaft: () => myRaft,
        getOtherPlayers: () => otherPlayers,
        getEnemiesData: () => enemiesData,
        getMyStats: () => myStats,
        getMageGrab: () => mageGrab,
        feverDirector,
    };
}

animate();
