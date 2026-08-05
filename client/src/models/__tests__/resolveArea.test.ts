import { describe, it, expect } from 'vitest';
import { REGIONS, getRegion, resolveArea } from '../mapData';
import { DROP_TABLE_SEEDS } from '../../db/seed';

/**
 * 掉落表用的是 **area id**，副本樓層是 `<regionId>-<floor>f`，不是 region id。
 * 這組測試守的就是「掉落表裡的每個 area 都查得到等級」——
 * 查不到時區域等級會退化成 1，詞綴階級權重（`07-affix.md` § 7.7）
 * 與特殊詞綴機率（§ 7.10.3）會整座副本算錯，而且不會報錯。
 */
describe('area id → 區域等級（resolveArea）', () => {
  const dropAreas = [...new Set(DROP_TABLE_SEEDS.map(d => d.area))];

  it('掉落表裡的每個 area 都解析得到等級', () => {
    const unresolved = dropAreas.filter(area => !resolveArea(area));
    expect(unresolved).toEqual([]);
  });

  it('等級一律 ≥ 1，且沒有任何 area 退化成 Lv.1 起算的新手權重', () => {
    for (const area of dropAreas) {
      const resolved = resolveArea(area)!;
      expect(resolved.levelMin, area).toBeGreaterThanOrEqual(1);
      expect(resolved.levelMax, area).toBeGreaterThanOrEqual(resolved.levelMin);
    }
  });

  it('region id 直接命中時回傳 region 自己的等級區間', () => {
    const region = getRegion('demon-forest')!;
    expect(resolveArea('demon-forest')).toEqual({
      region, levelMin: region.levelMin, levelMax: region.levelMax,
    });
  });

  it('副本樓層取該樓層的等級，不是整座副本的', () => {
    const ivory = getRegion('ivory-tower')!;
    const floor1 = ivory.floors!.find(f => f.floor === 1)!;
    const resolved = resolveArea('ivory-tower-1f')!;

    expect(resolved.region.id).toBe('ivory-tower');
    expect(resolved.floor).toEqual(floor1);
    expect(resolved.levelMin).toBe(floor1.levelMin);
    expect(resolved.levelMax).toBe(floor1.levelMax);
    // 整座象牙塔是 33~45，1F 只有 33~36 —— 取整座的會讓 1F 掉出高階詞綴
    expect(resolved.levelMax).toBeLessThan(ivory.levelMax);
  });

  it('百柱塔的區段本身就是 region，維持原樣', () => {
    const segment = getRegion('hundred-pillar-61-70f')!;
    expect(resolveArea('hundred-pillar-61-70f')!.levelMax).toBe(segment.levelMax);
  });

  it('每個有樓層的副本，其所有樓層 area 都解析得到對應樓層', () => {
    for (const region of REGIONS) {
      for (const floor of region.floors ?? []) {
        const resolved = resolveArea(`${region.id}-${floor.floor}f`);
        expect(resolved?.floor?.floor, `${region.id}-${floor.floor}f`).toBe(floor.floor);
      }
    }
  });

  it('不存在的 area 回 undefined，不會硬湊出一個等級', () => {
    expect(resolveArea('not-a-place')).toBeUndefined();
    expect(resolveArea('not-a-place-3f')).toBeUndefined();
  });
});
