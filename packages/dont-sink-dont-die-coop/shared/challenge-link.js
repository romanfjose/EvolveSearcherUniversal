/**
 * Don't Sink, Don't Die — 1-Click Viral Challenge URL Encoder & Rivalry Banner Engine
 * (shared/challenge-link.js)
 *
 * Implements Helmet 04 (Strategist Shark) Requirements:
 * - 1-Click viral social challenge URL generation and parsing:
 *   ?seed=42069&mode=coop&rival=Jose&targetDist=1450&targetScore=3200&ghost=base64url
 * - Instant race against sender's rival target marker on the river.
 * - Procedural floating 3D "RIVAL TARGET LINE" banner at the exact Z coordinate to beat,
 *   complete with laser finish line across the river, glowing holographic signage,
 *   pulsing beacon towers, and live proximity / pass detection.
 * - Zero external dependencies. Fully deterministic, headless Node & browser compatible.
 */

export const CHALLENGE_MODES = {
    COOP: 'coop',
    DAILY: 'daily',
    SOLO: 'solo',
    ENDLESS: 'endless',
    CAMPAIGN: 'campaign',
};

export const DEFAULT_CHALLENGE_SETTINGS = {
    seed: 42069,
    mode: CHALLENGE_MODES.COOP,
    rival: 'Jose',
    targetDist: 1450,
    targetScore: 3200,
    ghost: null,
};

// ─── Base64 & Base64URL Conversion Helpers ──────────────────────────────────

/**
 * Encodes a UTF-8 string or object to URL-safe Base64 (base64url).
 * Safe across Node.js Buffer and browser atob/btoa environments.
 */
export function toBase64Url(data) {
    if (data == null) return '';
    const str = typeof data === 'object' ? JSON.stringify(data) : String(data);

    let b64 = '';
    if (typeof Buffer !== 'undefined') {
        b64 = Buffer.from(str, 'utf8').toString('base64');
    } else if (typeof btoa === 'function') {
        b64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    } else {
        throw new Error('Base64 encoding not supported in current environment');
    }

    // Convert standard Base64 to Base64URL (- and _ without padding =)
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a URL-safe Base64 (base64url) or standard Base64 string back to UTF-8 string.
 */
export function fromBase64Url(b64url) {
    if (!b64url || typeof b64url !== 'string') return '';

    // Convert base64url back to standard base64 and pad with '='
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
        b64 += '=';
    }

    if (typeof Buffer !== 'undefined') {
        return Buffer.from(b64, 'base64').toString('utf8');
    }
    if (typeof atob === 'function') {
        const binary = atob(b64);
        const percent = Array.from(binary)
            .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
            .join('');
        return decodeURIComponent(percent);
    }
    throw new Error('Base64 decoding not supported in current environment');
}

// ─── River Coordinate & Distance Helpers ────────────────────────────────────

/**
 * Converts positive target distance downriver (e.g. 1450m) to Three.js river Z coordinate.
 * In Don't Sink Don't Die, start is z = 0 and downstream is negative Z (finish at z = -1500).
 */
export function distanceToZ(distanceMeters) {
    const dist = Math.max(0, Number(distanceMeters) || 0);
    return -dist;
}

/**
 * Converts Three.js river Z coordinate to positive downriver distance in meters.
 */
export function zToDistance(z) {
    const coordZ = Number(z) || 0;
    return Math.max(0, -coordZ);
}

// ─── Challenge Payload Sanitizer & Validator ────────────────────────────────

export function sanitizeChallengePayload(payload = {}) {
    const seed = payload.seed != null && !isNaN(Number(payload.seed))
        ? Number(payload.seed)
        : (typeof payload.seed === 'string' && payload.seed.trim() ? payload.seed.trim() : DEFAULT_CHALLENGE_SETTINGS.seed);

    let mode = (payload.mode || DEFAULT_CHALLENGE_SETTINGS.mode).toLowerCase().trim();
    if (!Object.values(CHALLENGE_MODES).includes(mode)) {
        mode = CHALLENGE_MODES.COOP;
    }

    const rivalRaw = payload.rival || payload.rivalName || payload.player || DEFAULT_CHALLENGE_SETTINGS.rival;
    const rival = String(rivalRaw).trim().slice(0, 32) || 'Rival Captain';

    const targetDist = Number.isFinite(Number(payload.targetDist))
        ? Math.max(1, Math.round(Number(payload.targetDist)))
        : (payload.targetZ != null ? Math.round(zToDistance(payload.targetZ)) : DEFAULT_CHALLENGE_SETTINGS.targetDist);

    const targetScore = Number.isFinite(Number(payload.targetScore))
        ? Math.max(0, Math.round(Number(payload.targetScore)))
        : DEFAULT_CHALLENGE_SETTINGS.targetScore;

    let ghost = null;
    if (payload.ghost) {
        if (typeof payload.ghost === 'string') {
            ghost = payload.ghost.trim();
        } else if (typeof payload.ghost === 'object') {
            ghost = toBase64Url(payload.ghost);
        }
    }

    return {
        seed,
        mode,
        rival,
        targetDist,
        targetScore,
        targetZ: distanceToZ(targetDist),
        ghost,
    };
}

// ─── Challenge URL Encoder & Decoder ────────────────────────────────────────

/**
 * Encodes challenge parameters into a compact URL string or query string:
 * e.g. `?seed=42069&mode=coop&rival=Jose&targetDist=1450&targetScore=3200&ghost=base64url`
 */
export function encodeChallengeUrl(params = {}, baseUrl = '') {
    const clean = sanitizeChallengePayload(params);
    const searchParams = new URLSearchParams();

    searchParams.set('seed', String(clean.seed));
    searchParams.set('mode', clean.mode);
    searchParams.set('rival', clean.rival);
    searchParams.set('targetDist', String(clean.targetDist));
    searchParams.set('targetScore', String(clean.targetScore));

    if (clean.ghost) {
        searchParams.set('ghost', clean.ghost);
    }

    const query = searchParams.toString();
    if (!baseUrl) {
        return `?${query}`;
    }

    const base = baseUrl.split('?')[0];
    return `${base}?${query}`;
}

/**
 * Decodes URL query string or full URL into a verified Challenge object.
 * Returns null if the URL contains no relevant challenge parameters.
 */
export function decodeChallengeUrl(urlOrQuery = '') {
    if (!urlOrQuery || typeof urlOrQuery !== 'string') {
        return null;
    }

    let search = urlOrQuery.trim();
    if (search.includes('?')) {
        search = search.slice(search.indexOf('?') + 1);
    } else if (search.includes('#')) {
        search = search.slice(search.indexOf('#') + 1);
    }

    const params = new URLSearchParams(search);
    const seedParam = params.get('seed');
    const modeParam = params.get('mode');
    const rivalParam = params.get('rival');
    const distParam = params.get('targetDist') || params.get('dist');
    const scoreParam = params.get('targetScore') || params.get('score');
    const ghostParam = params.get('ghost');

    // If query string has none of our challenge keys, return null
    if (!seedParam && !modeParam && !rivalParam && !distParam && !scoreParam && !ghostParam) {
        return null;
    }

    const parsedSeed = seedParam != null ? (isNaN(Number(seedParam)) ? seedParam : Number(seedParam)) : DEFAULT_CHALLENGE_SETTINGS.seed;
    const parsedMode = modeParam || DEFAULT_CHALLENGE_SETTINGS.mode;
    const parsedRival = rivalParam || DEFAULT_CHALLENGE_SETTINGS.rival;
    const parsedDist = distParam != null ? Number(distParam) : DEFAULT_CHALLENGE_SETTINGS.targetDist;
    const parsedScore = scoreParam != null ? Number(scoreParam) : DEFAULT_CHALLENGE_SETTINGS.targetScore;

    return sanitizeChallengePayload({
        seed: parsedSeed,
        mode: parsedMode,
        rival: parsedRival,
        targetDist: parsedDist,
        targetScore: parsedScore,
        ghost: ghostParam,
    });
}

// ─── Rival Race Telemetry & Status Evaluator ────────────────────────────────

/**
 * Evaluates player progress against the rival challenge marker.
 * Computes remaining distance, beating target status, score diff, and hype badge text.
 */
export function evaluateRivalryProgress(currentCraftZ, currentScore = 0, challenge) {
    if (!challenge) return null;

    const targetZ = challenge.targetZ != null ? challenge.targetZ : distanceToZ(challenge.targetDist);
    const currentZ = Number(currentCraftZ) || 0;
    const playerDist = zToDistance(currentZ);
    const targetDist = challenge.targetDist;

    // Remaining distance to target line
    const remainingMeters = Math.max(0, targetDist - playerDist);
    // Has passed the rival target line downriver
    const hasPassedLine = currentZ <= targetZ;

    // Score comparison
    const scoreDiff = (Number(currentScore) || 0) - (Number(challenge.targetScore) || 0);
    const hasBeatenScore = scoreDiff > 0;

    // Both distance and score beaten = Absolute Victory
    const isRivalCrushed = hasPassedLine && (currentScore >= challenge.targetScore);

    let statusText = '';
    let statusColor = '#38f2ff'; // Cyan default

    if (isRivalCrushed) {
        statusText = `🏆 CRUSHED ${challenge.rival.toUpperCase()}! (+${scoreDiff} PTS)`;
        statusColor = '#ffd700'; // Gold
    } else if (hasPassedLine) {
        statusText = `🚩 PASSED ${challenge.rival.toUpperCase()}'S DISTANCE! Beat ${challenge.targetScore} score next!`;
        statusColor = '#38ff8e'; // Emerald
    } else if (remainingMeters <= 50) {
        statusText = `⚠️ CLOSING IN ON ${challenge.rival.toUpperCase()}: ${remainingMeters.toFixed(1)}m LEFT!`;
        statusColor = '#ff4d6d'; // Hot crimson
    } else {
        statusText = `🎯 RIVAL TARGET: ${challenge.rival} (${targetDist}m | ${challenge.targetScore} pts)`;
        statusColor = '#38f2ff';
    }

    return {
        rivalName: challenge.rival,
        targetZ,
        targetDist,
        playerDist,
        currentZ,
        remainingMeters,
        hasPassedLine,
        scoreDiff,
        hasBeatenScore,
        isRivalCrushed,
        statusText,
        statusColor,
    };
}

// ─── Procedural 3D Rival Target Line & Floating Banner Rig ──────────────────

/**
 * Creates a floating 3D "RIVAL TARGET LINE" banner and holographic river laser
 * at the exact Z coordinate to beat.
 *
 * @param {object} THREE - Three.js namespace or compatible mock
 * @param {object} options
 * @param {object} options.challenge - Decoded challenge object
 * @param {number} [options.riverWidth=30] - River width in meters
 * @param {string} [options.bannerTitle="RIVAL TARGET LINE"] - Top banner header text
 * @returns {object} Interactive 3D target banner rig with update and pass animation hooks
 */
export function createRivalTargetBanner(THREE, {
    challenge = DEFAULT_CHALLENGE_SETTINGS,
    riverWidth = 30,
    bannerTitle = 'RIVAL TARGET LINE',
} = {}) {
    if (!THREE) {
        throw new Error('createRivalTargetBanner requires a THREE instance');
    }

    const cleanChallenge = sanitizeChallengePayload(challenge);
    const targetZ = cleanChallenge.targetZ;
    const rivalName = cleanChallenge.rival.toUpperCase();
    const targetScore = cleanChallenge.targetScore;
    const targetDist = cleanChallenge.targetDist;

    // Main anchor group stationed at targetZ
    const group = new THREE.Group();
    group.name = 'RivalTargetLineGroup';
    group.position.set(0, 0, targetZ);

    // Color definitions
    const laserColorHex = 0xff2a5f; // Neon crimson danger / challenge laser
    const passedColorHex = 0x38ff8e; // Vibrant neon emerald on defeat
    const beaconColorHex = 0xffaa00; // Gold amber

    // 1. Dual Shoreline Pylon Beacons
    const pylonMat = new THREE.MeshStandardMaterial
        ? new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.4, metalness: 0.8 })
        : { color: { setHex() {} } };

    const beaconLightMat = new THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ color: beaconColorHex, transparent: true, opacity: 0.9 })
        : { color: { setHex() {} }, opacity: 0.9 };

    const pylons = [];
    const halfW = riverWidth * 0.5;

    for (const side of [-1, 1]) {
        const pylonGroup = new THREE.Group();
        pylonGroup.position.set(side * (halfW - 0.75), 0, 0);

        // Heavy concrete / steel riverbed base
        if (THREE.CylinderGeometry && THREE.Mesh) {
            const baseMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(1.2, 1.6, 6, 8),
                pylonMat
            );
            baseMesh.position.set(0, 3, 0);
            pylonGroup.add(baseMesh);

            // Pulsing upper antenna spire
            const spireMesh = new THREE.Mesh(
                new THREE.ConeGeometry(0.5, 4, 8),
                beaconLightMat
            );
            spireMesh.position.set(0, 8, 0);
            pylonGroup.add(spireMesh);

            // High-intensity light beacon globe
            const globeMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.8, 12, 12),
                beaconLightMat
            );
            globeMesh.position.set(0, 10.5, 0);
            pylonGroup.add(globeMesh);
        }

        group.add(pylonGroup);
        pylons.push(pylonGroup);
    }

    // 2. Holographic Laser River Line across the water
    let laserMesh = null;
    const laserMat = new THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({
            color: laserColorHex,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide || 2,
        })
        : { color: { setHex() {} }, opacity: 0.85 };

    if (THREE.PlaneGeometry && THREE.Mesh) {
        // Flat river plane laser ribbon on the water surface (y = 0.28)
        laserMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(riverWidth - 1.5, 1.4),
            laserMat
        );
        laserMesh.rotation.x = -Math.PI / 2;
        laserMesh.position.set(0, 0.28, 0);
        group.add(laserMesh);
    }

    // 3. Overhead Horizontal Support Truss Beam
    const trussMat = new THREE.MeshStandardMaterial
        ? new THREE.MeshStandardMaterial({ color: 0x1a1e28, metalness: 0.9, roughness: 0.3 })
        : { color: { setHex() {} } };

    if (THREE.BoxGeometry && THREE.Mesh) {
        const trussBeam = new THREE.Mesh(
            new THREE.BoxGeometry(riverWidth + 1.0, 0.6, 0.6),
            trussMat
        );
        trussBeam.position.set(0, 10.2, 0);
        group.add(trussBeam);
    }

    // 4. Central Floating 3D Rival Banner Billboard
    const bannerGroup = new THREE.Group();
    bannerGroup.name = 'RivalBannerBillboard';
    bannerGroup.position.set(0, 12.0, 0);

    const bannerPlateMat = new THREE.MeshStandardMaterial
        ? new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            metalness: 0.6,
            roughness: 0.4,
        })
        : { color: { setHex() {} } };

    const bannerBorderMat = new THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ color: laserColorHex })
        : { color: { setHex() {} } };

    let bannerPlate = null;
    if (THREE.BoxGeometry && THREE.Mesh) {
        // Main dark carbon display board
        bannerPlate = new THREE.Mesh(
            new THREE.BoxGeometry(16.0, 3.6, 0.4),
            bannerPlateMat
        );
        // Neon edge frame
        const borderMesh = new THREE.Mesh(
            new THREE.BoxGeometry(16.4, 4.0, 0.32),
            bannerBorderMat
        );
        bannerPlate.add(borderMesh);
        bannerGroup.add(bannerPlate);
    }

    // 5. Procedural Canvas Texture for High-Resolution Text (if Canvas is available)
    let dynamicTexture = null;
    let canvas = null;
    let ctx = null;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        ctx = canvas.getContext('2d');
    }

    const drawBannerContent = (beaten = false) => {
        if (!ctx) return;
        ctx.clearRect(0, 0, 1024, 256);

        // Background styling
        ctx.fillStyle = beaten ? 'rgba(5, 46, 22, 0.95)' : 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(0, 0, 1024, 256);

        // Glowing border line
        ctx.lineWidth = 14;
        ctx.strokeStyle = beaten ? '#38ff8e' : '#ff2a5f';
        ctx.strokeRect(7, 7, 1010, 242);

        // Header Title
        ctx.font = 'bold 38px "Impact", "Arial Black", sans-serif';
        ctx.fillStyle = beaten ? '#38ff8e' : '#ff3b68';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const header = beaten ? '🏆 RIVAL LINE CRUSHED! 🏆' : `⚔️ ${bannerTitle} ⚔️`;
        ctx.fillText(header, 512, 60);

        // Subtitle Lore & Target Stats
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = '#ffffff';
        const targetText = `${rivalName}: ${targetDist}m  •  TARGET: ${targetScore} PTS`;
        ctx.fillText(targetText, 512, 138);

        // Bottom Callout
        ctx.font = '28px sans-serif';
        ctx.fillStyle = beaten ? '#a7f3d0' : '#fecdd3';
        const callout = beaten ? 'TARGET SURPASSED — KEEP SPRINTING!' : 'CROSS LINE TO OVERTAKE RIVAL';
        ctx.fillText(callout, 512, 204);

        if (dynamicTexture && dynamicTexture.needsUpdate !== undefined) {
            dynamicTexture.needsUpdate = true;
        }
    };

    if (canvas && THREE.CanvasTexture) {
        dynamicTexture = new THREE.CanvasTexture(canvas);
        drawBannerContent(false);

        const textPlaneMat = new THREE.MeshBasicMaterial({
            map: dynamicTexture,
            transparent: true,
            side: THREE.DoubleSide || 2,
        });

        const textPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(15.4, 3.4),
            textPlaneMat
        );
        textPlane.position.set(0, 0, 0.25);
        bannerGroup.add(textPlane);
    }

    group.add(bannerGroup);

    // State tracking
    let isCrossed = false;
    let pulseTime = 0;

    /**
     * Updates banner animation, floating hover, pulsing laser, and crossing triggers.
     * @param {number} dt - Delta time in seconds
     * @param {number|object} craftOrZ - Current raft craft state or Z coordinate
     * @param {number} [currentScore=0] - Player's current run score
     * @returns {object} Updated rivalry evaluation
     */
    function update(dt = 0.016, craftOrZ = 0, currentScore = 0) {
        pulseTime += dt;

        const currentZ = typeof craftOrZ === 'object' && craftOrZ.position
            ? craftOrZ.position.z
            : Number(craftOrZ) || 0;

        // Floating hover bob on banner billboard
        const hoverOffset = Math.sin(pulseTime * 2.5) * 0.35;
        bannerGroup.position.y = 12.0 + hoverOffset;

        // Holographic laser pulse
        const laserPulse = 0.65 + Math.sin(pulseTime * 6.0) * 0.35;
        if (laserMat && typeof laserMat.opacity === 'number') {
            laserMat.opacity = isCrossed ? 0.35 : laserPulse;
        }

        // Live rivalry status
        const evalResult = evaluateRivalryProgress(currentZ, currentScore, cleanChallenge);

        // Trigger pass transition once player crosses targetZ
        if (evalResult.hasPassedLine && !isCrossed) {
            isCrossed = true;
            markLineCrossed();
        }

        return evalResult;
    }

    /**
     * Flips visual styles to victorious emerald when player surpasses rival distance.
     */
    function markLineCrossed() {
        if (laserMat?.color?.setHex) {
            laserMat.color.setHex(passedColorHex);
        }
        if (bannerBorderMat?.color?.setHex) {
            bannerBorderMat.color.setHex(passedColorHex);
        }
        if (beaconLightMat?.color?.setHex) {
            beaconLightMat.color.setHex(passedColorHex);
        }
        drawBannerContent(true);
    }

    /**
     * Cleanly disposes geometries, materials, and canvas references.
     */
    function dispose() {
        if (dynamicTexture && typeof dynamicTexture.dispose === 'function') {
            dynamicTexture.dispose();
        }
        if (typeof group.traverse === 'function') {
            group.traverse((obj) => {
                if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                    obj.geometry.dispose();
                }
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach((m) => m && m.dispose && m.dispose());
                    } else if (typeof obj.material.dispose === 'function') {
                        obj.material.dispose();
                    }
                }
            });
        }
        if (group.parent && typeof group.parent.remove === 'function') {
            group.parent.remove(group);
        }
    }

    return {
        group,
        targetZ,
        challenge: cleanChallenge,
        isCrossed: () => isCrossed,
        update,
        markLineCrossed,
        dispose,
    };
}
