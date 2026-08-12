import type { TalentAffixInstance, TalentSlot } from './talent';
import { getTalentAffixDef } from '../db/seed/talentSeeds';

/**
 * 背包「天賦」分頁的格子與順序（`35-inventory-constraints.md` § 35.21）。
 *
 * 順序機制**與一般分頁同一套**（§ 35.8）：整理是一次性落位，把當下的排序結果
 * 整批寫成位置；之後新拿到的東西排在後面，不會插隊到分類中間。
 * 差別只在一般分頁的位置是格子索引，這裡是清單順序 —— 天賦分頁不做手動擺放。
 */

export type TalentBagCell =
  | { kind: 'slot'; tier: 1 | 2 | 3 | 4; count: number }
  | { kind: 'affix'; id: number };

/** 位置表的鍵。天賦格同階堆成一格，所以以階級為鍵；鑲材是獨立實例，以 id 為鍵 */
export function talentCellKey(cell: TalentBagCell): string {
  return cell.kind === 'slot' ? `slot-${cell.tier}` : `affix-${cell.id}`;
}

export type TalentBagOrder = Record<string, number>;

export function talentBagOrderStorageKey(characterId: number): string {
  return `mayana_talent_bag_order_${characterId}`;
}

/**
 * 這份天賦配置可動用的格子清單，未套用位置表。
 *
 * 同階的天賦格長得一模一樣，堆成一格帶數量 —— 六個一模一樣的格子沒有資訊量。
 */
export function buildTalentBagCells(
  spareSlots: TalentSlot[],
  looseAffixes: TalentAffixInstance[],
): TalentBagCell[] {
  const stacks = ([1, 2, 3, 4] as const)
    .map(tier => ({ tier, count: spareSlots.filter(s => s.tier === tier).length }))
    .filter(x => x.count > 0)
    .map(x => ({ kind: 'slot' as const, tier: x.tier, count: x.count }));
  return [...stacks, ...looseAffixes.map(a => ({ kind: 'affix' as const, id: a.id! }))];
}

/**
 * 整理（§ 35.21.1）：天賦格（高階在前）→ 條件鑲材 → 實作鑲材，
 * 各組高階在前、同階依定義順序。回傳位置表，由呼叫端持久化。
 */
export function sortTalentBag(
  cells: TalentBagCell[],
  affixes: TalentAffixInstance[],
): TalentBagOrder {
  const rank = (c: TalentBagCell): [number, number, number] => {
    if (c.kind === 'slot') return [0, -c.tier, 0];
    const def = getTalentAffixDef(affixes.find(a => a.id === c.id)?.definitionId ?? -1);
    if (!def) return [3, 0, 0];
    return [def.kind === 'condition' ? 1 : 2, -def.tier, def.id];
  };
  const sorted = [...cells].sort((a, b) => {
    const [ka, ta, ia] = rank(a);
    const [kb, tb, ib] = rank(b);
    return ka - kb || ta - tb || ia - ib;
  });
  const order: TalentBagOrder = {};
  sorted.forEach((c, i) => { order[talentCellKey(c)] = i; });
  return order;
}

/**
 * 套用位置表。**沒有位置的排在後面**，維持取得順序 ——
 * 整理過後新拿到的鑲材因此不會插進已經排好的分類中間。
 */
export function applyTalentBagOrder(
  cells: TalentBagCell[],
  order: TalentBagOrder,
): TalentBagCell[] {
  const placed: { cell: TalentBagCell; at: number }[] = [];
  const rest: TalentBagCell[] = [];
  for (const cell of cells) {
    const at = order[talentCellKey(cell)];
    if (at === undefined) rest.push(cell);
    else placed.push({ cell, at });
  }
  placed.sort((a, b) => a.at - b.at);
  return [...placed.map(p => p.cell), ...rest];
}

export function loadTalentBagOrder(characterId: number): TalentBagOrder {
  try {
    const data = JSON.parse(localStorage.getItem(talentBagOrderStorageKey(characterId)) ?? 'null');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const next: TalentBagOrder = {};
    for (const [key, at] of Object.entries(data)) {
      if (typeof at === 'number' && Number.isInteger(at) && at >= 0) next[key] = at;
    }
    return next;
  } catch {
    return {};
  }
}

export function saveTalentBagOrder(characterId: number, order: TalentBagOrder): void {
  localStorage.setItem(talentBagOrderStorageKey(characterId), JSON.stringify(order));
}
