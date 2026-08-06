import { CURE_ITEMS } from './cureItem';
import { ALL_TOWN_SCROLLS } from './townScroll';
import { REGIONS } from './mapData';
import { getItemById, getItemId } from './items';

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
 * - `bagItem`：其餘可使用的背包物品（加速藥水、狀態解除、卷軸），依**道具 id** 分派
 * - `equipment`：背包中的裝備實例，點擊等同換裝
 *
 * `bagItem` 存 id 不存名稱：快捷鍵是持久化設定，存名稱會在道具改名後指向不存在的東西。
 */
export type QuickSlotEntry =
  | { kind: 'potion'; potionType: BasicPotionType }
  | { kind: 'bagItem'; itemId: number }
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

/** 基礎藥水 id（紅 1／橙 2／白 3）→ `PotionType`。id 與 seed 的一致性由測試把關 */
const BASIC_POTION_IDS: Record<number, BasicPotionType> = {
  1: 'red',
  2: 'orange',
  3: 'white',
};

const SPEED_POTION_IDS: Record<number, 'green' | 'enhanced-green'> = {
  [getItemId('綠色藥水')!]: 'green',
  [getItemId('強化綠色藥水')!]: 'enhanced-green',
};

const CURE_ITEM_IDS = new Set(CURE_ITEMS.map(c => c.itemId));
const TOWN_SCROLL_IDS = new Set(ALL_TOWN_SCROLLS.map(s => s.itemId));

/**
 * 通行卷軸 id → 目的地 region id。
 * 由 `REGIONS` 的 `entryScrollItemId` 反查，改樓層設定時自動跟上，不需維護對應表。
 */
const ENTRY_SCROLL_TO_REGION = new Map<number, string>(
  REGIONS.filter(r => r.entryScrollItemId).map(r => [r.entryScrollItemId!, r.id]),
);

export function getEntryScrollRegion(itemId: number): string | undefined {
  return ENTRY_SCROLL_TO_REGION.get(itemId);
}

/** 點擊快捷鍵後要執行的行為（由 store 實際執行） */
export type QuickSlotAction =
  | { type: 'potion'; potionType: BasicPotionType }
  | { type: 'speedPotion'; speedType: 'green' | 'enhanced-green' }
  | { type: 'cure'; itemId: number }
  | { type: 'townScroll'; itemId: number }
  | { type: 'travel'; regionId: string; scrollItemId: number }
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

  const { itemId } = entry;
  if (BASIC_POTION_IDS[itemId]) return { type: 'potion', potionType: BASIC_POTION_IDS[itemId] };
  if (SPEED_POTION_IDS[itemId]) return { type: 'speedPotion', speedType: SPEED_POTION_IDS[itemId] };
  if (CURE_ITEM_IDS.has(itemId)) return { type: 'cure', itemId };
  if (TOWN_SCROLL_IDS.has(itemId)) return { type: 'townScroll', itemId };

  const regionId = getEntryScrollRegion(itemId);
  if (regionId) return { type: 'travel', regionId, scrollItemId: itemId };

  return null;
}

/**
 * 這個背包物品能不能放進快捷鍵。
 * 裝備一律可以；其餘依 `resolveQuickSlotAction` 是否解得出行為決定
 * （因此強化卷軸、素材、任務物品都放不進去）。
 */
export function canQuickSlotItem(kind: 'bag' | 'equipment', itemId: number): boolean {
  if (kind === 'equipment') return true;
  return resolveQuickSlotAction({ kind: 'bagItem', itemId }) != null;
}

/** 背包物品轉成快捷鍵格內容。不可放置時回 null */
export function toQuickSlotEntry(
  kind: 'bag' | 'equipment',
  itemId: number,
  equipmentId?: number,
  equipmentName?: string,
): QuickSlotEntry | null {
  if (kind === 'equipment') {
    if (equipmentId == null) return null;
    return { kind: 'equipment', equipmentId, name: equipmentName ?? '裝備' };
  }
  if (!canQuickSlotItem('bag', itemId)) return null;
  const basic = BASIC_POTION_IDS[itemId];
  if (basic) return { kind: 'potion', potionType: basic };
  return { kind: 'bagItem', itemId };
}

/** 兩個快捷鍵格內容是否指向同一個物品 */
export function isSameQuickSlotEntry(
  a: QuickSlotEntry | null | undefined,
  b: QuickSlotEntry | null | undefined,
): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'potion' && b.kind === 'potion') return a.potionType === b.potionType;
  if (a.kind === 'bagItem' && b.kind === 'bagItem') return a.itemId === b.itemId;
  if (a.kind === 'equipment' && b.kind === 'equipment') return a.equipmentId === b.equipmentId;
  return false;
}

/** 快捷鍵格顯示用的物品名稱。道具一律由 id 反查 seed，不存名稱 */
export function getQuickSlotItemName(entry: QuickSlotEntry): string {
  if (entry.kind === 'potion') {
    const id = Number(Object.keys(BASIC_POTION_IDS).find(k => BASIC_POTION_IDS[Number(k)] === entry.potionType));
    return getItemById(id)?.name ?? '藥水';
  }
  if (entry.kind === 'bagItem') return getItemById(entry.itemId)?.name ?? '未知道具';
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
    } else if (e.kind === 'bagItem') {
      // 舊格式存名稱，這裡順手換成 id（改名前存的格子會反查不到，直接剔除）
      const raw = e as { itemId?: number; name?: string };
      const itemId = typeof raw.itemId === 'number' ? raw.itemId
        : typeof raw.name === 'string' ? getItemId(raw.name)
        : undefined;
      if (itemId == null) continue;
      const entry: QuickSlotEntry = { kind: 'bagItem', itemId };
      // 規則改變後可能有格子指向已不可用的物品，一併剔除
      if (resolveQuickSlotAction(entry)) out[i] = entry;
    } else if (e.kind === 'equipment' && typeof (e as { equipmentId?: number }).equipmentId === 'number') {
      const ee = e as { equipmentId: number; name?: string };
      out[i] = { kind: 'equipment', equipmentId: ee.equipmentId, name: ee.name ?? '裝備' };
    }
  }

  return out;
}
