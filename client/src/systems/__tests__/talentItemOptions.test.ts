import { describe, it, expect } from 'vitest';
import { talentItemOptions } from '../talentItemOptions';
import { getParamFields } from '../../models/talentParams';
import { GENERAL_STORE_ITEM_IDS } from '../shop';
import { CURE_ITEMS } from '../../models/cureItem';
import { ALL_TOWN_SCROLLS } from '../../models/townScroll';
import { ITEM_DEFINITIONS } from '../../db/seed';
import { getItemId } from '../../models/items';

/** 自動天賦道具選項（`51-auto-talent.md` § 51.4.10~§ 51.4.11）：與背包有無無關 */
const ids = (pool?: Parameters<typeof talentItemOptions>[0]) => talentItemOptions(pool).map(d => d.id);
const poolOf = (ruleId: string, key = 'itemId') =>
  getParamFields(ruleId).find(f => f.key === key && f.kind === 'item') as { pool?: string } | undefined;

describe('talentItemOptions', () => {
  it('任意道具：列出全部道具', () => {
    expect(new Set(ids())).toEqual(new Set(ITEM_DEFINITIONS.map(d => d.id)));
  });

  it('購買：雜貨店貨架加各城回城卷軸，不含素材', () => {
    const shop = new Set(ids('shop'));
    for (const id of GENERAL_STORE_ITEM_IDS) expect(shop.has(id), String(id)).toBe(true);
    for (const s of ALL_TOWN_SCROLLS) expect(shop.has(s.itemId)).toBe(true);
    expect(shop.has(getItemId('銀礦石')!)).toBe(false);
  });

  it('解除道具：只有狀態解除道具', () => {
    expect(ids('cure')).toEqual(CURE_ITEMS.map(c => c.itemId));
  });

  it('使用消耗品：藥水、加速與增益藥水、回城卷軸、解除道具，不含強化卷軸', () => {
    const pool = new Set(ids('consumable'));
    for (const name of ['紅色藥水', '綠色藥水', '回魔藥水', '解毒藥水']) expect(pool.has(getItemId(name)!), name).toBe(true);
    expect(pool.has(ALL_TOWN_SCROLLS[0].itemId)).toBe(true);
    expect(pool.has(getItemId('武器強化卷軸')!)).toBe(false);
  });

  it('各動作的道具欄位對應的選項範圍', () => {
    expect(poolOf('buy_item')?.pool).toBe('shop');
    expect(poolOf('withdraw_item')?.pool).toBeUndefined();
    expect(poolOf('deposit_items')?.pool).toBeUndefined();
    expect(poolOf('item_count_below')?.pool).toBeUndefined();
    expect(poolOf('cure_item', 'cureItemId')?.pool).toBe('cure');
    expect(poolOf('use_consumable')?.pool).toBe('consumable');
  });
});
