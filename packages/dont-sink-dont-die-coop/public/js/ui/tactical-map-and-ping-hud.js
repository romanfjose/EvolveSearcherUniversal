/**
 * Don't Sink, Don't Die — Expanded Tactical River Map & Crew Separation Radar HUD
 * (`public/js/ui/tactical-map-and-ping-hud.js`)
 *
 * Directive: Sovereign Core & Helmet 04 (Street-Smart Shark / Tactical Pilot)
 *
 * Requirements:
 * 1. Top-down tactical river map representing the 80m-wide river corridor
 *    (corridor width: 80m, half-width: 40m, canonical river z from 0 to -1500m).
 * 2. Visual landmark features:
 *    - Upcoming Sanctuary Platforms (safe docking / resting platforms).
 *    - Harbor City Calm Basin (shop/repair tranquil zone with boundary markers).
 *    - Split-Route Islands (bifurcating obstacles separating channels left/right).
 * 3. Live Teammate Crew Separation Radar & Distance Callouts:
 *    - Relative offsets, Euclidean distances, separation status (Tethered <= 15m,
 *      Dispersed 15-40m, Estranged > 40m).
 *    - Visual distance callouts ('12m', '45m') and off-screen / edge-clamped indicators.
 * 4. Tactical River Ping System:
 *    - 1-click or coordinate pinging ('danger', 'assist', 'loot', 'gather').
 *    - Ping lifetime decay, animated pulsing wave rings, and screen projection.
 * 5. Full UI Controller Lifecycle:
 *    - `createTacticalRiverMapHud({ container, options })`
 *    - `computeTacticalMapMarkers({ localPlayer, crewPlayers, platforms, islands, harborBounds, pings, viewWindow })`
 *    - Pure coordinate projectors, zero external dependencies, 100% headless node:test compatible.
 */

export const TACTICAL_MAP_CONFIG = {
    ROOT_ID: 'tactical-river-map-hud',
    CORRIDOR_WIDTH_METERS: 80,
    CORRIDOR_HALF_WIDTH: 40,
    RIVER_START_Z: 0,
    RIVER_FINISH_Z: -1500,
    MAP_WIDTH_PX: 220,
    MAP_HEIGHT_PX: 320,
    DEFAULT_LOOKAHEAD_METERS: 160,
    DEFAULT_LOOKBEHIND_METERS: 40,
    TETHER_DISTANCE_SAFE: 15,
    TETHER_DISTANCE_WARN: 40,
    PING_DURATION_MS: 4000,
    DEFAULT_HARBOR_BOUNDS: { minX: -40, maxX: 40, minZ: -280, maxZ: -140 },
};

export const PING_TYPES = {
    DANGER: { id: 'danger', label: 'DANGER', color: '#ef4444', icon: '⚠️', priority: 3 },
    ASSIST: { id: 'assist', label: 'ASSIST', color: '#f59e0b', icon: '🛡️', priority: 2 },
    LOOT: { id: 'loot', label: 'LOOT', color: '#38bdf8', icon: '💎', priority: 1 },
    GATHER: { id: 'gather', label: 'GATHER', color: '#10b981', icon: '⚓', priority: 2 },
};

/**
 * Pure clamp utility.
 */
export function clamp(val, min, max) {
    if (Number.isNaN(val) || val === undefined || val === null) return min;
    return Math.max(min, Math.min(max, val));
}

/**
 * Projects world coordinates (x, z) to tactical corridor map normalized and pixel coordinates.
 * Corridor spans [-corridorHalfWidth, +corridorHalfWidth] in X,
 * and [raftZ - lookaheadMeters, raftZ + lookbehindMeters] in Z (or full course if viewWindow is 'full').
 *
 * @param {object} worldPos - { x, z }
 * @param {object} options
 * @returns {object} { uiX, uiY, normX, normY, isVisible, inCorridor }
 */
export function projectWorldToTacticalMap(worldPos, {
    corridorHalfWidth = TACTICAL_MAP_CONFIG.CORRIDOR_HALF_WIDTH,
    mapWidth = TACTICAL_MAP_CONFIG.MAP_WIDTH_PX,
    mapHeight = TACTICAL_MAP_CONFIG.MAP_HEIGHT_PX,
    viewMode = 'relative', // 'relative' (scrolling with player) or 'global' (full river 0 to -1500)
    anchorZ = 0,
    lookahead = TACTICAL_MAP_CONFIG.DEFAULT_LOOKAHEAD_METERS,
    lookbehind = TACTICAL_MAP_CONFIG.DEFAULT_LOOKBEHIND_METERS,
    finishZ = TACTICAL_MAP_CONFIG.RIVER_FINISH_Z,
} = {}) {
    const x = worldPos?.x ?? 0;
    const z = worldPos?.z ?? 0;

    // Normalizing X across corridor width [-half, +half] -> [0, 1]
    const normX = clamp((x + corridorHalfWidth) / (2 * corridorHalfWidth), 0, 1);
    const inCorridor = Math.abs(x) <= corridorHalfWidth;

    let normY = 0;
    let isVisible = true;

    if (viewMode === 'global') {
        // Z: 0 is bottom, finishZ (-1500) is top
        const riverLength = Math.abs(finishZ);
        const zProg = riverLength > 0 ? clamp(-z / riverLength, 0, 1) : 0;
        normY = 1 - zProg; // 1 at start (bottom), 0 at finish (top)
        isVisible = z <= 0 && z >= finishZ;
    } else {
        // Relative window centered on anchorZ (downriver is -z, upriver is +z)
        // Top of map = anchorZ - lookahead (downriver / forward)
        // Bottom of map = anchorZ + lookbehind (upriver / behind)
        const windowSize = lookahead + lookbehind;
        const topZ = anchorZ - lookahead;
        const bottomZ = anchorZ + lookbehind;

        if (z < topZ || z > bottomZ) {
            isVisible = false;
        }

        const windowProg = windowSize > 0 ? (bottomZ - z) / windowSize : 0.5;
        // normY: 0 at topZ (top), 1 at bottomZ (bottom)
        normY = clamp(1 - windowProg, 0, 1);
    }

    const uiX = normX * mapWidth;
    const uiY = normY * mapHeight;

    return {
        uiX: Math.round(uiX * 10) / 10,
        uiY: Math.round(uiY * 10) / 10,
        normX,
        normY,
        isVisible,
        inCorridor,
    };
}

/**
 * Computes crew separation status and distance callout for a teammate relative to local player.
 *
 * @param {object} localPos - { x, z }
 * @param {object} crewPos - { x, z }
 * @returns {object} { distance, dx, dz, status, color, calloutText }
 */
export function computeCrewSeparation(localPos, crewPos) {
    const lx = localPos?.x ?? 0;
    const lz = localPos?.z ?? 0;
    const cx = crewPos?.x ?? 0;
    const cz = crewPos?.z ?? 0;

    const dx = cx - lx;
    const dz = cz - lz;
    const distance = Math.hypot(dx, dz);
    const roundedDist = Math.round(distance);

    let status = 'tethered'; // <= 15m
    let color = '#34d399'; // Emerald
    let badgeText = 'TETHERED';

    if (distance > TACTICAL_MAP_CONFIG.TETHER_DISTANCE_WARN) {
        status = 'estranged'; // > 40m
        color = '#ef4444'; // Crimson
        badgeText = 'ESTRANGED';
    } else if (distance > TACTICAL_MAP_CONFIG.TETHER_DISTANCE_SAFE) {
        status = 'dispersed'; // 15m - 40m
        color = '#fbbf24'; // Amber
        badgeText = 'DISPERSED';
    }

    const direction = dz < 0 ? 'AHEAD' : (dz > 0 ? 'BEHIND' : 'LEVEL');

    return {
        distance: Math.round(distance * 10) / 10,
        dx,
        dz,
        status,
        color,
        badgeText,
        direction,
        calloutText: `${roundedDist}m ${direction}`,
    };
}

/**
 * Evaluates active tactical markers for river corridor features, platforms, calm basin,
 * islands, teammates, and pings.
 *
 * @param {object} params
 * @param {object} params.localPlayer - { position: { x, z }, yaw, health, name, color }
 * @param {Array|object} [params.crewPlayers] - List or map of other players
 * @param {Array} [params.platforms] - Sanctuary platforms [{ id, x, z, width, length, name, isOccupied }]
 * @param {Array} [params.islands] - Split-route islands [{ id, x, z, radius, leftChannelWidth, rightChannelWidth }]
 * @param {object} [params.harborBounds] - Calm basin bounds { minX, maxX, minZ, maxZ, name }
 * @param {Array} [params.pings] - Active pings [{ id, type, x, z, timestamp, senderId }]
 * @param {number} [params.now] - Current timestamp
 * @param {object} [params.options] - Coordinate projection options
 * @returns {object} Processed markers ready for tactical rendering
 */
export function computeTacticalMapMarkers({
    localPlayer,
    crewPlayers = [],
    platforms = [],
    islands = [],
    harborBounds = null,
    pings = [],
    now = Date.now(),
    options = {},
} = {}) {
    const localPos = localPlayer?.position || { x: 0, z: 0 };
    const anchorZ = localPos.z ?? 0;

    const projOpts = {
        corridorHalfWidth: options.corridorHalfWidth ?? TACTICAL_MAP_CONFIG.CORRIDOR_HALF_WIDTH,
        mapWidth: options.mapWidth ?? TACTICAL_MAP_CONFIG.MAP_WIDTH_PX,
        mapHeight: options.mapHeight ?? TACTICAL_MAP_CONFIG.MAP_HEIGHT_PX,
        viewMode: options.viewMode ?? 'relative',
        anchorZ,
        lookahead: options.lookahead ?? TACTICAL_MAP_CONFIG.DEFAULT_LOOKAHEAD_METERS,
        lookbehind: options.lookbehind ?? TACTICAL_MAP_CONFIG.DEFAULT_LOOKBEHIND_METERS,
        finishZ: options.finishZ ?? TACTICAL_MAP_CONFIG.RIVER_FINISH_Z,
    };

    // 1. Local Player Marker
    const localProj = projectWorldToTacticalMap(localPos, projOpts);
    const localMarker = {
        id: localPlayer?.id || 'local',
        name: localPlayer?.name || 'Pilot',
        color: localPlayer?.color || '#38bdf8',
        x: localPos.x,
        z: localPos.z,
        uiX: localProj.uiX,
        uiY: localProj.uiY,
        yaw: localPlayer?.yaw ?? 0,
        isLocal: true,
    };

    // 2. Teammates / Crew Separation Radar Markers
    const crewList = Array.isArray(crewPlayers)
        ? crewPlayers
        : (crewPlayers ? Object.values(crewPlayers) : []);

    const crewMarkers = [];
    for (const mate of crewList) {
        if (!mate || mate.id === localPlayer?.id || mate.isDead) continue;
        const pos = mate.position || { x: mate.x ?? 0, z: mate.z ?? 0 };
        const proj = projectWorldToTacticalMap(pos, projOpts);
        const sep = computeCrewSeparation(localPos, pos);

        // Clamping to map viewport borders if off-screen
        const isOffscreen = !proj.isVisible;
        let edgeUiX = proj.uiX;
        let edgeUiY = proj.uiY;

        if (isOffscreen) {
            edgeUiX = clamp(proj.uiX, 8, projOpts.mapWidth - 8);
            edgeUiY = clamp(proj.uiY, 8, projOpts.mapHeight - 8);
        }

        crewMarkers.push({
            id: mate.id,
            name: mate.name || 'Crewmate',
            color: mate.color || '#4ade80',
            x: pos.x,
            z: pos.z,
            uiX: proj.uiX,
            uiY: proj.uiY,
            edgeUiX,
            edgeUiY,
            isVisible: proj.isVisible,
            isOffscreen,
            separation: sep,
        });
    }

    // 3. Sanctuary Platforms
    const platformMarkers = [];
    for (const plat of platforms) {
        if (!plat) continue;
        const pPos = { x: plat.x ?? 0, z: plat.z ?? 0 };
        const proj = projectWorldToTacticalMap(pPos, projOpts);
        const dist = Math.hypot(pPos.x - localPos.x, pPos.z - localPos.z);

        platformMarkers.push({
            id: plat.id || `plat_${plat.z}`,
            name: plat.name || 'Sanctuary Platform',
            x: pPos.x,
            z: pPos.z,
            width: plat.width || 14,
            length: plat.length || 18,
            uiX: proj.uiX,
            uiY: proj.uiY,
            isVisible: proj.isVisible,
            distance: Math.round(dist),
            isOccupied: Boolean(plat.isOccupied),
            isSafeZone: true,
        });
    }

    // 4. Split-Route Islands (channel bifurcation)
    const islandMarkers = [];
    for (const isl of islands) {
        if (!isl) continue;
        const iPos = { x: isl.x ?? 0, z: isl.z ?? 0 };
        const proj = projectWorldToTacticalMap(iPos, projOpts);
        const radius = isl.radius || 8;
        const scale = projOpts.mapWidth / (projOpts.corridorHalfWidth * 2);
        const uiRadius = Math.max(4, radius * scale);
        const dist = Math.hypot(iPos.x - localPos.x, iPos.z - localPos.z);

        islandMarkers.push({
            id: isl.id || `island_${isl.z}`,
            name: isl.name || 'Split-Route Island',
            x: iPos.x,
            z: iPos.z,
            radius,
            uiRadius,
            uiX: proj.uiX,
            uiY: proj.uiY,
            isVisible: proj.isVisible,
            distance: Math.round(dist),
            leftChannelWidth: isl.leftChannelWidth ?? 26,
            rightChannelWidth: isl.rightChannelWidth ?? 26,
        });
    }

    // 5. Harbor City Calm Basin
    let harborMarker = null;
    const harbor = harborBounds || TACTICAL_MAP_CONFIG.DEFAULT_HARBOR_BOUNDS;
    if (harbor) {
        const topCenter = { x: (harbor.minX + harbor.maxX) / 2, z: harbor.minZ };
        const bottomCenter = { x: (harbor.minX + harbor.maxX) / 2, z: harbor.maxZ };
        const topProj = projectWorldToTacticalMap(topCenter, projOpts);
        const bottomProj = projectWorldToTacticalMap(bottomCenter, projOpts);

        const uiTop = Math.min(topProj.uiY, bottomProj.uiY);
        const uiBottom = Math.max(topProj.uiY, bottomProj.uiY);
        const uiHeight = Math.max(4, uiBottom - uiTop);

        const leftProj = projectWorldToTacticalMap({ x: harbor.minX, z: harbor.minZ }, projOpts);
        const rightProj = projectWorldToTacticalMap({ x: harbor.maxX, z: harbor.minZ }, projOpts);
        const uiLeft = Math.min(leftProj.uiX, rightProj.uiX);
        const uiRight = Math.max(leftProj.uiX, rightProj.uiX);
        const uiWidth = Math.max(6, uiRight - uiLeft);

        const inBasin = localPos.x >= harbor.minX && localPos.x <= harbor.maxX &&
                        localPos.z >= harbor.minZ && localPos.z <= harbor.maxZ;

        harborMarker = {
            id: 'harbor_calm_basin',
            name: harbor.name || 'Harbor City Calm Basin',
            minX: harbor.minX,
            maxX: harbor.maxX,
            minZ: harbor.minZ,
            maxZ: harbor.maxZ,
            uiLeft,
            uiTop,
            uiWidth,
            uiHeight,
            inBasin,
            isVisible: uiBottom >= 0 && uiTop <= projOpts.mapHeight,
        };
    }

    // 6. Tactical Pings (decay over PING_DURATION_MS)
    const activePings = [];
    const maxPingAge = TACTICAL_MAP_CONFIG.PING_DURATION_MS;

    for (const p of pings) {
        if (!p) continue;
        const age = now - (p.timestamp || now);
        if (age < 0 || age > maxPingAge) continue;

        const pPos = { x: p.x ?? 0, z: p.z ?? 0 };
        const proj = projectWorldToTacticalMap(pPos, projOpts);
        const pType = PING_TYPES[p.type?.toUpperCase()] || PING_TYPES.DANGER;
        const progress = age / maxPingAge; // 0 to 1
        const pulseScale = 1 + (progress * 2.0); // expanding ring
        const alpha = Math.max(0, 1 - progress);

        activePings.push({
            id: p.id || `ping_${p.timestamp}_${p.x}`,
            type: pType.id,
            label: pType.label,
            icon: pType.icon,
            color: pType.color,
            x: pPos.x,
            z: pPos.z,
            uiX: proj.uiX,
            uiY: proj.uiY,
            isVisible: proj.isVisible,
            age,
            progress,
            pulseScale,
            alpha,
            senderId: p.senderId,
        });
    }

    return {
        local: localMarker,
        crew: crewMarkers,
        platforms: platformMarkers,
        islands: islandMarkers,
        harbor: harborMarker,
        pings: activePings,
        corridor: {
            width: TACTICAL_MAP_CONFIG.CORRIDOR_WIDTH_METERS,
            halfWidth: projOpts.corridorHalfWidth,
            mapWidth: projOpts.mapWidth,
            mapHeight: projOpts.mapHeight,
            viewMode: projOpts.viewMode,
        },
    };
}

/**
 * Creates the Tactical River Map & Crew Separation Radar HUD component.
 *
 * @param {object} params
 * @param {HTMLElement} [params.container=document.body]
 * @param {object} [params.options={}]
 * @returns {object} Controller interface
 */
export function createTacticalRiverMapHud({ container = null, options = {} } = {}) {
    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const parent = container || (hasDOM ? document.body : null);

    const config = {
        mapWidth: options.mapWidth ?? TACTICAL_MAP_CONFIG.MAP_WIDTH_PX,
        mapHeight: options.mapHeight ?? TACTICAL_MAP_CONFIG.MAP_HEIGHT_PX,
        viewMode: options.viewMode ?? 'relative',
        onPing: options.onPing || null,
        ...options,
    };

    let root = null;
    let canvas = null;
    let ctx = null;
    let pingBar = null;
    let separationPanel = null;

    let activePingsList = [];
    let currentSelectedPingType = PING_TYPES.DANGER.id;
    let isVisible = true;
    let latestMarkers = null;

    if (hasDOM && parent) {
        root = document.createElement('div');
        root.id = TACTICAL_MAP_CONFIG.ROOT_ID;
        root.style.cssText = `
            position: absolute;
            top: 140px;
            right: 16px;
            width: ${config.mapWidth}px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            pointer-events: auto;
            z-index: 105;
            font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
            color: #e6ebf2;
            user-select: none;
        `;

        // Map Frame / Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px;
            background: rgba(13, 17, 23, 0.88);
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
            color: #38bdf8;
            backdrop-filter: blur(8px);
        `;
        header.innerHTML = `
            <span>TACTICAL RIVER RADAR (80m)</span>
            <span id="tactical-corridor-mode" style="color:#94a3b8; font-weight:600; font-size:9px;">REL</span>
        `;
        root.appendChild(header);

        // Canvas container for top-down radar
        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = `
            position: relative;
            width: ${config.mapWidth}px;
            height: ${config.mapHeight}px;
            background: rgba(10, 15, 24, 0.82);
            border: 1px solid rgba(56, 189, 248, 0.28);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), inset 0 0 16px rgba(56, 189, 248, 0.06);
            backdrop-filter: blur(10px);
            cursor: crosshair;
        `;

        canvas = document.createElement('canvas');
        canvas.width = config.mapWidth;
        canvas.height = config.mapHeight;
        canvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%;';
        ctx = canvas.getContext('2d');
        canvasContainer.appendChild(canvas);

        // Click-to-Ping interaction
        canvasContainer.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const clickUiX = e.clientX - rect.left;
            const clickUiY = e.clientY - rect.top;

            // Reverse map projection to world (x, z)
            const corridorHalf = TACTICAL_MAP_CONFIG.CORRIDOR_HALF_WIDTH;
            const worldX = (clickUiX / config.mapWidth) * (corridorHalf * 2) - corridorHalf;

            // In relative mode, uiY 0 is anchorZ - lookahead, uiY height is anchorZ + lookbehind
            const anchorZ = latestMarkers?.local?.z ?? 0;
            const lookahead = TACTICAL_MAP_CONFIG.DEFAULT_LOOKAHEAD_METERS;
            const lookbehind = TACTICAL_MAP_CONFIG.DEFAULT_LOOKBEHIND_METERS;
            const windowSize = lookahead + lookbehind;
            const worldZ = anchorZ + lookbehind - (clickUiY / config.mapHeight) * windowSize;

            spawnPing({
                type: currentSelectedPingType,
                x: worldX,
                z: worldZ,
                senderId: latestMarkers?.local?.id || 'local',
            });
        });

        root.appendChild(canvasContainer);

        // 4-Button Tactical Quick-Ping Hotbar
        pingBar = document.createElement('div');
        pingBar.style.cssText = `
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
        `;

        Object.values(PING_TYPES).forEach((pt) => {
            const btn = document.createElement('button');
            btn.className = `tactical-ping-btn ping-type-${pt.id}`;
            btn.setAttribute('data-ping-type', pt.id);
            btn.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                padding: 4px 2px;
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid ${pt.id === currentSelectedPingType ? pt.color : 'rgba(255,255,255,0.1)'};
                border-radius: 4px;
                font-size: 8.5px;
                font-weight: 700;
                color: ${pt.color};
                cursor: pointer;
                transition: transform 0.1s ease, border-color 0.15s ease;
            `;
            btn.innerHTML = `<span>${pt.icon}</span><span>${pt.label}</span>`;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSelectedPingType = pt.id;
                updatePingButtons();
            });

            pingBar.appendChild(btn);
        });

        root.appendChild(pingBar);

        // Teammate Separation Radar Panel
        separationPanel = document.createElement('div');
        separationPanel.id = 'crew-separation-radar-panel';
        separationPanel.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 6px 8px;
            background: rgba(13, 17, 23, 0.85);
            border: 1px solid rgba(56, 189, 248, 0.25);
            border-radius: 6px;
            backdrop-filter: blur(8px);
            font-size: 10px;
        `;
        root.appendChild(separationPanel);

        parent.appendChild(root);
    }

    /**
     * Updates ping selection button border highlights.
     */
    function updatePingButtons() {
        if (!pingBar) return;
        const btns = pingBar.querySelectorAll('button');
        btns.forEach((b) => {
            const type = b.getAttribute('data-ping-type');
            const pt = PING_TYPES[type?.toUpperCase()];
            if (type === currentSelectedPingType) {
                b.style.borderColor = pt?.color || '#38bdf8';
                b.style.boxShadow = `0 0 6px ${pt?.color || '#38bdf8'}66`;
            } else {
                b.style.borderColor = 'rgba(255,255,255,0.1)';
                b.style.boxShadow = 'none';
            }
        });
    }

    /**
     * Spawns a new tactical ping.
     */
    function spawnPing({ type = 'danger', x = 0, z = 0, senderId = 'local' } = {}) {
        const ping = {
            id: `ping_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type,
            x,
            z,
            timestamp: Date.now(),
            senderId,
        };
        activePingsList.push(ping);

        if (typeof config.onPing === 'function') {
            config.onPing(ping);
        }

        return ping;
    }

    /**
     * Renders tactical map on canvas.
     */
    function render(markers) {
        if (!ctx || !markers) return;
        const w = config.mapWidth;
        const h = config.mapHeight;
        ctx.clearRect(0, 0, w, h);

        // 1. Water Channel Background with corridor boundary guides (80m corridor)
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#0b1626');
        bgGrad.addColorStop(1, '#08101a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Corridor side borders (rock walls)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(1, 0, w - 2, h);

        // Center navigation channel dash
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Harbor City Calm Basin
        if (markers.harbor && markers.harbor.isVisible) {
            const hb = markers.harbor;
            ctx.fillStyle = hb.inBasin ? 'rgba(52, 211, 153, 0.22)' : 'rgba(52, 211, 153, 0.12)';
            ctx.fillRect(hb.uiLeft, hb.uiTop, hb.uiWidth, hb.uiHeight);

            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(hb.uiLeft, hb.uiTop, hb.uiWidth, hb.uiHeight);

            ctx.fillStyle = '#34d399';
            ctx.font = '8px ui-monospace, monospace';
            ctx.fillText('CALM BASIN', hb.uiLeft + 6, hb.uiTop + 10);
        }

        // 3. Split-Route Islands
        if (markers.islands) {
            markers.islands.forEach((isl) => {
                if (!isl.isVisible) return;
                ctx.fillStyle = '#475569';
                ctx.beginPath();
                ctx.arc(isl.uiX, isl.uiY, isl.uiRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Split route bifurcation guidance lines
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 3]);
                // Left route
                ctx.beginPath();
                ctx.moveTo(isl.uiX - isl.uiRadius - 4, isl.uiY - 10);
                ctx.lineTo(isl.uiX - isl.uiRadius - 4, isl.uiY + 10);
                ctx.stroke();
                // Right route
                ctx.beginPath();
                ctx.moveTo(isl.uiX + isl.uiRadius + 4, isl.uiY - 10);
                ctx.lineTo(isl.uiX + isl.uiRadius + 4, isl.uiY + 10);
                ctx.stroke();
                ctx.setLineDash([]);
            });
        }

        // 4. Sanctuary Platforms
        if (markers.platforms) {
            markers.platforms.forEach((plat) => {
                if (!plat.isVisible) return;
                ctx.fillStyle = plat.isOccupied ? 'rgba(251, 191, 36, 0.4)' : 'rgba(56, 189, 248, 0.3)';
                ctx.fillRect(plat.uiX - 8, plat.uiY - 6, 16, 12);

                ctx.strokeStyle = plat.isOccupied ? '#fbbf24' : '#38bdf8';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(plat.uiX - 8, plat.uiY - 6, 16, 12);

                ctx.fillStyle = '#ffffff';
                ctx.font = '8px ui-monospace, monospace';
                ctx.textAlign = 'center';
                ctx.fillText('SANCTUARY', plat.uiX, plat.uiY - 8);
                ctx.textAlign = 'start';
            });
        }

        // 5. Active Pings (Expanding pulse rings)
        if (markers.pings) {
            markers.pings.forEach((p) => {
                if (!p.isVisible) return;
                ctx.save();
                ctx.globalAlpha = p.alpha;

                // Pulsing ring
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(p.uiX, p.uiY, 6 * p.pulseScale, 0, Math.PI * 2);
                ctx.stroke();

                // Core icon dot
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.uiX, p.uiY, 4, 0, Math.PI * 2);
                ctx.fill();

                // Label
                ctx.font = '9px ui-monospace, monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(p.label, p.uiX, p.uiY + 14);

                ctx.restore();
            });
        }

        // 6. Teammates / Live Crew Radar Positions
        if (markers.crew) {
            markers.crew.forEach((mate) => {
                const drawX = mate.isVisible ? mate.uiX : mate.edgeUiX;
                const drawY = mate.isVisible ? mate.uiY : mate.edgeUiY;

                ctx.fillStyle = mate.separation.color;
                ctx.beginPath();
                ctx.arc(drawX, drawY, mate.isVisible ? 4.5 : 3.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Distance callout label
                ctx.font = '8.5px ui-monospace, monospace';
                ctx.fillStyle = mate.separation.color;
                ctx.fillText(mate.separation.calloutText, drawX + 7, drawY + 3);
            });
        }

        // 7. Local Player Craft Marker (Cyan Chevron pointing forward)
        if (markers.local) {
            const lx = markers.local.uiX;
            const ly = markers.local.uiY;

            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(markers.local.yaw);

            ctx.fillStyle = '#38bdf8';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 8;

            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(5, 5);
            ctx.lineTo(0, 2);
            ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    /**
     * Updates separation radar text callouts in the side panel.
     */
    function updateSeparationPanel(markers) {
        if (!separationPanel) return;

        if (!markers.crew || markers.crew.length === 0) {
            separationPanel.innerHTML = `
                <div style="color:#64748b; font-size:9px; text-align:center;">NO TEAMMATES DETECTED</div>
            `;
            return;
        }

        let html = `
            <div style="display:flex; justify-content:space-between; font-weight:700; color:#94a3b8; font-size:9px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:2px;">
                <span>CREW RADAR</span>
                <span>STATUS</span>
            </div>
        `;

        markers.crew.forEach((mate) => {
            const sep = mate.separation;
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                    <span style="color:#f1f5f9; font-weight:600;">${mate.name}</span>
                    <span style="color:${sep.color}; font-weight:800; font-size:9px; background:${sep.color}22; padding:1px 4px; border-radius:3px;">
                        ${sep.calloutText}
                    </span>
                </div>
            `;
        });

        separationPanel.innerHTML = html;
    }

    /**
     * Master update tick called from frame or simulation loop.
     */
    function update(params = {}) {
        const now = params.now || Date.now();

        // Prune expired pings
        activePingsList = activePingsList.filter((p) => now - (p.timestamp || now) <= TACTICAL_MAP_CONFIG.PING_DURATION_MS);

        const markers = computeTacticalMapMarkers({
            ...params,
            pings: [...(params.pings || []), ...activePingsList],
            now,
            options: config,
        });

        latestMarkers = markers;

        if (hasDOM) {
            render(markers);
            updateSeparationPanel(markers);
        }

        return markers;
    }

    /**
     * Toggles visibility.
     */
    function setVisible(val) {
        isVisible = Boolean(val);
        if (root) {
            root.style.display = isVisible ? 'flex' : 'none';
        }
    }

    /**
     * Disposes DOM nodes and listeners cleanly.
     */
    function dispose() {
        if (root && root.parentNode) {
            root.parentNode.removeChild(root);
        }
        root = null;
        canvas = null;
        ctx = null;
        pingBar = null;
        separationPanel = null;
        activePingsList = [];
        latestMarkers = null;
    }

    return {
        update,
        spawnPing,
        setSelectedPingType: (type) => {
            currentSelectedPingType = type;
            updatePingButtons();
        },
        getSelectedPingType: () => currentSelectedPingType,
        setVisible,
        isVisible: () => isVisible,
        getMarkers: () => latestMarkers,
        getRoot: () => root,
        dispose,
    };
}
