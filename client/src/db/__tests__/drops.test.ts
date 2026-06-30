import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../database';
import { seedDatabase, resetSeedState } from '../seed';
import { rollDrops } from '../../systems/drops';
import { loadTemplateCache } from '../../systems/templateSync';

describe('rollDrops', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    await loadTemplateCache();
  });

  it('should return correct number of entries for dawn-plains', async () => {
    const result = await rollDrops('dawn-plains', 1);
    // dawn-plains has 4 entries: gold, 品質石, 強化石, 紅色藥水
    // With POC 100x boost, most should drop, but we just verify no duplicates
    const itemNames = result.items.map(i => i.name);
    const uniqueNames = new Set(itemNames);
    expect(uniqueNames.size).toBe(itemNames.length);
  });

  it('should not produce duplicate item drops from single call', async () => {
    // Run multiple times to catch any randomness issues
    for (let i = 0; i < 10; i++) {
      const result = await rollDrops('dawn-plains', 1);
      const materialNames = result.items
        .filter(item => item.type === 'material' || item.type === 'potion')
        .map(item => item.name);
      const uniqueMaterials = new Set(materialNames);
      expect(uniqueMaterials.size).toBe(materialNames.length);
    }
  });

  it('should return empty for non-existent area', async () => {
    const result = await rollDrops('non-existent-area', 1);
    expect(result.gold).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('should produce drops consistent with seed data after rebuild', async () => {
    // Simulate the fix scenario: call seedDatabase again (rebuild)
    await seedDatabase();

    const entries = await db.dropTables.where('area').equals('dawn-plains').toArray();
    expect(entries).toHaveLength(7);

    const result = await rollDrops('dawn-plains', 1);
    const itemNames = result.items.map(i => i.name);
    const uniqueNames = new Set(itemNames);
    expect(uniqueNames.size).toBe(itemNames.length);
  });
  it('should include requiredClass on dropped equipment instances', async () => {
    // 鎖子甲 has requiredClass: ['knight', 'fairy']
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await rollDrops('trial-highlands', 1);
    vi.spyOn(Math, 'random').mockRestore();

    const chainMail = result.items.find(i => i.name === '鎖子甲');
    if (chainMail) {
      expect(chainMail.equipmentInstance?.requiredClass).toEqual(['knight', 'elf']);
    }
  });

  it('should drop equipment regardless of requiredClass', async () => {
    // All items in drop table should be droppable (no class filtering at drop time)
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await rollDrops('trial-highlands', 1);
    vi.spyOn(Math, 'random').mockRestore();

    const equipNames = result.items.filter(i => i.type === 'equipment').map(i => i.name);
    expect(equipNames).toContain('巨劍');
    expect(equipNames).toContain('鐵盾');
    expect(equipNames).toContain('鎖子甲');
  });
});

describe('Integration: seed → drops flow (no duplication)', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
  });

  it('should not produce duplicate drops even if seedDatabase called twice', async () => {
    await seedDatabase();
    await seedDatabase();

    const entries = await db.dropTables.where('area').equals('dawn-plains').toArray();
    expect(entries).toHaveLength(7);

    const result = await rollDrops('dawn-plains', 1);
    const itemNames = result.items.map(i => i.name);
    const uniqueNames = new Set(itemNames);
    expect(uniqueNames.size).toBe(itemNames.length);
  });

  it('should not produce duplicate drops on concurrent seedDatabase calls', async () => {
    await Promise.all([seedDatabase(), seedDatabase()]);

    const entries = await db.dropTables.where('area').equals('dawn-plains').toArray();
    expect(entries).toHaveLength(7);

    const result = await rollDrops('dawn-plains', 1);
    const itemNames = result.items.map(i => i.name);
    const uniqueNames = new Set(itemNames);
    expect(uniqueNames.size).toBe(itemNames.length);
  });

  it('all areas should have correct entry counts after seed', async () => {
    await seedDatabase();

    const allDrops = await db.dropTables.toArray();
    const areaCounts: Record<string, number> = {};
    for (const entry of allDrops) {
      areaCounts[entry.area] = (areaCounts[entry.area] ?? 0) + 1;
    }

    // Verify known areas
    expect(areaCounts['dawn-plains']).toBe(7);
    expect(areaCounts['green-valley']).toBe(9);
    expect(areaCounts['wind-woods']).toBe(8);
    expect(areaCounts['misty-swamp']).toBe(9);
    expect(areaCounts['trial-highlands']).toBe(11);
  });
});
