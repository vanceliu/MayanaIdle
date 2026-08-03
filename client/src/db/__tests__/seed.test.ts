import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../database';
import { seedDatabase, resetSeedState } from '../seed';
import { DROP_TABLE_SEEDS } from '../seed/dropSeeds';

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
    // 對照 seed 而非寫死數字 —— 這個測試要驗的是「不會重複寫入」，不是特定筆數
    expect(dropCount).toBe(DROP_TABLE_SEEDS.length);
  });

  it('should have unique entries per area-itemType-id combination', async () => {
    await seedDatabase();

    const allDrops = await db.dropTables.toArray();
    const seen = new Set<string>();

    for (const entry of allDrops) {
      const idPart = entry.itemTemplateId ?? entry.equipmentTemplateId ?? 'gold';
      // 同一區域可以有多個裝備池（例：雪原同時掉 T4 與 T3），因此 tier 必須進 key
      const key = `${entry.area}:${entry.itemType}:${idPart}:${entry.tier ?? '-'}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
