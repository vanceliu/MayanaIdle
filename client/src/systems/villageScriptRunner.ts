import type { VillageRule, VillageCondition, VillageAction } from '../models/villageScript';
import type { BagItem } from '../models/bagItem';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import type { HuntLocation } from '../models/villageScript';
import { getBagItemAmount } from '../models/bagItem';
import type { WarehouseKind } from '../models/villageScript';
import { matchesEquipmentFilter } from '../models/villageScript';
import type { Attributes } from '../models/attributes';
import { findScrollInBag, TOWN_SCROLL_CONFIG } from '../models/townScroll';
import { INN_PRICES } from '../stores/gameStore';
import {
  collectMaterialsByTier,
  collectSellableMaterials,
  collectBatchSellEquipment,
  isSellableEquipment,
  getItemBasePrice,
} from './shop';
import type { EquipmentTierLevel } from '../models/equipmentTier';

/**
 * 村莊腳本判定（`49-village-script.md`）。
 *
 * 與戰鬥／常駐腳本相同：由上往下，第一個「條件全成立且動作可執行」的規則勝出。
 * 「可執行」把在不在城鎮、買不買得起、有沒有東西可賣全部包進去，
 * 所以在野外時整份規則會自然掉到 `return_town` 那條，回城後才輪到買賣。
 */

export interface VillageScriptContext {
  className: string;
  /**
   * 角色自身屬性（建角＋升級配點），**不含裝備、不含 buff**。
   * 「本角色穿得起的」篩選條件的判定基準（`49-village-script.md` § 49.4）。
   */
  selfAttributes: Attributes;
  gold: number;
  bagItems: BagItem[];
  inventory: EquipmentInstance[];
  equippedIds: Set<number | undefined>;
  templates: EquipmentTemplate[];
  /** 背包已用格數與上限（`35-inventory-constraints.md`） */
  bagUsedSlots: number;
  bagMaxSlots: number;
  /** 角色現在是否站在城鎮 */
  inTown: boolean;
  /** `current_area_is` 用：所在區域 id */
  currentArea?: string;
  /** 上次掛機點；沒有就回不去 */
  lastHuntLocation: HuntLocation | null;
  /** 待返回旗標（§ 49.5）：只有自動回城帶進城時為 true */
  huntReturnPending: boolean;
  /** 倉庫內容（`13-town.md` § 13.8） */
  warehouse: {
    shared: { materials: BagItem[]; equipment: EquipmentInstance[] };
    personal: { materials: BagItem[]; equipment: EquipmentInstance[] };
    gold: number;
  };
  /** 背包剩餘格數，取出東西前要看得到 */
  bagFreeSlots: number;
  /**
   * 旅館有沒有事情可做：HP／MP 未滿，或身上有異常狀態（`13-town.md` § 13.7）。
   * 未帶＝當作不需要，避免「使用旅館」永遠成立而擋住後面的規則。
   */
  needsInn?: boolean;
  /** `weight_over` 用：當前負重百分比。未帶＝當作 0 */
  weightPercent?: number;
}

export function evaluateVillageScript(
  rules: VillageRule[],
  ctx: VillageScriptContext,
): VillageAction | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.conditions.every(c => checkVillageCondition(c, ctx))) continue;
    if (canExecuteVillageAction(rule.action, ctx)) return rule.action;
  }
  return null;
}

function checkVillageCondition(condition: VillageCondition, ctx: VillageScriptContext): boolean {
  switch (condition.type) {
    case 'always':
      return true;
    case 'bag_slots_used_gte':
      return ctx.bagUsedSlots >= (condition.value ?? ctx.bagMaxSlots);
    case 'item_count_below': {
      if (condition.itemId == null) return false;
      return getBagItemAmount(ctx.bagItems, condition.itemId) < (condition.value ?? 0);
    }
    case 'gold_below':
      return ctx.gold < (condition.value ?? 0);
    case 'gold_above':
      return ctx.gold > (condition.value ?? 0);

    // === § 51.4.8 新增 ===
    case 'in_town':
      return condition.match === 'field' ? !ctx.inTown : ctx.inTown;
    case 'bag_free_slots_lte':
      return ctx.bagFreeSlots <= (condition.value ?? 0);
    case 'has_hunt_location':
      return ctx.lastHuntLocation !== null;
    // 三類型共用（§ 51.4.5）：與戰鬥／常駐版同一個門檻語意
    case 'weight_over':
      return (ctx.weightPercent ?? 0) > (condition.value ?? 0);
    // 三類型共用（§ 51.4.5）：與戰鬥／常駐版比對同一個欄位
    case 'current_area_is':
      return condition.match !== undefined && ctx.currentArea === condition.match;
    case 'warehouse_gold_gte':
      // 金幣只有共用倉庫有（`13-town.md` § 13.8）
      return ctx.warehouse.gold >= (condition.value ?? 0);
    case 'warehouse_item_gte': {
      if (condition.itemId == null) return false;
      const kind = condition.warehouse ?? 'shared';
      return getBagItemAmount(ctx.warehouse[kind].materials, condition.itemId)
        >= (condition.value ?? 0);
    }

    default:
      return false;
  }
}

/** 這一輪這個動作實際上做不做得出事來 */
export function canExecuteVillageAction(action: VillageAction, ctx: VillageScriptContext): boolean {
  switch (action.type) {
    case 'return_town': {
      // 已經在城裡就沒有回城這回事，讓下一條規則接手
      if (ctx.inTown) return false;
      return findReturnScroll(action.scrollTownId, ctx) !== null;
    }
    case 'return_to_hunt':
      return ctx.inTown && ctx.lastHuntLocation !== null && ctx.huntReturnPending;
    case 'buy_item': {
      if (!ctx.inTown || action.itemId == null) return false;
      const price = getItemBasePrice(action.itemId);
      if (price <= 0) return false;
      if (getBuyAmount(action, ctx) <= 0) return false;
      return ctx.gold >= price;
    }
    case 'sell_materials':
      return ctx.inTown && collectVillageSellMaterials(action, ctx).length > 0;
    case 'sell_equipment':
      return ctx.inTown && collectVillageSellEquipment(action, ctx).length > 0;
    case 'use_inn':
      // 旅館要錢；HP／MP 都滿且沒有異常狀態時不必去（避免佔住判定）
      return ctx.inTown && ctx.gold >= INN_PRICES.full && ctx.needsInn === true;
    case 'deposit_materials':
      return ctx.inTown && collectDepositMaterials(action, ctx).length > 0;
    case 'deposit_equipment':
      return ctx.inTown && collectDepositEquipment(action, ctx).length > 0;
    case 'withdraw_item':
      return ctx.inTown && getWithdrawAmount(action, ctx) > 0;
    case 'deposit_gold':
      return ctx.inTown && getDepositGoldAmount(action, ctx) > 0;
    case 'withdraw_gold':
      return ctx.inTown && getWithdrawGoldAmount(action, ctx) > 0;
    default:
      return false;
  }
}

/** 倉庫類動作預設走共用倉庫（跨角色轉移的那一個） */
export function getWarehouseKind(action: VillageAction): WarehouseKind {
  return action.warehouse ?? 'shared';
}

function warehouseSide(action: VillageAction, ctx: VillageScriptContext) {
  return ctx.warehouse[getWarehouseKind(action)];
}

/** 要存進倉庫的素材：與販售同一套顏色門檻，但不受可販售限制（不可販售的素材照樣能存） */
export function collectDepositMaterials(action: VillageAction, ctx: VillageScriptContext): BagItem[] {
  if (action.maxTier == null) return [];
  return collectMaterialsByTier(ctx.bagItems, action.maxTier, {
    skipCraftMaterials: action.skipCraftMaterials ?? false,
  });
}

/**
 * 要存進倉庫的裝備＝命中篩選條件的那些（與販售的保留條件同一份設定，方向相反）。
 * 沒設篩選條件就不存 —— 「全部存進倉庫」要玩家自己明講，不能是留白的預設。
 */
export function collectDepositEquipment(
  action: VillageAction,
  ctx: VillageScriptContext,
): EquipmentInstance[] {
  if (!action.keep) return [];
  return ctx.inventory.filter(
    i => !ctx.equippedIds.has(i.id)
      && !i.isStarterGear
      && matchesEquipmentFilter(i, action.keep, ctx),
  );
}

/** 從倉庫取道具：補到目標數量，受倉庫存量與背包格數限制 */
export function getWithdrawAmount(action: VillageAction, ctx: VillageScriptContext): number {
  if (action.itemId == null) return 0;
  const missing = (action.targetAmount ?? 0) - getBagItemAmount(ctx.bagItems, action.itemId);
  if (missing <= 0) return 0;
  const stored = getBagItemAmount(warehouseSide(action, ctx).materials, action.itemId);
  if (stored <= 0) return 0;
  // 背包沒有這個品項時要一個新格子；已經有就併進同一格
  if (!ctx.bagItems.some(b => b.itemId === action.itemId) && ctx.bagFreeSlots <= 0) return 0;
  return Math.min(missing, stored);
}

/** 存金幣：身上留下 keepGold，其餘存進共用倉庫 */
export function getDepositGoldAmount(action: VillageAction, ctx: VillageScriptContext): number {
  return Math.max(0, ctx.gold - (action.keepGold ?? 0));
}

/** 領金幣：補到 targetAmount，受倉庫存量限制 */
export function getWithdrawGoldAmount(action: VillageAction, ctx: VillageScriptContext): number {
  const missing = (action.targetAmount ?? 0) - ctx.gold;
  if (missing <= 0) return 0;
  return Math.min(missing, ctx.warehouse.gold);
}

/** 回城卷軸：指定城鎮就查那一張，否則背包裡任一張 */
export function findReturnScroll(
  scrollTownId: string | undefined,
  ctx: VillageScriptContext,
): { itemId: number } | null {
  if (scrollTownId) {
    const info = TOWN_SCROLL_CONFIG[scrollTownId];
    if (!info) return null;
    return getBagItemAmount(ctx.bagItems, info.itemId) > 0 ? { itemId: info.itemId } : null;
  }
  const found = findScrollInBag(ctx.bagItems);
  return found ? { itemId: found.itemId } : null;
}

/**
 * 這次要買幾個：補到目標數量，且不超過買得起的量。
 * 用「補到 N 個」而不是「買 N 個」—— 後者搭配「少於 M 個就買」的條件會每輪都再買一次。
 */
export function getBuyAmount(action: VillageAction, ctx: VillageScriptContext): number {
  if (action.itemId == null) return 0;
  const target = action.targetAmount ?? 0;
  const held = getBagItemAmount(ctx.bagItems, action.itemId);
  const missing = target - held;
  if (missing <= 0) return 0;
  const price = getItemBasePrice(action.itemId);
  if (price <= 0) return 0;
  return Math.min(missing, Math.floor(ctx.gold / price));
}

export function collectVillageSellMaterials(action: VillageAction, ctx: VillageScriptContext): BagItem[] {
  if (action.maxTier == null) return [];
  const picked = collectSellableMaterials(ctx.bagItems, action.maxTier, {
    skipCraftMaterials: action.skipCraftMaterials ?? true,
  });
  if (!action.keepItemIds?.length) return picked;
  const keep = new Set(action.keepItemIds);
  return picked.filter(item => !keep.has(item.itemId));
}

/**
 * 要賣的裝備 ＝ 顏色門檻以下、可販售、且不符合任何保留條件。
 * 保留條件是例外清單，寧可少賣不可誤賣。
 */
export function collectVillageSellEquipment(
  action: VillageAction,
  ctx: VillageScriptContext,
): EquipmentInstance[] {
  if (action.maxTier == null) return [];
  const sellable = ctx.inventory.filter(i => isSellableEquipment(i, ctx.templates, ctx.equippedIds));
  const inTier = collectBatchSellEquipment(sellable, ctx.templates, action.maxTier as EquipmentTierLevel);
  return inTier.filter(i => !matchesEquipmentFilter(i, action.keep, ctx));
}
