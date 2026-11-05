// Raft physics core module for "Don't Sink, Don't Die".
// Pure and deterministic ES module exporting canonical watercraft physics,
// kinematics stepping, thrust, drag, and world obstacle interactions.
// Zero timers, zero I/O, zero external dependencies.

export {
    PHYSICS,
    WATER_SURFACE_Y,
    RIVER,
    clamp,
    riverCurrentMultiplier,
    riverCurrentForce,
    steadyStateSpeed,
    watercraftThrust,
    headingOf,
    yawOfQuaternion,
    driveWatercraft,
    settleOnWater,
    stepWatercraftKinematics,
    resolveWorldBoundsAndObstacles,
    waterClarity,
    isInShopZone,
    upgradeStats,
    throwVelocity,
    yawQuaternion,
} from './game-core.js';
