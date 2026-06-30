import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../database';
import { seedDatabase, resetSeedState } from '../seed';

describe('seedDatabase', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
  });

  it('should seed all tables on first run', async () => {
    await seedDatabase();

    const monsters = await db.monsterTemplates.count();
    const equipment = await db.equipmentTemplates.count();
    const drops = await db.dropTables.count();

    expect(monsters).toBeGreaterThan(0);
    expect(equipment).toBeGreaterThan(0);
    expect(drops).toBeGreaterThan(0);
  });

  it('should not duplicate dropTables on repeated calls', async () => {
    await seedDatabase();
    const firstCount = await db.dropTables.count();

    await seedDatabase();
    const secondCount = await db.dropTables.count();

    expect(secondCount).toBe(firstCount);
  });

  it('should not duplicate dropTables on concurrent calls', async () => {
    await Promise.all([seedDatabase(), seedDatabase()]);

    const dropCount = await db.dropTables.count();
    const firstRunDrops = await db.dropTables.toArray();

    // Verify no area has duplicate entries
    const areaCounts: Record<string, number> = {};
    for (const entry of firstRunDrops) {
      areaCounts[entry.area] = (areaCounts[entry.area] ?? 0) + 1;
    }

    // dawn-plains should have exactly 7 entries
    expect(areaCounts['dawn-plains']).toBe(7);
    // Total should match seed data
    expect(dropCount).toBe(607);
  });

  it('should fix legacy duplicated dropTables', async () => {
    // Simulate legacy duplication: seed monsters first, then manually double-insert drops
    await db.monsterTemplates.bulkAdd([
      { name: 'test', level: 1, hp: 10, attackMin: 1, attackMax: 2, defense: 0, exp: 5, race: 'normal', size: 'small', element: 'none', area: 'dawn-plains', isBoss: false } as any,
    ]);
    // Manually insert drops twice to simulate the bug
    const fakeDrops = [
      { area: 'dawn-plains', itemName: '金幣', itemType: 'gold', dropValue: 1000, minAmount: 1, maxAmount: 5 },
      { area: 'dawn-plains', itemName: '品質石', itemType: 'material', dropValue: 50 },
    ];
    await db.dropTables.bulkAdd(fakeDrops as any);
    await db.dropTables.bulkAdd(fakeDrops as any);

    const beforeCount = await db.dropTables.count();
    expect(beforeCount).toBe(4); // duplicated

    // seedDatabase should fix it
    await seedDatabase();

    const afterCount = await db.dropTables.count();
    expect(afterCount).toBe(607); // correct seed count

    // dawn-plains should have exactly 7 entries
    const dawnEntries = await db.dropTables.where('area').equals('dawn-plains').toArray();
    expect(dawnEntries).toHaveLength(7);
  });

  it('should have unique entries per area-itemName combination', async () => {
    await seedDatabase();

    const allDrops = await db.dropTables.toArray();
    const seen = new Set<string>();

    for (const entry of allDrops) {
      const key = `${entry.area}:${entry.itemName}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
