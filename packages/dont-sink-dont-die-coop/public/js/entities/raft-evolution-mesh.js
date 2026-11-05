/**
 * Don't Sink, Don't Die — Line-of-Sight 3D Raft Evolution & Visual Upgrade Rig
 * (`public/js/entities/raft-evolution-mesh.js`)
 *
 * Every purchased upgrade visibly mutates the 3D raft in line of sight:
 *  - Iron Hull: Spiked metallic prow plating, heavy reinforced iron skirts, and ramming spikes on the bow.
 *  - Outboard Motor: Twin spinning brass propellers, dual vertical exhaust pipes, and manifold housings on the stern.
 *  - War Mallet: Gunwale weapons rack holding glowing rune war hammers with arcane pulsating runes.
 *  - Healing Totem: Carved timber totem pole with glowing emerald lantern and runic restorative halo on the stern.
 *
 * Zero external asset dependencies. Pure procedural Three.js geometry & materials.
 */

export const EVOLUTION_UPGRADE_KEYS = {
    IRON_HULL: 'iron_hull',
    OUTBOARD_MOTOR: 'outboard_motor',
    WAR_MALLET: 'war_mallet',
    HEALING_TOTEM: 'healing_totem',
};

/**
 * Normalizes any format of active upgrade list/map into a lookup set of canonical keys.
 * Accepts arrays of strings (e.g. ['Iron Hull', 'motor', 'weapon_2', 'totem']),
 * Sets, or objects with boolean flags ({ 'Outboard Motor': true, armor: true }).
 *
 * @param {Array<string>|Set<string>|object} activeUpgrades
 * @returns {Set<string>} Set containing matching canonical evolution keys.
 */
export function normalizeEvolutionUpgrades(activeUpgrades = []) {
    const keys = new Set();
    if (!activeUpgrades) return keys;

    let items = [];
    if (Array.isArray(activeUpgrades)) {
        items = activeUpgrades;
    } else if (activeUpgrades instanceof Set) {
        items = Array.from(activeUpgrades);
    } else if (typeof activeUpgrades === 'object') {
        for (const [k, v] of Object.entries(activeUpgrades)) {
            if (Boolean(v)) items.push(k);
        }
    }

    for (const item of items) {
        if (!item || typeof item !== 'string') continue;
        const s = item.toLowerCase().trim().replace(/[\s\-_]+/g, '');

        // Iron Hull / Armor variants
        if (s.includes('ironhull') || s.includes('ironclad') || s.includes('aegis') || s.startsWith('armor')) {
            keys.add(EVOLUTION_UPGRADE_KEYS.IRON_HULL);
        }
        // Outboard Motor variants
        if (s.includes('outboardmotor') || s.includes('outboard') || s.includes('propeller') || s.startsWith('motor')) {
            keys.add(EVOLUTION_UPGRADE_KEYS.OUTBOARD_MOTOR);
        }
        // War Mallet / Weapon variants
        if (s.includes('warmallet') || s.includes('mallet') || s.includes('gavel') || s.includes('breaker') || s.startsWith('weapon')) {
            keys.add(EVOLUTION_UPGRADE_KEYS.WAR_MALLET);
        }
        // Healing Totem / Totem variants
        if (s.includes('healingtotem') || s.includes('totem') || s.includes('healing') || s.includes('lanternpole') || s.includes('emeraldlantern')) {
            keys.add(EVOLUTION_UPGRADE_KEYS.HEALING_TOTEM);
        }
    }

    return keys;
}

/**
 * Helper to instantiate materials gracefully across full Three.js or test mocks.
 */
function createEvolutionMaterials(THREE, customMaterials = {}) {
    const standard = (params) => {
        if (THREE.MeshStandardMaterial) return new THREE.MeshStandardMaterial(params);
        return new THREE.MeshBasicMaterial(params);
    };
    const basic = (params) => new THREE.MeshBasicMaterial(params);

    return {
        ironProw: customMaterials.ironProw || standard({
            color: 0x3a424e,
            metalness: 0.85,
            roughness: 0.28,
        }),
        spikes: customMaterials.spikes || standard({
            color: 0x606979,
            metalness: 0.9,
            roughness: 0.2,
        }),
        brassProp: customMaterials.brassProp || standard({
            color: 0xd4a03e,
            metalness: 0.8,
            roughness: 0.3,
        }),
        exhaustPipe: customMaterials.exhaustPipe || standard({
            color: 0x22262d,
            metalness: 0.75,
            roughness: 0.45,
        }),
        woodRack: customMaterials.woodRack || standard({
            color: 0x54361e,
            roughness: 0.85,
        }),
        hammerHead: customMaterials.hammerHead || standard({
            color: 0x2d333b,
            metalness: 0.7,
            roughness: 0.35,
        }),
        runeGlow: customMaterials.runeGlow || basic({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.9,
        }),
        totemWood: customMaterials.totemWood || standard({
            color: 0x422919,
            roughness: 0.9,
        }),
        totemCarving: customMaterials.totemCarving || standard({
            color: 0xc47e38,
            roughness: 0.7,
        }),
        emeraldGlow: customMaterials.emeraldGlow || basic({
            color: 0x10b981,
            transparent: true,
            opacity: 0.92,
        }),
        emeraldLanternGlass: customMaterials.emeraldLanternGlass || basic({
            color: 0x34d399,
            transparent: true,
            opacity: 0.6,
        }),
        haloRing: customMaterials.haloRing || basic({
            color: 0x059669,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
        }),
    };
}

/**
 * Builds the Iron Hull upgrade attachment:
 * Spiked metallic prow plating, forward ramming spikes, and riveted gunwale armor plates.
 * Mounted at the bow of the raft.
 */
export function buildIronHullAttachment(THREE, materials, raftDimensions = { w: 3, h: 0.6, d: 4 }) {
    const group = new THREE.Group();
    group.name = 'RaftEvolution_IronHull';
    group.visible = false;

    // 1. Heavy V-shaped prow ram plating
    const prowPlates = new THREE.Group();
    prowPlates.position.set(0, 0.15, -raftDimensions.d * 0.52);

    // Center prow wedge
    const wedge = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, raftDimensions.h * 0.9, 0.55),
        materials.ironProw
    );
    wedge.rotation.y = Math.PI / 4;
    prowPlates.add(wedge);

    // Front reinforced ramming beak
    const rammingBeak = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.85, 4),
        materials.ironProw
    );
    rammingBeak.rotation.x = -Math.PI / 2;
    rammingBeak.rotation.z = Math.PI / 4;
    rammingBeak.position.set(0, 0.05, -0.45);
    prowPlates.add(rammingBeak);

    // Center massive forward spike
    const mainSpike = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.65, 6),
        materials.spikes
    );
    mainSpike.rotation.x = -Math.PI / 2;
    mainSpike.position.set(0, 0.05, -0.9);
    prowPlates.add(mainSpike);

    // Splayed port & starboard forward ramming spikes
    const spikes = [mainSpike];
    for (const sx of [-0.28, 0.28]) {
        const sideSpike = new THREE.Mesh(
            new THREE.ConeGeometry(0.09, 0.5, 6),
            materials.spikes
        );
        sideSpike.rotation.x = -Math.PI / 2 + 0.12;
        sideSpike.rotation.y = sx > 0 ? 0.35 : -0.35;
        sideSpike.position.set(sx, 0.05, -0.68);
        prowPlates.add(sideSpike);
        spikes.push(sideSpike);
    }

    // Heavy riveted flank armor plates along forward gunwales
    for (const sx of [-1, 1]) {
        const flankPlate = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, raftDimensions.h * 0.75, raftDimensions.d * 0.45),
            materials.ironProw
        );
        flankPlate.position.set(sx * (raftDimensions.w * 0.52), 0.1, -raftDimensions.d * 0.22);
        prowPlates.add(flankPlate);

        // Armor spikes on the side plating
        for (const sz of [-0.15, 0.12]) {
            const flankSpike = new THREE.Mesh(
                new THREE.ConeGeometry(0.06, 0.25, 4),
                materials.spikes
            );
            flankSpike.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
            flankSpike.position.set(sx * (raftDimensions.w * 0.52 + 0.12), 0.1, sz);
            prowPlates.add(flankSpike);
            spikes.push(flankSpike);
        }
    }

    group.add(prowPlates);

    return {
        group,
        prowPlates,
        rammingBeak,
        spikes,
    };
}

/**
 * Builds the Outboard Motor upgrade attachment:
 * Heavy outboard engine casing, twin spinning brass propellers, dual exhaust pipes, and manifold.
 * Mounted at the stern of the raft.
 */
export function buildOutboardMotorAttachment(THREE, materials, raftDimensions = { w: 3, h: 0.6, d: 4 }) {
    const group = new THREE.Group();
    group.name = 'RaftEvolution_OutboardMotor';
    group.visible = false;

    // Main mounting bracket over stern
    const motorGroup = new THREE.Group();
    motorGroup.position.set(0, raftDimensions.h * 0.5 + 0.1, raftDimensions.d * 0.5 + 0.22);

    // Motor transmission cowling / block
    const engineBlock = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.65, 0.5),
        materials.exhaustPipe
    );
    engineBlock.position.y = 0.22;
    motorGroup.add(engineBlock);

    // Dual vertical chrome/dark exhaust pipes
    const exhaustPipes = [];
    for (const sx of [-0.45, 0.45]) {
        const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.065, 0.065, 0.85, 8),
            materials.exhaustPipe
        );
        pipe.position.set(sx, 0.72, -0.08);

        // Pipe lip / angle
        const pipeLip = new THREE.Mesh(
            new THREE.TorusGeometry(0.068, 0.015, 6, 12),
            materials.brassProp
        );
        pipeLip.rotation.x = Math.PI / 2;
        pipeLip.position.set(sx, 1.14, -0.08);

        motorGroup.add(pipe, pipeLip);
        exhaustPipes.push(pipe);
    }

    // Twin submerged brass propeller assemblies (port & starboard)
    const propellers = [];
    for (const sx of [-0.38, 0.38]) {
        // Lower shaft drive strut
        const strut = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.75, 8),
            materials.exhaustPipe
        );
        strut.position.set(sx, -0.35, 0.12);
        motorGroup.add(strut);

        // Propeller hub
        const propHub = new THREE.Group();
        propHub.position.set(sx, -0.7, 0.18);

        const noseCone = new THREE.Mesh(
            new THREE.ConeGeometry(0.09, 0.22, 8),
            materials.brassProp
        );
        noseCone.rotation.x = Math.PI / 2;
        propHub.add(noseCone);

        // 3 articulated brass propeller blades
        const blades = [];
        for (let b = 0; b < 3; b++) {
            const bladeArm = new THREE.Group();
            bladeArm.rotation.z = (b * Math.PI * 2) / 3;

            const bladeMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.36, 0.025),
                materials.brassProp
            );
            bladeMesh.position.y = 0.16;
            bladeMesh.rotation.y = 0.4; // pitch angle
            bladeArm.add(bladeMesh);
            propHub.add(bladeArm);
            blades.push(bladeMesh);
        }

        motorGroup.add(propHub);
        propellers.push({
            hub: propHub,
            side: sx < 0 ? 'port' : 'starboard',
            blades,
        });
    }

    group.add(motorGroup);

    return {
        group,
        motorGroup,
        exhaustPipes,
        propellers,
        spinAngle: 0,
    };
}

/**
 * Builds the War Mallet upgrade attachment:
 * Hardwood weapons rack mounted on the raft gunwale displaying multiple heavy runic war hammers
 * with glowing magical runes carved into the hammerheads.
 */
export function buildWarMalletAttachment(THREE, materials, raftDimensions = { w: 3, h: 0.6, d: 4 }) {
    const group = new THREE.Group();
    group.name = 'RaftEvolution_WarMallet';
    group.visible = false;

    // Weapons rack mounted along starboard gunwale
    const rack = new THREE.Group();
    rack.position.set(raftDimensions.w * 0.48, raftDimensions.h * 0.5 + 0.1, -0.1);

    // Upright timber pegs / shelf
    const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.1, 1.6),
        materials.woodRack
    );
    shelf.position.y = 0.1;
    rack.add(shelf);

    for (const pz of [-0.6, 0, 0.6]) {
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.04, 0.45, 6),
            materials.woodRack
        );
        post.position.set(0, 0.32, pz);
        rack.add(post);
    }

    // Rack of 3 heavy rune hammers resting in slots
    const hammers = [];
    const hammerSpacings = [-0.48, 0.0, 0.48];

    hammerSpacings.forEach((pz, idx) => {
        const hammerGroup = new THREE.Group();
        hammerGroup.position.set(-0.02, 0.38, pz);
        hammerGroup.rotation.z = -0.15; // resting slant

        // Mallet handle
        const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.035, 0.9, 8),
            materials.woodRack
        );
        hammerGroup.add(handle);

        // Heavy iron hammerhead
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.28, 0.44),
            materials.hammerHead
        );
        head.position.y = 0.38;
        hammerGroup.add(head);

        // Glowing arcane rune gem / inlays on both sides of hammerhead
        const runeMeshes = [];
        for (const rx of [-0.125, 0.125]) {
            const rune = new THREE.Mesh(
                new THREE.BoxGeometry(0.015, 0.14, 0.22),
                materials.runeGlow
            );
            rune.position.set(rx, 0.38, 0);
            hammerGroup.add(rune);
            runeMeshes.push(rune);
        }

        // Hammerhead top spike
        const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.05, 0.16, 4),
            materials.hammerHead
        );
        spike.position.y = 0.58;
        hammerGroup.add(spike);

        rack.add(hammerGroup);
        hammers.push({
            group: hammerGroup,
            head,
            runes: runeMeshes,
            baseY: hammerGroup.position.y,
            index: idx,
        });
    });

    group.add(rack);

    return {
        group,
        rack,
        hammers,
        pulseTime: 0,
    };
}

/**
 * Builds the Healing Totem upgrade attachment:
 * Carved tribal timber totem pole mounted on the stern deck, topped with an ornate
 * emerald lantern emitting a glowing restorative halo ring.
 */
export function buildHealingTotemAttachment(THREE, materials, raftDimensions = { w: 3, h: 0.6, d: 4 }) {
    const group = new THREE.Group();
    group.name = 'RaftEvolution_HealingTotem';
    group.visible = false;

    // Totem pole mounted on aft deck (port-stern corner)
    const poleGroup = new THREE.Group();
    poleGroup.position.set(-raftDimensions.w * 0.32, raftDimensions.h * 0.5 + 0.05, raftDimensions.d * 0.35);

    // Carved wood totem base pedestal
    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, 0.3, 8),
        materials.totemWood
    );
    pedestal.position.y = 0.15;
    poleGroup.add(pedestal);

    // Main carved totem shaft with 3 stacked spirit faces/segments
    const totemHeight = 1.6;
    const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.24, totemHeight, 8),
        materials.totemWood
    );
    shaft.position.y = 0.3 + totemHeight * 0.5;
    poleGroup.add(shaft);

    // Carved tribal relief bands & stylized spirit eyes
    for (let i = 0; i < 3; i++) {
        const ringY = 0.55 + i * 0.45;
        const reliefRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.215, 0.03, 6, 12),
            materials.totemCarving
        );
        reliefRing.rotation.x = Math.PI / 2;
        reliefRing.position.y = ringY;
        poleGroup.add(reliefRing);

        // Spirit eyes on totem
        for (const sx of [-0.08, 0.08]) {
            const eye = new THREE.Mesh(
                new THREE.SphereGeometry(0.035, 6, 6),
                materials.emeraldGlow
            );
            eye.position.set(sx, ringY + 0.1, 0.19);
            poleGroup.add(eye);
        }
    }

    // Top Totem Crossarm / Lantern Gantry
    const crossarm = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.1, 0.12),
        materials.totemWood
    );
    crossarm.position.y = 0.3 + totemHeight + 0.05;
    poleGroup.add(crossarm);

    // Hanging emerald lantern rig
    const lanternRig = new THREE.Group();
    lanternRig.position.set(0.24, 0.3 + totemHeight - 0.02, 0);

    // Lantern chain
    const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4),
        materials.totemCarving
    );
    chain.position.y = -0.11;
    lanternRig.add(chain);

    // Lantern cage (copper/carved cap and base)
    const lanternCap = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.12, 6),
        materials.totemCarving
    );
    lanternCap.position.y = -0.26;
    lanternRig.add(lanternCap);

    // Emerald glass body
    const lanternGlass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.1, 0.26, 6),
        materials.emeraldLanternGlass
    );
    lanternGlass.position.y = -0.42;
    lanternRig.add(lanternGlass);

    // Glowing core crystal
    const lanternCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 8),
        materials.emeraldGlow
    );
    lanternCore.position.y = -0.42;
    lanternRig.add(lanternCore);

    poleGroup.add(lanternRig);

    // Restorative runic emerald halo ring on the water / deck
    const haloRing = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.6, 24).rotateX(-Math.PI / 2),
        materials.haloRing
    );
    haloRing.position.set(0, 0.05, 0);
    poleGroup.add(haloRing);

    group.add(poleGroup);

    return {
        group,
        poleGroup,
        lanternRig,
        lanternCore,
        haloRing,
        swayAngle: 0,
    };
}

/**
 * Builds all 4 line-of-sight visual upgrade attachments and returns an evolution handle.
 *
 * @param {object} THREE - Three.js instance or mock.
 * @param {object} [options]
 * @param {object} [options.raftDimensions] - Raft bounding dimensions { w, h, d }.
 * @param {object} [options.customMaterials] - Optional material overrides.
 * @returns {object} Evolution handle with group, attachments, and update methods.
 */
export function buildRaftEvolutionAttachments(THREE, options = {}) {
    const raftDimensions = options.raftDimensions || { w: 3, h: 0.6, d: 4 };
    const materials = createEvolutionMaterials(THREE, options.customMaterials || {});

    const group = new THREE.Group();
    group.name = 'RaftEvolution_AttachmentsRoot';

    // 1. Spiked metallic prow plating
    const ironHull = buildIronHullAttachment(THREE, materials, raftDimensions);
    group.add(ironHull.group);

    // 2. Twin spinning brass propellers and exhaust pipes
    const outboardMotor = buildOutboardMotorAttachment(THREE, materials, raftDimensions);
    group.add(outboardMotor.group);

    // 3. Rack of glowing rune hammers
    const warMallet = buildWarMalletAttachment(THREE, materials, raftDimensions);
    group.add(warMallet.group);

    // 4. Emerald lantern totem pole
    const healingTotem = buildHealingTotemAttachment(THREE, materials, raftDimensions);
    group.add(healingTotem.group);

    const handle = {
        group,
        raftDimensions,
        materials,
        attachments: {
            ironHull,
            outboardMotor,
            warMallet,
            healingTotem,
        },
        activeKeys: new Set(),
        elapsedTime: 0,
    };

    return handle;
}

/**
 * Updates visibility and procedural animations for all raft evolution attachments.
 *
 * @param {object} handle - Evolution handle returned by buildRaftEvolutionAttachments.
 * @param {Array<string>|Set<string>|object} activeUpgrades - Currently active player upgrades.
 * @param {number} dt - Delta time in seconds.
 */
export function updateRaftEvolutionVis(handle, activeUpgrades = [], dt = 0.016) {
    if (!handle || !handle.attachments) return;

    handle.elapsedTime = (handle.elapsedTime || 0) + Math.max(0, dt);
    const t = handle.elapsedTime;
    const activeKeys = normalizeEvolutionUpgrades(activeUpgrades);
    handle.activeKeys = activeKeys;

    const { ironHull, outboardMotor, warMallet, healingTotem } = handle.attachments;

    // 1. Iron Hull
    if (ironHull && ironHull.group) {
        const isActive = activeKeys.has(EVOLUTION_UPGRADE_KEYS.IRON_HULL);
        ironHull.group.visible = isActive;
        if (isActive) {
            // Subtle creak / prow vibration
            const jitter = Math.sin(t * 12.0) * 0.005;
            ironHull.prowPlates.position.y = 0.15 + jitter;
        }
    }

    // 2. Outboard Motor
    if (outboardMotor && outboardMotor.group) {
        const isActive = activeKeys.has(EVOLUTION_UPGRADE_KEYS.OUTBOARD_MOTOR);
        outboardMotor.group.visible = isActive;
        if (isActive) {
            // Twin brass propellers spin continuously at high RPM
            outboardMotor.spinAngle = (outboardMotor.spinAngle || 0) + dt * 28.0;
            const spin = outboardMotor.spinAngle;

            for (const prop of outboardMotor.propellers) {
                // Counter-rotate port and starboard propellers
                const dir = prop.side === 'port' ? 1 : -1;
                prop.hub.rotation.z = spin * dir;
            }

            // Engine vibration / motor shudder
            outboardMotor.motorGroup.position.y = (handle.raftDimensions.h * 0.5 + 0.1) + Math.sin(t * 32.0) * 0.012;
        }
    }

    // 3. War Mallet
    if (warMallet && warMallet.group) {
        const isActive = activeKeys.has(EVOLUTION_UPGRADE_KEYS.WAR_MALLET);
        warMallet.group.visible = isActive;
        if (isActive) {
            // Arcane pulsating rune glow on hammers
            const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
            if (handle.materials?.runeGlow) {
                handle.materials.runeGlow.opacity = 0.6 + pulse * 0.4;
            }

            // Subtle weapon rack breathing / hover offset
            warMallet.hammers.forEach((h) => {
                const phase = t * 3.0 + h.index * 1.2;
                h.group.position.y = h.baseY + Math.sin(phase) * 0.015;
            });
        }
    }

    // 4. Healing Totem
    if (healingTotem && healingTotem.group) {
        const isActive = activeKeys.has(EVOLUTION_UPGRADE_KEYS.HEALING_TOTEM);
        healingTotem.group.visible = isActive;
        if (isActive) {
            // Gentle nautical pendulum sway of hanging emerald lantern
            const sway = Math.sin(t * 2.2) * 0.18;
            healingTotem.lanternRig.rotation.z = sway;

            // Emerald lantern core breathing pulse
            const pulse = 0.8 + 0.25 * Math.sin(t * 4.0);
            if (healingTotem.lanternCore?.scale) {
                healingTotem.lanternCore.scale.set(pulse, pulse, pulse);
            }

            // Slowly rotating restorative aura ring
            if (healingTotem.haloRing) {
                healingTotem.haloRing.rotation.z = t * 0.8;
                const haloPulse = 1.0 + Math.sin(t * 2.5) * 0.08;
                healingTotem.haloRing.scale.set(haloPulse, haloPulse, haloPulse);
            }
        }
    }
}
