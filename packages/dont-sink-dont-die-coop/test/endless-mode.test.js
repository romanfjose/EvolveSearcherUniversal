import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ENDLESS_START_Z,
    SECTOR_LENGTH,
    CHECKPOINT_SPACING,
    PERK_DRAFT_CHECKPOINT_INTERVAL,
    DEFAULT_RIVER_WIDTH,
    ENDLESS_BIOMES,
    PERK_POOL,
    BOSS_ARCHETYPES,
    BOSS_ARCHETYPE_KEYS,
    createRng,
    hashString,
    normalizeSeed,
    getSectorIndexFromZ,
    getSectorZBounds,
    getCheckpointCountAtZ,
    isPerkDraftCheckpoint,
    generateRiverSector,
    SectorChainer,
    generateBossDuo,
    damageBossDuo,
    rollPerkDraft,
    applyPerkCard,
    calculatePlayerPerkStats,
    EndlessLeaderboard,
    EndlessSession,
} from '../shared/endless-mode.js';

describe('Endless Rogue-River Survival Mode (shared/endless-mode.js)', () => {

    it('1. correctly configures endless mode base constants', () => {
        assert.equal(ENDLESS_START_Z, -1500);
        assert.equal(SECTOR_LENGTH, 450);
        assert.equal(CHECKPOINT_SPACING, 150);
        assert.equal(PERK_DRAFT_CHECKPOINT_INTERVAL, 3);
        assert.equal(DEFAULT_RIVER_WIDTH, 30);
        assert.ok(ENDLESS_BIOMES.length >= 4);
        assert.ok(PERK_POOL.length >= 8);
        assert.ok(BOSS_ARCHETYPE_KEYS.length >= 4);
    });

    it('2. mulberry32 PRNG produces deterministic sequences across identical seeds', () => {
        const rng1 = createRng(4242);
        const rng2 = createRng(4242);
        for (let i = 0; i < 20; i++) {
            assert.equal(rng1(), rng2());
        }
    });

    it('3. hashString converts arbitrary strings into deterministic 32-bit unsigned ints', () => {
        const h1 = hashString('Daily-Challenge-2026');
        const h2 = hashString('Daily-Challenge-2026');
        const h3 = hashString('Different-Seed');
        assert.equal(typeof h1, 'number');
        assert.equal(h1, h2);
        assert.notEqual(h1, h3);
        assert.ok(h1 > 0);
    });

    it('4. normalizeSeed handles numeric, string, and null/undefined seeds cleanly', () => {
        assert.equal(normalizeSeed(100), 100);
        assert.equal(normalizeSeed('abc'), hashString('abc'));
        assert.equal(normalizeSeed(null), 1337);
        assert.equal(normalizeSeed(undefined), 1337);
    });

    it('5. getSectorIndexFromZ accurately calculates sector index past z = -1500', () => {
        assert.equal(getSectorIndexFromZ(0), -1); // Before endless
        assert.equal(getSectorIndexFromZ(-1000), -1); // Before endless
        assert.equal(getSectorIndexFromZ(-1500), 0); // Start of endless (Sector 0)
        assert.equal(getSectorIndexFromZ(-1501), 0);
        assert.equal(getSectorIndexFromZ(-1949), 0);
        assert.equal(getSectorIndexFromZ(-1950), 1); // Sector 1 starts at -1950 (-1500 - 450)
        assert.equal(getSectorIndexFromZ(-2400), 2); // Sector 2 starts at -2400
        assert.equal(getSectorIndexFromZ(-6000), 10); // Sector 10
    });

    it('6. getSectorZBounds returns correct boundaries for any sector index', () => {
        const s0 = getSectorZBounds(0);
        assert.deepEqual(s0, { zStart: -1500, zEnd: -1950 });

        const s1 = getSectorZBounds(1);
        assert.deepEqual(s1, { zStart: -1950, zEnd: -2400 });

        const s5 = getSectorZBounds(5);
        assert.deepEqual(s5, { zStart: -1500 - 5 * 450, zEnd: -1500 - 6 * 450 });
    });

    it('7. getCheckpointCountAtZ calculates accurate cumulative checkpoint count', () => {
        assert.equal(getCheckpointCountAtZ(0), 0);
        assert.equal(getCheckpointCountAtZ(-150), 1);
        assert.equal(getCheckpointCountAtZ(-1500), 10);
        assert.equal(getCheckpointCountAtZ(-1650), 11);
        assert.equal(getCheckpointCountAtZ(-1800), 12);
        assert.equal(getCheckpointCountAtZ(-1950), 13);
    });

    it('8. isPerkDraftCheckpoint flags every 3rd checkpoint correctly', () => {
        assert.equal(isPerkDraftCheckpoint(0), false);
        assert.equal(isPerkDraftCheckpoint(1), false);
        assert.equal(isPerkDraftCheckpoint(2), false);
        assert.equal(isPerkDraftCheckpoint(3), true);
        assert.equal(isPerkDraftCheckpoint(6), true);
        assert.equal(isPerkDraftCheckpoint(9), true);
        assert.equal(isPerkDraftCheckpoint(12), true);
        assert.equal(isPerkDraftCheckpoint(13), false);
    });

    it('9. generateRiverSector creates valid sector structure with biome, checkpoints and hazards', () => {
        const sector = generateRiverSector(0, 777);
        assert.equal(sector.sectorIndex, 0);
        assert.equal(sector.zStart, -1500);
        assert.equal(sector.zEnd, -1950);
        assert.ok(sector.biome);
        assert.ok(sector.biome.id);
        assert.equal(sector.checkpoints.length, 3);
        assert.ok(sector.hazards.length >= 4);
        assert.ok(sector.bossDuo);
    });

    it('10. generateRiverSector sets up checkpoints with proper intervals and perk draft flags', () => {
        const sector = generateRiverSector(0, 100);
        const [cp1, cp2, cp3] = sector.checkpoints;
        assert.equal(cp1.z, -1650);
        assert.equal(cp2.z, -1800);
        assert.equal(cp3.z, -1950);

        // Check cumulative indices: -1650 is cp 11, -1800 is cp 12 (divisible by 3 -> draft!), -1950 is cp 13
        assert.equal(cp1.checkpointIndex, 11);
        assert.equal(cp1.offersPerkDraft, false);
        assert.equal(cp2.checkpointIndex, 12);
        assert.equal(cp2.offersPerkDraft, true);
        assert.equal(cp3.checkpointIndex, 13);
        assert.equal(cp3.offersPerkDraft, false);
    });

    it('11. generateRiverSector scales hazard intensity deterministically across sectors', () => {
        const sec0 = generateRiverSector(0, 999);
        const sec4 = generateRiverSector(4, 999);
        assert.ok(sec4.biome.intensity > sec0.biome.intensity);
        assert.ok(sec4.biome.waterSpeedMultiplier > sec0.biome.waterSpeedMultiplier);
    });

    it('12. SectorChainer lazily loads and retrieves sectors by index', () => {
        const chainer = new SectorChainer(1337);
        assert.equal(chainer.getActiveSectorCount(), 0);

        const s0 = chainer.getSector(0);
        assert.ok(s0);
        assert.equal(s0.sectorIndex, 0);
        assert.equal(chainer.getActiveSectorCount(), 1);

        // Subsequent get returns cached instance
        const s0Cached = chainer.getSector(0);
        assert.equal(s0, s0Cached);
    });

    it('13. SectorChainer updates sector buffer and prunes historical sectors beyond lead Z', () => {
        const chainer = new SectorChainer(1337, 2);
        // Raft at sector 0 (z = -1600)
        chainer.updateLeadZ(-1600);
        assert.ok(chainer.sectors.has(0));
        assert.ok(chainer.sectors.has(1));
        assert.ok(chainer.sectors.has(2));

        // Raft advances downriver to sector 6 (z = -4300)
        chainer.updateLeadZ(-4300);
        assert.ok(chainer.sectors.has(6));
        // Distant historical sector 0 should be pruned
        assert.equal(chainer.sectors.has(0), false);
    });

    it('14. generateBossDuo creates 2 distinct boss archetypes with escalating stats', () => {
        const duo0 = generateBossDuo(0, 555, -1900);
        assert.notEqual(duo0.bossA.archetypeId, duo0.bossB.archetypeId);
        assert.equal(duo0.bossA.role, 'Alpha');
        assert.equal(duo0.bossB.role, 'Beta');
        assert.ok(duo0.bossA.hp > 0);
        assert.ok(duo0.bossB.hp > 0);
        assert.equal(duo0.isCleared, false);

        // Compare with sector 3: stats should escalate
        const duo3 = generateBossDuo(3, 555, -3250);
        assert.ok(duo3.scaleFactor > duo0.scaleFactor);
        assert.ok(duo3.bossA.maxHp > duo0.bossA.maxHp);
        assert.ok(duo3.bossA.damage > duo0.bossA.damage);
    });

    it('15. damageBossDuo deals damage to selected boss and tracks HP reduction', () => {
        const duo = generateBossDuo(0, 111, -1900);
        duo.duoModifier = 'chrono_haste'; // Standard non-damage-splitting modifier
        const preHp = duo.bossA.hp;

        const res = damageBossDuo(duo, 'Alpha', 100);
        assert.equal(res.damageDealt, 100);
        assert.equal(duo.bossA.hp, preHp - 100);
        assert.equal(res.duoCleared, false);
    });

    it('16. damageBossDuo with shielded_bond modifier splits 25% damage to partner boss', () => {
        const duo = generateBossDuo(0, 222, -1900);
        duo.duoModifier = 'shielded_bond';

        const preHpA = duo.bossA.hp;
        const preHpB = duo.bossB.hp;

        const res = damageBossDuo(duo, 'Alpha', 100);
        // 25 damage split to partner B, 75 dealt to A
        assert.equal(res.damageDealt, 75);
        assert.equal(duo.bossA.hp, preHpA - 75);
        assert.equal(duo.bossB.hp, preHpB - 25);

        const splitEv = res.events.find((e) => e.event === 'bossDuo:shielded_bond_split');
        assert.ok(splitEv);
        assert.equal(splitEv.data.splitDamage, 25);
    });

    it('17. damageBossDuo with berserk_frenzy enrages surviving partner upon defeat', () => {
        const duo = generateBossDuo(0, 333, -1900);
        duo.duoModifier = 'berserk_frenzy';
        const partnerDmgPre = duo.bossB.damage;

        // One-shot boss A
        const res = damageBossDuo(duo, 'Alpha', duo.bossA.hp + 500);
        assert.equal(duo.bossA.isDefeated, true);
        assert.equal(duo.bossA.hp, 0);

        // Partner B should be enraged with +35% damage
        assert.ok(duo.bossB.damage > partnerDmgPre);
        const enrageEv = res.events.find((e) => e.event === 'bossDuo:berserk_enrage');
        assert.ok(enrageEv);
    });

    it('18. damageBossDuo clears encounter and awards coins when both bosses are defeated', () => {
        const duo = generateBossDuo(0, 444, -1900);
        duo.duoModifier = 'toxic_trail';

        damageBossDuo(duo, 'Alpha', duo.bossA.hp);
        assert.equal(duo.isCleared, false);

        const res = damageBossDuo(duo, 'Beta', duo.bossB.hp);
        assert.equal(duo.isCleared, true);
        assert.equal(res.duoCleared, true);

        const clearEv = res.events.find((e) => e.event === 'bossDuo:cleared');
        assert.ok(clearEv);
        assert.ok(clearEv.data.rewardCoins > 0);
    });

    it('19. rollPerkDraft offers exactly 3 unique cards from the pool', () => {
        const draft = rollPerkDraft(12, 1234);
        assert.equal(draft.cards.length, 3);
        assert.equal(draft.checkpointIndex, 12);

        const ids = draft.cards.map((c) => c.id);
        const unique = new Set(ids);
        assert.equal(unique.size, 3, 'All 3 offered cards must be unique');

        for (let i = 0; i < 3; i++) {
            assert.equal(draft.cards[i].offerSlot, i + 1);
        }
    });

    it('20. rollPerkDraft is deterministic for identical checkpoint and seed', () => {
        const d1 = rollPerkDraft(15, 888);
        const d2 = rollPerkDraft(15, 888);
        assert.deepEqual(d1, d2);
    });

    it('21. applyPerkCard adds card to inventory and stacks stats', () => {
        const inventory = { perks: {}, stats: {} };
        const card = PERK_POOL.find((p) => p.id === 'reinforced_keel');

        applyPerkCard(inventory, card);
        assert.equal(inventory.perks.reinforced_keel, 1);
        assert.equal(inventory.stats.maxHpBonus, 40);
        assert.equal(inventory.stats.keelGripBonus, 0.15);

        // Apply a second time to test stacking
        applyPerkCard(inventory, card);
        assert.equal(inventory.perks.reinforced_keel, 2);
        assert.equal(inventory.stats.maxHpBonus, 80);
        assert.equal(inventory.stats.keelGripBonus, 0.30);
    });

    it('22. applyPerkCard accepts card id string as input', () => {
        const inventory = { perks: {}, stats: {} };
        applyPerkCard(inventory, 'espresso_oars');
        assert.equal(inventory.perks.espresso_oars, 1);
        assert.equal(inventory.stats.paddleBoost, 0.20);
    });

    it('23. calculatePlayerPerkStats combines base raft stats with stacked perks', () => {
        const baseStats = {
            paddleThrust: 200,
            maxHealth: 100,
            attackDamage: 10,
            turnRate: 2.2,
            jumpVelocity: 18,
        };
        const inventory = {
            perks: { espresso_oars: 1, reinforced_keel: 1, squeaky_thunder: 1 },
            stats: {
                paddleBoost: 0.20,
                maxHpBonus: 40,
                damageBonus: 18,
                turnRateBonus: 0.35,
                jumpBonus: 2.5,
                lifestealRatio: 0.12,
            },
        };

        const result = calculatePlayerPerkStats(baseStats, inventory);
        assert.equal(result.paddleThrust, 240); // 200 * 1.20
        assert.equal(result.maxHealth, 140);   // 100 + 40
        assert.equal(result.attackDamage, 28); // 10 + 18
        assert.equal(result.turnRate, 2.2 * 1.35);
        assert.equal(result.jumpVelocity, 20.5); // 18 + 2.5
        assert.equal(result.lifestealRatio, 0.12);
    });

    it('24. EndlessLeaderboard records run entries and sorts by descending score', () => {
        const lb = new EndlessLeaderboard();
        const r1 = lb.recordRun({ playerName: 'Alice', seed: 42, furthestZ: -2000, kills: 5 });
        assert.equal(r1.rank, 1); // First entry is rank 1

        const r2 = lb.recordRun({ playerName: 'Bob', seed: 42, furthestZ: -3500, kills: 10, sectorsCleared: 2 });
        assert.equal(r2.rank, 1); // Bob went further and scored more, taking rank 1

        const top = lb.getTopScores(42, 5);
        assert.equal(top[0].playerName, 'Bob');
        assert.equal(top[1].playerName, 'Alice');
    });

    it('25. EndlessLeaderboard segregates leaderboards across different seeds', () => {
        const lb = new EndlessLeaderboard();
        lb.recordRun({ playerName: 'Charlie', seed: 101, furthestZ: -2500 });
        lb.recordRun({ playerName: 'Dave', seed: 202, furthestZ: -4000 });

        const seed101 = lb.getTopScores(101);
        const seed202 = lb.getTopScores(202);

        assert.equal(seed101.length, 1);
        assert.equal(seed101[0].playerName, 'Charlie');
        assert.equal(seed202.length, 1);
        assert.equal(seed202[0].playerName, 'Dave');
    });

    it('26. EndlessLeaderboard finds player personal best and supports export/import JSON', () => {
        const lb = new EndlessLeaderboard();
        lb.recordRun({ playerName: 'Eve', seed: 303, furthestZ: -2000, durationMs: 50000 });
        lb.recordRun({ playerName: 'Eve', seed: 303, furthestZ: -3000, durationMs: 70000 }); // Better score

        const best = lb.getPlayerBest(303, 'Eve');
        assert.ok(best);
        assert.equal(best.furthestZ, -3000);

        // Export and import to new leaderboard instance
        const exported = lb.exportJSON(303);
        const lb2 = new EndlessLeaderboard();
        assert.equal(lb2.importJSON(exported), true);

        const importedBest = lb2.getPlayerBest(303, 'Eve');
        assert.equal(importedBest.furthestZ, -3000);
    });

    it('27. EndlessSession initiates session and remains inactive before z = -1500', () => {
        const session = new EndlessSession({ seed: 777 });
        assert.equal(session.currentSectorIndex, 0);

        // Raft at z = -500 (in standard campaign zone)
        const update = session.updateRaftZ(-500);
        assert.equal(update.inEndless, false);
        assert.equal(update.newEvents.length, 0);
    });

    it('28. EndlessSession activates endless sectors and detects checkpoint crossing past z = -1500', () => {
        const session = new EndlessSession({ seed: 777 });
        // Crossing into endless sector 0 and past first checkpoint (z = -1650)
        const update = session.updateRaftZ(-1660);
        assert.equal(update.inEndless, true);
        assert.equal(update.sectorIndex, 0);

        const cpEvent = update.newEvents.find((e) => e.event === 'endless:checkpoint_crossed');
        assert.ok(cpEvent);
        assert.equal(cpEvent.data.z, -1650);
        assert.equal(cpEvent.data.checkpointIndex, 11);
    });

    it('29. EndlessSession triggers Perk Draft offering at the 3rd checkpoint in cycle', () => {
        const session = new EndlessSession({ seed: 777 });
        // Advance past second checkpoint of sector 0 (z = -1800, checkpoint index 12 -> divisible by 3!)
        const update = session.updateRaftZ(-1810);
        assert.equal(update.inEndless, true);

        const draftEvent = update.newEvents.find((e) => e.event === 'endless:perk_draft_offered');
        assert.ok(draftEvent, 'Should offer perk draft at checkpoint 12');
        assert.equal(draftEvent.data.checkpointIndex, 12);
        assert.equal(draftEvent.data.cards.length, 3);
        assert.ok(session.activeDraftOffer);
    });

    it('30. EndlessSession allows drafting a card and integrates it into perk inventory', () => {
        const session = new EndlessSession({ seed: 777 });
        session.updateRaftZ(-1810); // Trigger draft offer
        assert.ok(session.activeDraftOffer);

        const chosenSlot = 1;
        const targetCard = session.activeDraftOffer.cards.find((c) => c.offerSlot === chosenSlot);
        const drafted = session.chooseDraftCard(chosenSlot);

        assert.equal(drafted.id, targetCard.id);
        assert.equal(session.activeDraftOffer, null); // Offer consumed
        assert.equal(session.perkInventory.perks[drafted.id], 1);
    });

    it('31. EndlessSession spawns sector Boss Duo when approaching encounter coordinate', () => {
        const session = new EndlessSession({ seed: 777 });
        const sector0 = session.chainer.getSector(0);
        const encounterZ = sector0.bossDuo.encounterZ;

        // Sail close to boss encounter zone
        const update = session.updateRaftZ(encounterZ + 20);
        assert.ok(session.activeBossDuo);

        const bossSpawnEvent = update.newEvents.find((e) => e.event === 'endless:boss_duo_spawned');
        assert.ok(bossSpawnEvent);
        assert.equal(bossSpawnEvent.data.bossA.role, 'Alpha');
        assert.equal(bossSpawnEvent.data.bossB.role, 'Beta');
    });

    it('32. EndlessSession finishes run and records valid entry in global leaderboard', () => {
        const session = new EndlessSession({ seed: 888, playerName: 'RiverCaptain7' });
        session.updateRaftZ(-2500); // Sector 2
        session.sectorsCleared = 1;
        session.bossesDefeated = 2;
        session.kills = 15;

        // Apply a perk
        applyPerkCard(session.perkInventory, 'reinforced_keel');

        const summary = session.finishRun();
        assert.equal(session.isGameOver, true);
        assert.ok(summary.entry);
        assert.equal(summary.entry.playerName, 'RiverCaptain7');
        assert.equal(summary.entry.distance, 2500);
        assert.equal(summary.entry.perkCount, 1);
        assert.ok(summary.entry.score > 2500);
    });

    it('33. Full deterministic run reproducibility: identical seed yields identical sectors, perks, and duos', () => {
        const runA = new EndlessSession({ seed: 99999 });
        const runB = new EndlessSession({ seed: 99999 });

        const secA = runA.chainer.getSector(0);
        const secB = runB.chainer.getSector(0);

        assert.equal(secA.biome.id, secB.biome.id);
        assert.equal(secA.bossDuo.bossA.name, secB.bossDuo.bossA.name);
        assert.equal(secA.bossDuo.bossB.name, secB.bossDuo.bossB.name);

        const draftA = rollPerkDraft(12, 99999);
        const draftB = rollPerkDraft(12, 99999);
        assert.deepEqual(draftA.cards.map((c) => c.id), draftB.cards.map((c) => c.id));
    });
});
