// Sleek AAA Tactical River Minimap, Threat Radar, and Boss Health Bar Component.
// High-contrast, glassmorphic 2D Canvas & SVG overlay for Don't Sink, Don't Die.

import {
    RADAR_CONFIG,
    projectRiverProgress,
    projectToVerticalMap,
    projectToRadar,
    calculateOffscreenArrow,
    getThreatProfile,
    calculateChargingVector,
    calculateBossHealthPhases,
    getLandmarksInView,
} from '../../../shared/minimap-math.js';

const hex = (c) => (typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : (c || '#ffffff'));

/**
 * Creates the Tactical River Minimap, Threat Radar, and Boss Health Bar HUD component.
 *
 * @param {HTMLElement} [container=document.body] - Parent container element to mount onto.
 * @param {Object} [options={}] - Configuration options.
 */
export function createMinimapRadar(container = document.body, options = {}) {
    const opts = {
        radarRadius: options.radarRadius ?? 85,
        worldRadarRadius: options.worldRadarRadius ?? 100,
        mapWidth: options.mapWidth ?? 54,
        mapHeight: options.mapHeight ?? 240,
        showCanyonMap: options.showCanyonMap ?? true,
        showRadar: options.showRadar ?? true,
        showBossBar: options.showBossBar ?? true,
        ...options,
    };

    // --- DOM Elements Setup ---
    const root = document.createElement('div');
    root.id = 'tactical-minimap-root';
    root.style.cssText = `
        position: absolute;
        bottom: 24px;
        right: 24px;
        display: flex;
        align-items: flex-end;
        gap: 14px;
        pointer-events: none;
        z-index: 100;
        font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
        color: #e6ebf2;
        user-select: none;
    `;

    // 1. Vertical Canyon Progress Map
    const canyonPanel = document.createElement('div');
    canyonPanel.className = 'canyon-progress-panel';
    canyonPanel.style.cssText = `
        position: relative;
        width: ${opts.mapWidth}px;
        height: ${opts.mapHeight}px;
        background: rgba(13, 17, 23, 0.78);
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 8px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 12px rgba(56, 189, 248, 0.08);
        overflow: hidden;
        display: ${opts.showCanyonMap ? 'block' : 'none'};
    `;

    const canyonCanvas = document.createElement('canvas');
    canyonCanvas.width = opts.mapWidth;
    canyonCanvas.height = opts.mapHeight;
    canyonCanvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%;';
    const canyonCtx = canyonCanvas.getContext('2d');
    canyonPanel.appendChild(canyonCanvas);

    // 2. Circular 360 Tactical Threat Radar
    const radarDiameter = opts.radarRadius * 2;
    const radarPanel = document.createElement('div');
    radarPanel.className = 'tactical-radar-panel';
    radarPanel.style.cssText = `
        position: relative;
        width: ${radarDiameter}px;
        height: ${radarDiameter}px;
        background: radial-gradient(circle, rgba(13, 19, 28, 0.82) 0%, rgba(9, 13, 19, 0.94) 100%);
        border: 1px solid rgba(94, 234, 212, 0.35);
        border-radius: 50%;
        backdrop-filter: blur(12px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(94, 234, 212, 0.08);
        overflow: hidden;
        display: ${opts.showRadar ? 'block' : 'none'};
    `;

    const radarCanvas = document.createElement('canvas');
    radarCanvas.width = radarDiameter;
    radarCanvas.height = radarDiameter;
    radarCanvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%;';
    const radarCtx = radarCanvas.getContext('2d');
    radarPanel.appendChild(radarCanvas);

    // Compass ring labels (FWD / REAR)
    const compassOverlay = document.createElement('div');
    compassOverlay.style.cssText = `
        position: absolute;
        inset: 0;
        pointer-events: none;
    `;
    compassOverlay.innerHTML = `
        <span style="position:absolute; top:4px; left:50%; transform:translateX(-50%); font-size:9px; font-weight:700; color:rgba(94,234,212,0.8); letter-spacing:1px;">FWD</span>
        <span style="position:absolute; bottom:4px; left:50%; transform:translateX(-50%); font-size:9px; font-weight:700; color:rgba(248,113,113,0.8); letter-spacing:1px;">REAR</span>
    `;
    radarPanel.appendChild(compassOverlay);

    // 3. Top-Center Boss Health Bar
    const bossBarRoot = document.createElement('div');
    bossBarRoot.id = 'boss-health-bar-overlay';
    bossBarRoot.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: min(640px, 90vw);
        background: rgba(15, 20, 28, 0.88);
        border: 1px solid rgba(248, 113, 113, 0.35);
        border-radius: 8px;
        padding: 10px 16px 12px;
        backdrop-filter: blur(12px);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7), inset 0 0 24px rgba(248, 113, 113, 0.1);
        z-index: 110;
        pointer-events: none;
        display: none;
        transition: opacity 0.4s ease, transform 0.4s ease;
        opacity: 0;
    `;

    bossBarRoot.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span id="boss-type-badge" style="background:#ef4444; color:#fff; font-size:9px; font-weight:800; padding:2px 6px; border-radius:4px; letter-spacing:1px;">BOSS</span>
                <span id="boss-name" style="font-size:14px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#fff;">Dread Kraken</span>
                <span id="boss-phase-badge" style="font-size:10px; font-weight:700; color:#fbbf24; margin-left:4px;">PHASE 1</span>
            </div>
            <div id="boss-hp-numeric" style="font-size:12px; font-weight:700; color:#fca5a5;">300 / 300 (100%)</div>
        </div>
        <div id="boss-track-wrapper" style="position:relative; width:100%; height:14px; background:rgba(30, 41, 59, 0.9); border-radius:4px; overflow:hidden; border:1px solid rgba(255, 255, 255, 0.1);">
            <div id="boss-bar-fill" style="height:100%; width:100%; background:linear-gradient(90deg, #dc2626, #f97316); transition:width 0.2s cubic-bezier(0.4, 0, 0.2, 1);"></div>
            <div id="boss-phase-dividers" style="position:absolute; inset:0; pointer-events:none;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:9px; font-weight:600; color:#94a3b8; letter-spacing:0.5px;">
            <span id="boss-status-subtext">LEVIATHAN OF THE CITADEL MOUTH</span>
            <span id="boss-enrage-warn" style="color:#ef4444; font-weight:800; display:none;">⚠️ ENRAGED PHASE</span>
        </div>
    `;

    root.appendChild(canyonPanel);
    root.appendChild(radarPanel);
    if (container) {
        container.appendChild(root);
        container.appendChild(bossBarRoot);
    }

    // Dynamic state
    let radarSweepAngle = 0;
    let lastRenderTime = performance.now();

    /**
     * Renders the Vertical Canyon Progress Map on canvas.
     */
    function renderCanyonMap(state, myPlayer) {
        if (!opts.showCanyonMap || !canyonCtx) return;
        const w = opts.mapWidth;
        const h = opts.mapHeight;
        canyonCtx.clearRect(0, 0, w, h);

        // 1. Background river canyon track
        const grad = canyonCtx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, '#2d1f14'); // Act I muddy canyon amber
        grad.addColorStop(0.3, '#102236'); // Act II harbor indigo
        grad.addColorStop(0.65, '#06292b'); // Act III bioluminescent cyan
        grad.addColorStop(1, '#1e1136'); // Act IV tempest purple
        canyonCtx.fillStyle = grad;
        canyonCtx.fillRect(6, 0, w - 12, h);

        // Canyon riverbank borders
        canyonCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        canyonCtx.lineWidth = 1;
        canyonCtx.strokeRect(6, 0, w - 12, h);

        // 2. Harbor Shop zone overlay
        const shopMin = projectRiverProgress(RADAR_CONFIG.shopZone.minZ, RADAR_CONFIG.finishZ);
        const shopMax = projectRiverProgress(RADAR_CONFIG.shopZone.maxZ, RADAR_CONFIG.finishZ);
        const shopTopY = (1 - shopMin) * h;
        const shopBottomY = (1 - shopMax) * h;
        const shopHeight = Math.max(2, shopBottomY - shopTopY);

        canyonCtx.fillStyle = 'rgba(74, 222, 128, 0.22)';
        canyonCtx.fillRect(6, shopTopY, w - 12, shopHeight);
        canyonCtx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
        canyonCtx.strokeRect(6, shopTopY, w - 12, shopHeight);

        // 3. Checkpoint Gates
        canyonCtx.fillStyle = 'rgba(251, 191, 36, 0.85)';
        for (const cpZ of RADAR_CONFIG.checkpoints) {
            const cpProg = projectRiverProgress(cpZ, RADAR_CONFIG.finishZ);
            const cpY = (1 - cpProg) * h;
            canyonCtx.fillRect(4, cpY - 1, w - 8, 2);
        }

        // 4. Finish Citadel Gate
        canyonCtx.fillStyle = '#ffffff';
        canyonCtx.fillRect(4, 0, w - 8, 3);

        // 5. Active Loot Crates (if present in state)
        if (state.lootCrates) {
            canyonCtx.fillStyle = '#38bdf8';
            for (const crate of state.lootCrates) {
                if (crate.collected) continue;
                const p = projectToVerticalMap(crate.position || crate, w - 12, h);
                canyonCtx.beginPath();
                canyonCtx.arc(6 + p.x, p.y, 2, 0, Math.PI * 2);
                canyonCtx.fill();
            }
        }

        // 6. Enemies on canyon track
        if (state.enemies) {
            for (const [id, enemy] of Object.entries(state.enemies)) {
                if (!enemy || enemy.health <= 0) continue;
                const p = projectToVerticalMap(enemy.position, w - 12, h);
                const prof = getThreatProfile(enemy.type || id);
                canyonCtx.fillStyle = prof.color;
                canyonCtx.beginPath();
                canyonCtx.arc(6 + p.x, p.y, 3, 0, Math.PI * 2);
                canyonCtx.fill();
            }
        }

        // 7. Crew rafts (Human + AI bots)
        if (state.players) {
            for (const [id, player] of Object.entries(state.players)) {
                if (!player || player.isDead) continue;
                const p = projectToVerticalMap(player.position, w - 12, h);
                const isMe = myPlayer && player.id === myPlayer.id;

                canyonCtx.fillStyle = hex(player.color || (isMe ? '#5eead4' : '#94a3b8'));
                if (isMe) {
                    canyonCtx.shadowColor = '#5eead4';
                    canyonCtx.shadowBlur = 6;
                } else {
                    canyonCtx.shadowBlur = 0;
                }

                // Draw raft icon / circle
                canyonCtx.beginPath();
                if (isMe) {
                    canyonCtx.arc(6 + p.x, p.y, 4, 0, Math.PI * 2);
                } else {
                    canyonCtx.arc(6 + p.x, p.y, 2.5, 0, Math.PI * 2);
                }
                canyonCtx.fill();
                canyonCtx.shadowBlur = 0;
            }
        }
    }

    /**
     * Renders the 360 Tactical Threat Radar.
     */
    function renderRadar(state, myPlayer, dt) {
        if (!opts.showRadar || !radarCtx) return;
        const r = opts.radarRadius;
        const center = r;
        radarCtx.clearRect(0, 0, r * 2, r * 2);

        // 1. Concentric distance rings
        radarCtx.strokeStyle = 'rgba(94, 234, 212, 0.15)';
        radarCtx.lineWidth = 1;
        for (const fraction of [0.25, 0.5, 0.75, 1.0]) {
            radarCtx.beginPath();
            radarCtx.arc(center, center, (r - 8) * fraction, 0, Math.PI * 2);
            radarCtx.stroke();
        }

        // Crosshairs
        radarCtx.beginPath();
        radarCtx.moveTo(center, 8);
        radarCtx.lineTo(center, r * 2 - 8);
        radarCtx.moveTo(8, center);
        radarCtx.lineTo(r * 2 - 8, center);
        radarCtx.stroke();

        // 2. Animated scanning radar sweep line
        radarSweepAngle = (radarSweepAngle + dt * 1.5) % (Math.PI * 2);
        radarCtx.save();
        radarCtx.beginPath();
        radarCtx.moveTo(center, center);
        radarCtx.arc(center, center, r - 8, radarSweepAngle - 0.35, radarSweepAngle);
        radarCtx.closePath();
        const sweepGrad = radarCtx.createRadialGradient(center, center, 0, center, center, r - 8);
        sweepGrad.addColorStop(0, 'rgba(94, 234, 212, 0)');
        sweepGrad.addColorStop(1, 'rgba(94, 234, 212, 0.18)');
        radarCtx.fillStyle = sweepGrad;
        radarCtx.fill();
        radarCtx.restore();

        if (!myPlayer) return;
        const playerPos = myPlayer.position;
        const playerYaw = myPlayer.yaw ?? (myPlayer.quaternion ? 2 * Math.atan2(myPlayer.quaternion.y, myPlayer.quaternion.w) : 0);

        // 3. Render other crew rafts
        if (state.players) {
            for (const [id, p] of Object.entries(state.players)) {
                if (p.id === myPlayer.id || p.isDead) continue;
                const proj = projectToRadar(playerPos, p.position, playerYaw, {
                    worldRadarRadius: opts.worldRadarRadius,
                    uiRadius: r - 12,
                });

                if (proj.isInside) {
                    const px = center + proj.x;
                    const py = center + proj.y;
                    radarCtx.fillStyle = hex(p.color || '#4ade80');
                    radarCtx.beginPath();
                    radarCtx.arc(px, py, 3.5, 0, Math.PI * 2);
                    radarCtx.fill();

                    // Heading indicator line for crewmate
                    const mateYaw = p.yaw ?? (p.quaternion ? 2 * Math.atan2(p.quaternion.y, p.quaternion.w) : 0);
                    const relHdg = mateYaw - playerYaw;
                    radarCtx.strokeStyle = hex(p.color || '#4ade80');
                    radarCtx.lineWidth = 1.5;
                    radarCtx.beginPath();
                    radarCtx.moveTo(px, py);
                    radarCtx.lineTo(px - Math.sin(relHdg) * 7, py - Math.cos(relHdg) * 7);
                    radarCtx.stroke();
                }
            }
        }

        // 4. Render threats & off-screen warning arrows
        if (state.enemies) {
            for (const [id, enemy] of Object.entries(state.enemies)) {
                if (!enemy || enemy.health <= 0) continue;
                const prof = getThreatProfile(enemy.type || id);

                const proj = projectToRadar(playerPos, enemy.position, playerYaw, {
                    worldRadarRadius: opts.worldRadarRadius,
                    uiRadius: r - 12,
                });

                if (proj.isInside) {
                    // Inside radar circle
                    const ex = center + proj.x;
                    const ey = center + proj.y;

                    // Threat blip
                    radarCtx.fillStyle = prof.color;
                    radarCtx.shadowColor = prof.color;
                    radarCtx.shadowBlur = 8;
                    radarCtx.beginPath();
                    radarCtx.arc(ex, ey, 4.5, 0, Math.PI * 2);
                    radarCtx.fill();
                    radarCtx.shadowBlur = 0;

                    // Pulsing proximity ring for nearby threats (< 35m)
                    if (proj.worldDistance < 35) {
                        const pulse = (Math.sin(performance.now() * 0.01) + 1) * 3;
                        radarCtx.strokeStyle = prof.color;
                        radarCtx.lineWidth = 1;
                        radarCtx.beginPath();
                        radarCtx.arc(ex, ey, 5 + pulse, 0, Math.PI * 2);
                        radarCtx.stroke();
                    }

                    // Long Worm charging strike vector line
                    if (enemy.type === 'longWorm' && enemy.state === 'charging' && enemy.targetPos) {
                        const vec = calculateChargingVector(playerPos, enemy.position, enemy.targetPos, playerYaw, {
                            worldRadarRadius: opts.worldRadarRadius,
                            uiRadius: r - 12,
                        });
                        if (vec) {
                            radarCtx.strokeStyle = '#ef4444';
                            radarCtx.lineWidth = 2;
                            radarCtx.setLineDash([4, 3]);
                            radarCtx.beginPath();
                            radarCtx.moveTo(center + vec.startX, center + vec.startY);
                            radarCtx.lineTo(center + vec.endX, center + vec.endY);
                            radarCtx.stroke();
                            radarCtx.setLineDash([]);
                        }
                    }
                } else {
                    // Off-screen threat arrow clamped to radar perimeter
                    const arrow = calculateOffscreenArrow(playerPos, enemy.position, playerYaw, {
                        worldRadarRadius: opts.worldRadarRadius,
                        maxDetectionDist: 250,
                        uiRadius: r - 8,
                        rimPadding: 4,
                    });

                    if (arrow.inDetectionRange) {
                        const ax = center + arrow.edgeX;
                        const ay = center + arrow.edgeY;

                        radarCtx.save();
                        radarCtx.translate(ax, ay);
                        radarCtx.rotate(arrow.angle);

                        // Draw chevron pointer pointing outwards towards threat
                        radarCtx.fillStyle = prof.color;
                        radarCtx.shadowColor = prof.color;
                        radarCtx.shadowBlur = 6 * arrow.fadeRatio;
                        radarCtx.globalAlpha = Math.max(0.3, arrow.fadeRatio);

                        radarCtx.beginPath();
                        radarCtx.moveTo(0, -6);
                        radarCtx.lineTo(4, 4);
                        radarCtx.lineTo(0, 2);
                        radarCtx.lineTo(-4, 4);
                        radarCtx.closePath();
                        radarCtx.fill();

                        radarCtx.restore();

                        // Threat distance badge
                        if (arrow.isBehind) {
                            radarCtx.font = '8px ui-monospace, monospace';
                            radarCtx.fillStyle = prof.color;
                            radarCtx.textAlign = 'center';
                            radarCtx.fillText(`${Math.round(arrow.distance)}m`, ax, ay + (ay > center ? 10 : -6));
                        }
                    }
                }
            }
        }

        // 5. Player raft center icon (Cyan Chevron pointing up forward)
        radarCtx.fillStyle = '#5eead4';
        radarCtx.shadowColor = '#5eead4';
        radarCtx.shadowBlur = 8;
        radarCtx.beginPath();
        radarCtx.moveTo(center, center - 6);
        radarCtx.lineTo(center + 4, center + 4);
        radarCtx.lineTo(center, center + 2);
        radarCtx.lineTo(center - 4, center + 4);
        radarCtx.closePath();
        radarCtx.fill();
        radarCtx.shadowBlur = 0;
    }

    /**
     * Updates and renders the Top-Center Boss Health Bar.
     */
    function updateBossBar(state, myPlayer) {
        if (!opts.showBossBar) return;

        // Check if there is an active major enemy (Kraken, Worm, Mud Alien, Wizard)
        let activeBoss = null;
        if (state.boss) {
            activeBoss = state.boss;
        } else if (state.enemies) {
            // Find major enemy close to player or active
            const worm = state.enemies.longWorm;
            const kraken = state.enemies.kraken;
            const alien = state.enemies.mudAlien;
            const wizard = state.enemies.whiteGuy;

            if (kraken && kraken.health > 0) activeBoss = kraken;
            else if (worm && worm.health > 0) activeBoss = worm;
            else if (alien && alien.health > 0) activeBoss = alien;
            else if (wizard && wizard.health > 0) activeBoss = wizard;
        }

        if (!activeBoss || activeBoss.health <= 0) {
            bossBarRoot.style.opacity = '0';
            setTimeout(() => {
                if (!activeBoss || activeBoss.health <= 0) bossBarRoot.style.display = 'none';
            }, 400);
            return;
        }

        const phases = calculateBossHealthPhases(activeBoss.health, activeBoss.maxHealth, {
            phases: activeBoss.phases || 3,
            enrageThreshold: 0.25,
        });

        const prof = getThreatProfile(activeBoss.type || activeBoss.id);

        bossBarRoot.style.display = 'block';
        bossBarRoot.style.opacity = '1';

        const nameEl = bossBarRoot.querySelector('#boss-name');
        const phaseBadge = bossBarRoot.querySelector('#boss-phase-badge');
        const hpNum = bossBarRoot.querySelector('#boss-hp-numeric');
        const fill = bossBarRoot.querySelector('#boss-bar-fill');
        const dividersEl = bossBarRoot.querySelector('#boss-phase-dividers');
        const enrageWarn = bossBarRoot.querySelector('#boss-enrage-warn');

        if (nameEl) nameEl.textContent = activeBoss.name || prof.name;
        if (phaseBadge) phaseBadge.textContent = `PHASE ${phases.currentPhase} / ${phases.totalPhases}`;
        if (hpNum) hpNum.textContent = `${phases.health} / ${phases.maxHealth} (${phases.healthPercent.toFixed(0)}%)`;

        if (fill) {
            fill.style.width = `${phases.healthPercent}%`;
            if (phases.isEnraged) {
                fill.style.background = 'linear-gradient(90deg, #b91c1c, #ef4444)';
            } else {
                fill.style.background = 'linear-gradient(90deg, #dc2626, #f97316)';
            }
        }

        if (dividersEl) {
            dividersEl.innerHTML = phases.dividers
                .map((d) => `<div style="position:absolute; top:0; bottom:0; left:${d * 100}%; width:2px; background:rgba(255,255,255,0.7); box-shadow:0 0 4px #000;"></div>`)
                .join('');
        }

        if (enrageWarn) {
            enrageWarn.style.display = phases.isEnraged ? 'inline' : 'none';
        }
    }

    return {
        /**
         * Update loop called every frame or game tick.
         */
        update(state, myPlayer) {
            const now = performance.now();
            const dt = Math.min(0.1, (now - lastRenderTime) / 1000);
            lastRenderTime = now;

            renderCanyonMap(state, myPlayer);
            renderRadar(state, myPlayer, dt);
            updateBossBar(state, myPlayer);
        },
        /**
         * Cleans up and detaches DOM nodes.
         */
        destroy() {
            root.remove();
            bossBarRoot.remove();
        },
        elements: {
            root,
            canyonPanel,
            radarPanel,
            bossBarRoot,
            canyonCanvas,
            radarCanvas,
        },
    };
}
