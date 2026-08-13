import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import { getTotalAttributes } from '../models/character';
import { getItemById } from '../models/items';

/**
 * 負重系統（`20-attributes.md` § 20.7）。
 *
 * 負重上限 = (有效力量 + 有效體質) × 100 + 腰帶的負重加成
 *
 * **超重懲罰：無法攻擊、無法施放魔法**（可以移動、可以回血回魔）。
 * 判定發生在每次出手時，戰鬥記錄逐次顯示。
 */

/** 每點力量／體質提供的負重 */
const WEIGHT_PER_ATTRIBUTE = 100;

export interface BagItemLike {
  itemId: number;
  amount: number;
}

/** 負重上限 = (有效力量 + 有效體質) × 100 + 裝備的負重加成 */
export function getCarryCapacity(
  character: Character,
  equippedGear: (EquipmentInstance | null | undefined)[],
): number {
  const attrs = getTotalAttributes(character, undefined, equippedGear as (EquipmentInstance | null)[]);
  const base = (attrs.STR + attrs.VIT) * WEIGHT_PER_ATTRIBUTE;
  const bonus = equippedGear.reduce((sum, item) => sum + (item?.bonusWeight ?? 0), 0);
  return base + bonus;
}

/**
 * 目前負重 = 裝備重量 + 背包物品重量 × 數量。
 *
 * 裝備在身上的東西一樣計重。
 */
export function getCarriedWeight(
  equippedGear: (EquipmentInstance | null | undefined)[],
  bagItems: BagItemLike[],
): number {
  const gear = equippedGear.reduce((sum, item) => sum + (item?.weight ?? 0), 0);
  const bag = bagItems.reduce(
    (sum, item) => sum + (getItemById(item.itemId)?.weight ?? 0) * item.amount,
    0,
  );
  return roundWeight(gear + bag);
}

/**
 * 重量是直接印在畫面上的數字，浮點的 `0.1 × 19` 會跑出 `1.9000000000000001`，
 * 所以**任何乘或加之後要顯示的重量都得先收過**，收到小數點後一位
 * （seed 目前最細就是一位小數）。
 *
 * 現行 seed 的重量全是整數（印記歸 0 之後不再有小數，見 `30-items.md` § 30.2），
 * 這層是給之後再出現小數重量時擋的，不是可以拿掉的死碼。
 */
export function roundWeight(weight: number): number {
  return Math.round(weight * 10) / 10;
}

export interface WeightStatus {
  carried: number;
  capacity: number;
  overweight: boolean;
}

export function getWeightStatus(
  character: Character,
  equippedGear: (EquipmentInstance | null | undefined)[],
  bagItems: BagItemLike[],
): WeightStatus {
  const carried = getCarriedWeight(equippedGear, bagItems);
  const capacity = getCarryCapacity(character, equippedGear);
  return { carried, capacity, overweight: carried > capacity };
}

/** 超重時顯示在戰鬥記錄的訊息。每次出手判定都會顯示一次。 */
export function getOverweightMessage(status: WeightStatus): string {
  return `負重超過上限（${status.carried} / ${status.capacity}），無法攻擊或施放魔法`;
}
