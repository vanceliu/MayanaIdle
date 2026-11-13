/**
 * 自動天賦道具參數的選項（`51-auto-talent.md` § 51.4.10~§ 51.4.11）：
 * 購買限雜貨店貨架、解除道具限狀態解除道具、使用消耗品限可直接使用的道具，其餘為任意道具。
 */
import { ITEM_DEFINITIONS } from '../db/seed';
import { getItemById, type ItemCategory, type ItemDefinition } from '../models/items';
import type { TalentItemPool } from '../models/talentParams';
import { CURE_ITEMS } from '../models/cureItem';
import { BUFF_POTION_ITEM_IDS } from '../models/buffPotion';
import { ALL_TOWN_SCROLLS } from '../models/townScroll';
import { GENERAL_STORE_ITEM_IDS } from './shop';
import { POTION_CONFIG, SPEED_POTION_CONFIG } from '../stores/gameStore';

/** 下拉選單的分組順序 */
const CATEGORY_ORDER: readonly ItemCategory[] = ['potion', 'scroll', 'material', 'dungeon', 'spellbook', 'other'];

function byIds(ids: readonly number[]): ItemDefinition[] {
  return [...new Set(ids)].map(getItemById).filter((d): d is ItemDefinition => !!d);
}

const POOLS: Record<TalentItemPool, () => ItemDefinition[]> = {
  any: () => [...ITEM_DEFINITIONS].sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.id - b.id),
  shop: () => byIds([...GENERAL_STORE_ITEM_IDS, ...ALL_TOWN_SCROLLS.map(s => s.itemId)]),
  cure: () => byIds(CURE_ITEMS.map(c => c.itemId)),
  consumable: () => byIds([
    ...Object.values(POTION_CONFIG).map(c => c.itemId),
    ...Object.values(SPEED_POTION_CONFIG).map(c => c.itemId),
    ...BUFF_POTION_ITEM_IDS,
    ...ALL_TOWN_SCROLLS.map(s => s.itemId),
    ...CURE_ITEMS.map(c => c.itemId),
  ]),
};

const cache = new Map<TalentItemPool, ItemDefinition[]>();

export function talentItemOptions(pool: TalentItemPool = 'any'): ItemDefinition[] {
  let list = cache.get(pool);
  if (!list) {
    list = POOLS[pool]();
    cache.set(pool, list);
  }
  return list;
}
