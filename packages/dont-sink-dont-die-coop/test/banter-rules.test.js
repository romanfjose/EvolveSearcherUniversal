import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    BANTER_CHARACTERS,
    BANTER_TRIGGERS,
    BANTER_PRIORITIES,
    TRIGGER_CONFIGS,
    BANTER_LINES,
    createBanterRng,
    getBanterLine,
    BanterCooldownManager,
    evaluateBanterRules,
    getCrewmateForPlayer,
    projectWorldToScreen,
    clampBubbleToViewport,
} from '../shared/banter-rules.js';
import { createDreamBanterDirector } from '../public/js/ui/dream-banter.js';

describe('Banter Character Profiles & Definitions', () => {
    test('defines all required comedic characters', () => {
        const requiredKeys = ['WIZARD', 'PEDESTRIAN', 'POLICE', 'MATEO', 'MARTA', 'PIBE'];
        for (const key of requiredKeys) {
            const char = BANTER_CHARACTERS[key];
            assert.ok(char, `Missing character definition for ${key}`);
            assert.ok(char.id);
            assert.ok(char.displayName);
            assert.ok(char.portrait);
            assert.ok(char.color);
            assert.ok(char.borderColor);
            assert.ok(char.role);
            assert.equal(typeof char.voicePitch, 'number');
        }
    });

    test('defines all required trigger types and priority levels', () => {
        const expectedTriggers = [
            'WIZARD_PLANK_JUMP',
            'PEDESTRIAN_MUD_APPROACH',
            'POLICE_MUD_AGGRO',
            'CREW_BUY_HAMMER',
            'CREW_YEETED_BY_WIZARD',
            'CREW_REVIVE_CHECKPOINT',
            'CREW_SPOT_LONG_WORM',
        ];
        for (const trig of expectedTriggers) {
            assert.ok(BANTER_TRIGGERS[trig]);
            const cfg = TRIGGER_CONFIGS[BANTER_TRIGGERS[trig]];
            assert.ok(cfg);
            assert.ok(cfg.priority >= BANTER_PRIORITIES.LOW && cfg.priority <= BANTER_PRIORITIES.URGENT);
            assert.ok(cfg.globalCooldownMs > 0);
            assert.ok(cfg.characterCooldownMs > 0);
            assert.ok(cfg.durationMs > 0);
        }
    });
});

describe('Dialogue Database & Comedic Content Requirements', () => {
    test('Elevation-Blind Wizard contains all exact required comedic lines', () => {
        const lines = BANTER_LINES[BANTER_TRIGGERS.WIZARD_PLANK_JUMP];
        const enLines = lines.map((l) => l.en);

        assert.ok(enLines.includes("Where did he go?! He was literally just in the water!"));
        assert.ok(enLines.includes("Must have been the wind..."));
        assert.ok(enLines.includes("Curse my vertical neck brace!"));
    });

    test('Harbor Pedestrians contain all exact required comedic lines', () => {
        const lines = BANTER_LINES[BANTER_TRIGGERS.PEDESTRIAN_MUD_APPROACH];
        const enLines = lines.map((l) => l.en);

        assert.ok(enLines.includes("Bro is getting swamp sludge on my new shoes! OFFICER!!"));
        assert.ok(enLines.includes("Call the Harbor Police, the meatball is back!"));
    });

    test('Harbor Police contain all exact required comedic lines', () => {
        const lines = BANTER_LINES[BANTER_TRIGGERS.POLICE_MUD_AGGRO];
        const enLines = lines.map((l) => l.en);

        assert.ok(enLines.includes("STOP RESISTING, SLUDGE BOY!"));
        assert.ok(enLines.includes("WE HAVE YOU SURROUNDED BY WATER!"));
    });

    test('AI Crewmates (Capitán Mateo, Tía Marta, El Pibe) have all 4 required event pools', () => {
        const requiredCrew = ['mateo', 'marta', 'pibe'];
        const requiredEvents = [
            BANTER_TRIGGERS.CREW_BUY_HAMMER,
            BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD,
            BANTER_TRIGGERS.CREW_REVIVE_CHECKPOINT,
            BANTER_TRIGGERS.CREW_SPOT_LONG_WORM,
        ];

        for (const crewId of requiredCrew) {
            assert.ok(BANTER_LINES[crewId]);
            for (const ev of requiredEvents) {
                const pool = BANTER_LINES[crewId][ev];
                assert.ok(Array.isArray(pool) && pool.length >= 3, `Missing or short pool for ${crewId} - ${ev}`);
                for (const line of pool) {
                    assert.ok(line.en && line.en.length > 5);
                    assert.ok(line.es && line.es.length > 5);
                }
            }
        }
    });

    test('getBanterLine supports bilingual mode, english, and spanish language modes', () => {
        const trig = BANTER_TRIGGERS.WIZARD_PLANK_JUMP;
        const enLine = getBanterLine(trig, { language: 'en', lineIndex: 0 });
        const esLine = getBanterLine(trig, { language: 'es', lineIndex: 0 });
        const biLine = getBanterLine(trig, { language: 'bilingual', lineIndex: 0 });

        assert.equal(enLine.text, "Where did he go?! He was literally just in the water!");
        assert.equal(esLine.text, "¡¿A dónde se fue?! ¡Estaba literalmente recién en el agua!");
        assert.ok(biLine.text.length > 0);
    });

    test('createBanterRng generates deterministic sequence', () => {
        const rng1 = createBanterRng(42);
        const rng2 = createBanterRng(42);
        const seq1 = [rng1(), rng1(), rng1()];
        const seq2 = [rng2(), rng2(), rng2()];
        assert.deepEqual(seq1, seq2);
    });
});

describe('Banter Rate-Limiting & Cooldown Manager', () => {
    test('enforces global cooldown between successive triggers', () => {
        const cd = new BanterCooldownManager();
        const trig = BANTER_TRIGGERS.WIZARD_PLANK_JUMP;

        assert.equal(cd.canTrigger(trig, 'wizard', 1000), true);
        cd.recordTrigger(trig, 'wizard', 1000);

        // Immediate next trigger within 1200ms is blocked by global cooldown
        assert.equal(cd.canTrigger(trig, 'wizard', 1500), false);
        // Different trigger within global cooldown is also blocked
        assert.equal(cd.canTrigger(BANTER_TRIGGERS.POLICE_MUD_AGGRO, 'police', 1500), false);

        // Once global cooldown expires (1000 + 1200 = 2200), a DIFFERENT trigger can fire
        assert.equal(cd.canTrigger(BANTER_TRIGGERS.POLICE_MUD_AGGRO, 'police', 2300), true);
    });

    test('enforces trigger-specific cooldown', () => {
        const cd = new BanterCooldownManager();
        const trig = BANTER_TRIGGERS.WIZARD_PLANK_JUMP; // globalCooldownMs: 6000, characterCooldownMs: 8000
        cd.recordTrigger(trig, 'wizard', 0);

        // Before 6000ms, trigger is on cooldown
        assert.equal(cd.canTrigger(trig, 'wizard', 5000), false);
        // After characterCooldownMs (8000ms) has passed, both trigger and character cooldowns are clear
        assert.equal(cd.canTrigger(trig, 'wizard', 8500), true);
    });

    test('enforces character-specific cooldown', () => {
        const cd = new BanterCooldownManager();
        const cfg = TRIGGER_CONFIGS[BANTER_TRIGGERS.CREW_BUY_HAMMER]; // char cooldown 6000ms
        cd.recordTrigger(BANTER_TRIGGERS.CREW_BUY_HAMMER, 'mateo', 0);

        // Even with a different trigger, if character is on cooldown, it is blocked
        assert.equal(cd.canTrigger(BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD, 'mateo', 4000), false);
        // Another character can trigger
        assert.equal(cd.canTrigger(BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD, 'marta', 4000), true);
    });

    test('reset clears all recorded timestamps', () => {
        const cd = new BanterCooldownManager();
        cd.recordTrigger(BANTER_TRIGGERS.WIZARD_PLANK_JUMP, 'wizard', 10000);
        assert.equal(cd.canTrigger(BANTER_TRIGGERS.WIZARD_PLANK_JUMP, 'wizard', 10500), false);
        cd.reset();
        assert.equal(cd.canTrigger(BANTER_TRIGGERS.WIZARD_PLANK_JUMP, 'wizard', 10500), true);
    });
});

describe('Banter Rule Evaluator: Elevation-Blind Wizard', () => {
    test('fires when player is jumping onto a plank (y > 1) near the wizard', () => {
        const gameState = {
            players: [
                { id: 'p1', position: { x: 0, y: 1.8, z: -80 }, isDead: false },
            ],
            enemies: {
                whiteGuy: { id: 'whiteGuy', health: 50, position: { x: 0, y: 0.5, z: -90 } },
            },
        };
        const events = evaluateBanterRules(gameState, null, 1000);
        assert.equal(events.length, 1);
        assert.equal(events[0].trigger, BANTER_TRIGGERS.WIZARD_PLANK_JUMP);
        assert.equal(events[0].character.id, 'wizard');
        assert.ok(events[0].text.length > 0);
    });

    test('does not fire if player is swimming at water level (y <= 1)', () => {
        const gameState = {
            players: [
                { id: 'p1', position: { x: 0, y: 0.25, z: -80 }, isDead: false },
            ],
            enemies: {
                whiteGuy: { id: 'whiteGuy', health: 50, position: { x: 0, y: 0.5, z: -90 } },
            },
        };
        const events = evaluateBanterRules(gameState, null, 1000);
        assert.equal(events.length, 0);
    });

    test('does not fire if wizard is defeated (health <= 0)', () => {
        const gameState = {
            players: [
                { id: 'p1', position: { x: 0, y: 2.5, z: -80 }, isDead: false },
            ],
            enemies: {
                whiteGuy: { id: 'whiteGuy', health: 0, position: { x: 0, y: 0.5, z: -90 } },
            },
        };
        const events = evaluateBanterRules(gameState, null, 1000);
        assert.equal(events.length, 0);
    });
});

describe('Banter Rule Evaluator: Harbor Pedestrians & Police', () => {
    test('pedestrian screams when Mud Alien approaches city harbor pier (z = -200)', () => {
        const gameState = {
            players: [{ id: 'p1', position: { x: 0, y: 0.25, z: -190 }, isDead: false }],
            enemies: {
                mudAlien: { id: 'mudAlien', health: 150, position: { x: 15, y: 0.5, z: -205 } },
            },
            npcs: [
                { id: 'ped_1', type: 'pedestrian', position: { x: 22, y: 1.5, z: -200 }, isDead: false },
            ],
        };
        const events = evaluateBanterRules(gameState, null, 1000);
        assert.equal(events.length, 1);
        assert.equal(events[0].trigger, BANTER_TRIGGERS.PEDESTRIAN_MUD_APPROACH);
        assert.equal(events[0].character.id, 'pedestrian');
    });

    test('pedestrian does not trigger when Mud Alien is far from harbor', () => {
        const gameState = {
            players: [{ id: 'p1', position: { x: 0, y: 0.25, z: -50 }, isDead: false }],
            enemies: {
                mudAlien: { id: 'mudAlien', health: 150, position: { x: 15, y: 0.5, z: -80 } },
            },
            npcs: [
                { id: 'ped_1', type: 'pedestrian', position: { x: 22, y: 1.5, z: -200 }, isDead: false },
            ],
        };
        const events = evaluateBanterRules(gameState, null, 1000);
        assert.equal(events.length, 0);
    });

    test('police shouts commands when aggroed on Mud Alien', () => {
        const gameState = {
            players: [{ id: 'p1', position: { x: 0, y: 0.25, z: -200 }, isDead: false }],
            enemies: {
                mudAlien: { id: 'mudAlien', health: 150, position: { x: 15, y: 0.5, z: -200 } },
            },
            npcs: [
                { id: 'pol_1', type: 'police', position: { x: 24, y: 1.5, z: -200 }, isDead: false, aggroTarget: 'mudAlien' },
            ],
        };
        const events = evaluateBanterRules(gameState, null, 1000);
        const policeEv = events.find((e) => e.trigger === BANTER_TRIGGERS.POLICE_MUD_AGGRO);
        assert.ok(policeEv);
        assert.equal(policeEv.character.id, 'police');
        assert.equal(policeEv.priority, BANTER_PRIORITIES.URGENT);
    });
});

describe('Banter Rule Evaluator: AI Crewmate Reactions', () => {
    test('triggers crewmate reaction upon buying Squeaky Hammer (weapon upgrade)', () => {
        const gameState = {
            players: [
                { id: 'p1', name: 'Capitán Mateo', position: { x: 14, y: 0.5, z: -210 }, isDead: false },
                { id: 'p2', name: 'Tía Marta', position: { x: 14, y: 0.5, z: -210 }, isDead: false },
            ],
        };
        const contextEvent = {
            type: 'buyUpgrade',
            data: { type: 'weapon', playerId: 'p1', position: { x: 14, y: 1, z: -210 } },
        };
        const events = evaluateBanterRules(gameState, contextEvent, 1000);
        assert.equal(events.length, 1);
        assert.equal(events[0].trigger, BANTER_TRIGGERS.CREW_BUY_HAMMER);
        assert.equal(events[0].character.id, 'mateo');
    });

    test('triggers crewmate reaction when yeeted into the sky by Wizard', () => {
        const gameState = {
            players: [
                { id: 'p1', name: 'Mateo', position: { x: 0, y: 10, z: -90 }, isDead: false },
                { id: 'p2', name: 'Tía Marta', position: { x: 0, y: 12, z: -90 }, isDead: false },
            ],
        };
        const contextEvent = {
            type: 'playerThrown',
            data: { id: 'p2', force: { x: 100, y: 800, z: 100 } },
        };
        const events = evaluateBanterRules(gameState, contextEvent, 1000);
        assert.equal(events.length, 1);
        assert.equal(events[0].trigger, BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD);
        assert.equal(events[0].character.id, 'marta');
    });

    test('triggers crewmate reaction upon checkpoint revive', () => {
        const gameState = {
            players: [
                { id: 'p1', name: 'Mateo', isDead: false },
                { id: 'p2', name: 'Marta', isDead: false },
                { id: 'p3', name: 'El Pibe', isDead: false },
            ],
        };
        const contextEvent = {
            type: 'playerRevived',
            data: { id: 'p3', position: { x: 0, y: 1, z: -310 } },
        };
        const events = evaluateBanterRules(gameState, contextEvent, 1000);
        assert.equal(events.length, 1);
        assert.equal(events[0].trigger, BANTER_TRIGGERS.CREW_REVIVE_CHECKPOINT);
        assert.equal(events[0].character.id, 'pibe');
    });

    test('triggers crewmate panic reaction upon spotting Long Worm', () => {
        const gameState = {
            players: [
                { id: 'p1', name: 'Mateo', position: { x: 0, y: 0.5, z: -310 }, isDead: false },
            ],
            enemies: {
                longWorm: { id: 'longWorm', health: 200, position: { x: -10, y: 0.5, z: -360 }, state: 'charging' },
            },
        };
        const events = evaluateBanterRules(gameState, null, 1000);
        assert.equal(events.length, 1);
        assert.equal(events[0].trigger, BANTER_TRIGGERS.CREW_SPOT_LONG_WORM);
        assert.equal(events[0].character.id, 'mateo');
    });

    test('getCrewmateForPlayer cycles across the 3 AI crewmates consistently', () => {
        const crewList = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
        assert.equal(getCrewmateForPlayer('p1', crewList).id, 'mateo');
        assert.equal(getCrewmateForPlayer('p2', crewList).id, 'marta');
        assert.equal(getCrewmateForPlayer('p3', crewList).id, 'pibe');
        assert.equal(getCrewmateForPlayer('p4', crewList).id, 'mateo');
    });
});

describe('3D World to 2D Screen Projection Mathematics', () => {
    // Identity View-Projection matrix (clip space = world space)
    const identityVP = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ];

    test('projects center origin (0, 0, 0) to screen center (width/2, height/2)', () => {
        const res = projectWorldToScreen({ x: 0, y: 0, z: 0 }, identityVP, 1920, 1080);
        assert.equal(res.inFront, true);
        assert.equal(res.x, 960);
        assert.equal(res.y, 540);
    });

    test('projects top-right point (1, 1, 0) to screen (1920, 0)', () => {
        const res = projectWorldToScreen({ x: 1, y: 1, z: 0 }, identityVP, 1920, 1080);
        assert.equal(res.inFront, true);
        assert.equal(res.x, 1920);
        assert.equal(res.y, 0); // Y inverted for DOM top-left origin
    });

    test('flags points behind camera as inFront = false', () => {
        // In a typical perspective projection, clipW <= 0 means behind camera
        const behindMatrix = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, -1,
            0, 0, 0, -1,
        ];
        const res = projectWorldToScreen({ x: 0, y: 0, z: 5 }, behindMatrix, 1920, 1080);
        assert.equal(res.inFront, false);
    });

    test('clampBubbleToViewport confines bubble within screen margins', () => {
        const screenW = 1000;
        const screenH = 600;
        const bubbleW = 200;
        const bubbleH = 80;
        const pad = 10;

        // Way off to the left
        const leftClamped = clampBubbleToViewport(-100, 300, bubbleW, bubbleH, screenW, screenH, pad);
        assert.equal(leftClamped.x, pad + bubbleW * 0.5); // 110
        assert.equal(leftClamped.isClamped, true);

        // Way off to the top
        const topClamped = clampBubbleToViewport(500, -50, bubbleW, bubbleH, screenW, screenH, pad);
        assert.equal(topClamped.y, pad + bubbleH); // 90
        assert.equal(topClamped.isClamped, true);

        // Safely in the middle
        const centerClamped = clampBubbleToViewport(500, 300, bubbleW, bubbleH, screenW, screenH, pad);
        assert.equal(centerClamped.x, 500);
        assert.equal(centerClamped.y, 300);
        assert.equal(centerClamped.isClamped, false);
    });
});

describe('Dream Banter Director Lifecycle & Headless Mechanics', () => {
    test('initializes and spawns bubbles with audio callback notification', () => {
        let playedSound = null;
        const director = createDreamBanterDirector({
            onBanterSound: (info) => { playedSound = info; },
            language: 'es',
        });

        const bubble = director.spawnBubble({
            character: BANTER_CHARACTERS.WIZARD,
            text: "¡Maldito sea mi cuello ortopédico!",
            worldPosition: { x: 0, y: 2, z: -50 },
            durationMs: 3000,
        });

        assert.ok(bubble);
        assert.equal(director.getActiveBubbles().length, 1);
        assert.ok(playedSound);
        assert.equal(playedSound.character.id, 'wizard');
        assert.equal(playedSound.pitch, BANTER_CHARACTERS.WIZARD.voicePitch);
    });

    test('evicts oldest/lower priority bubbles when exceeding maxActiveBubbles', () => {
        const director = createDreamBanterDirector({ maxActiveBubbles: 2 });

        director.spawnBubble({
            character: BANTER_CHARACTERS.PEDESTRIAN,
            text: "Line 1",
            worldPosition: { x: 0, y: 1, z: 0 },
            priority: BANTER_PRIORITIES.LOW,
        });
        director.spawnBubble({
            character: BANTER_CHARACTERS.MATEO,
            text: "Line 2",
            worldPosition: { x: 0, y: 1, z: 0 },
            priority: BANTER_PRIORITIES.MEDIUM,
        });
        assert.equal(director.getActiveBubbles().length, 2);

        // Spawn higher priority 3rd bubble -> evicts lowest priority Line 1
        director.spawnBubble({
            character: BANTER_CHARACTERS.POLICE,
            text: "Line 3",
            worldPosition: { x: 0, y: 1, z: 0 },
            priority: BANTER_PRIORITIES.URGENT,
        });

        const active = director.getActiveBubbles();
        assert.equal(active.length, 2);
        assert.equal(active[0].text, "Line 2");
        assert.equal(active[1].text, "Line 3");
    });

    test('updates bubble lifetime and removes expired bubbles on tick', () => {
        const director = createDreamBanterDirector();
        director.spawnBubble({
            character: BANTER_CHARACTERS.MATEO,
            text: "Quick exclamation!",
            worldPosition: { x: 0, y: 1, z: 0 },
            durationMs: 1000,
        });

        assert.equal(director.getActiveBubbles().length, 1);

        // Step 0.5s -> still active
        director.update(0.5, 1280, 720);
        assert.equal(director.getActiveBubbles().length, 1);

        // Step another 0.6s -> expired
        director.update(0.6, 1280, 720);
        assert.equal(director.getActiveBubbles().length, 0);
    });

    test('evaluateAndTrigger processes game state seamlessly', () => {
        const director = createDreamBanterDirector({ language: 'en' });
        const gameState = {
            players: [{ id: 'p1', position: { x: 0, y: 2.2, z: -90 }, isDead: false }],
            enemies: { whiteGuy: { id: 'whiteGuy', health: 50, position: { x: 0, y: 0.5, z: -95 } } },
        };

        const spawned = director.evaluateAndTrigger(gameState, null, 1000);
        assert.equal(spawned.length, 1);
        assert.equal(spawned[0].character.id, 'wizard');
        assert.equal(director.getActiveBubbles().length, 1);

        director.dispose();
        assert.equal(director.getActiveBubbles().length, 0);
    });
});
