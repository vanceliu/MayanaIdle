import { describe, it, expect } from 'vitest';
import { DROP_TABLE_SEEDS } from '../seed';
import { getItemDefinition } from '../../models/items';

describe('經濟平衡驗證', () => {
  const EARLY_AREAS = [
    { area: 'dawn-plains', label: '曙光草原 Lv.1~5' },
    { area: 'green-valley', label: '翠綠谷地 Lv.6~10' },
    { area: 'wind-woods', label: '風語林地 Lv.11~15' },
    { area: 'misty-swamp', label: '迷霧沼澤 Lv.16~20' },
    { area: 'trial-highlands', label: '試煉高地 Lv.21~30' },
  ];

  function calcAreaEconomics(areaId: string) {
    const areaDrops = DROP_TABLE_SEEDS.filter(d => d.area === areaId);
    const goldDrop = areaDrops.find(d => d.itemName === '金幣');
    if (!goldDrop) return null;

    const avgGold = ((goldDrop.minAmount ?? 0) + (goldDrop.maxAmount ?? 0)) / 2;
    const goldRate = goldDrop.dropValue / 1000;
    const expectedGoldPerKill = avgGold * goldRate;

    let expectedMaterialGoldPerKill = 0;
    const materialDrops = areaDrops.filter(d => {
      if (d.itemType !== 'material') return false;
      const def = getItemDefinition(d.itemName);
      return def?.sellPrice !== undefined && def.sellPrice > 0;
    });

    for (const drop of materialDrops) {
      const def = getItemDefinition(drop.itemName)!;
      const sellValue = Math.floor(def.sellPrice! * 0.5);
      const dropRate = drop.dropValue / 1000;
      const avgAmount = ((drop.minAmount ?? 1) + (drop.maxAmount ?? 1)) / 2;
      expectedMaterialGoldPerKill += sellValue * dropRate * avgAmount;
    }

    const totalPerKill = expectedGoldPerKill + expectedMaterialGoldPerKill;
    const boostPercent = expectedGoldPerKill > 0
      ? (expectedMaterialGoldPerKill / expectedGoldPerKill) * 100
      : 0;

    return {
      expectedGoldPerKill,
      expectedMaterialGoldPerKill,
      totalPerKill,
      boostPercent,
    };
  }

  it('前期區域（Lv.1~30）素材收入提升約 20~50%', () => {
    for (const { area, label } of EARLY_AREAS) {
      const result = calcAreaEconomics(area);
      expect(result).not.toBeNull();
      expect(result!.boostPercent).toBeGreaterThan(15);
      expect(result!.boostPercent).toBeLessThan(55);
    }
  });

  it('前期區域（Lv.1~30）素材賣價不超過該區域金幣掉落上限', () => {
    const earlyAreaIds = EARLY_AREAS.map(a => a.area);
    for (const areaId of earlyAreaIds) {
      const areaDrops = DROP_TABLE_SEEDS.filter(d => d.area === areaId);
      const goldDrop = areaDrops.find(d => d.itemName === '金幣');
      if (!goldDrop || !goldDrop.maxAmount) continue;

      const goldMax = goldDrop.maxAmount;
      const materialDrops = areaDrops.filter(d => {
        if (d.itemType !== 'material') return false;
        const def = getItemDefinition(d.itemName);
        return def?.sellPrice !== undefined && def.sellPrice > 0;
      });

      for (const drop of materialDrops) {
        const def = getItemDefinition(drop.itemName)!;
        const sellValue = Math.floor(def.sellPrice! * 0.5);
        expect(
          sellValue,
          `${drop.itemName} 在 ${areaId} 賣價 ${sellValue}G 超過金幣上限 ${goldMax}G`
        ).toBeLessThanOrEqual(goldMax);
      }
    }
  });

  it('輸出各區域經濟數據供人工確認', () => {
    const results: Record<string, unknown>[] = [];
    for (const { area, label } of EARLY_AREAS) {
      const r = calcAreaEconomics(area);
      if (r) {
        results.push({
          area: label,
          goldPerKill: r.expectedGoldPerKill.toFixed(1),
          materialGoldPerKill: r.expectedMaterialGoldPerKill.toFixed(1),
          totalPerKill: r.totalPerKill.toFixed(1),
          boost: `+${r.boostPercent.toFixed(1)}%`,
        });
      }
    }
    console.table(results);
    expect(results.length).toBe(EARLY_AREAS.length);
  });
});
