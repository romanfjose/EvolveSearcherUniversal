/**
 * Don't Sink, Don't Die — Explosive Attract-Mode Showcase Director
 * (`shared/attract-showcase.js`)
 *
 * Sovereign Helmet 04 Directive (Strategist Shark):
 * Optimizes for the first 5-10 seconds of human/recruiter attention.
 * When on the title screen or launched with ?demo=1, cycles through 4 high-voltage
 * 6-second action cuts (24s total loop):
 *
 *   Cut 1: "Waterfall Kickflip in Sunset Canyon"
 *          - Biome: Act I Sunset Canyon (Amber Canyon Headwaters)
 *          - Raft launches off waterfall ramp, performs 360 kickflip stunt, lands into hydroplaning wake.
 *   Cut 2: "War Mallet Double-Smash in Drowned Harbor"
 *          - Biome: Act II Drowned Harbor (Neon Harbor & Smuggler Docks)
 *          - Dual War Mallet shockwave strikes flattening Mud Aliens with visceral hitstop crits.
 *   Cut 3: "Disco Crab Rave in Bioluminescent Cavern"
 *          - Biome: Act III Bioluminescent Cavern (Bioluminescent Abyssal Gorge)
 *          - Neon crabs pulsing at 120 BPM, capybara calm aura, and coin multiplier shower.
 *   Cut 4: "Dread Kraken Tentacle Parry in Maelstrom Mouth"
 *          - Biome: Act IV Maelstrom Mouth (Tempest Maelstrom & Citadel Mouth)
 *          - 220ms Perfect Parry reflecting colossal Kraken tentacle slam with electric shockwave.
 *
 * Zero external dependencies. Pure, deterministic mathematical simulation and trajectory planning.
 */

export const CUT_DURATION_SEC = 6.0;
export const TOTAL_SHOWCASE_DURATION_SEC = 24.0;

export const SHOWCASE_CUT_IDS = {
    WATERFALL_KICKFLIP: 'waterfall-kickflip',
    WAR_MALLET_SMASH: 'war-mallet-smash',
    DISCO_CRAB_RAVE: 'disco-crab-rave',
    KRAKEN_PARRY: 'kraken-parry',
};

/**
 * 4 High-Voltage Showcase Cut Specifications
 */
export const ATTRACT_CUTS = [
    {
        index: 0,
        id: SHOWCASE_CUT_IDS.WATERFALL_KICKFLIP,
        title: 'Waterfall Kickflip in Sunset Canyon',
        tagline: 'Defy River Gravity',
        act: 1,
        biomeName: 'Sunset Canyon',
        riverZ: -120, // Canyon headwaters near stunt ramp
        durationSec: CUT_DURATION_SEC,
        cameraProfile: {
            mode: 'dynamic-orbit',
            baseFov: 72,
            targetFov: 58,
            orbitRadius: 14.0,
            orbitHeightStart: 7.5,
            orbitHeightEnd: 4.5,
            startAngleRad: -Math.PI * 0.4,
            endAngleRad: Math.PI * 0.35,
            lookAheadDistance: 12.0,
        },
        focusEntity: 'player-raft',
        actionTriggers: [
            { timeSec: 0.8, action: 'hit-waterfall-ramp', payload: { verticalImpulse: 18.0, forwardBoost: -24.0 } },
            { timeSec: 1.4, action: 'trigger-kickflip', payload: { rotationDeg: 360, trickName: 'Waterfall Kickflip' } },
            { timeSec: 3.2, action: 'water-landing-splash', payload: { hydroplaningSec: 2.5, coinsBonus: 10 } },
            { timeSec: 4.5, action: 'nitro-boost', payload: { speedMultiplier: 1.7 } },
        ],
    },
    {
        index: 1,
        id: SHOWCASE_CUT_IDS.WAR_MALLET_SMASH,
        title: 'War Mallet Double-Smash in Drowned Harbor',
        tagline: 'Brutal Industrial Impact',
        act: 2,
        biomeName: 'Drowned Harbor',
        riverZ: -520, // Industrial harbor basin
        durationSec: CUT_DURATION_SEC,
        cameraProfile: {
            mode: 'shoulder-tracking',
            baseFov: 65,
            targetFov: 52,
            orbitRadius: 10.5,
            orbitHeightStart: 5.5,
            orbitHeightEnd: 3.8,
            startAngleRad: Math.PI * 0.15,
            endAngleRad: Math.PI * 0.65,
            lookAheadDistance: 8.0,
        },
        focusEntity: 'player-crew',
        actionTriggers: [
            { timeSec: 1.0, action: 'windup-mallet-strike', payload: { hammerId: 'war-mallet-tier3', glowingRune: true } },
            { timeSec: 1.8, action: 'mallet-impact-1', payload: { target: 'mudAlien-01', damage: 65, hitstopMs: 45, shockwaveRadius: 6.5 } },
            { timeSec: 3.0, action: 'secondary-cleave-charge', payload: { comboMultiplier: 2.0 } },
            { timeSec: 3.8, action: 'mallet-impact-2', payload: { target: 'mudAlien-02', damage: 85, hitstopMs: 60, ragdollLaunch: true } },
        ],
    },
    {
        index: 2,
        id: SHOWCASE_CUT_IDS.DISCO_CRAB_RAVE,
        title: 'Disco Crab Rave in Bioluminescent Cavern',
        tagline: 'Neon Groove Underworld',
        act: 3,
        biomeName: 'Bioluminescent Cavern',
        riverZ: -920, // Abyssal crystal cavern
        durationSec: CUT_DURATION_SEC,
        cameraProfile: {
            mode: 'cinematic-pan',
            baseFov: 70,
            targetFov: 62,
            orbitRadius: 16.0,
            orbitHeightStart: 8.0,
            orbitHeightEnd: 6.0,
            startAngleRad: -Math.PI * 0.75,
            endAngleRad: -Math.PI * 0.1,
            lookAheadDistance: 10.0,
        },
        focusEntity: 'disco-island',
        actionTriggers: [
            { timeSec: 0.6, action: 'crab-rave-beat-sync', payload: { bpm: 120, crabCount: 8, neonStrobe: true } },
            { timeSec: 2.0, action: 'capybara-tangerine-nod', payload: { healAura: true, calmDurationSec: 3.0 } },
            { timeSec: 3.4, action: 'double-coin-fountain', payload: { multiplier: 2.0, coinCount: 40 } },
            { timeSec: 4.8, action: 'strobe-crystal-pulse', payload: { colorHex: 0x06b6d4, intensity: 1.8 } },
        ],
    },
    {
        index: 3,
        id: SHOWCASE_CUT_IDS.KRAKEN_PARRY,
        title: 'Dread Kraken Tentacle Parry in Maelstrom Mouth',
        tagline: 'Apex Boss Counter-Strike',
        act: 4,
        biomeName: 'Maelstrom Mouth',
        riverZ: -1350, // Final Kraken Boss Arena
        durationSec: CUT_DURATION_SEC,
        cameraProfile: {
            mode: 'boss-low-angle',
            baseFov: 78,
            targetFov: 50,
            orbitRadius: 18.0,
            orbitHeightStart: 3.2,
            orbitHeightEnd: 7.0,
            startAngleRad: -Math.PI * 0.25,
            endAngleRad: Math.PI * 0.3,
            lookAheadDistance: 15.0,
        },
        focusEntity: 'dread-kraken',
        actionTriggers: [
            { timeSec: 0.9, action: 'tentacle-telegraph-rise', payload: { tentacleIndex: 2, height: 16.0, dangerRingRadius: 8.0 } },
            { timeSec: 2.3, action: 'colossal-tentacle-slam', payload: { targetPos: { x: 0, y: 0.25, z: -1350 } } },
            { timeSec: 2.45, action: 'perfect-parry-impact', payload: { windowMs: 220, hitstopMs: 60, reflectedDamage: 120, stunDurationSec: 2.5 } },
            { timeSec: 4.0, action: 'kraken-recoil-stagger', payload: { bossHpRemaining: 880, barnacleWeakpointExposed: true } },
        ],
    },
];

/**
 * Checks URL query parameters or explicit flag for Attract / Demo reel mode.
 * Supports: `?demo=1`, `?demo=true`, `?attract=1`, `?attract=true`.
 *
 * @param {string|object} [queryOrLocation] - URL string, location object, or search params string.
 * @returns {boolean}
 */
export function isAttractDemoRequested(queryOrLocation) {
    if (!queryOrLocation) return false;

    let search = '';
    if (typeof queryOrLocation === 'string') {
        search = queryOrLocation.includes('?') ? queryOrLocation.split('?')[1] : queryOrLocation;
    } else if (typeof queryOrLocation === 'object') {
        search = queryOrLocation.search || queryOrLocation.searchParams?.toString() || '';
    }

    if (!search) return false;
    const params = new URLSearchParams(search);
    const demoVal = params.get('demo');
    const attractVal = params.get('attract');

    const isTrue = (val) => val === '1' || val === 'true' || val === '' || val === 'yes';
    return isTrue(demoVal) || isTrue(attractVal);
}

/**
 * Clamp helper
 */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Smooth cubic Hermite interpolation (smoothstep)
 */
export function smoothstep(min, max, val) {
    const x = clamp((val - min) / (max - min), 0, 1);
    return x * x * (3 - 2 * x);
}

/**
 * Compute the 3D camera orbit trajectory for a given cut and elapsed seconds into the cut.
 * Returns exact camera position {x, y, z}, lookAt target {x, y, z}, FOV, and roll tilt.
 *
 * @param {object} cut - Showcase cut definition from ATTRACT_CUTS
 * @param {number} elapsedSecInCut - Progress into current cut (0.0 to CUT_DURATION_SEC)
 * @param {object} [baseAnchorPos] - Optional override for anchor position
 * @returns {object} { eye: {x,y,z}, target: {x,y,z}, fov: number, roll: number }
 */
export function calculateCameraOrbit(cut, elapsedSecInCut, baseAnchorPos = null) {
    const duration = cut.durationSec || CUT_DURATION_SEC;
    const t = clamp(elapsedSecInCut / duration, 0, 1);
    const smoothT = smoothstep(0, 1, t);

    const anchor = baseAnchorPos || { x: 0, y: 0.25, z: cut.riverZ };
    const cam = cut.cameraProfile;

    // Angle interpolation around anchor
    const angle = cam.startAngleRad + (cam.endAngleRad - cam.startAngleRad) * smoothT;

    // Orbit height and radius interpolation
    const height = cam.orbitHeightStart + (cam.orbitHeightEnd - cam.orbitHeightStart) * smoothT;
    const radius = cam.orbitRadius * (1.0 - 0.15 * Math.sin(smoothT * Math.PI)); // Subtle breathe-in pulse

    // Eye coordinates relative to anchor
    const eyeX = anchor.x + Math.sin(angle) * radius;
    const eyeY = anchor.y + height;
    const eyeZ = anchor.z + Math.cos(angle) * radius;

    // Dynamic FOV punch during high action moments (mid-cut dramatic zoom)
    const baseFov = cam.baseFov;
    const targetFov = cam.targetFov;
    const fov = baseFov + (targetFov - baseFov) * smoothT;

    // LookAt Target tracks ahead downriver
    const targetX = anchor.x + Math.sin(angle * 0.5) * 1.5;
    const targetY = anchor.y + 1.2;
    const targetZ = anchor.z - (cam.lookAheadDistance * (0.3 + 0.7 * smoothT));

    // Dynamic Dutch angle roll during kickflip and parry cuts
    let roll = 0;
    if (cut.id === SHOWCASE_CUT_IDS.WATERFALL_KICKFLIP) {
        // Roll angle matches kickflip mid-air roll peak
        roll = Math.sin(smoothT * Math.PI) * 0.18; // ~10 degrees dynamic roll
    } else if (cut.id === SHOWCASE_CUT_IDS.KRAKEN_PARRY) {
        // Sudden camera tilt during tentacle impact
        roll = -Math.sin(smoothT * Math.PI * 1.5) * 0.12;
    }

    return {
        eye: { x: Number(eyeX.toFixed(3)), y: Number(eyeY.toFixed(3)), z: Number(eyeZ.toFixed(3)) },
        target: { x: Number(targetX.toFixed(3)), y: Number(targetY.toFixed(3)), z: Number(targetZ.toFixed(3)) },
        fov: Number(fov.toFixed(2)),
        roll: Number(roll.toFixed(3)),
        progress: Number(t.toFixed(4)),
    };
}

/**
 * Evaluates pending AI action triggers for the current cut between previousTime and currentTime.
 * Guarantees each trigger fires exactly once per cut cycle.
 *
 * @param {object} cut - Showcase cut definition
 * @param {number} prevSecInCut - Previous elapsed seconds in this cut
 * @param {number} currentSecInCut - Current elapsed seconds in this cut
 * @returns {Array<object>} Array of fired action trigger objects
 */
export function evaluateCutActionTriggers(cut, prevSecInCut, currentSecInCut) {
    if (!cut || !cut.actionTriggers) return [];

    const fired = [];
    for (let i = 0; i < cut.actionTriggers.length; i++) {
        const trigger = cut.actionTriggers[i];
        if (trigger.timeSec > prevSecInCut && trigger.timeSec <= currentSecInCut) {
            fired.push({
                cutId: cut.id,
                act: cut.act,
                timeSec: trigger.timeSec,
                action: trigger.action,
                payload: { ...trigger.payload },
            });
        }
    }
    return fired;
}

/**
 * Creates an instance of the Attract Mode Showcase Director.
 *
 * @param {object} [options]
 * @param {number} [options.initialCutIndex=0] - Starting cut index (0..3)
 * @param {boolean} [options.loop=true] - Continuously cycle cuts
 * @param {boolean} [options.autoStart=true] - Start in running state
 * @param {function} [options.onCutChange] - Callback when cut transitions: (cut, prevCut) => {}
 * @param {function} [options.onActionTrigger] - Callback when AI action triggers: (trigger) => {}
 * @returns {object} Attract Showcase Director API
 */
export function createAttractShowcaseDirector(options = {}) {
    const loop = options.loop !== false;
    let isRunning = options.autoStart !== false;
    let cutIndex = clamp(Math.floor(options.initialCutIndex || 0), 0, ATTRACT_CUTS.length - 1);
    let elapsedInCurrentCut = 0;
    let totalElapsedShowcase = cutIndex * CUT_DURATION_SEC;
    let cycleCount = 0;

    const onCutChange = typeof options.onCutChange === 'function' ? options.onCutChange : null;
    const onActionTrigger = typeof options.onActionTrigger === 'function' ? options.onActionTrigger : null;

    /**
     * Jump immediately to a specific cut
     */
    function setCut(newIndex) {
        const target = clamp(Math.floor(newIndex), 0, ATTRACT_CUTS.length - 1);
        const prevCut = ATTRACT_CUTS[cutIndex];
        cutIndex = target;
        elapsedInCurrentCut = 0;
        totalElapsedShowcase = target * CUT_DURATION_SEC;
        const currentCut = ATTRACT_CUTS[cutIndex];

        if (onCutChange) {
            onCutChange(currentCut, prevCut);
        }
        return currentCut;
    }

    /**
     * Advance simulation by dt seconds
     * @param {number} dt - Delta time in seconds
     * @returns {object} Current showcase state snapshot & fired triggers
     */
    function step(dt = 1 / 60) {
        if (!isRunning || dt <= 0) {
            const currentCut = ATTRACT_CUTS[cutIndex];
            return {
                isRunning,
                currentCut,
                cutIndex,
                elapsedInCurrentCut,
                totalElapsedShowcase,
                cycleCount,
                camera: calculateCameraOrbit(currentCut, elapsedInCurrentCut),
                firedTriggers: [],
                cutChanged: false,
            };
        }

        const prevSec = elapsedInCurrentCut;
        elapsedInCurrentCut += dt;
        totalElapsedShowcase += dt;

        let cutChanged = false;
        let currentCut = ATTRACT_CUTS[cutIndex];
        let firedTriggers = [];

        // Check for cut completion (6 seconds)
        if (elapsedInCurrentCut >= currentCut.durationSec) {
            // Collect any trailing triggers up to the boundary
            firedTriggers.push(...evaluateCutActionTriggers(currentCut, prevSec, currentCut.durationSec));

            const prevCut = currentCut;
            const nextIndex = cutIndex + 1;

            if (nextIndex >= ATTRACT_CUTS.length) {
                if (loop) {
                    cycleCount++;
                    cutIndex = 0;
                    elapsedInCurrentCut -= prevCut.durationSec;
                    totalElapsedShowcase = 0;
                    cutChanged = true;
                } else {
                    isRunning = false;
                    elapsedInCurrentCut = currentCut.durationSec;
                }
            } else {
                cutIndex = nextIndex;
                elapsedInCurrentCut -= prevCut.durationSec;
                cutChanged = true;
            }

            currentCut = ATTRACT_CUTS[cutIndex];
            if (cutChanged && onCutChange) {
                onCutChange(currentCut, prevCut);
            }

            // Also evaluate any triggers that fall into the new cut start
            if (elapsedInCurrentCut > 0) {
                firedTriggers.push(...evaluateCutActionTriggers(currentCut, 0, elapsedInCurrentCut));
            }
        } else {
            firedTriggers.push(...evaluateCutActionTriggers(currentCut, prevSec, elapsedInCurrentCut));
        }

        // Invoke callbacks
        if (onActionTrigger && firedTriggers.length > 0) {
            for (let i = 0; i < firedTriggers.length; i++) {
                onActionTrigger(firedTriggers[i]);
            }
        }

        const camera = calculateCameraOrbit(currentCut, elapsedInCurrentCut);

        return {
            isRunning,
            currentCut,
            cutIndex,
            elapsedInCurrentCut,
            totalElapsedShowcase,
            cycleCount,
            camera,
            firedTriggers,
            cutChanged,
        };
    }

    function pause() {
        isRunning = false;
    }

    function resume() {
        isRunning = true;
    }

    function reset() {
        cutIndex = 0;
        elapsedInCurrentCut = 0;
        totalElapsedShowcase = 0;
        cycleCount = 0;
        isRunning = true;
    }

    function getCurrentCut() {
        return ATTRACT_CUTS[cutIndex];
    }

    function getSnapshot() {
        const currentCut = ATTRACT_CUTS[cutIndex];
        return {
            isRunning,
            cutIndex,
            currentCut,
            elapsedInCurrentCut,
            totalElapsedShowcase,
            cycleCount,
            camera: calculateCameraOrbit(currentCut, elapsedInCurrentCut),
        };
    }

    return {
        step,
        pause,
        resume,
        reset,
        setCut,
        getCurrentCut,
        getSnapshot,
        get isRunning() { return isRunning; },
        get cutIndex() { return cutIndex; },
        get elapsedInCurrentCut() { return elapsedInCurrentCut; },
        get totalElapsedShowcase() { return totalElapsedShowcase; },
        get cycleCount() { return cycleCount; },
    };
}
