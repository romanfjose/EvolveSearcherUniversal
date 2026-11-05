/**
 * Multi-Resolution 100vh Viewport & HUD Collision Auditor
 * (`shared/hud-layout-auditor.js`)
 *
 * Computes DOM HUD bounding boxes across canonical desktop & mobile viewports,
 * verifies zero bounding box intersections between active HUD panels,
 * and calculates dynamic compact scaling factors to keep total HUD area under 18% of the viewport.
 *
 * Zero external dependencies — pure, deterministic ES module.
 */

/**
 * Canonical test viewports required by Sovereign QA Helmet 03.
 */
export const AUDITOR_VIEWPORTS = [
    { name: 'desktop-fhd', width: 1920, height: 1080, type: 'desktop', orientation: 'landscape' },
    { name: 'desktop-wxga-plus', width: 1440, height: 900, type: 'desktop', orientation: 'landscape' },
    { name: 'desktop-fwxga', width: 1366, height: 768, type: 'desktop', orientation: 'landscape' },
    { name: 'desktop-hd', width: 1280, height: 720, type: 'desktop', orientation: 'landscape' },
    { name: 'mobile-landscape', width: 844, height: 390, type: 'mobile', orientation: 'landscape' },
    { name: 'mobile-portrait', width: 390, height: 844, type: 'mobile', orientation: 'portrait' },
];

/**
 * Base layout dimensions and styling constraints for HUD components.
 * Derived from public/index.html and public/js/ui/minimap-radar.js.
 */
export const DEFAULT_HUD_SPEC = {
    hud: {
        id: '#hud',
        alias: '#ui',
        baseWidth: 236,
        baseHeight: 180,
        margin: { top: 12, left: 12 },
    },
    waveBanner: {
        id: '#wave-banner',
        alias: '#wave-panel',
        baseHeight: 88,
        minWidth: 280,
        maxWidth: 400,
        desktopTop: 12,
        mobileBottom: 64,
        mobileLeft: 12,
        mobileWidth: 260,
    },
    scoreboard: {
        id: '#scoreboard',
        baseWidth: 290,
        baseHeight: 140,
        margin: { top: 12, right: 12 },
        // Collapsed/hidden at width <= 860px (per public/index.html @media (max-width: 860px))
        hideBelowWidth: 860,
    },
    minimap: {
        id: '#tactical-minimap-root',
        // Minimap panel includes canyon map (54px) + radar (170px) + gap (14px) = 238px width, 240px height
        baseWidth: 238,
        baseHeight: 240,
        margin: { bottom: 54, right: 16 },
    },
    instructions: {
        id: '#instructions',
        baseHeight: 34,
        // Responsive pill at bottom center
        margin: { bottom: 12 },
        paddingHorizontal: 28,
        maxWidthOffset: 24, // calc(100vw - 24px)
        mobileMaxHeight: 52, // wraps onto multiple lines if narrow
    },
    maxHudAreaRatio: 0.18, // 18% viewport area ceiling
};

/**
 * Determines whether two 2D axis-aligned bounding boxes (AABBs) intersect.
 *
 * @param {{ left: number, top: number, right: number, bottom: number }} a
 * @param {{ left: number, top: number, right: number, bottom: number }} b
 * @param {number} [tolerance=0] - Pixel tolerance for touch vs penetration
 * @returns {{ intersects: boolean, overlapWidth: number, overlapHeight: number }}
 */
export function checkBoundingBoxIntersection(a, b, tolerance = 0) {
    if (!a || !b) return { intersects: false, overlapWidth: 0, overlapHeight: 0 };
    const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

    const intersects = xOverlap > tolerance && yOverlap > tolerance;
    return {
        intersects,
        overlapWidth: intersects ? xOverlap : 0,
        overlapHeight: intersects ? yOverlap : 0,
    };
}

/**
 * Calculates raw or scaled bounding boxes for all active HUD elements
 * under the specified viewport dimensions and scale factor.
 *
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {number} [scale=1.0] - Compact scaling multiplier
 * @param {Object} [customSpec={}]
 * @returns {Record<string, { id: string, left: number, top: number, right: number, bottom: number, width: number, height: number, visible: boolean }>}
 */
export function computeHudBoundingBoxes(viewportWidth, viewportHeight, scale = 1.0, customSpec = {}) {
    const spec = { ...DEFAULT_HUD_SPEC, ...customSpec };
    const boxes = {};
    const isMobileWidth = viewportWidth <= 860;

    // 1. #hud (Telemetry, health, speed, coins) - Top Left
    const hudW = Math.round(spec.hud.baseWidth * scale);
    const hudH = Math.round(spec.hud.baseHeight * scale);
    const hudTop = Math.round(spec.hud.margin.top * Math.min(1, scale));
    const hudLeft = Math.round(spec.hud.margin.left * Math.min(1, scale));

    boxes['#hud'] = {
        id: '#hud',
        left: hudLeft,
        top: hudTop,
        right: hudLeft + hudW,
        bottom: hudTop + hudH,
        width: hudW,
        height: hudH,
        visible: true,
    };

    // 2. #scoreboard - Top Right
    // Hidden on screens <= 860px width
    const sbVisible = !isMobileWidth;
    if (sbVisible) {
        const sbW = Math.round(spec.scoreboard.baseWidth * scale);
        const sbH = Math.round(spec.scoreboard.baseHeight * scale);
        const sbRight = viewportWidth - Math.round(spec.scoreboard.margin.right * Math.min(1, scale));
        const sbTop = Math.round(spec.scoreboard.margin.top * Math.min(1, scale));
        boxes['#scoreboard'] = {
            id: '#scoreboard',
            left: sbRight - sbW,
            top: sbTop,
            right: sbRight,
            bottom: sbTop + sbH,
            width: sbW,
            height: sbH,
            visible: true,
        };
    } else {
        boxes['#scoreboard'] = {
            id: '#scoreboard',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
            visible: false,
        };
    }

    // 3. #wave-banner / #wave-panel - Center top on desktop, bottom-left on mobile
    let waveW, waveH, waveLeft, waveTop;
    if (isMobileWidth) {
        // Mobile style: bottom: 64px; left: 12px; width: 260px (or scaled down to fit)
        waveW = Math.min(Math.round(spec.waveBanner.mobileWidth * scale), Math.max(160, viewportWidth - 24));
        waveH = Math.round(spec.waveBanner.baseHeight * scale);
        waveLeft = Math.round(spec.waveBanner.mobileLeft * Math.min(1, scale));
        const waveBottom = viewportHeight - Math.round(spec.waveBanner.mobileBottom * Math.min(1, scale));
        waveTop = waveBottom - waveH;
    } else {
        // Desktop style: top: 12px; left: 50%; transform: translateX(-50%); width: min(400px, calc(100vw - 520px)); min-width: 280px;
        const availableWaveW = Math.max(spec.waveBanner.minWidth, viewportWidth - 520);
        waveW = Math.round(Math.min(spec.waveBanner.maxWidth, availableWaveW) * scale);
        waveH = Math.round(spec.waveBanner.baseHeight * scale);
        waveLeft = Math.round((viewportWidth - waveW) / 2);
        waveTop = Math.round(spec.waveBanner.desktopTop * Math.min(1, scale));
    }

    boxes['#wave-banner'] = {
        id: '#wave-banner',
        left: waveLeft,
        top: waveTop,
        right: waveLeft + waveW,
        bottom: waveTop + waveH,
        width: waveW,
        height: waveH,
        visible: true,
    };

    // 4. #tactical-minimap-root - Bottom Right
    const miniW = Math.round(spec.minimap.baseWidth * scale);
    const miniH = Math.round(spec.minimap.baseHeight * scale);
    const miniRight = viewportWidth - Math.round(spec.minimap.margin.right * Math.min(1, scale));
    const miniBottom = viewportHeight - Math.round(spec.minimap.margin.bottom * Math.min(1, scale));
    const miniLeft = miniRight - miniW;
    const miniTop = miniBottom - miniH;

    boxes['#tactical-minimap-root'] = {
        id: '#tactical-minimap-root',
        left: miniLeft,
        top: miniTop,
        right: miniRight,
        bottom: miniBottom,
        width: miniW,
        height: miniH,
        visible: true,
    };

    // 5. #instructions - Bottom Center
    // On small mobile, instructions might wrap or tuck between elements, or be compact
    let instW, instH, instLeft, instTop;
    const estimatedTextW = isMobileWidth ? 260 : 540;
    const maxInstW = viewportWidth - spec.instructions.maxWidthOffset;
    instW = Math.min(Math.round(estimatedTextW * scale), maxInstW);
    instH = isMobileWidth ? Math.round(spec.instructions.mobileMaxHeight * scale) : Math.round(spec.instructions.baseHeight * scale);
    instLeft = Math.round((viewportWidth - instW) / 2);
    const instBottom = viewportHeight - Math.round(spec.instructions.margin.bottom * Math.min(1, scale));
    instTop = instBottom - instH;

    boxes['#instructions'] = {
        id: '#instructions',
        left: instLeft,
        top: instTop,
        right: instLeft + instW,
        bottom: instBottom,
        width: instW,
        height: instH,
        visible: true,
    };

    return boxes;
}

/**
 * Verifies zero bounding box intersections between active HUD elements.
 *
 * @param {Record<string, { id: string, left: number, top: number, right: number, bottom: number, width: number, height: number, visible: boolean }>} boxes
 * @param {number} [tolerance=0]
 * @returns {{ collisions: Array<{ pair: [string, string], overlapWidth: number, overlapHeight: number }>, hasCollision: boolean }}
 */
export function checkHudCollisions(boxes, tolerance = 0) {
    const keys = Object.keys(boxes);
    const collisions = [];

    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const keyA = keys[i];
            const keyB = keys[j];
            const boxA = boxes[keyA];
            const boxB = boxes[keyB];

            if (!boxA.visible || !boxB.visible) continue;

            const res = checkBoundingBoxIntersection(boxA, boxB, tolerance);
            if (res.intersects) {
                collisions.push({
                    pair: [keyA, keyB],
                    overlapWidth: res.overlapWidth,
                    overlapHeight: res.overlapHeight,
                    description: `${keyA} intersects ${keyB} by ${Math.round(res.overlapWidth)}x${Math.round(res.overlapHeight)}px`,
                });
            }
        }
    }

    return {
        collisions,
        hasCollision: collisions.length > 0,
    };
}

/**
 * Computes the total area of all visible HUD elements and the percentage of the viewport it occupies.
 *
 * @param {Record<string, { id: string, left: number, top: number, right: number, bottom: number, width: number, height: number, visible: boolean }>} boxes
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {{ totalHudArea: number, viewportArea: number, areaRatio: number, areaPercent: number }}
 */
export function computeHudAreaRatio(boxes, viewportWidth, viewportHeight) {
    const viewportArea = Math.max(1, viewportWidth * viewportHeight);
    let totalHudArea = 0;

    for (const box of Object.values(boxes)) {
        if (!box.visible) continue;
        totalHudArea += Math.max(0, box.width * box.height);
    }

    const areaRatio = totalHudArea / viewportArea;
    const areaPercent = areaRatio * 100;

    return {
        totalHudArea,
        viewportArea,
        areaRatio,
        areaPercent,
    };
}

/**
 * Computes the optimal dynamic compact scaling factor (between minScale and 1.0)
 * such that:
 *  1. Zero bounding box intersections exist between HUD panels.
 *  2. Total HUD area stays under maxAreaRatio (default 18% of viewport).
 *
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {Object} [options={}]
 * @returns {{ scale: number, boxes: Record<string, any>, areaRatio: number, areaPercent: number, hasCollision: boolean, valid: boolean }}
 */
export function computeCompactScalingFactor(viewportWidth, viewportHeight, options = {}) {
    const maxAreaRatio = options.maxHudAreaRatio ?? DEFAULT_HUD_SPEC.maxHudAreaRatio;
    const minScale = options.minScale ?? 0.45;
    const maxScale = options.maxScale ?? 1.0;
    const step = options.step ?? 0.02;

    let bestSolution = null;

    // Search from 1.0 down to minScale for the highest scale factor that meets all criteria
    for (let s = maxScale; s >= minScale - 1e-6; s -= step) {
        const roundedScale = Math.round(s * 100) / 100;
        const boxes = computeHudBoundingBoxes(viewportWidth, viewportHeight, roundedScale, options.spec);
        const col = checkHudCollisions(boxes, options.tolerance ?? 0);
        const area = computeHudAreaRatio(boxes, viewportWidth, viewportHeight);

        const meetsAreaConstraint = area.areaRatio <= maxAreaRatio;
        const meetsCollisionConstraint = !col.hasCollision;

        if (meetsAreaConstraint && meetsCollisionConstraint) {
            return {
                scale: roundedScale,
                boxes,
                areaRatio: area.areaRatio,
                areaPercent: area.areaPercent,
                hasCollision: false,
                valid: true,
                totalHudArea: area.totalHudArea,
                viewportArea: area.viewportArea,
            };
        }

        // Keep track of best candidate (least collision, lowest area excess)
        if (!bestSolution || (col.collisions.length < bestSolution.collisions.length)) {
            bestSolution = {
                scale: roundedScale,
                boxes,
                areaRatio: area.areaRatio,
                areaPercent: area.areaPercent,
                hasCollision: col.hasCollision,
                collisions: col.collisions,
                valid: meetsAreaConstraint && meetsCollisionConstraint,
                totalHudArea: area.totalHudArea,
                viewportArea: area.viewportArea,
            };
        }
    }

    return bestSolution;
}

/**
 * Runs a complete layout and collision audit for a single viewport configuration.
 *
 * @param {{ width: number, height: number, name?: string }} vp
 * @param {Object} [options={}]
 * @returns {Object} Full audit report with pass/fail gates
 */
export function auditViewportLayout(vp, options = {}) {
    const { width, height, name = `${vp.width}x${vp.height}` } = vp;
    const maxRatio = options.maxHudAreaRatio ?? DEFAULT_HUD_SPEC.maxHudAreaRatio;

    // 1. Audit at default 1.0 scale
    const defaultBoxes = computeHudBoundingBoxes(width, height, 1.0, options.spec);
    const defaultCollisions = checkHudCollisions(defaultBoxes, options.tolerance ?? 0);
    const defaultArea = computeHudAreaRatio(defaultBoxes, width, height);

    // 2. Compute dynamic compact scaling factor for small screens
    const dynamic = computeCompactScalingFactor(width, height, {
        maxHudAreaRatio: maxRatio,
        spec: options.spec,
        tolerance: options.tolerance ?? 0,
    });

    const passed = dynamic.valid && dynamic.areaRatio <= maxRatio && !dynamic.hasCollision;

    return {
        viewport: { name, width, height },
        passed,
        targetAreaPercentMax: maxRatio * 100,
        unscaled: {
            boxes: defaultBoxes,
            hasCollision: defaultCollisions.hasCollision,
            collisions: defaultCollisions.collisions,
            areaPercent: defaultArea.areaPercent,
            areaRatio: defaultArea.areaRatio,
        },
        dynamic: {
            scale: dynamic.scale,
            boxes: dynamic.boxes,
            hasCollision: dynamic.hasCollision,
            collisions: dynamic.collisions || [],
            areaPercent: dynamic.areaPercent,
            areaRatio: dynamic.areaRatio,
        },
    };
}

/**
 * Runs the audit across all standard desktop and mobile viewports.
 *
 * @param {Array<{ width: number, height: number, name?: string }>} [viewports=AUDITOR_VIEWPORTS]
 * @param {Object} [options={}]
 * @returns {{ summary: { total: number, passed: number, failed: number }, reports: Array<Object>, allPassed: boolean }}
 */
export function auditAllViewports(viewports = AUDITOR_VIEWPORTS, options = {}) {
    const reports = viewports.map((vp) => auditViewportLayout(vp, options));
    const passedCount = reports.filter((r) => r.passed).length;
    const failedCount = reports.length - passedCount;

    return {
        summary: {
            total: reports.length,
            passed: passedCount,
            failed: failedCount,
        },
        allPassed: failedCount === 0,
        reports,
    };
}
