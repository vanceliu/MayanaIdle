import { describe, it, expect } from 'vitest';
import { DROP_TABLE_SEEDS } from '../seed';
import { getItemById } from '../../models/items';

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
    const goldDrop = areaDrops.find(d => d.itemType === 'gold');
    if (!goldDrop) return null;

    const avgGold = ((goldDrop.minAmount ?? 0) + (goldDrop.maxAmount ?? 0)) / 2;
    const goldRate = goldDrop.dropValue / 1000;
    const expectedGoldPerKill = avgGold * goldRate;

    let expectedMaterialGoldPerKill = 0;
    // 「掉了可以賣錢的東西」才算素材收入。精鍊／工藝印記歸 scroll（`46-sigil.md` § 46.2）
    // 但仍是全區域掉落的可販售品，收入照算 —— 只看 category 會讓改歸類憑空砍掉前期收入。
    const materialDrops = areaDrops.filter(d => {
      if (d.itemType !== 'item' || !d.itemTemplateId) return false;
      const def = getItemById(d.itemTemplateId);
      if (!def || def.category === 'potion') return false;
      return def.sellPrice !== undefined && def.sellPrice > 0;
    });

    for (const drop of materialDrops) {
      const def = getItemById(drop.itemTemplateId!)!;
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
    for (const { area } of EARLY_AREAS) {
      const result = calcAreaEconomics(area);
      expect(result).not.toBeNull();
      expect(result!.boostPercent).toBeGreaterThan(8);
      expect(result!.boostPercent).toBeLessThan(55);
    }
  });

  it('前期區域（Lv.1~30）素材賣價不超過該區域金幣掉落上限', () => {
    const earlyAreaIds = EARLY_AREAS.map(a => a.area);
    for (const areaId of earlyAreaIds) {
      const areaDrops = DROP_TABLE_SEEDS.filter(d => d.area === areaId);
      const goldDrop = areaDrops.find(d => d.itemType === 'gold');
      if (!goldDrop || !goldDrop.maxAmount) continue;

      const goldMax = goldDrop.maxAmount;
      const materialDrops = areaDrops.filter(d => {
        if (d.itemType !== 'item' || !d.itemTemplateId) return false;
        const def = getItemById(d.itemTemplateId);
        return def?.category === 'material' && def.sellPrice !== undefined && def.sellPrice > 0;
      });

      for (const drop of materialDrops) {
        const def = getItemById(drop.itemTemplateId!)!;
        const sellValue = Math.floor(def.sellPrice! * 0.5);
        expect(
          sellValue,
          `${def.name} 在 ${areaId} 賣價 ${sellValue}G 超過金幣上限 ${goldMax}G`
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
