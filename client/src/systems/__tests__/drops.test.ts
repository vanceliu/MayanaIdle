import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rollDrops, rollBossDrops } from '../drops';
import { REGIONS } from '../../models/mapData';

import { db, resetTestDb } from '../../testing/testDb';
import type { EquipmentTemplate } from '../../models/equipment';

describe('drops system', () => {
  beforeEach(async () => {
    // 掉落表由各測試自己擺，seed 的內容先清掉
    resetTestDb();
    await db.dropTables.clear();
    await db.bossDropTables.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rollDrops', () => {
    it('should return empty result when no drop table entries', async () => {
      await db.dropTables.clear();

      const result = await rollDrops('dawn-plains', 1);

      expect(result.gold).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('印記套用完整掉寶倍率：drop_rate 與 Pressure 都吃（27 § 27.8）', async () => {
      // 基礎 1%（掉落值 10）；roll 固定 25 → 無加成不掉，×(1.5 × 2) = 30 就掉
      vi.spyOn(Math, 'random').mockReturnValue(0.025);
      const entries = [{ area: 'snow-field', itemType: 'item', itemTemplateId: 147, dropValue: 10 }];
      await db.dropTables.bulkAdd(entries as never);

      const plain = await rollDrops('snow-field', 1, { drop_rate: 0, gold_rate: 0 });
      expect(plain.items).toHaveLength(0);

      const boosted = await rollDrops('snow-field', 1, { drop_rate: 50, gold_rate: 0, pressure_mult: 2 });
      expect(boosted.items).toHaveLength(1);
      expect(boosted.items[0].itemTemplateId).toBe(147);
    });

    it('should drop gold at face value (no multiplier)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await db.dropTables.bulkAdd([
            { area: 'dawn-plains', itemType: 'gold', dropValue: 100, minAmount: 10, maxAmount: 10 },
          ] as never);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.gold).toBe(10);
    });

    it('should drop equipment with affixes', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await db.dropTables.bulkAdd([
            { area: 'green-valley', itemType: 'equipment', equipmentTemplateId: 1, dropValue: 100 },
          ] as never);
      await db.equipmentTemplates.put({
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
      } as any as EquipmentTemplate);

      const result = await rollDrops('green-valley', 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('equipment');
      expect(result.items[0].equipmentInstance).toBeDefined();
      expect(result.items[0].equipmentInstance!.affixes).toHaveLength(4);
      expect(result.items[0].equipmentInstance!.quality).toBe(0);
    });

    // `37-statistics.md` § 37.3：T7 計數靠這個欄位，掉落端不帶就得再查一次 DB
    it('should tag dropped equipment with its tier', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await db.dropTables.bulkAdd([
            { area: 'ancient-ruins', itemType: 'equipment', equipmentTemplateId: 232, dropValue: 100 },
          ] as never);
      await db.equipmentTemplates.put({
        id: 232,
        name: '終焉巨劍',
        type: 'twoHandSword',
        slot: 'rightHand',
        isTwoHanded: true,
        acquireType: 'drop_only',
        tier: 7,
        buyPrice: 0,
      } as any as EquipmentTemplate);

      const result = await rollDrops('ancient-ruins', 1);

      expect(result.items[0].equipmentTier).toBe(7);
    });

    it('should drop potions', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await db.dropTables.bulkAdd([
            { area: 'dawn-plains', itemType: 'item', itemTemplateId: 1, dropValue: 200, minAmount: 1, maxAmount: 3 },
          ] as never);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('potion');
      expect(result.items[0].name).toBe('紅色藥水');
      expect(result.items[0].amount).toBeGreaterThanOrEqual(1);
    });

    it('should not drop when roll exceeds boosted drop value', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      await db.dropTables.bulkAdd([
            { area: 'dawn-plains', itemType: 'gold', dropValue: 5, minAmount: 10, maxAmount: 10 },
          ] as never);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.gold).toBe(0);
    });

    it('should drop items with the seed category (id 9 = 工藝印記, scroll)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await db.dropTables.bulkAdd([
            { area: 'dawn-plains', itemType: 'item', itemTemplateId: 9, dropValue: 50, minAmount: 1, maxAmount: 1 },
          ] as never);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('scroll');
      expect(result.items[0].name).toBe('工藝印記');
    });

    it('should apply drop_rate bonus to normal monster drops', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.08);
      await db.dropTables.bulkAdd([
            { area: 'dawn-plains', itemType: 'item', itemTemplateId: 9, dropValue: 80, minAmount: 1, maxAmount: 1 },
          ] as never);

      const resultNoBonus = await rollDrops('dawn-plains', 1);
      expect(resultNoBonus.items).toHaveLength(0);

      vi.spyOn(Math, 'random').mockReturnValue(0.08);
      const resultWithBonus = await rollDrops('dawn-plains', 1, { drop_rate: 50, gold_rate: 0 });
      expect(resultWithBonus.items).toHaveLength(1);
      expect(resultWithBonus.items[0].name).toBe('工藝印記');
    });

    it('should map dungeon items to scrolls after applying the level-based boost', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.075);
      await db.dropTables.bulkAdd([
            { area: 'hundred-pillar-1-10f', itemType: 'item', itemTemplateId: 135, dropValue: 50, minAmount: 1, maxAmount: 1 },
          ] as never);

      const result = await rollDrops('hundred-pillar-1-10f', 1, undefined, false, 52);
      const scroll = result.items.find(item => item.itemTemplateId === 135);

      expect(scroll).toMatchObject({
        name: '百柱塔 11F 通行卷軸',
        type: 'scroll',
        itemTemplateId: 135,
        amount: 1,
      });
    });

    it('should map other item templates to materials', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await db.dropTables.bulkAdd([
            { area: 'dawn-plains', itemType: 'item', itemTemplateId: 132, dropValue: 1000, minAmount: 1, maxAmount: 1 },
          ] as never);

      const result = await rollDrops('dawn-plains', 1);

      expect(result.items[0]).toMatchObject({
        name: '磨刀石',
        type: 'material',
        itemTemplateId: 132,
        amount: 1,
      });
    });

    it('should apply drop_rate bonus to normal monster skill books', async () => {
      await db.dropTables.clear();
      vi.spyOn(Math, 'random').mockReturnValue(0.00075);

      const resultNoBonus = await rollDrops('hundred-pillar-1-10f', 1);
      expect(resultNoBonus.items).toHaveLength(0);

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.00075)
        .mockReturnValueOnce(0);
      const resultWithBonus = await rollDrops('hundred-pillar-1-10f', 1, { drop_rate: 100, gold_rate: 0 });
      expect(resultWithBonus.items).toEqual([
        expect.objectContaining({ type: 'spellbook', itemTemplateId: expect.any(Number), amount: 1 }),
      ]);
    });
  });

  describe('drop table area coverage', () => {
    it('newbie neutral zone regions should be defined', async () => {
      const regionIds = REGIONS.map(r => r.id);
      expect(regionIds).toContain('dawn-plains');
      expect(regionIds).toContain('green-valley');
      expect(regionIds).toContain('wind-woods');
      expect(regionIds).toContain('misty-swamp');
      expect(regionIds).toContain('trial-highlands');
    });

    it('regions should have valid level ranges', async () => {
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
  beforeEach(async () => {
    resetTestDb();
    await db.dropTables.clear();
    await db.bossDropTables.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty result when no boss drop entries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await db.bossDropTables.clear();

    const result = await rollBossDrops('象牙塔惡魔', 1, 45);

    expect(result.gold).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('should drop gold from boss drop table', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await db.bossDropTables.bulkAdd([
          { bossName: '象牙塔惡魔', itemType: 'gold', dropValue: 1000, minAmount: 500, maxAmount: 500 },
        ] as never);

    const result = await rollBossDrops('象牙塔惡魔', 1, 45);

    expect(result.gold).toBe(500);
  });

  it('should apply gold_rate bonus to boss gold drops', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await db.bossDropTables.bulkAdd([
          { bossName: '象牙塔惡魔', itemType: 'gold', dropValue: 1000, minAmount: 500, maxAmount: 500 },
        ] as never);

    const result = await rollBossDrops('象牙塔惡魔', 1, 45, { drop_rate: 0, gold_rate: 50 });

    expect(result.gold).toBe(750);
  });

  it('should drop materials from boss drop table', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await db.bossDropTables.bulkAdd([
          { bossName: '朦朧蛇魔', itemType: 'item', itemTemplateId: 12, dropValue: 100, minAmount: 1, maxAmount: 1 },
        ] as never);

    const result = await rollBossDrops('朦朧蛇魔', 1, 50);

    const materialItem = result.items.find(i => i.type === 'material');
    expect(materialItem).toBeDefined();
    expect(materialItem!.name).toBe('銀精華');
  });

  it('should apply drop_rate bonus to boss drops', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.08);
    await db.bossDropTables.bulkAdd([
          { bossName: '遠古騎士', itemType: 'item', itemTemplateId: 13, dropValue: 80, minAmount: 1, maxAmount: 1 },
        ] as never);

    // Without bonus: roll=80, dropValue=80 → 80 >= 80 → no drop
    const resultNoBonus = await rollBossDrops('遠古騎士', 1, 60);
    expect(resultNoBonus.items).toHaveLength(0);

    // With bonus: dropValue boosted to 80*1.5=120 → 80 < 120 → drop
    vi.spyOn(Math, 'random').mockReturnValue(0.08);
    const resultWithBonus = await rollBossDrops('遠古騎士', 1, 60, { drop_rate: 50, gold_rate: 0 });
    expect(resultWithBonus.items).toHaveLength(1);
    expect(resultWithBonus.items[0].name).toBe('米索利碎片');
  });

  it('should apply drop_rate bonus to boss skill books', async () => {
    await db.bossDropTables.clear();
    vi.spyOn(Math, 'random').mockReturnValue(0.06);

    const resultNoBonus = await rollBossDrops('測試 Boss', 1, 44);
    expect(resultNoBonus.items).toHaveLength(0);

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.06)
      .mockReturnValueOnce(0);
    const resultWithBonus = await rollBossDrops('測試 Boss', 1, 44, { drop_rate: 50, gold_rate: 0 });
    expect(resultWithBonus.items).toEqual([
      expect.objectContaining({ type: 'spellbook', amount: 1 }),
    ]);
  });

  it('should apply the same special category mapping to boss drops', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await db.bossDropTables.bulkAdd([
          { bossName: '測試 Boss', itemType: 'item', itemTemplateId: 135, dropValue: 1000, minAmount: 1, maxAmount: 1 },
          { bossName: '測試 Boss', itemType: 'item', itemTemplateId: 132, dropValue: 1000, minAmount: 1, maxAmount: 1 },
        ] as never);

    const result = await rollBossDrops('測試 Boss', 1, 30);

    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemTemplateId: 135, type: 'scroll' }),
      expect.objectContaining({ itemTemplateId: 132, type: 'material' }),
    ]));
  });

  it('should not drop when roll exceeds boss drop value', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await db.bossDropTables.bulkAdd([
          { bossName: '安塔巨龍', itemType: 'item', itemTemplateId: 16, dropValue: 70, minAmount: 1, maxAmount: 1 },
        ] as never);

    const result = await rollBossDrops('安塔巨龍', 1, 50);

    expect(result.items).toHaveLength(0);
  });
});
