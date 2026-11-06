# Don't Sink, Don't Die — Co-Op River Survival

A deterministic 60Hz 3D co-op river survival game (`Three.js` + `Socket.io` + zero-dependency offline loopback server) built from a surreal dream draft. 1 to 4 players pilot rafts down a 1.5 km hostile river corridor across 4 biomes, fight dream entities, salvage scrap, upgrade gear at riverside docks, and break through to the river mouth.

Runs either online over WebSockets or completely offline in-browser with autonomous AI bots using the exact same deterministic simulation loop.

---

## Quickstart

Clone and run locally:

```bash
# Install dependencies
npm install

# Start the multiplayer server (Express + Socket.io on port 3000)
npm start
```

Open `http://localhost:3000` in your browser.

### Headless Verification & Tests

```bash
# Run unit & simulation test suite (60Hz mechanics, enemy FSMs, net contract)
npm test

# Run core game simulation tests specifically
node --test test/game-core.test.js

# Run headless 60Hz WebGL scene-graph NaN audit & Director QA sniper
npm run qa:helmet
```

---

## Core Handling & Physical Mechanics

The watercraft simulation solves exact hydrodynamic drag, keel grip, and momentum at a fixed 60Hz step.

### Twin Articulated Oars (`remos`) & Hydrodynamics
- **Articulated Remos:** The craft mounts twin independently articulated oars—port (`leftPaddle`) and starboard (`rightPaddle`).
- **Timed Rhythmic Pulls (`[W]`):** Prior to buying an outboard motor, paddling forward is a manual stroke cycle (Catch $\rightarrow$ Power Pull $\rightarrow$ Glide Recovery). Hitting `[W]` dips the blades and accelerates the craft along its heading.
- **Fast-Press Choke Penalty:** Spamming `[W]` before the active pull finishes yanks the blades out of the water prematurely. This chokes the stroke, induces a slip stall, cuts forward speed by 32%, and sheds water in an erratic spray.
- **Outboard Motor:** Purchasing the motor replaces manual stroke timing with continuous throttle, converting forward propulsion to steady mechanical drive with reduced turning agility.

### Side-Aware Melee Combat & Guard
- **Directional Oar Strikes:** Left-click triggers an oar swing. The pilot dynamically lifts and swings the port oar (`leftPaddle`) or starboard oar (`rightPaddle`) depending on which side the enemy threatens.
- **Dual-Oar Parry (`X-Guard`):** Holding Right-Click crosses both oars across the chest. Blocks absorb 80% incoming damage, eliminate knockback throws, and prevent capsizing.
- **On-Foot Mobility:** Jumping onto solid docks or elevated vegetation prompts the player to hoist the raft overhead, swapping row mechanics for on-foot footwork.

---

## The 3 Dream Entities & The Dread Kraken

The river spawns three distinct entities drawn from the dream draft, scaling across distance and party size, concluding in an apex encounter.

1. **The White Entity in the Wizard Hat (`whiteGuy`):**
   - Haunts the water surface, relentlessly targeting whichever raft trails behind the pack.
   - Casts telekinetic vortexes that pick up and hurl rafts across the river.
   - **Counterplay:** Players who jump onto the riverbank vegetation or wooden side-planks (`costado`) stand above the water line (`y > 1.0m`), granting total immunity to its grip. In the water, coordinated `2v1` dual-oar strikes stagger the entity and spin its wizard hat in real-time.

2. **The 3-Legged Headless Mud Alien (`mudAlien`):**
   - Stalks crafts along a 3m–100m pursuit leash.
   - Emits a periodic toxic shockwave aura. If lured past the harbor sea wall into the Riverside City, its AoE damages dockside civilians, provoking local Police marksmen into opening suppressive fire that tears the alien apart.

3. **The 26-Segment Nokia-Vector Long Worm (`longWorm`):**
   - An undulating multi-segment predator with procedural inverse kinematics.
   - Locks a ballistic strike vector from upriver, charges at high speed, and goes dormant for 2.0 seconds after lunging—leaving its vitals vulnerable to flanking hits.

4. **The River Mouth Apex: The Dread Kraken (`z = -1350`):**
   - Spawns at the river terminus where the channel expands into an open caldera.
   - A 3-phase encounter with procedural tentacle sweeps, armored barnacle weak points, crushing whirlpool currents, and shockwave water plumes. Defeating the Kraken clears the passage to the open ocean.

---

## Controls

| Key / Input | Action |
|---|---|
| `W` | Pull oars (timed rhythm pre-motor) / Continuous throttle (motorized) |
| `S` | Backwater braking / reverse stroke |
| `A` / `D` | Steer port / starboard (direct yaw torque with rapid release damping) |
| `Space` | Jump from water or docks; hoists raft overhead mid-air |
| Left Click | Side-aware oar melee strike (targets nearest threat flank) |
| Right Click (Hold) | Dual-oar crossed parry (`X-Guard`, 80% damage reduction) |
| `E` | Interact / Open Armory Shop at Riverside City docks (`z: -150 to -250`) |
| `Z` / `X` / `C` / `V` | Tactical Crew Orders (Dock / Hold Anchor / Meet at Shop / Focus Boss) |
| `M` | Toggle audio mute |
| Mouse Move | Orbit chase camera |

---

## Architecture & Determinism

The client and server share core gameplay code with zero state divergence:

```
shared/game-core.js            Deterministic state machine: ticks, entity FSMs, wave scaling,
                               raft kinematics, combat math. Zero external dependencies.
shared/boss-kraken.js          The Dread Kraken boss state machine: 3 phases, tentacles, shockwaves.
shared/combat-system.js        2v1 double-team combat stagger, hat spin, and parry logic.
shared/loopback.js             In-memory Socket.io drop-in for zero-server offline play.
server.js                      Node.js Express + Socket.io server running authoritative core.
public/js/main.js              Three.js client, 60Hz physics sub-stepping, twin-oar rig, VFX.
tools/qa-helmet-sniper.mjs     Headless 60Hz scene-graph and NaN verification harness.
```

- **Transport Agnostic:** If the client fails to connect to a live Socket.io host within 2.5 seconds, it automatically falls back to `shared/loopback.js` without interrupting the session.
- **Strict Invariants:** Position vectors, quaternions, health pools, and currency balances are defensively clamped every tick to prevent NaN leaks or state corruption.
