/**
 * Sovereign Core & Videogame Helmet 04 Directive
 * Per-Act Particle, Popup & Silhouette Contrast Budget
 * (`shared/frustum-clutter-budget.js`)
 *
 * Why this exists:
 * In high-angle diorama rendering, procedural clutter (excessive visible meshes, particle storms,
 * popup banner spam, and obscuring HUD elements) drowns the 0.5-second squint test, washes out
 * critical silhouettes (safe costado planks, whiteGuy wizard, mudAlien tripod, nokia-vector worm),
 * and creates frame stutter.
 *
 * This pure, zero-dependency ES module enforces hard visual clutter caps across the frustum:
 *   - maxVisibleMeshes: 2400
 *   - maxActiveParticles: 120
 *   - maxSimultaneousPopups: 3
 *   - maxHudFootprintRatio: 0.08 (< 8% screen HUD occlusion)
 *
 * Pure ES module, zero external dependencies, deterministic.
 */

/**
 * Hard caps for scene frustum visual clutter.
 */
export const CLUTTER_BUDGET_LIMITS = Object.freeze({
    maxVisibleMeshes: 2400,
    maxActiveParticles: 120,
    maxSimultaneousPopups: 3,
    maxHudFootprintRatio: 0.08,
});

/**
 * Clamps a numerical value between min and max.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    if (typeof value !== 'number' || Number.isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
}

/**
 * Evaluates whether the scene elements inside the view frustum are within the visual clutter budget.
 * When limits are exceeded, computes scaling and throttle ratios to safeguard 60 FPS and 0.5s squint-test clarity.
 *
 * @param {Object} [params]
 * @param {number} [params.visibleMeshes=0] - Number of visible 3D meshes in camera frustum
 * @param {number} [params.activeParticles=0] - Number of active VFX/weather particles in frustum
 * @param {number} [params.activePopups=0] - Number of active toasts, popups, or HUD alert banners
 * @param {number} [params.hudFootprintRatio=0.05] - Ratio of screen area occluded by HUD (0.0 to 1.0)
 * @returns {{
 *   withinBudget: boolean,
 *   meshScaleFactor: number,
 *   particleThrottleRatio: number,
 *   allowNewPopup: boolean
 * }}
 */
export function evaluateSceneClutterBudget({
    visibleMeshes = 0,
    activeParticles = 0,
    activePopups = 0,
    hudFootprintRatio = 0.05,
} = {}) {
    const safeVisibleMeshes = Math.max(0, typeof visibleMeshes === 'number' && Number.isFinite(visibleMeshes) ? visibleMeshes : 0);
    const safeActiveParticles = Math.max(0, typeof activeParticles === 'number' && Number.isFinite(activeParticles) ? activeParticles : 0);
    const safeActivePopups = Math.max(0, typeof activePopups === 'number' && Number.isFinite(activePopups) ? activePopups : 0);
    const safeHudRatio = Math.max(0, typeof hudFootprintRatio === 'number' && Number.isFinite(hudFootprintRatio) ? hudFootprintRatio : 0);

    const meshesOk = safeVisibleMeshes <= CLUTTER_BUDGET_LIMITS.maxVisibleMeshes;
    const particlesOk = safeActiveParticles <= CLUTTER_BUDGET_LIMITS.maxActiveParticles;
    const popupsOk = safeActivePopups <= CLUTTER_BUDGET_LIMITS.maxSimultaneousPopups;
    const hudOk = safeHudRatio <= CLUTTER_BUDGET_LIMITS.maxHudFootprintRatio;

    const withinBudget = meshesOk && particlesOk && popupsOk && hudOk;

    // Mesh scale factor: 1.0 when within budget; throttles down inversely proportional to excess
    let meshScaleFactor = 1.0;
    if (safeVisibleMeshes > CLUTTER_BUDGET_LIMITS.maxVisibleMeshes) {
        meshScaleFactor = CLUTTER_BUDGET_LIMITS.maxVisibleMeshes / safeVisibleMeshes;
    }
    meshScaleFactor = clamp(meshScaleFactor, 0.0, 1.0);

    // Particle throttle ratio: 1.0 when within budget; throttles down inversely proportional to excess
    let particleThrottleRatio = 1.0;
    if (safeActiveParticles > CLUTTER_BUDGET_LIMITS.maxActiveParticles) {
        particleThrottleRatio = CLUTTER_BUDGET_LIMITS.maxActiveParticles / safeActiveParticles;
    }
    particleThrottleRatio = clamp(particleThrottleRatio, 0.0, 1.0);

    // Allow new popup: only allowed if current active popups are strictly less than maxSimultaneousPopups
    // and total HUD footprint ratio remains under maxHudFootprintRatio
    const allowNewPopup = safeActivePopups < CLUTTER_BUDGET_LIMITS.maxSimultaneousPopups && safeHudRatio < CLUTTER_BUDGET_LIMITS.maxHudFootprintRatio;

    return {
        withinBudget,
        meshScaleFactor: Number(meshScaleFactor.toFixed(4)),
        particleThrottleRatio: Number(particleThrottleRatio.toFixed(4)),
        allowNewPopup,
    };
}
