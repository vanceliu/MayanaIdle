import { CURE_ITEMS } from './cureItem';
import { TOWN_SCROLL_CONFIG } from './townScroll';
import { REGIONS } from './mapData';

/**
 * 快捷鍵系統（`35-inventory-constraints.md` § 35.7）。
 *
 * 10 格，對應鍵盤 1~9 與 0。可從背包拖放指定，點擊或按鍵觸發對應行為。
 */

export const QUICK_SLOT_COUNT = 10;

/** 紅／橙／白三種基礎藥水沿用既有的 `PotionType` */
export type BasicPotionType = 'red' | 'orange' | 'white';

/**
 * 快捷鍵格內容。
 * - `potion`：紅／橙／白，走 `usePotionByType`
 * - `bagItem`：其餘可使用的背包物品（加速藥水、狀態解除、卷軸），依名稱分派
 * - `equipment`：背包中的裝備實例，點擊等同換裝
 */
export type QuickSlotEntry =
  | { kind: 'potion'; potionType: BasicPotionType }
  | { kind: 'bagItem'; name: string }
  | { kind: 'equipment'; equipmentId: number; name: string };

export type QuickSlots = (QuickSlotEntry | null)[];

/** § 35.7：第 10 格顯示為 0（對應鍵盤 0） */
export function quickSlotLabel(idx: number): string {
  return idx === QUICK_SLOT_COUNT - 1 ? '0' : String(idx + 1);
}

/** § 35.7：鍵盤按鍵 → 格子索引。1~9 對應第 1~9 格，0 對應第 10 格 */
export function keyToQuickSlotIndex(key: string): number | null {
  if (key === '0') return QUICK_SLOT_COUNT - 1;
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= QUICK_SLOT_COUNT - 1) return n - 1;
  return null;
}

export function emptyQuickSlots(): QuickSlots {
  return Array.from({ length: QUICK_SLOT_COUNT }, () => null);
}

const BASIC_POTIONS: Record<string, BasicPotionType> = {
  紅色藥水: 'red',
  橙色藥水: 'orange',
  白色藥水: 'white',
};

const SPEED_POTIONS: Record<string, 'green' | 'enhanced-green'> = {
  綠色藥水: 'green',
  強化綠色藥水: 'enhanced-green',
};

const CURE_ITEM_NAMES = new Set(CURE_ITEMS.map(c => c.name));
const TOWN_SCROLL_NAMES = new Set(Object.values(TOWN_SCROLL_CONFIG).map(s => s.name));

/**
 * 通行卷軸 → 目的地 region id。
 * 由 `REGIONS` 的 `entryScrollName` 反查，改樓層設定時自動跟上，不需維護對應表。
 */
const ENTRY_SCROLL_TO_REGION = new Map<string, string>(
  REGIONS.filter(r => r.entryScrollName).map(r => [r.entryScrollName!, r.id]),
);

export function getEntryScrollRegion(itemName: string): string | undefined {
  return ENTRY_SCROLL_TO_REGION.get(itemName);
}

/** 點擊快捷鍵後要執行的行為（由 store 實際執行） */
export type QuickSlotAction =
  | { type: 'potion'; potionType: BasicPotionType }
  | { type: 'speedPotion'; speedType: 'green' | 'enhanced-green' }
  | { type: 'cure'; name: string }
  | { type: 'townScroll'; name: string }
  | { type: 'travel'; regionId: string; scrollName: string }
  | { type: 'equip'; equipmentId: number };

/**
 * 解析快捷鍵格的點擊行為。回 `null` 代表這格沒有可執行的動作。
 *
 * 這是**唯一**判斷「哪些物品能放進快捷鍵」的地方 —— `canQuickSlotItem()` 也走同一條邏輯，
 * 避免「放得進去但點了沒反應」的不一致。
 */
export function resolveQuickSlotAction(entry: QuickSlotEntry | null): QuickSlotAction | null {
  if (!entry) return null;

  if (entry.kind === 'potion') {
    return { type: 'potion', potionType: entry.potionType };
  }

  if (entry.kind === 'equipment') {
    return { type: 'equip', equipmentId: entry.equipmentId };
  }

  const name = entry.name;
  if (BASIC_POTIONS[name]) return { type: 'potion', potionType: BASIC_POTIONS[name] };
  if (SPEED_POTIONS[name]) return { type: 'speedPotion', speedType: SPEED_POTIONS[name] };
  if (CURE_ITEM_NAMES.has(name)) return { type: 'cure', name };
  if (TOWN_SCROLL_NAMES.has(name)) return { type: 'townScroll', name };

  const regionId = getEntryScrollRegion(name);
  if (regionId) return { type: 'travel', regionId, scrollName: name };

  return null;
}

/**
 * 這個背包物品能不能放進快捷鍵。
 * 裝備一律可以；其餘依 `resolveQuickSlotAction` 是否解得出行為決定
 * （因此強化卷軸、素材、任務物品都放不進去）。
 */
export function canQuickSlotItem(kind: 'bag' | 'equipment', name: string): boolean {
  if (kind === 'equipment') return true;
  return resolveQuickSlotAction({ kind: 'bagItem', name }) != null;
}

/** 背包物品轉成快捷鍵格內容。不可放置時回 null */
export function toQuickSlotEntry(
  kind: 'bag' | 'equipment',
  name: string,
  equipmentId?: number,
): QuickSlotEntry | null {
  if (kind === 'equipment') {
    if (equipmentId == null) return null;
    return { kind: 'equipment', equipmentId, name };
  }
  if (!canQuickSlotItem('bag', name)) return null;
  const basic = BASIC_POTIONS[name];
  if (basic) return { kind: 'potion', potionType: basic };
  return { kind: 'bagItem', name };
}

/** 兩個快捷鍵格內容是否指向同一個物品 */
export function isSameQuickSlotEntry(
  a: QuickSlotEntry | null | undefined,
  b: QuickSlotEntry | null | undefined,
): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'potion' && b.kind === 'potion') return a.potionType === b.potionType;
  if (a.kind === 'bagItem' && b.kind === 'bagItem') return a.name === b.name;
  if (a.kind === 'equipment' && b.kind === 'equipment') return a.equipmentId === b.equipmentId;
  return false;
}

/** 快捷鍵格顯示用的物品名稱 */
export function getQuickSlotItemName(entry: QuickSlotEntry): string {
  if (entry.kind === 'potion') {
    return Object.keys(BASIC_POTIONS).find(n => BASIC_POTIONS[n] === entry.potionType) ?? '藥水';
  }
  return entry.name;
}

/**
 * 正規化持久化的快捷鍵設定。
 *
 * 舊格式是 `(PotionType | null)[]` 且只有 5 格，直接讀會壞掉；
 * 這裡一併處理格式轉換與補齊到 `QUICK_SLOT_COUNT` 格。
 */
export function normalizeQuickSlots(raw: unknown): QuickSlots {
  const out: QuickSlots = Array.from({ length: QUICK_SLOT_COUNT }, () => null);
  if (!Array.isArray(raw)) return out;

  for (let i = 0; i < Math.min(raw.length, QUICK_SLOT_COUNT); i++) {
    const v = raw[i];
    if (v == null) continue;

    // 舊格式：直接存 'red' | 'orange' | 'white'
    if (typeof v === 'string') {
      if (v === 'red' || v === 'orange' || v === 'white') {
        out[i] = { kind: 'potion', potionType: v };
      }
      continue;
    }

    if (typeof v !== 'object') continue;
    const e = v as Partial<QuickSlotEntry> & { kind?: string };
    if (e.kind === 'potion' && (e as { potionType?: string }).potionType) {
      const pt = (e as { potionType: string }).potionType;
      if (pt === 'red' || pt === 'orange' || pt === 'white') {
        out[i] = { kind: 'potion', potionType: pt };
      }
    } else if (e.kind === 'bagItem' && typeof (e as { name?: string }).name === 'string') {
      const entry: QuickSlotEntry = { kind: 'bagItem', name: (e as { name: string }).name };
      // 規則改變後可能有格子指向已不可用的物品，一併剔除
      if (resolveQuickSlotAction(entry)) out[i] = entry;
    } else if (e.kind === 'equipment' && typeof (e as { equipmentId?: number }).equipmentId === 'number') {
      const ee = e as { equipmentId: number; name?: string };
      out[i] = { kind: 'equipment', equipmentId: ee.equipmentId, name: ee.name ?? '裝備' };
    }
  }

  return out;
}
