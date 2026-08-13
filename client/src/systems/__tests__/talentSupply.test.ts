import { describe, it, expect } from 'vitest';
import {
  canExecuteVillageAction,
  collectVillageSellMaterials,
  type VillageScriptContext,
} from '../villageScriptRunner';
import type { VillageAction } from '../../models/villageScript';
import type { BagItem } from '../../models/bagItem';

/** 補給新動作（`51-auto-talent.md` § 51.4.11，階段 9） */

function bag(itemId: number, name: string, amount = 1): BagItem {
  return { itemId, name, type: 'material', amount };
}

function ctx(over: Partial<VillageScriptContext> = {}): VillageScriptContext {
  return {
    className: 'knight',
    gold: 1000,
    bagItems: [],
    inventory: [],
    equippedIds: new Set(),
    templates: [],
    bagUsedSlots: 0,
    bagMaxSlots: 60,
    inTown: true,
    lastHuntLocation: null,
    warehouse: {
      shared: { materials: [], equipment: [] },
      personal: { materials: [], equipment: [] },
      gold: 0,
    },
    bagFreeSlots: 60,
    ...over,
  };
}

describe('使用旅館', () => {
  const act: VillageAction = { type: 'use_inn' };

  it('HP／MP 全滿又沒有異常狀態時不觸發 —— 否則會永遠成立擋住後面的規則', () => {
    expect(canExecuteVillageAction(act, ctx({ needsInn: false }))).toBe(false);
    // 沒帶就是不需要
    expect(canExecuteVillageAction(act, ctx())).toBe(false);
  });

  it('需要休息且在城鎮、有錢才成立', () => {
    expect(canExecuteVillageAction(act, ctx({ needsInn: true }))).toBe(true);
    expect(canExecuteVillageAction(act, ctx({ needsInn: true, inTown: false }))).toBe(false);
    expect(canExecuteVillageAction(act, ctx({ needsInn: true, gold: 0 }))).toBe(false);
  });
});

describe('販售素材的兩階（§ 51.4.11）', () => {
  // 用真的 seed 素材：`collectSellableMaterials` 要查 iconTier，查不到的一律跳過
  const items = [bag(19, '破碎獸牙'), bag(20, '黏液殘渣')];

  it('完整版：白名單指定的永遠不賣', () => {
    const withWhitelist: VillageAction = {
      type: 'sell_materials', maxTier: 7, skipCraftMaterials: false, keepItemIds: [20],
    };
    const picked = collectVillageSellMaterials(withWhitelist, ctx({ bagItems: items }));
    expect(picked.map(i => i.itemId)).toContain(19);
    expect(picked.map(i => i.itemId)).not.toContain(20);
  });

  /* 限縮版已刪除（§ 51.4.1），只剩帶保留設定的完整版 */
  it('沒門檻一件都不賣，不會誤清背包', () => {
    const noThreshold: VillageAction = { type: 'sell_materials' };
    expect(collectVillageSellMaterials(noThreshold, ctx({ bagItems: items }))).toHaveLength(0);
  });
});
