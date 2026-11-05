import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Socket.io
const socket = io();

window.buyUpgradeEvent = (type) => {
    socket.emit('buyUpgrade', type);
};

let myStats = { coins: 50, upgrades: [] };
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

// Setup Cannon.js Physics
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 10;

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
const physicsMaterial = new CANNON.Material();
const whiteGuyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
const wizardHatMaterial = new THREE.MeshStandardMaterial({ color: 0x3333aa, flatShading: true });
const mudAlienMaterial = new THREE.MeshStandardMaterial({ color: 0x654321, flatShading: true });
const longWormMaterial = new THREE.MeshStandardMaterial({ color: 0x8b008b, flatShading: true }); // Dark magenta
const paddleMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, map: woodTex });
const hammerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const pedMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const policeMaterial = new THREE.MeshStandardMaterial({ color: 0x0000aa });

const contactMaterial = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, { friction: 0.1, restitution: 0.3 });
world.addContactMaterial(contactMaterial);

// --- Environment ---
const riverWidth = 30;
const riverLength = 2000; // Longer for worm

const riverGeo = new THREE.PlaneGeometry(riverWidth, riverLength, 10, 100);
const riverMesh = new THREE.Mesh(riverGeo, riverMaterial);
riverMesh.rotation.x = -Math.PI / 2;
riverMesh.position.z = -riverLength / 2 + 50; 
riverMesh.receiveShadow = true;
scene.add(riverMesh);

// Removed solid river floor plane to allow objects to submerge

// Solid invisible walls to prevent leaving the river
const wallShape = new CANNON.Box(new CANNON.Vec3(1, 50, riverLength / 2));
const leftWall = new CANNON.Body({ mass: 0, material: physicsMaterial, position: new CANNON.Vec3(-riverWidth/2 - 2, 0, -riverLength/2 + 50) });
leftWall.addShape(wallShape);
world.addBody(leftWall);

const rightWall = new CANNON.Body({ mass: 0, material: physicsMaterial, position: new CANNON.Vec3(riverWidth/2 + 2, 0, -riverLength/2 + 50) });
rightWall.addShape(wallShape);
world.addBody(rightWall);

const cityGeo = new THREE.PlaneGeometry(40, 100);
const cityMesh = new THREE.Mesh(cityGeo, groundMaterial);
cityMesh.rotation.x = -Math.PI / 2;
cityMesh.position.set(25, 0.5, -200);
cityMesh.receiveShadow = true;
scene.add(cityMesh);
const cityShape = new CANNON.Box(new CANNON.Vec3(20, 0.5, 50));
const cityBody = new CANNON.Body({ mass: 0, material: physicsMaterial, position: new CANNON.Vec3(25, 0, -200) });
cityBody.addShape(cityShape);
world.addBody(cityBody);

// --- Checkpoints ---
const checkpoints = [];
for (let i = 1; i <= 8; i++) {
    const cpZ = -i * 150;
    const cpMesh = new THREE.Mesh(new THREE.BoxGeometry(riverWidth, 10, 2), checkpointMaterial);
    cpMesh.position.set(0, 5, cpZ);
    scene.add(cpMesh);
    checkpoints.push({ z: cpZ, active: true });
}

// --- Finish Line ---
const finishLineZ = -1500;
const finishMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.8 });
const finishMesh = new THREE.Mesh(new THREE.BoxGeometry(riverWidth, 20, 2), finishMaterial);
finishMesh.position.set(0, 10, finishLineZ);
scene.add(finishMesh);
let gameWon = false;

// --- Obstacles (Vegetation & Planks) ---
const obstacles = [];
// Generate vegetation and planks heavily along the sides (costados) to act as visual borders
for (let i = 0; i < 300; i++) {
    const isLeft = Math.random() > 0.5;
    // Push them slightly outward to border the river heavily
    const xPos = isLeft ? -riverWidth/2 - Math.random()*2 + Math.random()*4 : riverWidth/2 + Math.random()*2 - Math.random()*4;
    const zPos = -Math.random() * (riverLength - 100) - 20;
    const isPlank = Math.random() > 0.7; // 30% chance for a wood plank

    let mesh, shape, yPos;

    if (isPlank) {
        // Wood Plank
        const width = 4 + Math.random() * 3;
        const depth = 2 + Math.random() * 2;
        const height = 0.5;
        yPos = height/2 + Math.random() * 2; // Elevate slightly above water
        mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), woodMaterial);
        shape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
        mesh.position.set(xPos, yPos, zPos);
        scene.add(mesh);
    } else {
        // Composite Tree
        const size = 2 + Math.random() * 3;
        yPos = size;

        mesh = new THREE.Group();

        // Trunk
        const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, size, 8), woodMaterial);
        trunkMesh.position.y = size/2;
        mesh.add(trunkMesh);

        // Leaves
        const leavesRadius = size;
        const leavesMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(leavesRadius), vegetationMaterial);
        leavesMesh.position.y = size + leavesRadius/2;

        // Add random slight rotation to leaves for organic look
        leavesMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        mesh.add(leavesMesh);

        // The physics shape represents the whole area broadly
        shape = new CANNON.Cylinder(leavesRadius, leavesRadius, size * 2, 8);
        mesh.position.set(xPos, 0, zPos); // Group is at ground level
        scene.add(mesh);

        yPos = size; // Center of mass for physics body
    }

    const body = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(xPos, yPos, zPos), material: physicsMaterial });
    body.addShape(shape);
    world.addBody(body);
    obstacles.push({ mesh, body });
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


// --- Players ---
const otherPlayers = {};
let myRaft = null;
let isDead = false;
let myHealth = 100;
const raftSize = { w: 2, h: 0.5, d: 3 };

function createRaftMesh(color, upgrades=[]) {
    const group = new THREE.Group();

    // Raft (Inventory-able)
    const raftMesh = new THREE.Mesh(new THREE.BoxGeometry(raftSize.w, raftSize.h, raftSize.d), woodMaterial);

    // The "Dude"
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const shirtMaterial = new THREE.MeshStandardMaterial({ color: color });

    const dudeBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.5), shirtMaterial);
    dudeBody.position.y = 0.6 + raftSize.h/2;
    const dudeHead = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), skinMaterial);
    dudeHead.position.y = 1.2 + raftSize.h/2 + 0.3;

    group.add(raftMesh);
    group.add(dudeBody);
    group.add(dudeHead);
    
    // Default Paddle
    let weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 3), paddleMaterial);
    
    if (upgrades.includes('weapon')) {
        weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2), hammerMaterial);
    }
    weaponMesh.position.set(1.2, dudeBody.position.y, 0);
    group.add(weaponMesh);
    
    if (upgrades.includes('motor')) {
        const motorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({color: 0x333333}));
        motorMesh.position.set(0, raftSize.h/2 + 0.4, 1.5);
        raftMesh.add(motorMesh); // Attached to raft so it disappears with it
    }

    scene.add(group);
    return { group: group, raft: raftMesh, paddle: weaponMesh, dude: dudeBody };
}

function reRenderMyRaft(p) {
    if (myRaft) {
        scene.remove(myRaft.mesh);
        // keep body
    }
    const visuals = createRaftMesh(p.color, p.upgrades);
    visuals.group.position.copy(myRaft ? myRaft.body.position : p.position);
    visuals.group.quaternion.copy(myRaft ? myRaft.body.quaternion : p.quaternion);
    
    myRaft = { mesh: visuals.group, raftMesh: visuals.raft, paddle: visuals.paddle, body: myRaft ? myRaft.body : null };
}

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id === socket.id) {
            const p = players[id];
            myStats.coins = p.coins;
            myStats.upgrades = p.upgrades;
            document.getElementById('coins').innerText = `Coins: ${myStats.coins}`;
            
            const raftBody = new CANNON.Body({
                mass: 5,
                position: new CANNON.Vec3(p.position.x, p.position.y, p.position.z),
                material: physicsMaterial,
                linearDamping: 0.1, angularDamping: 0.1 // Less native damping, replaced by fluid drag
            });
            raftBody.addShape(new CANNON.Box(new CANNON.Vec3(raftSize.w/2, raftSize.h/2, raftSize.d/2)));
            world.addBody(raftBody);
            
            reRenderMyRaft(p); // Set mesh but we don't have body set yet
            myRaft.body = raftBody;
            
            // Allow jumping if colliding with obstacles or if resting near the water surface
            raftBody.addEventListener("collide", (e) => { if(e.contact.ni.y > 0.5) canJump = true; });
        } else {
            const p = players[id];
            const visuals = createRaftMesh(p.color, p.upgrades);
            visuals.group.position.set(p.position.x, p.position.y, p.position.z);
            otherPlayers[id] = visuals;
        }
    });
});

socket.on('newPlayer', (p) => {
    const visuals = createRaftMesh(p.color, p.upgrades);
    visuals.group.position.set(p.position.x, p.position.y, p.position.z);
    otherPlayers[p.id] = visuals;
});

socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id].group);
        delete otherPlayers[id];
    }
});

socket.on('playerMoved', (p) => {
    if (otherPlayers[p.id]) {
        otherPlayers[p.id].group.position.set(p.position.x, p.position.y, p.position.z);
        otherPlayers[p.id].group.quaternion.set(p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w);
    }
});

socket.on('playerHealthUpdate', (data) => {
    if (data.id === socket.id) {
        myHealth = data.health;
        document.getElementById('health').innerText = `Health: ${Math.max(0, myHealth)}`;
    }
});

socket.on('playerStatsUpdate', (p) => {
    myStats.coins = p.coins;
    myStats.upgrades = p.upgrades;
    document.getElementById('coins').innerText = `Coins: ${myStats.coins}`;
});

socket.on('upgradePurchased', (type) => {
    // Rerender local raft to show upgrade visually
    // In a real app we'd fetch full player data, but we can fake it:
    reRenderMyRaft({color: myRaft.mesh.material.color.getHex(), upgrades: myStats.upgrades, position: myRaft.body.position, quaternion: myRaft.body.quaternion});
});

socket.on('playerDied', (id) => {
    if (id === socket.id) {
        isDead = true;
        document.getElementById('health').innerText = "DEAD - Spectating";
        if (myRaft) myRaft.mesh.visible = false;
    } else if (otherPlayers[id]) {
        otherPlayers[id].group.visible = false;
    }
});

socket.on('playerRevived', (p) => {
    if (p.id === socket.id) {
        isDead = false;
        myHealth = p.health;
        document.getElementById('health').innerText = `Health: ${myHealth}`;
        if (myRaft) {
            myRaft.mesh.visible = true;
            myRaft.body.position.set(0, 5, p.position.z);
            myRaft.body.velocity.set(0,0,0);
        }
    } else if (otherPlayers[p.id]) {
        otherPlayers[p.id].group.visible = true;
    }
});

socket.on('playerThrown', (data) => {
    if (data.id === socket.id && myRaft && !isDead) {
        // Apply the random throw force
        myRaft.body.velocity.set(0,0,0); // reset current velocity
        myRaft.body.applyImpulse(new CANNON.Vec3(data.force.x, data.force.y, data.force.z), myRaft.body.position);
    }
});

socket.on('gameWon', (winningPlayerId) => {
    gameWon = true;
    document.getElementById('health').innerText = `YOU WIN! CO-OP ESCAPE!`;
    document.getElementById('health').style.color = '#00FF00';
    document.getElementById('health').style.fontSize = '2em';
    // Let's pop up a generic win div
    const winDiv = document.createElement('div');
    winDiv.innerHTML = "<h1>RIVER ESCAPED!</h1><p>You and your friends survived.</p>";
    winDiv.style.position = 'absolute';
    winDiv.style.top = '50%';
    winDiv.style.left = '50%';
    winDiv.style.transform = 'translate(-50%, -50%)';
    winDiv.style.color = 'white';
    winDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    winDiv.style.padding = '40px';
    winDiv.style.textAlign = 'center';
    winDiv.style.border = '5px solid green';
    winDiv.style.zIndex = '1000';
    document.body.appendChild(winDiv);
});


// --- Intro Sequence ---
let inIntroSequence = true;
let introTime = 0;
const introDuration = 4000; // 4 seconds intro
let introCameraStartOffset = new THREE.Vector3(10, 15, 20); // Start high and to the side
let introCameraEndOffset = new THREE.Vector3(0, 5, 10); // End at the normal follow position

// --- Controls & Combat ---
const keys = { w: false, a: false, s: false, d: false, space: false, e: false };
let canJump = false;
let isAttacking = false;
let isBlocking = false;

// Camera state
let cameraYaw = 0; // rotation around Y axis
let cameraPitch = 0.2; // slight angle down by default
const maxPitch = Math.PI / 2 - 0.1;
const minPitch = -Math.PI / 2 + 0.1;
const cameraDistance = 15;

// Prevent context menu on right click
window.addEventListener('contextmenu', e => e.preventDefault());

// Pointer Lock for camera movement
document.body.addEventListener('click', () => {
    if (!shopOpen && !inIntroSequence) {
        document.body.requestPointerLock();
    }
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== document.body) {
        // Exited pointer lock
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body) {
        // Sensitivity
        const sensitivity = 0.002;
        cameraYaw -= e.movementX * sensitivity;
        cameraPitch -= e.movementY * sensitivity;

        // Clamp pitch to prevent flipping
        cameraPitch = Math.max(minPitch, Math.min(maxPitch, cameraPitch));
    }
});

window.addEventListener('keydown', (e) => { 
    if (inIntroSequence) return; // Disable controls during intro

    if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; 
    if(e.key===' ') keys.space=true;
    
    // Shop toggle
    if(e.key.toLowerCase() === 'e') {
        if (shopOpen) {
            document.getElementById('shop').style.display = 'none';
            shopOpen = false;
        } else if (myRaft && myRaft.mesh.position.x > 10 && myRaft.mesh.position.z > -250 && myRaft.mesh.position.z < -150) {
            // Near city
            document.getElementById('shop').style.display = 'block';
            shopOpen = true;
        }
    }
});
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; if(e.key===' ') keys.space=false;});

window.addEventListener('mousedown', (e) => {
    if (isDead || shopOpen || inIntroSequence) return;

    if (e.button === 0 && !isBlocking && document.pointerLockElement === document.body) {
        // Left click = Attack
        isAttacking = true;
        if(myRaft) {
             myRaft.paddle.rotation.x = Math.PI / 4;
             setTimeout(() => { if (!isBlocking) myRaft.paddle.rotation.x = 0; }, 200);
        }
        if (enemiesData) {
            for(const key in enemiesData) {
                const enemy = enemiesData[key];
                if (enemy.health > 0) {
                    if (myRaft.mesh.position.distanceTo(enemyMeshes[key].position) < 4) {
                        socket.emit('playerHitEnemy', { enemyId: key });
                    }
                }
            }
        }
        setTimeout(() => isAttacking = false, 200);
    } else if (e.button === 2) {
        // Right click = Block
        isBlocking = true;
        if(myRaft) {
            myRaft.paddle.rotation.z = Math.PI / 2;
            myRaft.paddle.position.set(0, 0.5, -1.5); // Move paddle to front
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        // Stop blocking
        isBlocking = false;
        if(myRaft) {
            myRaft.paddle.rotation.z = 0;
            myRaft.paddle.position.set(1.2, 0.5, 0); // Restore original position
        }
    }
});

// --- Game Loop ---
const clock = new THREE.Clock();
const baseRiverForce = new CANNON.Vec3(0, 0, -100); // Re-tuned for fluid dynamics
let lastSync = 0;
let lastEnemyHit = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const now = Date.now();

    world.step(1/60, delta, 3);

    if (myRaft && inIntroSequence) {
        // Hold raft in place during intro
        myRaft.body.velocity.set(0, 0, 0);
        myRaft.body.angularVelocity.set(0, 0, 0);
        myRaft.body.position.copy(myRaft.body.position);

        myRaft.mesh.position.copy(myRaft.body.position);
        myRaft.mesh.quaternion.copy(myRaft.body.quaternion);

        introTime += delta * 1000;
        if (introTime > introDuration) {
            inIntroSequence = false;
        }
    }

    if (myRaft && !isDead && !inIntroSequence) {

        // --- Visual River Updates ---
        // Animate water flow
        waterTex.offset.y -= delta * 0.5;

        // Dynamically change water color from muddy to clear based on Z progress
        const maxMudZ = -100;
        const maxClearZ = -1500; // Finish line
        let progress = (myRaft.body.position.z - maxMudZ) / (maxClearZ - maxMudZ);
        progress = Math.max(0, Math.min(1, progress));

        const muddyColor = new THREE.Color('#5c4a3d'); // Deeper muddy brown
        const clearColor = new THREE.Color('#0f5e9c'); // Deeper clear blue, less bright
        riverMaterial.color.lerpColors(muddyColor, clearColor, progress);

        // Fluid Dynamics (Buoyancy and Drag)
        const waterLevel = 0; // River mesh is at y=0
        const depth = waterLevel - myRaft.body.position.y;

        // If raft is in water
        if (depth > -1) {
            canJump = true; // Allow jumping off water surface

            // Buoyancy force pushing up
            const buoyancyForce = new CANNON.Vec3(0, (depth + 0.5) * 60, 0);
            myRaft.body.applyForce(buoyancyForce, myRaft.body.position);

            // Apply simulated fluid drag (damps movement inside water)
            myRaft.body.velocity.scale(0.9, myRaft.body.velocity);
            myRaft.body.angularVelocity.scale(0.9, myRaft.body.angularVelocity);

            // Dynamic river mechanic: current pushes raft downriver
            const riverForceMultiplier = 1 + Math.max(0, -myRaft.body.position.z / 500);
            const currentForce = new CANNON.Vec3(0, 0, baseRiverForce.z * riverForceMultiplier);
            if (myRaft.body.position.x > -15 && myRaft.body.position.x < 15) {
                myRaft.body.applyForce(currentForce, myRaft.body.position);
            }
        }

        // Raft Movement Dynamics
        let paddleForceLeft = 0;
        let paddleForceRight = 0;
        const basePaddleForce = 200; // Tuned for fluid drag

        if (keys.w) {
            paddleForceLeft += basePaddleForce;
            paddleForceRight += basePaddleForce;
        }
        if (keys.s) {
            paddleForceLeft -= basePaddleForce;
            paddleForceRight -= basePaddleForce;
        }
        if (keys.a) {
            paddleForceRight += basePaddleForce; // Right paddle only
        }
        if (keys.d) {
            paddleForceLeft += basePaddleForce; // Left paddle only
        }

        if (myStats.upgrades.includes('motor')) {
            // Motor gives a general forward boost if W is pressed
            if (keys.w) {
                 paddleForceLeft += 100;
                 paddleForceRight += 100;
            }
        }
        if (isAttacking) {
            paddleForceLeft += 50;
            paddleForceRight += 50;
        }

        // Apply forces locally
        // Raft width is raftSize.w = 2, so left/right offsets are approx x = -1 and x = 1
        if (paddleForceLeft !== 0) {
            const forceLocal = new CANNON.Vec3(0, 0, -paddleForceLeft);
            const pointLocal = new CANNON.Vec3(-1, 0, 0);
            myRaft.body.applyLocalForce(forceLocal, pointLocal);
        }

        if (paddleForceRight !== 0) {
            const forceLocal = new CANNON.Vec3(0, 0, -paddleForceRight);
            const pointLocal = new CANNON.Vec3(1, 0, 0);
            myRaft.body.applyLocalForce(forceLocal, pointLocal);
        }

        // Motor simulates harder turning via angular drag
        if (myStats.upgrades.includes('motor')) {
             myRaft.body.angularVelocity.scale(0.95, myRaft.body.angularVelocity);
        }

        if (keys.space && canJump) {
            myRaft.body.velocity.y = 15; // Increased jump velocity so raft can reach obstacles
            canJump = false;
            // Put raft in inventory when jumping
            if (myRaft.raftMesh) myRaft.raftMesh.visible = false;
        }

        // Restore raft when landed
        if (canJump && myRaft.raftMesh && !myRaft.raftMesh.visible) {
            myRaft.raftMesh.visible = true;
        }

        // Extremely heavy damping on X and Z rotation to keep the raft upright
        myRaft.body.angularVelocity.x *= 0.1;
        myRaft.body.angularVelocity.z *= 0.1;

        // Slightly damp Y rotation so it doesn't spin infinitely
        myRaft.body.angularVelocity.y *= 0.8;

        // Force quaternion to remain mostly flat
        myRaft.body.quaternion.x *= 0.1;
        myRaft.body.quaternion.z *= 0.1;
        myRaft.body.quaternion.normalize();

        myRaft.mesh.position.copy(myRaft.body.position);
        myRaft.mesh.quaternion.copy(myRaft.body.quaternion);

        // Enemy collision / damage
        if (enemiesData && now - lastEnemyHit > 1000) {
            for(const key in enemiesData) {
                const enemy = enemiesData[key];
                if (enemy.health > 0) {
                    if (myRaft.mesh.position.distanceTo(enemyMeshes[key].position) < (key === 'longWorm' ? 5 : 3)) {
                        socket.emit('enemyHitPlayer', { playerId: socket.id, damage: enemy.damage, enemyType: enemy.type, isBlocking: isBlocking });
                        lastEnemyHit = now;
                    }
                }
            }
        }

        for (let cp of checkpoints) {
            if (cp.active && myRaft.body.position.z < cp.z) {
                cp.active = false;
                socket.emit('checkpointCrossed', { checkpointZ: cp.z });
            }
        }

        if (!gameWon && myRaft.body.position.z < finishLineZ) {
            gameWon = true;
            socket.emit('crossedFinishLine');
        }

        if (now - lastSync > 1000 / 30) {
            socket.emit('playerMovement', {
                position: { x: myRaft.body.position.x, y: myRaft.body.position.y, z: myRaft.body.position.z },
                quaternion: { x: myRaft.body.quaternion.x, y: myRaft.body.quaternion.y, z: myRaft.body.quaternion.z, w: myRaft.body.quaternion.w }
            });
            lastSync = now;
        }
    }

    for (const obs of obstacles) {
        // Only sync physics for planks, trees are static groups
        if (obs.mesh.type === 'Mesh') {
            obs.mesh.position.copy(obs.body.position);
            obs.mesh.quaternion.copy(obs.body.quaternion);
        }
    }

    // Camera
    if (myRaft) {
        if (inIntroSequence) {
            const targetPos = myRaft.mesh.position;
            const progress = introTime / introDuration;

            // Easing function for smooth pan
            const easeInOutQuad = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            // Interpolate offset
            const currentOffset = new THREE.Vector3().lerpVectors(introCameraStartOffset, introCameraEndOffset, easeInOutQuad);

            // Apply offset relative to raft world matrix
            const desiredCamPos = currentOffset.applyMatrix4(myRaft.mesh.matrixWorld);
            camera.position.copy(desiredCamPos);
            camera.lookAt(targetPos);
        } else {
            const targetPos = isDead ? new THREE.Vector3(0, 50, myRaft.mesh.position.z) : myRaft.mesh.position;

            // Calculate orbital camera position using spherical coordinates
            const camX = targetPos.x + cameraDistance * Math.cos(cameraPitch) * Math.sin(cameraYaw);
            const camY = targetPos.y + cameraDistance * Math.sin(cameraPitch) + (isDead ? 50 : 2); // slightly above raft
            const camZ = targetPos.z + cameraDistance * Math.cos(cameraPitch) * Math.cos(cameraYaw);

            const desiredCamPos = new THREE.Vector3(camX, camY, camZ);
            camera.position.lerp(desiredCamPos, 0.2); // Smooth camera movement
            camera.lookAt(targetPos.x, targetPos.y + 1, targetPos.z);
        }
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
