import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rollDrops, rollBossDrops } from '../drops';
import { REGIONS } from '../../models/mapData';

vi.mock('../../db/database', () => ({
  db: {
    dropTables: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    bossDropTables: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    equipmentTemplates: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      get: vi.fn().mockResolvedValue(null),
    },
    equipmentInstances: {
      add: vi.fn().mockResolvedValue(1),
    },
  },
}));

import { db } from '../../db/database';

describe('drops system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rollDrops', () => {
    it('should return empty result when no drop table entries', async () => {
      vi.mocked(db.dropTables.where('area').equals).mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      } as any);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.gold).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should drop gold at face value (no multiplier)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      vi.mocked(db.dropTables.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { area: 'dawn-plains', itemType: 'gold', dropValue: 100, minAmount: 10, maxAmount: 10 },
          ]),
        }),
      } as any);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.gold).toBe(10);
    });

    it('should drop equipment with affixes', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      vi.mocked(db.dropTables.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { area: 'green-valley', itemType: 'equipment', equipmentTemplateId: 1, dropValue: 100 },
          ]),
        }),
      } as any);
      vi.mocked(db.equipmentTemplates.get).mockResolvedValue({
        id: 1,
        name: '木劍',
        type: 'sword',
        slot: 'rightHand',
        isTwoHanded: false,
        smallMonsterDamage: 8,
        largeMonsterDamage: 6,
        defense: undefined,
        requiredLevel: 1,
        buyPrice: 100,
      } as any);

      const result = await rollDrops('green-valley', 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('equipment');
      expect(result.items[0].equipmentInstance).toBeDefined();
      expect(result.items[0].equipmentInstance!.affixes).toHaveLength(4);
      expect(result.items[0].equipmentInstance!.quality).toBe(0);
    });

    it('should drop potions', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      vi.mocked(db.dropTables.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { area: 'dawn-plains', itemType: 'item', itemTemplateId: 1, dropValue: 200, minAmount: 1, maxAmount: 3 },
          ]),
        }),
      } as any);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('potion');
      expect(result.items[0].name).toBe('紅色藥水');
      expect(result.items[0].amount).toBeGreaterThanOrEqual(1);
    });

    it('should not drop when roll exceeds boosted drop value', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      vi.mocked(db.dropTables.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { area: 'dawn-plains', itemType: 'gold', dropValue: 5, minAmount: 10, maxAmount: 10 },
          ]),
        }),
      } as any);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.gold).toBe(0);
    });

    it('should drop materials', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      vi.mocked(db.dropTables.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { area: 'dawn-plains', itemType: 'item', itemTemplateId: 9, dropValue: 50, minAmount: 1, maxAmount: 1 },
          ]),
        }),
      } as any);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('material');
      expect(result.items[0].name).toBe('品質石');
    });
  });

  describe('drop table area coverage', () => {
    it('newbie neutral zone regions should be defined', () => {
      const regionIds = REGIONS.map(r => r.id);
      expect(regionIds).toContain('dawn-plains');
      expect(regionIds).toContain('green-valley');
      expect(regionIds).toContain('wind-woods');
      expect(regionIds).toContain('misty-swamp');
      expect(regionIds).toContain('trial-highlands');
    });

    it('regions should have valid level ranges', () => {
      const fieldRegions = REGIONS.filter(r => r.type === 'field');
      for (const region of fieldRegions) {
        expect(region.levelMax).toBeGreaterThanOrEqual(region.levelMin);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('rollBossDrops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty result when no boss drop entries', async () => {
    vi.mocked(db.bossDropTables.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const result = await rollBossDrops('象牙塔惡魔', 1, 45);

    expect(result.gold).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('should drop gold from boss drop table', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(db.bossDropTables.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { bossName: '象牙塔惡魔', itemType: 'gold', dropValue: 1000, minAmount: 500, maxAmount: 500 },
        ]),
      }),
    } as any);

    const result = await rollBossDrops('象牙塔惡魔', 1, 45);

    expect(result.gold).toBe(500);
  });

  it('should apply gold_rate bonus to boss gold drops', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(db.bossDropTables.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { bossName: '象牙塔惡魔', itemType: 'gold', dropValue: 1000, minAmount: 500, maxAmount: 500 },
        ]),
      }),
    } as any);

    const result = await rollBossDrops('象牙塔惡魔', 1, 45, { drop_rate: 0, gold_rate: 50 });

    expect(result.gold).toBe(750);
  });

  it('should drop materials from boss drop table', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(db.bossDropTables.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { bossName: '朦朧蛇魔', itemType: 'item', itemTemplateId: 12, dropValue: 100, minAmount: 1, maxAmount: 1 },
        ]),
      }),
    } as any);

    const result = await rollBossDrops('朦朧蛇魔', 1, 50);

    const materialItem = result.items.find(i => i.type === 'material');
    expect(materialItem).toBeDefined();
    expect(materialItem!.name).toBe('銀精華');
  });

  it('should apply drop_rate bonus to boss drops', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.08);
    vi.mocked(db.bossDropTables.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { bossName: '遠古騎士', itemType: 'item', itemTemplateId: 13, dropValue: 80, minAmount: 1, maxAmount: 1 },
        ]),
      }),
    } as any);

    // Without bonus: roll=80, dropValue=80 → 80 >= 80 → no drop
    const resultNoBonus = await rollBossDrops('遠古騎士', 1, 60);
    expect(resultNoBonus.items).toHaveLength(0);

    // With bonus: dropValue boosted to 80*1.5=120 → 80 < 120 → drop
    vi.spyOn(Math, 'random').mockReturnValue(0.08);
    const resultWithBonus = await rollBossDrops('遠古騎士', 1, 60, { drop_rate: 50, gold_rate: 0 });
    expect(resultWithBonus.items).toHaveLength(1);
    expect(resultWithBonus.items[0].name).toBe('米索利碎片');
  });

  it('should not drop when roll exceeds boss drop value', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    vi.mocked(db.bossDropTables.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { bossName: '安塔巨龍', itemType: 'item', itemTemplateId: 16, dropValue: 70, minAmount: 1, maxAmount: 1 },
        ]),
      }),
    } as any);

    const result = await rollBossDrops('安塔巨龍', 1, 50);

    expect(result.items).toHaveLength(0);
  });
});
