import { describe, it, expect } from 'vitest';
import { REGIONS, getRegion } from '../mapData';
import { getEntryScrollRegion, canQuickSlotItem } from '../quickSlot';
import { ITEM_DEFINITIONS } from '../../db/seed/itemSeeds';

/**
 * 百柱塔 1~10F 入場券（`09-dungeon.md` § 百柱塔、`13-town.md` § 13.3 雜貨店）。
 *
 * 改動前 `百柱塔 1F 通行卷軸` 是死資料：不在任何掉落表、非任何 `entryScrollItemId`、
 * 程式無一處引用。現改為雜貨店販售的 1~10F 入場券，沿用既有 `entryScrollName` 機制。
 */

const SCROLL = '百柱塔 1F 通行卷軸';
const SCROLL_ID = ITEM_DEFINITIONS.find(i => i.name === SCROLL)!.id;

describe('百柱塔 1F 通行卷軸', () => {
  it('是雜貨店可購買的道具（有 buyPrice）', () => {
    const def = ITEM_DEFINITIONS.find(i => i.name === SCROLL)!;
    expect(def.category).toBe('dungeon');
    expect(def.buyPrice).toBe(2000);
  });

  it('是百柱塔 1~10F 的入場券', () => {
    expect(getRegion('hundred-pillar-1-10f')?.entryScrollItemId).toBe(SCROLL_ID);
  });

  it('不再是死資料 —— 至少被一個 region 引用', () => {
    expect(REGIONS.filter(r => r.entryScrollItemId === SCROLL_ID).length).toBe(1);
  });

  it('可反查回目的地 region，因此能放快捷鍵直飛', () => {
    expect(getEntryScrollRegion(SCROLL_ID)).toBe('hundred-pillar-1-10f');
    expect(canQuickSlotItem('bag', SCROLL_ID)).toBe(true);
  });
});

describe('百柱塔各段門禁完整性', () => {
  it('1~10F 到 91~100F 每一段都有各自的通行卷軸，且卷軸都存在於 seed', () => {
    const segments = REGIONS.filter(r => r.id.startsWith('hundred-pillar-'));
    expect(segments.length).toBeGreaterThanOrEqual(10);

    const known = new Set(ITEM_DEFINITIONS.map(i => i.id));
    const missing = segments.filter(r => !r.entryScrollItemId || !known.has(r.entryScrollItemId));
    expect(missing.map(r => r.id)).toEqual([]);
  });

  it('每段的卷軸各自獨立，不共用同一張', () => {
    const scrollIds = REGIONS
      .filter(r => r.id.startsWith('hundred-pillar-'))
      .map(r => r.entryScrollItemId!);
    expect(new Set(scrollIds).size).toBe(scrollIds.length);
  });
});
