import type { VillageRule, VillageCondition, VillageAction } from '../models/villageScript';
import type { BagItem } from '../models/bagItem';
import type { CraftMaterial, EquipmentInstance, EquipmentTemplate } from '../models/equipment';
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
  getTemplateSellPrice,
  isSellableEquipment,
  getItemBasePrice,
} from './shop';
import { getEquipmentTierLevel, type EquipmentTierLevel } from '../models/equipmentTier';
import { addCrystal, crystalImproves, type AbilityCrystal } from '../models/abilityCrystal';
import { getDismantleOutcome } from './crafting';

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
  /** `dismantle_equipment` 用：已有的技能結晶。未帶＝沒有 */
  abilityCrystals?: readonly AbilityCrystal[];
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
      // 金幣只有帳號倉庫有（`13-town.md` § 13.8）
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
      return ctx.inTown && collectBuyItems(action, ctx).length > 0;
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
    case 'deposit_items':
      return ctx.inTown && collectDepositItems(action, ctx).length > 0;
    case 'dismantle_equipment':
      return ctx.inTown && collectVillageDismantle(action, ctx).length > 0;
    case 'discard_equipment':
      return collectDiscardEquipment(action, ctx).length > 0;
    case 'withdraw_item':
      return ctx.inTown && collectWithdrawItems(action, ctx).length > 0;
    case 'deposit_gold':
      return ctx.inTown && getDepositGoldAmount(action, ctx) > 0;
    case 'withdraw_gold':
      return ctx.inTown && getWithdrawGoldAmount(action, ctx) > 0;
    default:
      return false;
  }
}

/** 倉庫類動作預設走帳號倉庫（跨角色轉移的那一個）；補給天賦不碰公會倉庫 */
export function getWarehouseKind(action: VillageAction): WarehouseKind {
  return action.warehouse === 'personal' ? 'personal' : 'shared';
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

export interface ItemLine {
  itemId: number;
  amount: number;
}

/** 多組道具動作的各組（§ 49.3 最多 3 組）：未選道具的組略過，同一道具只取第一組；數量未設為 0 */
function getItemGroups(action: VillageAction, amountKey: 'targetAmount' | 'keepAmount'): ItemLine[] {
  const raw: [number | undefined, number | undefined][] = amountKey === 'targetAmount'
    ? [[action.itemId, action.targetAmount], [action.itemId2, action.targetAmount2], [action.itemId3, action.targetAmount3]]
    : [[action.itemId, action.keepAmount], [action.itemId2, action.keepAmount2], [action.itemId3, action.keepAmount3]];
  const groups: ItemLine[] = [];
  for (const [itemId, amount] of raw) {
    if (itemId == null || groups.some(g => g.itemId === itemId)) continue;
    groups.push({ itemId, amount: amount ?? 0 });
  }
  return groups;
}

/** 存入指定道具：每組存「身上數量 − 留下數量」 */
export function collectDepositItems(action: VillageAction, ctx: VillageScriptContext): ItemLine[] {
  return getItemGroups(action, 'keepAmount')
    .map(g => ({ itemId: g.itemId, amount: getBagItemAmount(ctx.bagItems, g.itemId) - g.amount }))
    .filter(line => line.amount > 0);
}

export interface VillageDismantlePick {
  item: EquipmentInstance;
  yields: CraftMaterial[];
  crystal?: AbilityCrystal;
}

/**
 * 這一輪要拆的裝備（§ 49.4.1），依背包順序。
 * 「新或更強」與背包格數都計入同一輪前面已拆的；放不下的那件跳過。
 */
export function collectVillageDismantle(action: VillageAction, ctx: VillageScriptContext): VillageDismantlePick[] {
  if (action.maxTier == null) return [];
  const crystalMode = action.crystalMode ?? 'improve';
  const templates = new Map(ctx.templates.map(t => [t.id, t]));
  const heldKinds = new Set(ctx.bagItems.filter(b => b.amount > 0).map(b => b.itemId));
  let crystals = ctx.abilityCrystals ?? [];
  let usedSlots = ctx.bagUsedSlots;
  const picks: VillageDismantlePick[] = [];

  for (const item of ctx.inventory) {
    if (item.id == null || ctx.equippedIds.has(item.id) || item.isStarterGear) continue;
    const template = templates.get(item.templateId);
    if (!template || getEquipmentTierLevel(template) > action.maxTier) continue;
    const { yields, crystal } = getDismantleOutcome(item, template);
    if (!yields && !crystal) continue;
    if (!yields && !action.includeDropOnly) continue;
    if (item.isCraftedGear && !action.includeCrafted) continue;
    if (crystal) {
      if (crystalMode === 'never') continue;
      if (crystalMode === 'improve' && !crystalImproves(crystals.find(c => c.type === crystal.type), crystal)) continue;
    }
    if (matchesEquipmentFilter(item, action.keep, ctx)) continue;

    const newKinds = (yields ?? []).filter(m => !heldKinds.has(m.itemId));
    if (usedSlots - 1 + newKinds.length > ctx.bagMaxSlots) continue;
    usedSlots += newKinds.length - 1;
    for (const m of newKinds) heldKinds.add(m.itemId);
    if (crystal) crystals = addCrystal(crystals, crystal);
    picks.push({ item, yields: yields ?? [], crystal });
  }
  return picks;
}

/** 要丟的裝備（§ 49.4.2）：Tier 門檻以下、符合「丟哪些」、不符合保留條件；已裝備與新手裝不丟 */
export function collectDiscardEquipment(action: VillageAction, ctx: VillageScriptContext): EquipmentInstance[] {
  if (action.maxTier == null) return [];
  const scope = action.discardScope ?? 'unsellable';
  const templates = new Map(ctx.templates.map(t => [t.id, t]));
  return ctx.inventory.filter(item => {
    if (item.id == null || ctx.equippedIds.has(item.id) || item.isStarterGear) return false;
    // 創角直接穿上的新手裝沒有 `isStarterGear` 旗標，要看模板
    const template = templates.get(item.templateId);
    if (!template || template.acquireType === 'starter') return false;
    if (getEquipmentTierLevel(template) > action.maxTier!) return false;
    const sellable = getTemplateSellPrice(template) > 0;
    if (scope === 'unsellable' && sellable) return false;
    if (scope === 'sellable' && !sellable) return false;
    return !matchesEquipmentFilter(item, action.keep, ctx);
  });
}

/** 從倉庫取道具：每組補到目標數量，受倉庫存量限制；新品項佔新格，依組的順序扣剩餘格數 */
export function collectWithdrawItems(action: VillageAction, ctx: VillageScriptContext): ItemLine[] {
  const stored = warehouseSide(action, ctx).materials;
  let freeSlots = ctx.bagFreeSlots;
  const lines: ItemLine[] = [];
  for (const { itemId, amount: target } of getItemGroups(action, 'targetAmount')) {
    const missing = target - getBagItemAmount(ctx.bagItems, itemId);
    const available = getBagItemAmount(stored, itemId);
    if (missing <= 0 || available <= 0) continue;
    if (!ctx.bagItems.some(b => b.itemId === itemId)) {
      if (freeSlots <= 0) continue;
      freeSlots--;
    }
    lines.push({ itemId, amount: Math.min(missing, available) });
  }
  return lines;
}

/** 存金幣：身上留下 keepGold，其餘存進帳號倉庫 */
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
 * 這次要買的：每組補到目標數量，不超過買得起的量；金幣依組的順序扣。
 * 用「補到 N 個」而不是「買 N 個」—— 後者搭配「少於 M 個就買」的條件會每輪都再買一次。
 */
export function collectBuyItems(action: VillageAction, ctx: VillageScriptContext): ItemLine[] {
  let gold = ctx.gold;
  const lines: ItemLine[] = [];
  for (const { itemId, amount: target } of getItemGroups(action, 'targetAmount')) {
    const missing = target - getBagItemAmount(ctx.bagItems, itemId);
    const price = getItemBasePrice(itemId);
    if (missing <= 0 || price <= 0) continue;
    const amount = Math.min(missing, Math.floor(gold / price));
    if (amount <= 0) continue;
    gold -= amount * price;
    lines.push({ itemId, amount });
  }
  return lines;
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
