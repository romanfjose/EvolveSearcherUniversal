/**
 * Don't Sink, Don't Die — Comedic Fever-Dream Banter Rules & Triggers
 * Pure, deterministic banter evaluation, dialogue database, cooldown/rate-limiting management,
 * and 3D screen projection mathematics.
 *
 * Zero external dependencies.
 */

// ─── Character Definitions & Styling Profiles ────────────────────────────────

export const BANTER_CHARACTERS = {
    WIZARD: {
        id: 'wizard',
        displayName: 'Elevation-Blind Wizard',
        portrait: '🧙‍♂️',
        color: '#38bdf8', // Arcane cyan
        bgColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: '#38bdf8',
        role: 'enemy',
        voicePitch: 1.4,
    },
    PEDESTRIAN: {
        id: 'pedestrian',
        displayName: 'Harbor Pedestrian',
        portrait: '🚶‍♂️',
        color: '#f59e0b', // Amber
        bgColor: 'rgba(30, 27, 75, 0.92)',
        borderColor: '#f59e0b',
        role: 'civilian',
        voicePitch: 1.1,
    },
    POLICE: {
        id: 'police',
        displayName: 'Harbor Police',
        portrait: '👮‍♂️',
        color: '#ef4444', // Siren red
        bgColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#ef4444',
        role: 'enforcer',
        voicePitch: 0.8,
    },
    MATEO: {
        id: 'mateo',
        displayName: 'Capitán Mateo',
        portrait: '🧔🏽‍♂️',
        color: '#60a5fa', // Blue
        bgColor: 'rgba(30, 41, 59, 0.92)',
        borderColor: '#60a5fa',
        role: 'crew',
        voicePitch: 0.9,
    },
    MARTA: {
        id: 'marta',
        displayName: 'Tía Marta',
        portrait: '👵🏽',
        color: '#ec4899', // Pink
        bgColor: 'rgba(80, 7, 36, 0.92)',
        borderColor: '#ec4899',
        role: 'crew',
        voicePitch: 1.3,
    },
    PIBE: {
        id: 'pibe',
        displayName: 'El Pibe',
        portrait: '🧢',
        color: '#10b981', // Emerald
        bgColor: 'rgba(6, 78, 59, 0.92)',
        borderColor: '#10b981',
        role: 'crew',
        voicePitch: 1.2,
    },
};

// ─── Trigger Event IDs & Priorities ─────────────────────────────────────────

export const BANTER_TRIGGERS = {
    WIZARD_PLANK_JUMP: 'WIZARD_PLANK_JUMP',
    PEDESTRIAN_MUD_APPROACH: 'PEDESTRIAN_MUD_APPROACH',
    POLICE_MUD_AGGRO: 'POLICE_MUD_AGGRO',
    CREW_BUY_HAMMER: 'CREW_BUY_HAMMER',
    CREW_YEETED_BY_WIZARD: 'CREW_YEETED_BY_WIZARD',
    CREW_REVIVE_CHECKPOINT: 'CREW_REVIVE_CHECKPOINT',
    CREW_SPOT_LONG_WORM: 'CREW_SPOT_LONG_WORM',
};

export const BANTER_PRIORITIES = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    URGENT: 4,
};

export const TRIGGER_CONFIGS = {
    [BANTER_TRIGGERS.WIZARD_PLANK_JUMP]: {
        priority: BANTER_PRIORITIES.HIGH,
        globalCooldownMs: 6000,
        characterCooldownMs: 8000,
        durationMs: 3800,
        characterId: BANTER_CHARACTERS.WIZARD.id,
    },
    [BANTER_TRIGGERS.PEDESTRIAN_MUD_APPROACH]: {
        priority: BANTER_PRIORITIES.MEDIUM,
        globalCooldownMs: 5000,
        characterCooldownMs: 7000,
        durationMs: 3500,
        characterId: BANTER_CHARACTERS.PEDESTRIAN.id,
    },
    [BANTER_TRIGGERS.POLICE_MUD_AGGRO]: {
        priority: BANTER_PRIORITIES.URGENT,
        globalCooldownMs: 4000,
        characterCooldownMs: 6000,
        durationMs: 3600,
        characterId: BANTER_CHARACTERS.POLICE.id,
    },
    [BANTER_TRIGGERS.CREW_BUY_HAMMER]: {
        priority: BANTER_PRIORITIES.HIGH,
        globalCooldownMs: 4500,
        characterCooldownMs: 6000,
        durationMs: 4000,
    },
    [BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD]: {
        priority: BANTER_PRIORITIES.URGENT,
        globalCooldownMs: 3500,
        characterCooldownMs: 5000,
        durationMs: 3800,
    },
    [BANTER_TRIGGERS.CREW_REVIVE_CHECKPOINT]: {
        priority: BANTER_PRIORITIES.HIGH,
        globalCooldownMs: 5000,
        characterCooldownMs: 7000,
        durationMs: 4000,
    },
    [BANTER_TRIGGERS.CREW_SPOT_LONG_WORM]: {
        priority: BANTER_PRIORITIES.URGENT,
        globalCooldownMs: 7000,
        characterCooldownMs: 10000,
        durationMs: 4200,
    },
};

// ─── Dialogue Database (English + Bilingual Spanish Spice) ───────────────────

export const BANTER_LINES = {
    // 1. Elevation-Blind Wizard (when player jumps onto plank y > 1)
    [BANTER_TRIGGERS.WIZARD_PLANK_JUMP]: [
        { en: "Where did he go?! He was literally just in the water!", es: "¡¿A dónde se fue?! ¡Estaba literalmente recién en el agua!" },
        { en: "Must have been the wind...", es: "Debe haber sido el viento..." },
        { en: "Curse my vertical neck brace!", es: "¡Maldito sea mi cuello ortopédico!" },
        { en: "Invisibility magic?! No, he simply ceased to exist on the Z-plane!", es: "¡¿Magia de invisibilidad?! ¡No, simplemente dejó de existir en el eje Z!" },
        { en: "My spells only travel at sea level! Come down here and fight like a plankton!", es: "¡Mis hechizos solo viajan a nivel del mar! ¡Baja aquí y pelea como un plancton!" },
    ],

    // 2. Harbor Pedestrians (when Mud Alien approaches z = -200)
    [BANTER_TRIGGERS.PEDESTRIAN_MUD_APPROACH]: [
        { en: "Bro is getting swamp sludge on my new shoes! OFFICER!!", es: "¡Bro me está tirando lodo en mis zapatillas nuevas! ¡¡OFICIAL!!" },
        { en: "Call the Harbor Police, the meatball is back!", es: "¡Llamen a la Policía del Puerto, volvió la albóndiga mutante!" },
        { en: "Disgusting! Do you even know what dry-cleaning costs in this harbor?!", es: "¡Qué asco! ¡¿Sabés lo que sale la tintorería en este puerto?!" },
        { en: "Security! There is an unscheduled organic swamp hazard walking my dock!", es: "¡Seguridad! ¡Hay un peligro pantanoso no habilitado pisando mi muelle!" },
        { en: "¡Ay mi madre! Look at the smell radiating off that thing!", es: "¡Ay mi madre! ¡Miren el barrial tóxico que desprende esa cosa!" },
    ],

    // 3. Harbor Police (when aggroed on Mud Alien)
    [BANTER_TRIGGERS.POLICE_MUD_AGGRO]: [
        { en: "STOP RESISTING, SLUDGE BOY!", es: "¡DEJA DE RESISTIRTE, NIÑO PANTANO!" },
        { en: "WE HAVE YOU SURROUNDED BY WATER!", es: "¡ESTÁS RODEADO DE AGUA, RÍNDETE!" },
        { en: "Code 404: Unregistered toxic biome organism spotted on city pier!", es: "¡Código 404: Organismo tóxico no empadronado en el muelle de la ciudad!" },
        { en: "Put the mud down and put your pseudopods in the air!", es: "¡Suelta el lodo y pon los pseudópodos en alto!" },
        { en: "¡Manos arriba, chabón! That violates the harbor cleanliness ordinance of 1882!", es: "¡Manos arriba, chabón! ¡Eso viola la ordenanza de higiene portuaria de 1882!" },
    ],

    // 4. AI Crewmate: Capitan Mateo
    mateo: {
        [BANTER_TRIGGERS.CREW_BUY_HAMMER]: [
            { en: "A squeaky hammer?! Mateo, we needed raft planks, not a toddler toy!", es: "¿¡Un martillo chillón?! ¡Mateo, necesitábamos tablones para la balsa, no un juguete!" },
            { en: "It squeaks... but Dios mío, 30 damage is 30 damage. Smash away, carajo!", es: "Chilla como patito... ¡pero Dios mío, 30 de daño es 30 de daño! ¡Dale masa, carajo!" },
            { en: "By Neptune's beard! Did you spend our rum savings on squeak tech?!", es: "¡Por las barbas de Neptuno! ¿Gastaste los ahorros de ron en tecnología chillona?" },
        ],
        [BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD]: [
            { en: "HOLD THE RIGGING! I'm orbiting the stratosphere!!", es: "¡AGÁRRENSE DEL APAREJO! ¡¡Estoy entrando en órbita estratosférica!!" },
            { en: "That scoundrel wizard threw me to high heaven! Catch the helm, quick!", es: "¡Ese brujo bribón me mandó hasta el cielo! ¡Agarren el timón, rápido!" },
            { en: "¡Madre mía! I can see the river mouth from up here!", es: "¡Madre mía! ¡Puedo ver la desembocadura del río desde acá arriba!" },
        ],
        [BANTER_TRIGGERS.CREW_REVIVE_CHECKPOINT]: [
            { en: "I'm back, muchachos! Did anyone steer while I took a dirt nap?!", es: "¡Volví, muchachos! ¿Alguien timoneó mientras yo dormía una siestita bajo el agua?" },
            { en: "Never count out Mateo! Pass me an oar, we have waves to conquer!", es: "¡Nunca den por muerto a Mateo! ¡Pásenme un remo, carajo!" },
            { en: "Checkpoints are blessings from the river gods! Keep paddling!", es: "¡Bendito punto de control! ¡A remar que no se ha hundido nadie todavía!" },
        ],
        [BANTER_TRIGGERS.CREW_SPOT_LONG_WORM]: [
            { en: "LEVIATHAN OFF THE BOW! Brace for a sideways breach!!", es: "¡LEVIATÁN POR LA PROA! ¡Agárrense que embiste de costado!" },
            { en: "That is NOT a harmless river eel! Hard to port, immediately!", es: "¡Eso NO es una simple anguila de río! ¡Giren a babor de inmediato!" },
            { en: "Look at the size of that worm! We're gonna need a bigger raft!", es: "¡Miren el lomo que tiene esa serpiente! ¡Vamos a necesitar una balsa más grande!" },
        ],
    },

    // 5. AI Crewmate: Tia Marta
    marta: {
        [BANTER_TRIGGERS.CREW_BUY_HAMMER]: [
            { en: "¡Ay mi amor! That little squeak sounds like my blender when I make salsa!", es: "¡Ay mi amor! ¡Ese ruidito chifle suena igual a mi licuadora cuando hago salsa!" },
            { en: "Does this hammer come with warranty?! Don't break it on the wizard's skull!", es: "¿Trae garantía este martillito? ¡No lo vayan a romper contra el cráneo del brujo!" },
            { en: "A squeaky mallet? Bueno, at least now you can tenderize the meatball properly!", es: "¿Un mazo que chilla? Bueno, ¡al menos ahora van a ablandar esa albóndiga de barro!" },
        ],
        [BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD]: [
            { en: "¡SANTO CIELO! Put me down, you bearded homeless sorcerer!!", es: "¡SANTO CIELO! ¡Bájame inmediatamente, viejo chiflado sinvergüenza!" },
            { en: "Who taught that viejo to throw elderly women into orbit?!", es: "¡¿Quién le enseñó a ese viejo a tirar a señoras decentes por el aire?!" },
            { en: "I'm flying higher than my empanada prices! ¡Auxiliooo!", es: "¡Estoy volando más alto que los precios del mercado! ¡¡Auxiliooo!!" },
        ],
        [BANTER_TRIGGERS.CREW_REVIVE_CHECKPOINT]: [
            { en: "Resurrected and ready! Who took my purse while I was underwater?!", es: "¡Resucitada y lista! ¿Quién me revisó la cartera mientras estaba bajo el agua?" },
            { en: "You thought you got rid of your Tía?! Not on this river, cariño!", es: "¡¿Pensaron que se libraban de su Tía?! ¡Ni en sueños, mi cielo!" },
            { en: "I survived three divorces, that river mud wasn't going to stop me!", es: "¡Sobreviví a tres divorcios, mirá si este barro me va a parar a mí!" },
        ],
        [BANTER_TRIGGERS.CREW_SPOT_LONG_WORM]: [
            { en: "¡DIOS MÍO! That oversized spaghetti is coming right for my kitchen!", es: "¡DIOS MÍO! ¡Ese fideo gigante viene directo a voltearnos la cocina!" },
            { en: "Quick, dodge it! If that worm dents my bulwark, someone is getting chancla!", es: "¡Esquiven eso, rápido! ¡Si esa lombriz me raya el casco va a haber chancletazo!" },
            { en: "Look at all those bioluminescent ribs! Could make great soup broth...", es: "¡Miren esas costillas que brillan! Qué rico caldo de pescado saldría de ahí..." },
        ],
    },

    // 6. AI Crewmate: El Pibe
    pibe: {
        [BANTER_TRIGGERS.CREW_BUY_HAMMER]: [
            { en: "YOOOO!! The Squeaky Hammer is pure meta! *SQUEAK SQUEAK* NO SCOPE!", es: "¡¡UOOO!! ¡El martillo chillón es puro meta! ¡*SQUEAK SQUEAK* DALE PAPÁ!" },
            { en: "Bro bought the meme weapon! 30 damage per bonk let's gooooo!", es: "¡Compró el arma del meme! ¡30 de daño por cada golpe vamooss!" },
            { en: "Sound design 10/10, that squeak is emotional damage to the enemy!", es: "¡Diseño sonoro 10 de 10, ese chillido daña psicológicamente al brujo!" },
        ],
        [BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD]: [
            { en: "WE ARE GOING TO BRAZILLLLL!! *cartoon falling whistle*", es: "¡¡NOS FUIMOS A OTRA DIMENSIÓN!! *silbido de caída libre*" },
            { en: "Bro literally hit me with physics engine glitch! Clip that!!", es: "¡Bro me mandó a volar con el motor de físicas! ¡Clipeen eso que sale en TikTok!" },
            { en: "I CAN SEE MY HOUSE FROM HEEEEEERE!", es: "¡¡PUEDO VER MI CASA DESDE ACÁAAAAA!!" },
        ],
        [BANTER_TRIGGERS.CREW_REVIVE_CHECKPOINT]: [
            { en: "Respawn timer was 0.2 seconds too long, skill issue by the river!", es: "¡El respawn tardó un toque, pero ya reviví! ¡Skill issue total del río!" },
            { en: "Second life, double the swagger. Give me that paddle!", es: "¡Segunda vida, papá! ¡Pasame ese remo que la carreamos toda!" },
            { en: "Checkpoints carry harder than my ranked teammates!", es: "¡Los checkpoints carrilean más que mis compañeros en ranked!" },
        ],
        [BANTER_TRIGGERS.CREW_SPOT_LONG_WORM]: [
            { en: "FINAL BOSS VIBES! The Long Worm is charging, SIDE-STEP IT BRO!!", es: "¡TREMENDO JEFE! ¡Viene el gusano largo a los gomazos, esquivalooo!" },
            { en: "Bro think he slither.io! Dodge the charge and punish on cooldown!", es: "¡Se cree el de slither.io el bicho ese! ¡Esquiven la carga y peguénle quieto!" },
            { en: "That hitbox is gargantuan! Don't get swallowed whole!!", es: "¡Esa hitbox es gigantezca! ¡No se dejen comer enteros que no revivimos más!" },
        ],
    },
};

// ─── Deterministic Seeded Random Helper ──────────────────────────────────────

export function createBanterRng(seed = 1337) {
    let a = (seed >>> 0) || 1;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Banter Selection & Formatting ──────────────────────────────────────────

/**
 * Returns formatted banter dialogue line chosen deterministically.
 * @param {string} trigger - BANTER_TRIGGERS constant
 * @param {object} [options]
 * @param {string} [options.characterId] - Optional character identifier
 * @param {string} [options.language] - 'bilingual', 'es', or 'en'
 * @param {number} [options.lineIndex] - Optional explicit line index
 * @param {function} [options.rng] - Optional seeded rng
 */
export function getBanterLine(trigger, {
    characterId = null,
    language = 'bilingual',
    lineIndex = null,
    rng = Math.random,
} = {}) {
    let pool = null;

    if (characterId && BANTER_LINES[characterId] && BANTER_LINES[characterId][trigger]) {
        pool = BANTER_LINES[characterId][trigger];
    } else if (BANTER_LINES[trigger]) {
        pool = BANTER_LINES[trigger];
    }

    if (!pool || pool.length === 0) return null;

    const idx = lineIndex !== null && lineIndex >= 0
        ? lineIndex % pool.length
        : Math.floor(rng() * pool.length);

    const entry = pool[idx];

    let text = entry.en;
    if (language === 'es') {
        text = entry.es;
    } else if (language === 'bilingual') {
        // Natural mix or Spanish spice line
        text = entry.es || entry.en;
    }

    return {
        trigger,
        characterId,
        index: idx,
        text,
        en: entry.en,
        es: entry.es,
    };
}

// ─── Rate-Limiting & Cooldown Manager ───────────────────────────────────────

export class BanterCooldownManager {
    constructor() {
        this.globalLastTriggerTime = -Infinity;
        this.triggerLastTimes = new Map();
        this.characterLastTimes = new Map();
    }

    /**
     * Checks if a trigger is currently on cooldown.
     */
    canTrigger(triggerId, characterId = null, nowMs = 0) {
        const cfg = TRIGGER_CONFIGS[triggerId];
        if (!cfg) return false;

        // Global cooldown across all banter
        const globalCd = 1200; // Minimum pause between ANY two lines
        if (nowMs - this.globalLastTriggerTime < globalCd) {
            return false;
        }

        // Specific trigger cooldown
        if (this.triggerLastTimes.has(triggerId)) {
            const lastTrigger = this.triggerLastTimes.get(triggerId);
            if (nowMs - lastTrigger < cfg.globalCooldownMs) {
                return false;
            }
        }

        // Specific character cooldown
        const charId = characterId || cfg.characterId;
        if (charId && this.characterLastTimes.has(charId)) {
            const lastChar = this.characterLastTimes.get(charId);
            if (nowMs - lastChar < cfg.characterCooldownMs) {
                return false;
            }
        }

        return true;
    }

    /**
     * Marks a trigger as fired, recording timestamps.
     */
    recordTrigger(triggerId, characterId = null, nowMs = 0) {
        const cfg = TRIGGER_CONFIGS[triggerId];
        this.globalLastTriggerTime = nowMs;
        this.triggerLastTimes.set(triggerId, nowMs);

        const charId = characterId || cfg?.characterId;
        if (charId) {
            this.characterLastTimes.set(charId, nowMs);
        }
    }

    /**
     * Resets all cooldowns to initial state.
     */
    reset() {
        this.globalLastTriggerTime = -Infinity;
        this.triggerLastTimes.clear();
        this.characterLastTimes.clear();
    }
}

// ─── Contextual Banter Rules Evaluator (Pure Game Simulation Logic) ─────────

/**
 * Evaluates game state snapshots and returns any banter events that should trigger.
 * Pure and deterministic.
 *
 * @param {object} gameState
 * @param {object} gameState.players - Map or array of players
 * @param {object} gameState.enemies - Map of enemies (whiteGuy, mudAlien, longWorm)
 * @param {Array}  [gameState.npcs] - Array of NPCs (pedestrians, police)
 * @param {object} [contextEvent] - Optional discrete event (e.g. buyUpgrade, playerThrown, playerRevived)
 * @param {number} nowMs - Current simulation timestamp in ms
 * @param {BanterCooldownManager} cooldownManager - Cooldown tracker instance
 * @param {object} [options]
 * @param {string} [options.language] - 'bilingual' | 'en' | 'es'
 * @param {function} [options.rng] - Seeded PRNG
 * @returns {Array<object>} List of fired banter trigger payloads
 */
export function evaluateBanterRules(
    gameState,
    contextEvent = null,
    nowMs = 0,
    cooldownManager = null,
    { language = 'bilingual', rng = Math.random } = {}
) {
    const cd = cooldownManager || new BanterCooldownManager();
    const triggeredEvents = [];

    const playersList = Array.isArray(gameState?.players)
        ? gameState.players
        : Object.values(gameState?.players || {});
    const enemies = gameState?.enemies || {};
    const npcs = gameState?.npcs || [];

    // Helper to attempt firing
    const tryFire = (triggerId, charId, worldPos, extraData = {}) => {
        if (!cd.canTrigger(triggerId, charId, nowMs)) return false;

        const line = getBanterLine(triggerId, { characterId: charId, language, rng });
        if (!line) return false;

        const charMeta = BANTER_CHARACTERS[charId?.toUpperCase()]
            || Object.values(BANTER_CHARACTERS).find((c) => c.id === charId)
            || { id: charId, displayName: charId, portrait: '💬', color: '#fff' };

        const cfg = TRIGGER_CONFIGS[triggerId];
        cd.recordTrigger(triggerId, charId, nowMs);

        triggeredEvents.push({
            id: `banter_${nowMs}_${triggerId}_${charId}`,
            trigger: triggerId,
            character: charMeta,
            text: line.text,
            en: line.en,
            es: line.es,
            worldPosition: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
            durationMs: cfg?.durationMs || 3500,
            priority: cfg?.priority || BANTER_PRIORITIES.MEDIUM,
            timestamp: nowMs,
            extra: extraData,
        });
        return true;
    };

    // ── Rule 1: Elevation-Blind Wizard (Target player jumped onto a plank y > 1) ──
    const wizard = enemies.whiteGuy;
    if (wizard && wizard.health > 0) {
        // Find if any player near the wizard is elevated (plank jump y > 1)
        for (const p of playersList) {
            if (!p.isDead && p.position) {
                const distZ = Math.abs(p.position.z - wizard.position.z);
                const distX = Math.abs(p.position.x - wizard.position.x);
                if (distZ < 35 && distX < 25 && p.position.y > 1.0) {
                    tryFire(
                        BANTER_TRIGGERS.WIZARD_PLANK_JUMP,
                        BANTER_CHARACTERS.WIZARD.id,
                        { x: wizard.position.x, y: (wizard.position.y || 0.5) + 2.0, z: wizard.position.z },
                        { targetPlayerId: p.id, targetY: p.position.y }
                    );
                    break;
                }
            }
        }
    }

    // ── Rule 3: Harbor Police (Aggroed on Mud Alien - higher priority than pedestrian) ──
    const mudAlien = enemies.mudAlien;
    let policeFired = false;
    if (mudAlien && mudAlien.health > 0) {
        const aggroPolice = npcs.find((n) => n.type === 'police' && !n.isDead && n.aggroTarget === 'mudAlien');
        if (aggroPolice) {
            policeFired = tryFire(
                BANTER_TRIGGERS.POLICE_MUD_AGGRO,
                BANTER_CHARACTERS.POLICE.id,
                { x: aggroPolice.position.x, y: (aggroPolice.position.y || 1) + 1.8, z: aggroPolice.position.z },
                { officerId: aggroPolice.id }
            );
        }
    }

    // ── Rule 2: Harbor Pedestrians (Mud Alien approaches z = -200) ──────────
    if (mudAlien && mudAlien.health > 0 && !policeFired) {
        const mudZ = mudAlien.position?.z || 0;
        // City harbor dock is around z = -150 to -250 (center -200)
        // Pedestrian lines trigger when there is an active alive pedestrian nearby
        const ped = npcs.find((n) => n.type === 'pedestrian' && !n.isDead);
        if (ped && Math.abs(mudZ - (-200)) < 40) {
            tryFire(
                BANTER_TRIGGERS.PEDESTRIAN_MUD_APPROACH,
                BANTER_CHARACTERS.PEDESTRIAN.id,
                { x: ped.position.x, y: (ped.position.y || 1) + 1.8, z: ped.position.z },
                { mudZ }
            );
        }
    }

    // ── Rule 4: Discrete Context Events (Upgrades, Yeet, Revive, Worm) ──────
    if (contextEvent) {
        const { type, data } = contextEvent;

        // Crew buys Squeaky Hammer
        if (type === 'upgradePurchased' || type === 'buyUpgrade') {
            const upgradeType = typeof data === 'string' ? data : data?.type;
            if (upgradeType === 'weapon') {
                const buyerId = data?.playerId || data?.id || 'p1';
                const char = getCrewmateForPlayer(buyerId, playersList);
                const pos = data?.position || { x: 0, y: 1, z: -200 };
                tryFire(
                    BANTER_TRIGGERS.CREW_BUY_HAMMER,
                    char.id,
                    { x: pos.x, y: pos.y + 1.5, z: pos.z },
                    { buyerId }
                );
            }
        }

        // Crew Yeeted by Wizard (playerThrown)
        if (type === 'playerThrown') {
            const victimId = data?.id || data?.playerId;
            const victim = playersList.find((p) => p.id === victimId);
            const char = getCrewmateForPlayer(victimId, playersList);
            const pos = victim?.position || data?.position || { x: 0, y: 6, z: -100 };
            tryFire(
                BANTER_TRIGGERS.CREW_YEETED_BY_WIZARD,
                char.id,
                { x: pos.x, y: (pos.y || 5) + 1.5, z: pos.z },
                { victimId, force: data?.force }
            );
        }

        // Crew Revived at Checkpoint
        if (type === 'playerRevived' || type === 'checkpointCrossed') {
            const revivedId = data?.id || (Array.isArray(data) ? data[0]?.id : null);
            const char = getCrewmateForPlayer(revivedId, playersList);
            const pos = data?.position || { x: 0, y: 1, z: data?.checkpointZ || -150 };
            tryFire(
                BANTER_TRIGGERS.CREW_REVIVE_CHECKPOINT,
                char.id,
                { x: pos.x, y: (pos.y || 1) + 1.5, z: pos.z },
                { revivedId }
            );
        }

        // Crew Spots Long Worm
        if (type === 'longWormSpotted' || (type === 'enemyRespawn' && data?.type === 'longWorm')) {
            const worm = enemies.longWorm || data;
            const spotter = playersList[0] || { position: { x: 0, y: 0.5, z: -300 } };
            const char = getCrewmateForPlayer(spotter.id, playersList);
            tryFire(
                BANTER_TRIGGERS.CREW_SPOT_LONG_WORM,
                char.id,
                { x: spotter.position.x, y: (spotter.position.y || 0.5) + 1.5, z: spotter.position.z },
                { wormZ: worm?.position?.z }
            );
        }
    }

    // Check if Long Worm is charging and within spot range if not triggered by event
    const worm = enemies.longWorm;
    if (worm && worm.health > 0 && worm.state === 'charging' && playersList.length > 0) {
        const lead = playersList[0];
        if (Math.abs(lead.position.z - worm.position.z) < 180) {
            const char = getCrewmateForPlayer(lead.id, playersList);
            tryFire(
                BANTER_TRIGGERS.CREW_SPOT_LONG_WORM,
                char.id,
                { x: lead.position.x, y: (lead.position.y || 0.5) + 1.5, z: lead.position.z },
                { charging: true }
            );
        }
    }

    return triggeredEvents;
}

/**
 * Maps player index/ID to one of the 3 iconic AI crewmates (Mateo, Marta, Pibe).
 */
export function getCrewmateForPlayer(playerId, playersList = []) {
    const list = Array.isArray(playersList) ? playersList : Object.values(playersList || {});
    const idx = list.findIndex((p) => p.id === playerId);
    const assignedIndex = idx >= 0 ? idx % 3 : 0;

    switch (assignedIndex) {
        case 0:
            return BANTER_CHARACTERS.MATEO;
        case 1:
            return BANTER_CHARACTERS.MARTA;
        case 2:
            return BANTER_CHARACTERS.PIBE;
        default:
            return BANTER_CHARACTERS.MATEO;
    }
}

// ─── 3D World to 2D Screen Projection Mathematics ───────────────────────────

/**
 * Pure 4x4 matrix vector multiply and perspective divide (headless-safe).
 * projects 3D world position (x, y, z) into screen coordinate pixels.
 *
 * @param {object} worldPos - { x, y, z }
 * @param {Array<number>} viewProjMatrix - 16-element column-major matrix
 * @param {number} screenWidth - viewport width in pixels
 * @param {number} screenHeight - viewport height in pixels
 * @returns {object} { x, y, inFront, zDist }
 */
export function projectWorldToScreen(worldPos, viewProjMatrix, screenWidth, screenHeight) {
    const { x, y, z } = worldPos;
    const m = viewProjMatrix;

    // Vector4 = Matrix4 * (x, y, z, 1.0)
    // Three.js matrices are column-major:
    // row 0: m[0], m[4], m[8], m[12]
    // row 1: m[1], m[5], m[9], m[13]
    // row 2: m[2], m[6], m[10], m[14]
    // row 3: m[3], m[7], m[11], m[15]
    const clipX = m[0] * x + m[4] * y + m[8] * z + m[12];
    const clipY = m[1] * x + m[5] * y + m[9] * z + m[13];
    const clipZ = m[2] * x + m[6] * y + m[10] * z + m[14];
    const clipW = m[3] * x + m[7] * y + m[11] * z + m[15];

    if (clipW <= 0.0001) {
        return {
            x: -9999,
            y: -9999,
            inFront: false,
            zDist: clipW,
        };
    }

    // Normalized Device Coordinates (-1 to 1)
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;

    // Viewport pixels (0,0 is top-left in web DOM)
    const screenX = (ndcX * 0.5 + 0.5) * screenWidth;
    const screenY = (1.0 - (ndcY * 0.5 + 0.5)) * screenHeight;

    const inFront = clipW > 0 && ndcX >= -1.2 && ndcX <= 1.2 && ndcY >= -1.2 && ndcY <= 1.2;

    return {
        x: screenX,
        y: screenY,
        inFront,
        zDist: clipW,
    };
}

/**
 * Clamps 2D screen coordinate so the speech bubble stays within view padding.
 */
export function clampBubbleToViewport(screenX, screenY, bubbleWidth, bubbleHeight, screenWidth, screenHeight, padding = 16) {
    const minX = padding + bubbleWidth * 0.5;
    const maxX = screenWidth - padding - bubbleWidth * 0.5;
    const minY = padding + bubbleHeight;
    const maxY = screenHeight - padding;

    return {
        x: Math.max(minX, Math.min(maxX, screenX)),
        y: Math.max(minY, Math.min(maxY, screenY)),
        isClamped: screenX < minX || screenX > maxX || screenY < minY || screenY > maxY,
    };
}
