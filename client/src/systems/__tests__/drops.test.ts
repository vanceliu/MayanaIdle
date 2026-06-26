import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rollDrops } from '../drops';
import { REGIONS } from '../../models/mapData';

vi.mock('../../db/database', () => ({
  db: {
    dropTables: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    equipmentTemplates: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
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
      vi.spyOn(Math, 'random').mockReturnValue(0); // Always drop
      vi.mocked(db.dropTables.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { area: 'dawn-plains', itemType: 'gold', itemName: 'gold', dropValue: 100, minAmount: 10, maxAmount: 10 },
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
            { area: 'green-valley', itemType: 'equipment', itemName: '木劍', dropValue: 100, minAmount: 1, maxAmount: 1 },
          ]),
        }),
      } as any);
      vi.mocked(db.equipmentTemplates.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
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
          }),
        }),
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
            { area: 'dawn-plains', itemType: 'potion', itemName: '紅色藥水', dropValue: 200, minAmount: 1, maxAmount: 3 },
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
      vi.spyOn(Math, 'random').mockReturnValue(0.99); // 990/1000 > most boosted values
      vi.mocked(db.dropTables.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { area: 'dawn-plains', itemType: 'gold', itemName: 'gold', dropValue: 5, minAmount: 10, maxAmount: 10 },
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
            { area: 'dawn-plains', itemType: 'material', itemName: '品質石', dropValue: 50, minAmount: 1, maxAmount: 1 },
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
