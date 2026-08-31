/**
 * 強化卷軸的結算 —— `06-equipment.md` § 6.9（武器）、§ 6.10（防具）、§ 6.12（＋／－ 卷軸）。
 *
 * 背包與鐵匠鋪共用這一支：判定、卷軸消耗、統計計數、裝備存活與否都在這裡，
 * 呼叫端只負責演出與訊息呈現。
 *
 * 武器與防具是兩套獨立系統（成功率公式不同），這裡只共用流程，不共用公式。
 */

import type { EquipmentInstance, EquipSlot } from '../models/equipment';
import { getBagItemAmount, consumeBagItem, type BagItem } from '../models/bagItem';
import { useGameStore } from '../stores/gameStore';
import { db } from '../db/database';
import { getWeaponEnhanceRate, getArmorEnhanceRate } from './enhancement';

/** 強化卷軸（`ITEM_DEFINITIONS` id）。背包比對一律用 id，不用名稱（§ 99.1） */
export const WEAPON_ENHANCE_SCROLL_ID = 7;
export const ARMOR_ENHANCE_SCROLL_ID = 8;
/** 上位卷軸：一次隨機 +1~3 */
export const WEAPON_ENHANCE_PLUS_SCROLL_ID = 157;
export const ARMOR_ENHANCE_PLUS_SCROLL_ID = 158;
/** 下位卷軸：強化等級 -1，必定成功 */
export const WEAPON_ENHANCE_MINUS_SCROLL_ID = 159;
export const ARMOR_ENHANCE_MINUS_SCROLL_ID = 160;

export const PLUS_SCROLL_MAX_LEVELS = 3;

/** 武器安定值固定 6；防具沒帶值時退回下限 4（§ 6.10） */
const WEAPON_DEFAULT_STABILITY = 6;
const ARMOR_DEFAULT_STABILITY = 4;

export type ScrollCategory = 'weapon' | 'armor';
export type ScrollVariant = 'normal' | 'plus' | 'minus';

export interface EnhanceScroll {
  itemId: number;
  category: ScrollCategory;
  variant: ScrollVariant;
}

const SCROLLS: EnhanceScroll[] = [
  { itemId: WEAPON_ENHANCE_SCROLL_ID, category: 'weapon', variant: 'normal' },
  { itemId: WEAPON_ENHANCE_PLUS_SCROLL_ID, category: 'weapon', variant: 'plus' },
  { itemId: WEAPON_ENHANCE_MINUS_SCROLL_ID, category: 'weapon', variant: 'minus' },
  { itemId: ARMOR_ENHANCE_SCROLL_ID, category: 'armor', variant: 'normal' },
  { itemId: ARMOR_ENHANCE_PLUS_SCROLL_ID, category: 'armor', variant: 'plus' },
  { itemId: ARMOR_ENHANCE_MINUS_SCROLL_ID, category: 'armor', variant: 'minus' },
];

/** 這個道具 id 是不是強化卷軸。不是就回 null */
export function getEnhanceScroll(itemId: number | undefined): EnhanceScroll | null {
  if (itemId == null) return null;
  return SCROLLS.find(s => s.itemId === itemId) ?? null;
}

export function getScrollId(category: ScrollCategory, variant: ScrollVariant): number {
  return SCROLLS.find(s => s.category === category && s.variant === variant)!.itemId;
}

/**
 * 卷軸分類看的是**裝備分類**，不是防禦數值：
 * 魔導書、盾牌、臂甲、飾品都是防具，走防具卷軸與 § 6.10 的公式。
 */
export function isEnhanceWeapon(item: EquipmentInstance): boolean {
  return !!item.smallMonsterDamage;
}

export function getEnhanceStability(item: EquipmentInstance): number {
  if (isEnhanceWeapon(item)) return item.stability ?? WEAPON_DEFAULT_STABILITY;
  return item.stability ?? ARMOR_DEFAULT_STABILITY;
}

/** 腰帶安定值 -1＝不可強化（§ 6.10） */
export function isEnhanceable(item: EquipmentInstance): boolean {
  return getEnhanceStability(item) >= 0;
}

export function scrollCategoryOf(item: EquipmentInstance): ScrollCategory {
  return isEnhanceWeapon(item) ? 'weapon' : 'armor';
}

/** 這張卷軸能不能用在這件裝備上 */
export function canScrollTarget(scroll: EnhanceScroll, item: EquipmentInstance): boolean {
  if (!isEnhanceable(item)) return false;
  if (scroll.category !== scrollCategoryOf(item)) return false;
  // － 卷軸在 +0 沒有可降的等級
  if (scroll.variant === 'minus' && (item.enhancement ?? 0) <= 0) return false;
  return true;
}

/** 成功率。安定值內必成，超出後武器固定 1/3、防具走 1/(目標等級-1) 那張表 */
export function getEnhanceRate(item: EquipmentInstance, targetLevel: number): number {
  const stability = getEnhanceStability(item);
  return isEnhanceWeapon(item)
    ? getWeaponEnhanceRate(targetLevel, stability)
    : getArmorEnhanceRate(targetLevel, stability);
}

/**
 * ＋卷軸的成功率與普通卷軸完全相同（§ 6.12）：判的一律是**使用前等級的下一級**，
 * 抽到 +1~3 只決定跳多遠。
 */
export function getJudgedLevel(item: EquipmentInstance): number {
  return (item.enhancement ?? 0) + 1;
}

/** 強化目標。`slot` 有值＝穿在身上，回寫要進 `equippedGear` 而不是 `inventory` */
export interface EnhanceTarget {
  item: EquipmentInstance;
  slot?: EquipSlot;
}

export interface EnhanceOutcome {
  /** § 48.4：安定值內只給白閃，超出安定值成功才是金色那一套 */
  fx: 'safe' | 'success' | 'fail';
  success: boolean;
  nextLevel: number;
  message: string;
  /** 失敗時裝備已從清單移除，演出靠這份快照原地演完碎裂 */
  ghost?: EquipmentInstance;
}

/** 背包列一律以 `itemTemplateId` 定位（§ 99.1），不可用 name 查 */
function persistBagItem(itemId: number, newAmount: number) {
  const charId = useGameStore.getState().character?.id;
  if (!charId) return;
  const rows = db.characterBag.where({ characterId: charId, itemTemplateId: itemId });
  if (newAmount <= 0) rows.delete();
  else rows.modify({ amount: newAmount });
}

function persistEquipment(item: EquipmentInstance) {
  if (!item.id) return;
  db.equipmentInstances.update(item.id, {
    enhancement: item.enhancement,
    quality: item.quality,
    affixes: item.affixes,
  });
}

function writeBack(target: EnhanceTarget, updated: EquipmentInstance | null, bagItems: BagItem[]) {
  const { equippedGear, inventory } = useGameStore.getState();
  if (target.slot) {
    useGameStore.setState({ equippedGear: { ...equippedGear, [target.slot]: updated }, bagItems });
  } else if (updated) {
    useGameStore.setState({ inventory: inventory.map(i => (i.id === target.item.id ? updated : i)), bagItems });
  } else {
    useGameStore.setState({ inventory: inventory.filter(i => i.id !== target.item.id), bagItems });
  }
}

/**
 * 消耗一張卷軸並結算。卷軸不足或目標不合法時回 null，不消耗任何東西。
 *
 * `randomFn` 只為測試留的注入點，正式路徑一律用 `Math.random`。
 */
export function applyEnhanceScroll(
  scroll: EnhanceScroll,
  target: EnhanceTarget,
  randomFn: () => number = Math.random,
): EnhanceOutcome | null {
  const { item } = target;
  if (!canScrollTarget(scroll, item)) return null;

  const bagItems = useGameStore.getState().bagItems;
  const scrollCount = getBagItemAmount(bagItems, scroll.itemId);
  if (scrollCount <= 0) return null;

  const newBag = consumeBagItem(bagItems, scroll.itemId);
  persistBagItem(scroll.itemId, scrollCount - 1);

  const current = item.enhancement ?? 0;

  if (scroll.variant === 'minus') {
    // 沒有判定，所以不計入強化次數與損毀數（§ 6.12）
    const nextLevel = current - 1;
    const updated = { ...item, enhancement: nextLevel };
    persistEquipment(updated);
    writeBack(target, updated, newBag);
    useGameStore.getState().saveState();
    return { fx: 'safe', success: true, nextLevel, message: `${item.name} 已降為 +${nextLevel}` };
  }

  const steps = scroll.variant === 'plus' ? 1 + Math.floor(randomFn() * PLUS_SCROLL_MAX_LEVELS) : 1;
  const nextLevel = current + steps;
  const stability = getEnhanceStability(item);
  const success = randomFn() < getEnhanceRate(item, getJudgedLevel(item));

  let outcome: EnhanceOutcome;
  if (success) {
    const updated = { ...item, enhancement: nextLevel };
    persistEquipment(updated);
    writeBack(target, updated, newBag);
    outcome = {
      fx: nextLevel <= stability ? 'safe' : 'success',
      success: true,
      nextLevel,
      message: `強化成功！${item.name} +${nextLevel}`,
    };
  } else {
    if (item.id) db.equipmentInstances.delete(item.id);
    writeBack(target, null, newBag);
    outcome = {
      fx: 'fail',
      success: false,
      nextLevel: current,
      message: `強化失敗！${item.name} 已損毀...`,
      ghost: item,
    };
  }

  const stats = { ...useGameStore.getState().statistics };
  if (scroll.category === 'weapon') {
    stats.weaponEnhanceAttempts += 1;
    if (!success) stats.weaponsBroken += 1;
  } else {
    stats.armorEnhanceAttempts += 1;
    if (!success) stats.armorsBroken += 1;
  }
  useGameStore.setState({ statistics: stats });
  useGameStore.getState().saveState();

  return outcome;
}
