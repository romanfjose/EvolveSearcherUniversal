const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};
const availableColors = [0xff4444, 0x4444ff, 0x44ff44, 0xffff44];
let colorIndex = 0;

// Upgrades Configuration
const UPGRADES = {
    motor: { type: 'motor', cost: 10, name: 'Motor', speedBonus: 40, turnPenalty: 0.5 },
    weapon: { type: 'weapon', cost: 15, name: 'Squeaky Hammer', damageBonus: 20 },
    armor: { type: 'armor', cost: 20, name: 'Raft Armor', maxHealthBonus: 50 }
};

// Enemies
// Start them off map/inactive initially
const enemies = {
    whiteGuy: {
        id: 'whiteGuy', type: 'whiteGuy',
        position: { x: 0, y: 5, z: 100 },
        health: 0, speed: 15, damage: 15, respawnDelay: 10000
    },
    mudAlien: {
        id: 'mudAlien', type: 'mudAlien',
        position: { x: 15, y: 5, z: 100 },
        health: 0, speed: 10, damage: 30, respawnDelay: 20000
    },
    longWorm: {
        id: 'longWorm', type: 'longWorm',
        position: { x: -10, y: 5, z: 100 },
        health: 0, speed: 40, damage: 40, respawnDelay: 30000,
        state: 'idle',
        targetPos: null
    }
};

let gameStarted = false;
let furthestZ = 0;

function spawnEnemy(type, zPos) {
    const e = enemies[type];
    if (type === 'whiteGuy') e.health = 50;
    if (type === 'mudAlien') e.health = 150;
    if (type === 'longWorm') e.health = 200;

    e.position.x = (Math.random() - 0.5) * 20;
    e.position.z = zPos;
    io.emit('enemyRespawn', e);
}

function handleDynamicSpawns(activePlayers) {
    if (activePlayers.length === 0) return;

    let currentFurthestZ = activePlayers[0].position.z;
    for (let p of activePlayers) {
        if (p.position.z < currentFurthestZ) currentFurthestZ = p.position.z;
    }

    // Initial spawn logic
    if (!gameStarted && currentFurthestZ < -10) {
        gameStarted = true;
        const playerCount = activePlayers.length;
        // Randomize initial enemy based on player count
        if (playerCount >= 4) {
            enemies.longWorm.hasSpawned = true;
            spawnEnemy('longWorm', currentFurthestZ - 50);
        } else if (playerCount >= 3) {
            enemies.mudAlien.hasSpawned = true;
            spawnEnemy('mudAlien', currentFurthestZ - 40);
        } else {
            // 1-2 players
            enemies.whiteGuy.hasSpawned = true;
            spawnEnemy('whiteGuy', currentFurthestZ + 10); // Spawns slightly behind them
        }
    }

    // Progressive spawning as they move further down the river
    // If furthestZ crosses thresholds, spawn missing enemies
    // Only spawn if they aren't currently waiting to respawn natively (isDead/respawning flag)
    // To prevent infinite instant respawns, we track if they've ever been spawned

    if (currentFurthestZ < -150 && !enemies.mudAlien.hasSpawned) {
        enemies.mudAlien.hasSpawned = true;
        spawnEnemy('mudAlien', currentFurthestZ - 50);
    }
    if (currentFurthestZ < -300 && !enemies.longWorm.hasSpawned) {
        enemies.longWorm.hasSpawned = true;
        spawnEnemy('longWorm', currentFurthestZ - 60);
    }
    if (currentFurthestZ < -100 && !enemies.whiteGuy.hasSpawned) {
        enemies.whiteGuy.hasSpawned = true;
        spawnEnemy('whiteGuy', currentFurthestZ + 20);
    }
}

const npcs = [];
for(let i=0; i<5; i++) {
    npcs.push({ id: `pedestrian_${i}`, type: 'pedestrian', position: { x: 20 + Math.random()*10, y: 5, z: -190 - Math.random()*20 }, health: 20, isDead: false });
}
for(let i=0; i<2; i++) {
    npcs.push({ id: `police_${i}`, type: 'police', position: { x: 25 + Math.random()*5, y: 5, z: -190 - Math.random()*20 }, health: 50, isDead: false, aggroTarget: null });
}


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Calculate a staggered start position
    // Players will spawn roughly in the middle X, but staggered along Z based on how many players are already connected
    // This gives them a sequential start formation (one ahead of another).
    const playerNum = Object.keys(players).length;

    // Spawn staggered along Z (startZ gets more negative for each player to place them further ahead)
    const startZ = -playerNum * 8 + (Math.random() * 2 - 1);
    const startX = (Math.random() - 0.5) * 2; // Keep X near the center
    const color = availableColors[colorIndex % availableColors.length];
    colorIndex++;

    players[socket.id] = {
        id: socket.id,
        color: color,
        position: { x: startX, y: 5, z: startZ },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        health: 100,
        maxHealth: 100,
        isDead: false,
        coins: 50, // Starting money for testing upgrades
        upgrades: []
    };

    socket.emit('currentPlayers', players);
    socket.emit('enemiesUpdate', enemies);
    socket.emit('npcsUpdate', npcs);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id] && !players[socket.id].isDead) {
            players[socket.id].position = movementData.position;
            players[socket.id].quaternion = movementData.quaternion;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('playerHitEnemy', (data) => {
        const enemy = enemies[data.enemyId];
        const p = players[socket.id];
        if (enemy && enemy.health > 0 && p) {
            let dmg = 10;
            if (p.upgrades.includes('weapon')) dmg += UPGRADES.weapon.damageBonus;
            
            enemy.health -= dmg;
            io.emit('enemyHit', { id: enemy.id, health: enemy.health });
            
            if (enemy.health <= 0) {
                // Drop coins
                p.coins += 10;
                socket.emit('playerStatsUpdate', p);
                
                setTimeout(() => {
                    if (enemy.type === 'whiteGuy') enemy.health = 50;
                    else if (enemy.type === 'mudAlien') enemy.health = 150;
                    else if (enemy.type === 'longWorm') enemy.health = 200;
                    enemy.position.z += 50; 
                    io.emit('enemyRespawn', enemy);
                }, enemy.respawnDelay);
            }
        }
    });

    socket.on('enemyHitPlayer', (data) => {
        if (players[data.playerId] && !players[data.playerId].isDead) {

             // Check if blocking
             let damageTaken = data.damage;
             let isSuccessfullyBlocking = data.isBlocking;

             if (isSuccessfullyBlocking) {
                 damageTaken = Math.floor(damageTaken * 0.2); // 80% damage reduction
             }

             // If white guy hit the player, check if player is safe
             if (data.enemyType === 'whiteGuy') {
                 if (players[data.playerId].position.y <= 1) {
                     players[data.playerId].health -= damageTaken;
                     io.emit('playerHealthUpdate', { id: data.playerId, health: players[data.playerId].health });

                     // If blocking, white guy doesn't throw you
                     if (!isSuccessfullyBlocking) {
                         // Calculate a random throw vector
                         const throwForce = {
                             x: (Math.random() - 0.5) * 500,
                             y: 500 + Math.random() * 500,
                             z: (Math.random() - 0.5) * 500
                         };
                         io.emit('playerThrown', { id: data.playerId, force: throwForce });
                     }
                 } else {
                     // Player is safe on an obstacle, ignore damage
                     return;
                 }
             } else {
                 players[data.playerId].health -= damageTaken;
                 io.emit('playerHealthUpdate', { id: data.playerId, health: players[data.playerId].health });
             }
             
             if(players[data.playerId].health <= 0) {
                 players[data.playerId].isDead = true;
                 io.emit('playerDied', data.playerId);
             }
        }
    });
    
    socket.on('enemyHitNPC', (data) => {
         const npc = npcs.find(n => n.id === data.npcId);
         if(npc && !npc.isDead) {
             npc.health -= data.damage;
             if(npc.health <= 0) npc.isDead = true;
             npcs.forEach(n => { if (n.type === 'police' && !n.isDead) n.aggroTarget = data.enemyId; });
             io.emit('npcsUpdate', npcs);
         }
    });

    socket.on('buyUpgrade', (upgradeType) => {
        const p = players[socket.id];
        const upg = UPGRADES[upgradeType];
        if (p && upg && p.coins >= upg.cost && !p.upgrades.includes(upgradeType)) {
            p.coins -= upg.cost;
            p.upgrades.push(upgradeType);
            
            if (upgradeType === 'armor') {
                p.maxHealth += upg.maxHealthBonus;
                p.health += upg.maxHealthBonus;
                io.emit('playerHealthUpdate', { id: p.id, health: p.health, maxHealth: p.maxHealth });
            }
            
            socket.emit('playerStatsUpdate', p);
            socket.emit('upgradePurchased', upgradeType);
        }
    });

    socket.on('checkpointCrossed', (data) => {
        Object.values(players).forEach(p => {
            if (p.isDead) {
                p.isDead = false;
                p.health = p.maxHealth;
                // Place revived player slightly ahead of the checkpoint so they don't immediately get hit
                p.position.z = data.checkpointZ - 10;
                p.position.x = (Math.random() - 0.5) * 5;
                p.position.y = 5;
                io.emit('playerRevived', p);
            }
        });
    });

    socket.on('crossedFinishLine', () => {
        io.emit('gameWon', socket.id); // One player reached the end, so they all win (Co-op)
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// AI Loop
setInterval(() => {
    let activePlayers = Object.values(players).filter(p => !p.isDead);
    
    handleDynamicSpawns(activePlayers);

    if (activePlayers.length > 0) {
        // Target player is always the one furthest back (largest Z)
        let target = activePlayers[0];
        for (let i = 1; i < activePlayers.length; i++) {
            if (activePlayers[i].position.z > target.position.z) {
                target = activePlayers[i];
            }
        }

        // 1. White Guy
        if (enemies.whiteGuy.health > 0) {
            // Ensure he floats at water level
            enemies.whiteGuy.position.y = 0.5;

            // White Guy ignores players who are elevated (e.g. standing on vegetation/planks)
            // The river floor is at y=0, raft height is 0.5. Resting height is ~0.25.
            // Obstacles can be around y=2.5. So y > 1 means they are safe.
            if (target.position.y <= 1) {
                const dx = target.position.x - enemies.whiteGuy.position.x;
                const dz = target.position.z - enemies.whiteGuy.position.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist > 2) {
                     enemies.whiteGuy.position.x += (dx / dist) * enemies.whiteGuy.speed * 0.05;
                     enemies.whiteGuy.position.z += (dz / dist) * enemies.whiteGuy.speed * 0.05;
                }
            }
        }

        // 2. Mud Alien
        if (enemies.mudAlien.health > 0) {
            enemies.mudAlien.position.y = 0.5;

            const dx = target.position.x - enemies.mudAlien.position.x;
            const dz = target.position.z - enemies.mudAlien.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);

            // Mud alien distance check (if it was 100 max before, keep some limit or just chase if near)
            if (dist > 3 && dist < 100) {
                 enemies.mudAlien.position.x += (dx / dist) * enemies.mudAlien.speed * 0.05;
                 enemies.mudAlien.position.z += (dz / dist) * enemies.mudAlien.speed * 0.05;
            }
        }

        // Mud Alien AoE vs NPCs
        npcs.forEach(npc => {
            if (!npc.isDead) {
                const distToNpc = Math.sqrt(Math.pow(npc.position.x - enemies.mudAlien.position.x, 2) + Math.pow(npc.position.z - enemies.mudAlien.position.z, 2));
                if (distToNpc < 5) {
                    // Apply AoE damage (tick)
                    npc.health -= 1; // 1 damage per 50ms tick
                    if (npc.health <= 0) npc.isDead = true;

                    // Aggro Police
                    npcs.forEach(n => {
                        if (n.type === 'police' && !n.isDead) {
                            n.aggroTarget = 'mudAlien';
                        }
                    });
                }
            }
        });
        // End Mud Alien AoE

        // 3. Long Worm (Vector strike)
        if (enemies.longWorm.health > 0) {
            enemies.longWorm.position.y = 0.5;
            const worm = enemies.longWorm;
            
            // Only activate if players are somewhat near (e.g. z < -300)
            // But target is always furthest back. Let's see if furthest back is near enough.
            if (Math.abs(target.position.z - worm.position.z) < 200) {
                if (worm.state === 'idle') {
                    // Lock onto furthest back player
                    worm.targetPos = { x: target.position.x, z: target.position.z };
                    worm.state = 'charging';
                } else if (worm.state === 'charging') {
                    const dx = worm.targetPos.x - worm.position.x;
                    const dz = worm.targetPos.z - worm.position.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    
                    if (dist > 2) {
                        worm.position.x += (dx / dist) * worm.speed * 0.05;
                        worm.position.z += (dz / dist) * worm.speed * 0.05;
                    } else {
                        // Reached vector target, stop and wait before next strike
                        worm.state = 'cooldown';
                        setTimeout(() => { if (worm.health > 0) worm.state = 'idle'; }, 2000);
                    }
                }
            }
        }
    }

    // Police
    npcs.forEach(npc => {
        if (npc.type === 'police' && !npc.isDead && npc.aggroTarget) {
            const targetEnemy = enemies[npc.aggroTarget];
            if (targetEnemy && targetEnemy.health > 0) {
                targetEnemy.health -= 5; 
                io.emit('enemyHit', { id: targetEnemy.id, health: targetEnemy.health });
                if(targetEnemy.health <= 0) {
                    npc.aggroTarget = null;
                    setTimeout(() => {
                        if (targetEnemy.type === 'mudAlien') targetEnemy.health = 150;
                        targetEnemy.position.z += 50; 
                        io.emit('enemyRespawn', targetEnemy);
                    }, targetEnemy.respawnDelay);
                }
            } else {
                npc.aggroTarget = null;
            }
        }
    });

    io.emit('enemiesUpdate', enemies);
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
