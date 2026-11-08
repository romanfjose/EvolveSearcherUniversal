/**
 * Don't Sink, Don't Die — Multi-Mode Camera Profiles & Kickflip Landing Feel Bridge
 * (`shared/camera-modes-and-kickflip-feel.js`)
 *
 * Sovereign Core & Videogame Helmet 01 (Synthetic José Camera & Game-Feel Pilot):
 * 1. Low, Close, Over-the-Shoulder Chase Camera:
 *    - Strict adherence to low pitch (0.24..0.28 rad / ~13°..16°), base distance (10.0..11.5m),
 *      and horizon-framing look-ahead (14..18m downriver along -Z).
 *    - 100% player-centered lock with zero bot centroid drift across all 5 game modes:
 *      'campaign', 'daily', 'endless', 'boss_rush', and 'splitscreen'.
 * 2. Kickflip & Dynamic Landing Camera Feel:
 *    - Translates mid-air kickflip rotation into subtle dynamic Dutch angle roll offset (up to ~0.15 rad).
 *    - Translates landing impacts into visceral vertical pitch impulse, FOV pulse (cushioning & release),
 *      and snappy camera shake boost.
 *    - Never yanks the horizon out of view: pitch impulses are bounded and preserve downriver sightlines.
 *    - 100% numerical safety: zero NaN, null, or Infinity leaks under any input corruption.
 *
 * Pure deterministic ES module with zero external dependencies.
 */

export const CAMERA_FEEL_LIMITS = Object.freeze({
    minPitch: 0.24,
    maxPitch: 0.28,
    minDistance: 10.0,
    maxDistance: 11.5,
    minLookAhead: 14.0,
    maxLookAhead: 18.0,

    // Feel Impulse Clamp Limits (keeps horizon solidly in view)
    maxRollOffset: 0.18,      // Max Dutch roll angle (~10.3 degrees)
    minPitchImpulse: -0.12,   // Max downward pitch compression
    maxPitchImpulse: 0.08,    // Max upward pitch rebound
    maxFovPulse: 6.0,         // Max FOV pulse in degrees
    maxShakeBoost: 0.65,      // Max camera shake boost
});

/**
 * Camera profiles for all 5 official game modes.
 * All profiles maintain Helmet 01 low over-the-shoulder chase camera geometry.
 */
export const MODE_CAMERA_PROFILES = Object.freeze({
    campaign: Object.freeze({
        id: 'campaign',
        name: 'Standard Campaign Camera',
        pitch: 0.25,           // 14.3 degrees low chase angle
        distance: 10.5,        // Tight over-the-shoulder framing
        lookAhead: 16.0,       // Eyes locked downriver
        heightOffset: 1.85,    // Craft eye elevation
        stiffness: 13.0,       // Snappy spring tracking
        follow: 6.5,           // Responsive yaw follow
        baseFov: 72.0,
        maxFov: 84.0,
    }),
    daily: Object.freeze({
        id: 'daily',
        name: 'Daily Fever-Dream Camera',
        pitch: 0.26,           // Slightly steeper for dense fever hazards
        distance: 10.8,
        lookAhead: 16.5,
        heightOffset: 1.90,
        stiffness: 13.5,
        follow: 6.8,
        baseFov: 73.0,
        maxFov: 85.0,
    }),
    endless: Object.freeze({
        id: 'endless',
        name: 'Endless Rogue-River Camera',
        pitch: 0.25,
        distance: 11.0,        // Slightly wider margin for extreme endless speeds
        lookAhead: 17.5,       // Farther look-ahead for high-speed survival
        heightOffset: 1.85,
        stiffness: 14.0,
        follow: 7.0,
        baseFov: 74.0,
        maxFov: 86.0,
    }),
    boss_rush: Object.freeze({
        id: 'boss_rush',
        name: 'Boss Rush Titan Camera',
        pitch: 0.27,           // Framed slightly up for giant titan visibility
        distance: 11.4,        // Maximum distance in profile budget to frame boss sweeps
        lookAhead: 18.0,       // Max forward sightline to telegraph telegraph lunges
        heightOffset: 1.95,
        stiffness: 14.5,
        follow: 7.2,
        baseFov: 75.0,
        maxFov: 88.0,
    }),
    splitscreen: Object.freeze({
        id: 'splitscreen',
        name: '2P Split-Screen Compact Camera',
        pitch: 0.24,           // Low angle tailored for compressed half-height/width viewports
        distance: 10.2,        // Intimate tight distance for halved pixel real estate
        lookAhead: 15.0,
        heightOffset: 1.80,
        stiffness: 15.0,       // Instantaneous bite for split controls
        follow: 7.5,
        baseFov: 70.0,
        maxFov: 82.0,
    }),
});

export const VALID_GAME_MODES = Object.freeze(Object.keys(MODE_CAMERA_PROFILES));

/**
 * Retrieves the mode camera profile, falling back safely to 'campaign'.
 *
 * @param {string} mode - Game mode key
 * @returns {object} Frozen camera profile
 */
export function getModeCameraProfile(mode) {
    if (typeof mode === 'string') {
        const key = mode.toLowerCase().trim();
        if (Object.hasOwn(MODE_CAMERA_PROFILES, key)) {
            return MODE_CAMERA_PROFILES[key];
        }
    }
    return MODE_CAMERA_PROFILES.campaign;
}

/**
 * Helper to clamp values safely.
 */
function clamp(v, min, max) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

/**
 * Computes visceral camera feel offsets for kickflips, jumps, and solid landings.
 * Follows Helmet 01 directives:
 * - Dynamic Dutch angle roll during mid-air 360 kickflips.
 * - Physical landing compression (pitch dip + slight FOV swell) and elastic recovery.
 * - Head bounce extra jolt for ceiling or overhead structure contact.
 * - Never yanks the horizon out of view.
 *
 * @param {object} [options]
 * @param {boolean} [options.airborne=false] - True if craft is mid-air
 * @param {number} [options.kickflipProgress=0] - Kickflip progress (0.0 to 1.0 or 0 to 360 deg)
 * @param {number} [options.landingImpact=0] - Instantaneous landing impact intensity (0.0 to 1.0+)
 * @param {boolean} [options.headBounce=false] - True if craft rebounded off an obstacle/bridge overhead
 * @returns {{ rollOffset: number, pitchImpulse: number, fovPulse: number, shakeBoost: number }}
 */
export function computeKickflipAndLandingCameraImpulse(params = {}) {
    const safeParams = (params && typeof params === 'object') ? params : {};
    const {
        airborne = false,
        kickflipProgress = 0,
        landingImpact = 0,
        headBounce = false,
    } = safeParams;
    const isAirborne = Boolean(airborne);
    const isHeadBounce = Boolean(headBounce);

    // Normalize kickflip progress: accept 0..1 or 0..360
    let kProg = 0;
    if (typeof kickflipProgress === 'number' && Number.isFinite(kickflipProgress)) {
        if (kickflipProgress > 1.0) {
            kProg = clamp(kickflipProgress / 360, 0, 1);
        } else {
            kProg = clamp(kickflipProgress, 0, 1);
        }
    }

    // Normalize landing impact: strictly non-negative finite number
    const impact = (typeof landingImpact === 'number' && Number.isFinite(landingImpact))
        ? Math.max(0, landingImpact)
        : 0;

    let rollOffset = 0;
    let pitchImpulse = 0;
    let fovPulse = 0;
    let shakeBoost = 0;

    if (isAirborne) {
        // Mid-air kickflip feel:
        // Sine wave roll that smoothly tilts camera left-right through rotation without dizzying the pilot
        if (kProg > 0 && kProg < 1) {
            // Full 360 degree kickflip induces a clean Dutch angle roll: sin(kProg * 2 * PI)
            rollOffset = Math.sin(kProg * Math.PI * 2) * 0.14; // max ~8 degrees
            // Subtle mid-air float pitch lift
            pitchImpulse = 0.02 * Math.sin(kProg * Math.PI);
            // Slight FOV expansion mid-trick for dramatic stunt perspective
            fovPulse = 1.8 * Math.sin(kProg * Math.PI);
        } else {
            // Standard airborne float
            pitchImpulse = 0.015;
            fovPulse = 0.8;
        }
    } else {
        // Ground / Water Landing Feel:
        if (impact > 0.01) {
            const saturatedImpact = Math.min(2.0, impact);

            // Downward pitch compression on impact: craft hits water/deck, nose dips slightly
            // Negative pitchImpulse compresses down without losing horizon
            pitchImpulse = -0.055 * Math.min(1.0, saturatedImpact);

            // Downward shock absorbs into FOV compression/expansion pulse
            fovPulse = 2.4 * Math.min(1.0, saturatedImpact);

            // Screen shake boost proportional to impact force
            shakeBoost = 0.22 * Math.min(1.5, saturatedImpact);

            // Rebound bounce if impact was severe
            if (saturatedImpact > 0.75) {
                shakeBoost += 0.08 * (saturatedImpact - 0.75);
            }
        }
    }

    // Head bounce penalty: craft bonks an overhead obstacle or bridge underside
    if (isHeadBounce) {
        // Sudden jarring downwards pitch impulse and crisp camera shake
        pitchImpulse -= 0.045;
        shakeBoost = Math.max(shakeBoost, 0.32);
        fovPulse = Math.max(fovPulse, 3.0);
        rollOffset += 0.05;
    }

    // Clamp all impulse outputs to strict safe limits to preserve horizon
    const clampedRoll = clamp(rollOffset, -CAMERA_FEEL_LIMITS.maxRollOffset, CAMERA_FEEL_LIMITS.maxRollOffset);
    const clampedPitch = clamp(pitchImpulse, CAMERA_FEEL_LIMITS.minPitchImpulse, CAMERA_FEEL_LIMITS.maxPitchImpulse);
    const clampedFov = clamp(fovPulse, -2.0, CAMERA_FEEL_LIMITS.maxFovPulse);
    const clampedShake = clamp(shakeBoost, 0, CAMERA_FEEL_LIMITS.maxShakeBoost);

    return {
        rollOffset: Number(clampedRoll.toFixed(4)),
        pitchImpulse: Number(clampedPitch.toFixed(4)),
        fovPulse: Number(clampedFov.toFixed(3)),
        shakeBoost: Number(clampedShake.toFixed(3)),
    };
}
