# Don't Sink, Don't Die — co-op raft survival

3D co-op raft survival down a 1.5 km river (Three.js + pure deterministic kinematics, no physics engine). Paddle, jump onto planks, fight a wizard, a mud alien and a long worm, buy upgrades at the city, and reach the river mouth together.

It runs in two modes from the same client and the same game rules:

| Mode | How to start | Who simulates the world |
|---|---|---|
| **Online multiplayer** | `npm start`, open `http://localhost:3000` | `server.js` (Socket.io), up to 4 friends |
| **Offline / zero-server** | [`docs/index.html`](docs/index.html) (GitHub Pages or any static server) | The browser itself, with 1–3 AI companion bots |

## Play the static demo

- **GitHub Pages:** with Pages serving the repository root, open `/packages/dont-sink-dont-die-coop/docs/`. Choose a crew size and press *Play offline*.
- **Locally:** run `npm run demo` (it uses `python3 -m http.server 8138`) and open `http://localhost:8138/docs/`. ES modules don't load over `file://`, so you need some static server.

You don't need a flag. If the page can't reach a Socket.io server, it switches to offline mode by itself: either `socket.io/socket.io.js` returns 404, or the connection fails within 2.5 s. URL parameters:

| Param | Effect |
|---|---|
| `offline` | Skip the server probe |
| `bots=1..3` | Size of the AI crew (default 2) |
| `seed=<int>` | Reproducible run (enemy positions, throws, bot blocks) |

## Controls

| Input | Action |
|---|---|
| `W` / `S` | Paddle forward / back water at half power |
| `A` / `D` | Steer left / right. The turn rate is direct and dies within 0.4 s of letting go |
| `Space` | Jump from the water or a plank. The raft goes into your inventory mid-air and you splash back down onto the surface. Standing on a plank or tree (y > 1) makes you immune to the wizard |
| Mouse | Orbit the chase camera; it eases back behind the raft after about a second |
| Left click | Attack (click the scene first to lock the mouse). The lunge adds a small forward thrust |
| Right click (hold) | Block: 80 % less damage, and you can't be thrown |
| `E` | Open the shop at the city on the right bank (x > 10, z −150…−250) |
| `M` | Mute sound |

## Game rules

All the numbers live in [`shared/game-core.js`](shared/game-core.js). The test suite pins them down.

- **Waves.** There is one wave per 150 m (one per checkpoint gate), 10 in total. When a wave starts, the HUD shows a banner and plays a horn. Enemies that spawn later get **+25 % health and +10 % damage per wave**. They also get **+20 % health for each crew member after the first**.
- **Openers.** A crew of 1–2 starts against the wizard (`whiteGuy`), a crew of 3 against the mud alien, and a crew of 4 against the long worm. The other enemies unlock at 100 m, 150 m and 300 m. A killed enemy comes back after its respawn delay, positioned relative to the lead raft.
- **Enemies.**
  - The wizard chases the rearmost raft at water level. A raft standing on a plank deck (above `PLAYER.safeHeight`) is out of his reach.
  - The mud alien chases on a 3–100 m leash. Its aura hurts city civilians, which brings out the police.
  - The long worm locks a strike vector, coils for 0.6 s as a telegraph, charges, then rests for 2 s.
- **River layout.** `generateRiverObstacles(seed)` builds the river from one shared seed (`RIVER_LAYOUT_SEED`): 300 bank trees, a mid-channel slalom of rocks and buoys, and about 70 elevated refuge planks marked with lanterns. The client, the server and the bots all build the same layout.
- **Upgrades.**

  | Upgrade | Cost | Effect |
  |---|---|---|
  | Motor | 10 | +200 N thrust while paddling forward; 30 % slower turn rate |
  | Squeaky Hammer | 15 | 30 damage per hit instead of 10 |
  | Raft Armor | 20 | +50 max HP |

  You start with 50 coins. Kills pay 10, 20 or 30 coins depending on the enemy, plus 2 per wave.
- **Death and revival.** Any raft that crosses a checkpoint revives every fallen crewmate just past that checkpoint. If the whole crew sinks, everyone regroups at the last checkpoint after 3 s. When any raft reaches the river mouth, the whole crew wins.
- **Score** = 100 × kills + damage dealt + 1 per 10 m of best progress.

### AI companions (offline mode)

The bots follow a small state machine: `follow → engage → evade → refuge → advance`. Whatever their mode, they steer around trunks, rocks and buoys (`steerAroundObstacles`).

- **Follow.** A bot holds a formation slot behind you. It moves at the speed the drag model gives a paddling raft: 15 m/s, or 21 m/s with the motor.
- **Engage.** A bot attacks the nearest enemy within 30 m, as long as that enemy is within 45 m of you. It swings every 0.7 s and blocks 35 % of incoming hits.
- **Evade.** A bot sidesteps a coiling or charging worm and hits it while it rests.
- **Refuge.** When the wizard comes within 10 m, a bot jumps onto the nearest plank and hits him from up there.
- **Advance.** If you sink, the bots push downriver on their own, and reaching a checkpoint revives you.

Bots buy upgrades in the city band in this order: hammer, armor, motor.

**Auto-Pilot.** Press `P`, or click the HUD button, and `autopilotInput` drives your own raft hands-free through `stepWatercraftKinematics`. It uses the same brain as the bots, and it docks at the City Shop to buy upgrades. Any helm key takes control back.

## Raft handling

`stepWatercraftKinematics` in [`shared/game-core.js`](shared/game-core.js) is the controller, and the tests run it directly. The browser calls it at a fixed 60 Hz step. `resolveWorldBoundsAndObstacles` then slides the raft off trunks, rocks and buoys, lands it on planks and the shop dock, and clamps it to the channel.

- **Water floor.** A raft at or below the waterline that is not rising is held on `WATER_SURFACE_Y` (0.25) with zero vertical speed. No input can push it underwater.
- **Yaw only.** The simulated raft only yaws. Banking into turns, the planing nose-up, the bob and the oar strokes exist only on the Three.js child group.
- **Keel.** Horizontal velocity is split along the heading (drag 6.7 /s) and across it (8 × that). Both are solved exactly per step, so the raft carves where it points at any frame rate.
- **Helm.** `A`/`D` set a target yaw rate. The rate reaches it, and drops back to zero on release, at 16 /s.
- **Jump.** Jumping sets 18 m/s upward against 30 m/s² gravity. The raft rises 5.4 m and is in the air for 1.2 s.

## Architecture

```
shared/game-core.js   pure, deterministic rules: tick, spawns, waves, enemy FSMs, combat,
                      upgrades, bots, raft-physics math. No timers, no I/O, seeded RNG.
shared/loopback.js    in-browser Socket.io stand-in: owns a game state, ticks it at 20 Hz,
                      and delivers routed events to local handlers (structured-cloned like wire data)
server.js             Express + Socket.io: the same core, with events routed to rooms
public/js/net.js      transport picker: real server if reachable, otherwise loopback
public/js/main.js     Three.js rendering of the seeded layout, articulated enemy rigs, City Shop pier + neon sign,
                      shared kinematics (client-authoritative movement), Auto-Pilot, chase camera, wake/splash FX
public/js/hud.js      HUD (hull, speed/heading telemetry, river progress, wave pips, enemy bars, scoreboard,
                      toasts, damage numbers), WebAudio SFX
docs/index.html       static landing page → ../public/index.html?offline&bots=N
```

Every core command returns events of the form `{ event, data, to?, except? }`, and each transport routes them the same way:

| Route | `server.js` | `loopback.js` |
|---|---|---|
| `to` | `io.to(id)` | delivered only if it targets the local player |
| `except` | `io.except(id)` | dropped if it excludes the local player |
| neither | broadcast | delivered |

Because both transports run the identical rules, the offline game behaves the same as the online one. It also lets the test suite play a full river run headlessly.

### Notes on authority

- The server now uses its own wave-scaled enemy damage. It ignores the number the client reports, and only applies damage to the sender.
- Enemy respawns and the worm's cooldown are driven by the tick clock instead of `setTimeout`. This removed a bug where police kills respawned some enemies with 0 HP.
- The client's upgrade re-render no longer crashes. It used to read `material` on a `THREE.Group`.

## Multiplayer server

```bash
npm install
```

```bash
npm start
```

The server listens on `PORT` (default `3000`) and serves `public/`, with `shared/` at `/shared`. To make a server run reproducible, set `SEED=<int>`.

## Tests

```bash
npm test
```

The suite has 77 `node:test` cases, with no browser and no dependencies:

- raft physics math and the watercraft controller (never below the waterline, keel grip, helm stop, jump arc)
- upgrade costs and stats
- wave scaling
- spawning
- each enemy state machine
- combat, blocking and raft damage
- checkpoints and team wipe
- the network routing contract
- bot behaviour
- loopback transport semantics
- seeded determinism
- a full scripted run in which a crew escapes the river through all 10 waves
