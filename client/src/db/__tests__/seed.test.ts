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
    expect(dropCount).toBe(618);
  });

  it('should have unique entries per area-itemType-id combination', async () => {
    await seedDatabase();

    const allDrops = await db.dropTables.toArray();
    const seen = new Set<string>();

    for (const entry of allDrops) {
      const idPart = entry.itemTemplateId ?? entry.equipmentTemplateId ?? 'gold';
      const key = `${entry.area}:${entry.itemType}:${idPart}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
