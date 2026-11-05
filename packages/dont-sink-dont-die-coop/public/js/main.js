import * as THREE from 'three';
import {
    RIVER, CHECKPOINTS, FINISH_Z, PHYSICS, PLAYER, ENEMY_TYPES,
    WATER_SURFACE_Y, stepWatercraftKinematics, resolveWorldBoundsAndObstacles,
    watercraftThrust, headingOf, yawOfQuaternion, throwVelocity,
    waterClarity, isInShopZone,
} from '../../shared/game-core.js';
import { createNetSocket } from './net.js';
import { createHud, createSfx } from './hud.js';

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
scene.background = new THREE.Color(0x87CEEB); 
scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

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
const riverMaterial = new THREE.MeshStandardMaterial({ color: 0x1ca3ec, map: waterTex, flatShading: true });
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22, flatShading: true }); 
const vegetationMaterial = new THREE.MeshStandardMaterial({ color: 0x2e8b57, flatShading: true }); // SeaGreen
const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, map: woodTex, flatShading: true });
const checkpointMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 });
const whiteGuyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
const wizardHatMaterial = new THREE.MeshStandardMaterial({ color: 0x3333aa, flatShading: true });
const mudAlienMaterial = new THREE.MeshStandardMaterial({ color: 0x654321, flatShading: true });
const longWormMaterial = new THREE.MeshStandardMaterial({ color: 0x8b008b, flatShading: true }); // Dark magenta
const paddleMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, map: woodTex });
const hammerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const pedMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const policeMaterial = new THREE.MeshStandardMaterial({ color: 0x0000aa });

// --- Environment ---
const riverWidth = RIVER.width;
const riverLength = RIVER.length;

const riverGeo = new THREE.PlaneGeometry(riverWidth, riverLength, 10, 100);
const riverMesh = new THREE.Mesh(riverGeo, riverMaterial);
riverMesh.rotation.x = -Math.PI / 2;
riverMesh.position.z = -riverLength / 2 + 50; 
riverMesh.receiveShadow = true;
scene.add(riverMesh);

const cityGeo = new THREE.PlaneGeometry(40, 100);
const cityMesh = new THREE.Mesh(cityGeo, groundMaterial);
cityMesh.rotation.x = -Math.PI / 2;
cityMesh.position.set(25, 0.5, -200);
cityMesh.receiveShadow = true;
scene.add(cityMesh);

// --- Checkpoints ---
const checkpoints = [];
for (const cpZ of CHECKPOINTS) {
    const cpMesh = new THREE.Mesh(new THREE.BoxGeometry(riverWidth, 10, 2), checkpointMaterial);
    cpMesh.position.set(0, 5, cpZ);
    scene.add(cpMesh);
    checkpoints.push({ z: cpZ, active: true });
}

// --- Finish Line ---
const finishLineZ = FINISH_Z;
const finishMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.8 });
const finishMesh = new THREE.Mesh(new THREE.BoxGeometry(riverWidth, 20, 2), finishMaterial);
finishMesh.position.set(0, 10, finishLineZ);
scene.add(finishMesh);
let gameWon = false;

// --- Obstacles (Vegetation & Planks) ---
const obstacles = [];
for (let i = 0; i < 300; i++) {
    const isLeft = Math.random() > 0.5;
    const xPos = isLeft ? -riverWidth / 2 - Math.random() * 2 + Math.random() * 3.5 : riverWidth / 2 + Math.random() * 2 - Math.random() * 3.5;
    const zPos = -Math.random() * (riverLength - 100) - 20;
    const isPlank = Math.random() > 0.7;

    if (isPlank) {
        const width = 4 + Math.random() * 3;
        const depth = 2 + Math.random() * 2;
        const height = 0.5;
        const yPos = 0.9 + Math.random() * 0.6;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), woodMaterial);
        mesh.position.set(xPos, yPos, zPos);
        scene.add(mesh);
        obstacles.push({
            type: 'plank',
            mesh,
            x: xPos,
            z: zPos,
            halfW: width / 2,
            halfD: depth / 2,
            topY: yPos + height / 2 + PLAYER.restY,
        });
    } else {
        const size = 2 + Math.random() * 3;
        const mesh = new THREE.Group();
        const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, size, 8), woodMaterial);
        trunkMesh.position.y = size / 2;
        mesh.add(trunkMesh);

        const leavesRadius = size;
        const leavesMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(leavesRadius), vegetationMaterial);
        leavesMesh.position.y = size + leavesRadius / 2;
        leavesMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        mesh.add(leavesMesh);

        mesh.position.set(xPos, 0, zPos);
        scene.add(mesh);
        obstacles.push({
            type: 'tree',
            mesh,
            x: xPos,
            z: zPos,
            radius: 0.85,
        });
    }
}

// --- Enemies ---
// Build Wizard (replaces White Guy)
const wizardGroup = new THREE.Group();
const wizardRaft = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 3), woodMaterial); // Wizard raft
const wizardBody = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 2), whiteGuyMaterial);
wizardBody.position.y = 1.25;
const wizardHat = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 8), wizardHatMaterial);
wizardHat.position.y = 2.5;
wizardGroup.add(wizardRaft);
wizardGroup.add(wizardBody);
wizardGroup.add(wizardHat);

const enemyMeshes = {
    whiteGuy: wizardGroup,
    mudAlien: new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), mudAlienMaterial),
    longWorm: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 10, 8), longWormMaterial) // Long boi
};
enemyMeshes.longWorm.rotation.x = Math.PI / 2; // Lie flat

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
            if (key === 'longWorm' && e.state === 'charging') {
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
            const mat = npc.type === 'police' ? policeMaterial : pedMaterial;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), mat);
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

/**
 * group (position + yaw, mirrors the physics body) → tilt (visual-only bank/pitch/bob) → hull, rider, oar, motor.
 * Pitch and roll never touch the CANNON.Body.
 */
function createRaftMesh(color, upgrades = []) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    group.add(tilt);

    const raft = new THREE.Mesh(new THREE.BoxGeometry(raftSize.w, raftSize.h, raftSize.d), woodMaterial);
    raft.castShadow = true;
    const dude = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.5), new THREE.MeshStandardMaterial({ color }));
    dude.position.y = 0.6 + raftSize.h / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), skinMaterial);
    head.position.y = 1.2 + raftSize.h / 2 + 0.3;
    tilt.add(raft, dude, head);

    const hammer = upgrades.includes('weapon');
    const paddle = hammer
        ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2), hammerMaterial)
        : new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 3), paddleMaterial);
    const paddleHome = new THREE.Vector3(1.2, dude.position.y, 0);
    paddle.position.copy(paddleHome);
    tilt.add(paddle);

    let prop = null;
    if (upgrades.includes('motor')) {
        const motor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), motorMaterial);
        motor.position.set(0, raftSize.h / 2 + 0.2, raftSize.d / 2 + 0.2);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9), motorMaterial);
        shaft.position.set(0, -0.6, 0.15);
        prop = new THREE.Group();
        prop.position.set(0, -1.0, 0.35);
        for (let b = 0; b < 3; b++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.04), propMaterial);
            blade.position.y = 0.22;
            const arm = new THREE.Group();
            arm.rotation.z = (b * 2 * Math.PI) / 3;
            blade.rotation.y = 0.5;
            arm.add(blade);
            prop.add(arm);
        }
        motor.add(shaft, prop);
        raft.add(motor); // stowed with the raft mid-jump
    }

    scene.add(group);
    return {
        group, tilt, raft, paddle, paddleHome, prop, hammer,
        anim: { yaw: 0, speed: 0, turn: 0, thrust: 0, airborne: false, rowPhase: 0, bank: 0, pitch: 0, swing: 0, block: false, wakeAcc: 0, propAngle: 0 },
    };
}

/** Per-frame visual life of a raft: oar strokes, attack swing, banking, planing pitch, bob, propeller, wake. */
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
        p.position.set(0, vis.paddleHome.y - 0.35, -1.5);
        p.rotation.set(0, 0, Math.PI / 2);
    } else if (a.swing > 0) {
        a.swing = Math.max(0, a.swing - dt);
        p.rotation.set(-Math.PI / 4 * Math.sin((a.swing / SWING_S) * Math.PI), 0, 0);
    } else if (rowing && !vis.hammer) {
        // stroke: blade dips (roll), sweeps aft (pitch), lifts out on the recovery
        p.rotation.set(Math.sin(a.rowPhase) * 0.65, 0, 0.35 + Math.cos(a.rowPhase) * 0.3);
        p.position.y = vis.paddleHome.y - 0.25 + Math.cos(a.rowPhase) * 0.2;
    } else {
        p.rotation.x *= 1 - ease(10);
        p.rotation.y = 0;
        p.rotation.z *= 1 - ease(10);
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
    myStats.coins = p.coins;
    myStats.upgrades = p.upgrades;
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

socket.on('playerThrown', (data) => {
    if (data.id === socket.id && myRaft?.craft && !isDead) {
        const v = throwVelocity(data.force);
        myRaft.craft.velocity.set(v.x, v.y, v.z);
        splash(myRaft.craft.position.x, myRaft.craft.position.z, 1.2);
    }
});

socket.on('gameWon', () => {
    gameWon = true;
    hud.setStatus('YOU WIN! CO-OP ESCAPE!', 'var(--ok)');
    sfx.kill();
    document.getElementById('win').hidden = false;
});

// --- Intro Sequence (short 1.2s swoop, immediately skippable on any movement input) ---
let inIntroSequence = true;
let introTime = 0;
const introDuration = 1200;
const introCameraStartOffset = new THREE.Vector3(8, 12, 16);
const introCameraEndOffset = new THREE.Vector3(0, 5, 10);

// --- Controls & Combat ---
const keys = { w: false, a: false, s: false, d: false, space: false };
let isAttacking = false;
let isBlocking = false;

// Spring-damped chase camera: trails the raft's heading; mouse drag / arrow keys orbit, then eases back behind.
const CAM = { pitch: 0.3, minPitch: -0.15, maxPitch: 1.2, distance: 11, stiffness: 9, follow: 3.5, recenterDelayMs: 1200, recenter: 2.5 };
const cam = {
    yaw: 0, orbit: 0, pitch: CAM.pitch, lastInput: -Infinity, live: false,
    vel: new THREE.Vector3(), look: new THREE.Vector3(), fov: camera.fov,
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

window.addEventListener('contextmenu', (e) => e.preventDefault());

const unlockAudio = () => sfx.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Double-click canvas if the player explicitly wants pointer lock; single-click attacks immediately without trapping cursor.
renderer.domElement.addEventListener('dblclick', () => {
    if (!shopOpen) document.body.requestPointerLock?.();
});

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
    if (k === 'shift') isBlocking = true;
    if (k === 'e') {
        if (shopOpen) {
            document.getElementById('shop').style.display = 'none';
            shopOpen = false;
        } else if (myRaft?.craft && isInShopZone(myRaft.craft.position)) {
            hud.setStats(myStats);
            document.getElementById('shop').style.display = 'block';
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
    if (e.target?.closest?.('#shop')) return;
    if (isDead || shopOpen || !myRaft) return;
    if (e.button === 0) {
        triggerAttack();
    } else if (e.button === 2) {
        inIntroSequence = false;
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

function fixedStep() {
    if (!myRaft?.craft) return;
    const craft = myRaft.craft;
    if (inIntroSequence) {
        craft.velocity.set(0, 0, 0);
        craft.angularVelocity.y = 0;
    }
    const live = !isDead && !inIntroSequence;
    const input = live ? { ...keys, upgrades: myStats.upgrades, attacking: isAttacking, onSolid } : { onSolid };
    const { jumped, impact } = stepWatercraftKinematics(craft, input, FIXED_DT);
    const col = resolveWorldBoundsAndObstacles(craft, obstacles);
    onSolid = col.onSolid;
    craft.quaternion.setFromAxisAngle(yAxis, craft.yaw);

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

    if (enemiesData && now - lastEnemyHit > PLAYER.hitCooldownMs) {
        for (const key in enemiesData) {
            const enemy = enemiesData[key];
            if (enemy.health > 0 && vis.group.position.distanceTo(enemyMeshes[key].position) < ENEMY_TYPES[key].hitRadius) {
                socket.emit('enemyHitPlayer', { playerId: socket.id, damage: enemy.damage, enemyType: enemy.type, isBlocking });
                lastEnemyHit = now;
            }
        }
    }
    for (const cp of checkpoints) {
        if (cp.active && craft.position.z < cp.z) {
            cp.active = false;
            socket.emit('checkpointCrossed', { checkpointZ: cp.z });
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
        const dist = CAM.distance + speed * 0.22;
        desired.set(
            target.x + dist * Math.cos(cam.pitch) * Math.sin(yaw),
            target.y + 1.5 + dist * Math.sin(cam.pitch),
            target.z + dist * Math.cos(cam.pitch) * Math.cos(yaw),
        );
        const f = headingOf(myRaft.vis.anim.yaw);
        look.set(target.x + f.x * 3, target.y + 1.2, target.z + f.z * 3);
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
    if (myRaft?.craft) {
        riverMaterial.color.lerpColors(muddyColor, clearColor, waterClarity(myRaft.craft.position.z));
        updateLocalRaft(delta, now);
        animateRaft(myRaft.vis, delta, t);
    }
    for (const vis of Object.values(otherPlayers)) {
        updateRemote(vis, delta);
        animateRaft(vis, delta, t);
    }

    for (const key in hitPulse) {
        hitPulse[key] = Math.max(0, hitPulse[key] - delta * 5);
        enemyMeshes[key].scale.setScalar(1 + 0.35 * hitPulse[key]);
    }
    updateFoam(delta);
    updateRings(delta);

    if (myRaft?.vis) updateCamera(delta);
    updateHud(now);
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    foamMaterial.uniforms.scale.value = window.innerHeight / 2;
});

animate();
