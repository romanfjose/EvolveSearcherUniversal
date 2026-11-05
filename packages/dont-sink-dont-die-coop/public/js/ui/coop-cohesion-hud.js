/**
 * Don't Sink, Don't Die — Co-Op Crew Cohesion & Regroup Callout HUD Widget
 * (`public/js/ui/coop-cohesion-hud.js`)
 *
 * Requirements & Intent:
 * Under Helmet 04 & Sovereign Core directives, pacing and co-op cohesion must be
 * front and center. When playing with AI bots or human teammates, players shouldn't
 * outpace their crew or abandon teammates downriver.
 *
 * This module provides:
 * 1. Pure Status Evaluator `evaluateCrewCohesionStatus({ localPlayer, crewPlayers })`:
 *    - Computes relative distances and separation vectors between localPlayer and all living crew.
 *    - Evaluates formation tier:
 *      * 'ANCHORED': Player or crew is anchored at a sanctuary / harbor dock / resting eddy.
 *      * 'TIGHT': High cohesion (distance <= 18m) -> 'IN FORMATION +25% GOLD'.
 *      * 'STRETCHED': Moderate separation (18m - 35m) -> Caution / warning.
 *      * 'DRIFTING': Severe separation (> 35m) -> 'CREWMATE DRIFTING BEHIND — DROP ANCHOR [S] TO WAIT'.
 *    - Detects whether localPlayer is the leader or falling behind, and identifies which teammate
 *      is stranded or furthest behind.
 * 2. Visual Component `createCoopCohesionHud({ container, containerId, ... })`:
 *    - Mounts a high-contrast glassmorphic cockpit HUD widget.
 *    - Renders a live crew cohesion meter bar (0% - 100%), callout status banner, and teammate distance pips.
 *    - Zero external dependencies, pure ES module, 100% headless node:test compatible.
 */

export const COHESION_THRESHOLDS = {
    TIGHT_FORMATION_MAX_DIST: 18,     // Up to 18m considered in formation
    STRETCHED_MAX_DIST: 35,          // 18m to 35m is stretched / caution
    MAX_TRACKED_SEPARATION: 80,      // Scale ceiling for meter (0% at >= 80m)
    GOLD_BONUS_MULTIPLIER: 1.25,     // +25% Gold when in formation
};

export const COHESION_CALLOUTS = {
    IN_FORMATION: 'IN FORMATION +25% GOLD',
    ANCHORED_SANCTUARY: 'ANCHORED AT SANCTUARY',
    DRIFTING_BEHIND: 'CREWMATE DRIFTING BEHIND — DROP ANCHOR [S] TO WAIT',
    CATCHING_UP: 'FALLING BEHIND — PADDLE FORWARD [W] TO REGROUP',
    SOLO_EXPLORER: 'SOLO EXPEDITION — ALLIED CREW OFFLINE',
};

export const COHESION_STATUS_KEYS = {
    FORMATION: 'formation',
    ANCHORED: 'anchored',
    DRIFTING: 'drifting',
    CATCH_UP: 'catch_up',
    SOLO: 'solo',
};

/**
 * Computes Euclidean distance on the XZ river plane.
 */
function distanceXZ(posA, posB) {
    if (!posA || !posB) return 0;
    const dx = (posA.x || 0) - (posB.x || 0);
    const dz = (posA.z || 0) - (posB.z || 0);
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Pure evaluator for crew cohesion state.
 *
 * @param {object} params
 * @param {object} params.localPlayer - Current local player object { id, position: {x,y,z}, isDead, isAnchored, inSanctuary }
 * @param {Array<object>|Record<string, object>} params.crewPlayers - Other player/bot objects in the crew
 * @returns {object} Detailed cohesion assessment
 */
export function evaluateCrewCohesionStatus({ localPlayer = null, crewPlayers = [] } = {}) {
    // Normalise crew list
    let crewList = [];
    if (Array.isArray(crewPlayers)) {
        crewList = crewPlayers;
    } else if (crewPlayers && typeof crewPlayers === 'object') {
        crewList = Object.values(crewPlayers);
    }

    // Filter alive teammates excluding local player
    const localId = localPlayer?.id;
    const activeCrew = crewList.filter((p) => {
        if (!p) return false;
        if (localId && p.id === localId) return false;
        return !p.isDead && (p.health == null || p.health > 0);
    });

    const isLocalDead = Boolean(localPlayer?.isDead || (localPlayer?.health != null && localPlayer.health <= 0));
    const localPos = localPlayer?.position || { x: 0, y: 0.25, z: 0 };
    const isAnchored = Boolean(localPlayer?.isAnchored || localPlayer?.anchored);
    const inSanctuary = Boolean(localPlayer?.inSanctuary || localPlayer?.isProtectedBySanctuary || isAnchored);

    // If solo or no active teammates
    if (activeCrew.length === 0 || isLocalDead) {
        return {
            status: COHESION_STATUS_KEYS.SOLO,
            callout: isLocalDead ? 'RAFT SUNK — AWAITING REVIVAL' : COHESION_CALLOUTS.SOLO_EXPLORER,
            cohesionScore: 100,
            cohesionPercent: 100,
            goldMultiplier: 1.0,
            hasFormationBonus: false,
            isAnchored: false,
            inSanctuary: false,
            maxSeparationDist: 0,
            averageSeparationDist: 0,
            leadPlayerDistZ: 0,
            isLocalLeading: true,
            teammatesCount: 0,
            teammateDetails: [],
        };
    }

    // Evaluate distance and relative downriver delta (river flows toward negative Z)
    // A player with smaller Z is further downriver (ahead).
    // A player with larger Z is further upriver (behind).
    let maxDist = 0;
    let totalDist = 0;
    let trailingTeammate = null;
    let maxDriftBehindZ = 0;
    let anyTeammateAhead = false;
    let anyTeammateAnchored = false;

    const teammateDetails = activeCrew.map((mate) => {
        const matePos = mate.position || { x: 0, y: 0.25, z: 0 };
        const dist = distanceXZ(localPos, matePos);
        // deltaZ > 0 means mate is further upriver (behind localPlayer)
        // deltaZ < 0 means mate is further downriver (ahead of localPlayer)
        const deltaZ = matePos.z - localPos.z;

        if (dist > maxDist) {
            maxDist = dist;
        }
        totalDist += dist;

        if (deltaZ > maxDriftBehindZ) {
            maxDriftBehindZ = deltaZ;
            trailingTeammate = mate;
        }

        if (deltaZ < -5) {
            anyTeammateAhead = true;
        }

        if (mate.isAnchored || mate.anchored || mate.inSanctuary) {
            anyTeammateAnchored = true;
        }

        return {
            id: mate.id || mate.name || 'mate',
            name: mate.name || 'Crewmate',
            distance: Math.round(dist * 10) / 10,
            deltaZ: Math.round(deltaZ * 10) / 10,
            isAhead: deltaZ < 0,
            isBehind: deltaZ > 0,
            isBot: Boolean(mate.isBot),
        };
    });

    const averageDist = totalDist / activeCrew.length;

    // Check sanctuary / anchor condition
    if (inSanctuary || (isAnchored && anyTeammateAnchored)) {
        return {
            status: COHESION_STATUS_KEYS.ANCHORED,
            callout: COHESION_CALLOUTS.ANCHORED_SANCTUARY,
            cohesionScore: 100,
            cohesionPercent: 100,
            goldMultiplier: COHESION_THRESHOLDS.GOLD_BONUS_MULTIPLIER,
            hasFormationBonus: true,
            isAnchored: true,
            inSanctuary: true,
            maxSeparationDist: Math.round(maxDist * 10) / 10,
            averageSeparationDist: Math.round(averageDist * 10) / 10,
            leadPlayerDistZ: Math.round((localPos.z) * 10) / 10,
            isLocalLeading: maxDriftBehindZ >= 0,
            teammatesCount: activeCrew.length,
            teammateDetails,
            trailingTeammate: trailingTeammate ? (trailingTeammate.name || trailingTeammate.id) : null,
        };
    }

    // Cohesion percentage calculation:
    // 0 to 18m -> 100%
    // 18m to 80m -> linear drop from 100% down to 0%
    let cohesionPercent = 100;
    if (maxDist > COHESION_THRESHOLDS.TIGHT_FORMATION_MAX_DIST) {
        const excess = maxDist - COHESION_THRESHOLDS.TIGHT_FORMATION_MAX_DIST;
        const span = COHESION_THRESHOLDS.MAX_TRACKED_SEPARATION - COHESION_THRESHOLDS.TIGHT_FORMATION_MAX_DIST;
        cohesionPercent = Math.max(0, Math.min(100, Math.round((1 - excess / span) * 100)));
    }

    // Determine status & callout
    let status = COHESION_STATUS_KEYS.FORMATION;
    let callout = COHESION_CALLOUTS.IN_FORMATION;
    let hasFormationBonus = true;
    let goldMultiplier = COHESION_THRESHOLDS.GOLD_BONUS_MULTIPLIER;

    if (maxDist > COHESION_THRESHOLDS.STRETCHED_MAX_DIST) {
        hasFormationBonus = false;
        goldMultiplier = 1.0;

        // If a teammate is lagging far behind and local player is ahead
        if (maxDriftBehindZ > 20) {
            status = COHESION_STATUS_KEYS.DRIFTING;
            const mateName = trailingTeammate?.name || 'CREWMATE';
            callout = `${mateName.toUpperCase()} DRIFTING BEHIND — DROP ANCHOR [S] TO WAIT`;
        } else if (anyTeammateAhead) {
            status = COHESION_STATUS_KEYS.CATCH_UP;
            callout = COHESION_CALLOUTS.CATCHING_UP;
        } else {
            status = COHESION_STATUS_KEYS.DRIFTING;
            callout = COHESION_CALLOUTS.DRIFTING_BEHIND;
        }
    } else if (maxDist > COHESION_THRESHOLDS.TIGHT_FORMATION_MAX_DIST) {
        // Warning zone between 18m and 35m
        if (maxDriftBehindZ > 12) {
            callout = 'CREW SPREADING — PULL BACK OR FORM UP';
        } else {
            callout = 'FORMATION STRETCHED (+10% GOLD)';
            goldMultiplier = 1.10;
        }
    }

    return {
        status,
        callout,
        cohesionScore: cohesionPercent,
        cohesionPercent,
        goldMultiplier,
        hasFormationBonus,
        isAnchored,
        inSanctuary,
        maxSeparationDist: Math.round(maxDist * 10) / 10,
        averageSeparationDist: Math.round(averageDist * 10) / 10,
        leadPlayerDistZ: Math.round((localPos.z) * 10) / 10,
        isLocalLeading: maxDriftBehindZ >= 0,
        teammatesCount: activeCrew.length,
        teammateDetails,
        trailingTeammate: trailingTeammate ? (trailingTeammate.name || trailingTeammate.id) : null,
    };
}

/**
 * Creates and attaches the Co-Op Crew Cohesion HUD Component.
 *
 * @param {object} options
 * @param {HTMLElement|string} [options.container] - Parent container or container ID.
 * @param {string} [options.containerId='coop-cohesion-hud-root']
 * @param {boolean} [options.autoRender=true]
 * @returns {object} Cohesion HUD Controller interface
 */
export function createCoopCohesionHud({
    container = null,
    containerId = 'coop-cohesion-hud-root',
    autoRender = true,
} = {}) {
    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';

    // Inject stylesheet once if DOM exists
    if (hasDOM && !document.getElementById('coop-cohesion-hud-styles')) {
        const style = document.createElement('style');
        style.id = 'coop-cohesion-hud-styles';
        style.textContent = `
            #coop-cohesion-hud-root {
                position: fixed;
                top: 76px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                padding: 6px 14px;
                background: rgba(11, 16, 24, 0.88);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 20px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 12px rgba(0, 0, 0, 0.35);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 95;
                font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
                user-select: none;
                pointer-events: none;
                transition: transform 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
                min-width: 260px;
                box-sizing: border-box;
            }
            .cohesion-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.05em;
            }
            .cohesion-title-group {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .cohesion-glyph {
                font-size: 13px;
                line-height: 1;
            }
            .cohesion-pct-badge {
                font-size: 11px;
                font-weight: 800;
                font-variant-numeric: tabular-nums;
            }
            .cohesion-bar-track {
                width: 100%;
                height: 6px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 999px;
                overflow: hidden;
                position: relative;
                margin: 2px 0;
            }
            .cohesion-bar-fill {
                height: 100%;
                width: 100%;
                border-radius: 999px;
                transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease, box-shadow 0.25s ease;
            }
            .cohesion-callout-banner {
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                text-align: center;
                white-space: nowrap;
                transition: color 0.2s ease;
            }
            .cohesion-mate-pips {
                display: flex;
                gap: 6px;
                margin-top: 2px;
                font-size: 9.5px;
                color: #94a3b8;
            }
            .cohesion-mate-pip {
                padding: 1px 5px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.06);
                display: flex;
                align-items: center;
                gap: 3px;
            }
            .cohesion-mate-pip.drifting {
                background: rgba(239, 68, 68, 0.2);
                color: #fca5a5;
                border: 1px solid rgba(239, 68, 68, 0.4);
                animation: cohesionPipPulse 1.2s infinite;
            }
            @keyframes cohesionPipPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
            /* Status Themes */
            #coop-cohesion-hud-root.status-formation {
                border-color: rgba(74, 222, 128, 0.4);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 16px rgba(74, 222, 128, 0.2);
            }
            #coop-cohesion-hud-root.status-formation .cohesion-bar-fill {
                background-color: #4ade80;
                box-shadow: 0 0 8px #4ade80;
            }
            #coop-cohesion-hud-root.status-formation .cohesion-callout-banner {
                color: #86efac;
            }
            #coop-cohesion-hud-root.status-formation .cohesion-pct-badge {
                color: #4ade80;
            }

            #coop-cohesion-hud-root.status-anchored {
                border-color: rgba(56, 189, 248, 0.4);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 16px rgba(56, 189, 248, 0.25);
            }
            #coop-cohesion-hud-root.status-anchored .cohesion-bar-fill {
                background-color: #38bdf8;
                box-shadow: 0 0 8px #38bdf8;
            }
            #coop-cohesion-hud-root.status-anchored .cohesion-callout-banner {
                color: #7dd3fc;
            }
            #coop-cohesion-hud-root.status-anchored .cohesion-pct-badge {
                color: #38bdf8;
            }

            #coop-cohesion-hud-root.status-drifting {
                border-color: rgba(239, 68, 68, 0.5);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 18px rgba(239, 68, 68, 0.35);
                animation: cohesionAlertShake 0.4s ease;
            }
            #coop-cohesion-hud-root.status-drifting .cohesion-bar-fill {
                background-color: #ef4444;
                box-shadow: 0 0 10px #ef4444;
            }
            #coop-cohesion-hud-root.status-drifting .cohesion-callout-banner {
                color: #fca5a5;
                font-weight: 900;
            }
            #coop-cohesion-hud-root.status-drifting .cohesion-pct-badge {
                color: #ef4444;
            }

            #coop-cohesion-hud-root.status-catch_up {
                border-color: rgba(251, 191, 36, 0.45);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 16px rgba(251, 191, 36, 0.25);
            }
            #coop-cohesion-hud-root.status-catch_up .cohesion-bar-fill {
                background-color: #fbbf24;
                box-shadow: 0 0 8px #fbbf24;
            }
            #coop-cohesion-hud-root.status-catch_up .cohesion-callout-banner {
                color: #fde68a;
            }
            #coop-cohesion-hud-root.status-catch_up .cohesion-pct-badge {
                color: #fbbf24;
            }

            #coop-cohesion-hud-root.status-solo {
                border-color: rgba(148, 163, 184, 0.3);
            }
            #coop-cohesion-hud-root.status-solo .cohesion-bar-fill {
                background-color: #64748b;
            }
            #coop-cohesion-hud-root.status-solo .cohesion-callout-banner {
                color: #94a3b8;
            }
            #coop-cohesion-hud-root.status-solo .cohesion-pct-badge {
                color: #94a3b8;
            }

            @keyframes cohesionAlertShake {
                0%, 100% { transform: translateX(-50%); }
                25% { transform: translateX(calc(-50% - 3px)); }
                75% { transform: translateX(calc(-50% + 3px)); }
            }

            @media (max-width: 768px) {
                #coop-cohesion-hud-root {
                    top: 60px;
                    padding: 4px 8px;
                    min-width: 220px;
                }
                .cohesion-callout-banner {
                    font-size: 9px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Resolve root element
    let rootEl = null;
    if (hasDOM) {
        if (container instanceof HTMLElement) {
            rootEl = container;
        } else if (typeof container === 'string') {
            rootEl = document.getElementById(container);
        }
        if (!rootEl) {
            rootEl = document.getElementById(containerId);
            if (!rootEl) {
                rootEl = document.createElement('div');
                rootEl.id = containerId;
                document.body.appendChild(rootEl);
            }
        }
    }

    let lastState = null;
    let isVisible = true;

    function render(statusData) {
        if (!rootEl) return;
        const data = statusData || lastState;
        if (!data) return;

        // Set status class
        rootEl.className = `status-${data.status || 'formation'}`;

        let glyph = '⚓';
        if (data.status === COHESION_STATUS_KEYS.FORMATION) glyph = '✨';
        else if (data.status === COHESION_STATUS_KEYS.ANCHORED) glyph = '⚓';
        else if (data.status === COHESION_STATUS_KEYS.DRIFTING) glyph = '⚠️';
        else if (data.status === COHESION_STATUS_KEYS.CATCH_UP) glyph = '⚡';
        else if (data.status === COHESION_STATUS_KEYS.SOLO) glyph = '🧭';

        // Pips for teammates
        let matePipsHtml = '';
        if (Array.isArray(data.teammateDetails) && data.teammateDetails.length > 0) {
            matePipsHtml = `<div class="cohesion-mate-pips">` +
                data.teammateDetails.map((m) => {
                    const isFar = m.distance > COHESION_THRESHOLDS.STRETCHED_MAX_DIST;
                    return `<span class="cohesion-mate-pip ${isFar ? 'drifting' : ''}">
                        ${m.name}: ${m.distance}m ${m.isBehind ? '↓' : m.isAhead ? '↑' : ''}
                    </span>`;
                }).join('') +
                `</div>`;
        }

        rootEl.innerHTML = `
            <div class="cohesion-header">
                <div class="cohesion-title-group">
                    <span class="cohesion-glyph">${glyph}</span>
                    <span>CREW COHESION</span>
                </div>
                <span class="cohesion-pct-badge">${data.cohesionPercent}%</span>
            </div>
            <div class="cohesion-bar-track">
                <div class="cohesion-bar-fill" style="width: ${data.cohesionPercent}%;"></div>
            </div>
            <div class="cohesion-callout-banner">${data.callout}</div>
            ${matePipsHtml}
        `;
    }

    function update({ localPlayer, crewPlayers } = {}) {
        const status = evaluateCrewCohesionStatus({ localPlayer, crewPlayers });
        lastState = status;
        if (autoRender && rootEl) {
            render(status);
        }
        return status;
    }

    function setVisible(val) {
        isVisible = Boolean(val);
        if (rootEl) {
            rootEl.style.display = isVisible ? 'flex' : 'none';
        }
    }

    function dispose() {
        if (rootEl && rootEl.parentNode) {
            rootEl.parentNode.removeChild(rootEl);
        }
        rootEl = null;
        lastState = null;
    }

    return {
        update,
        render,
        setVisible,
        isVisible: () => isVisible,
        getLastState: () => lastState,
        element: rootEl,
        dispose,
    };
}
