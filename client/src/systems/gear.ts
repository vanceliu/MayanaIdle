/**
 * 裝備的素質需求結算（`06-equipment.md` § 6A.8.8）。
 *
 * 需求未滿足時**仍可裝備**：基礎防禦、隨機額外防禦、強化與重量照算，
 * 只有那件的 4 條詞綴凍結。本模組是唯一的凍結入口 ——
 * 戰鬥、狀態面板、UI 一律先過 `getEffectiveGear()` 再往下算，
 * 各自判斷會漏掉「詞綴給的屬性也不該算」這件事。
 */
import { getTotalAttributes, getGearAttributeBonus } from '../models/character';
import { ATTRIBUTE_KEYS } from '../models/attributes';
import type { Attributes } from '../models/attributes';
import { areAffixesActive, resolveActiveGear } from '../models/equipment';
import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { ActiveEffect } from '../models/effect';

/**
 * 把需求未滿足的件換成「詞綴清空」的副本，其餘欄位原樣保留。
 *
 * 起算值是角色自身屬性（建角＋升級配點＋buff，**不含裝備**），
 * 之後反覆納入需求已滿足的件 —— 最小固定點，見 `resolveActiveGear()`。
 * 沒有任何一件被凍結時回傳原陣列，避免每幀產生新物件。
 */
export function getEffectiveGear(
  char: Character,
  activeEffects: ActiveEffect[],
  equippedGear: (EquipmentInstance | null)[],
): (EquipmentInstance | null)[] {
  if (!equippedGear.some(g => g?.requiredAttributes)) return equippedGear;
  // 不傳 equippedGear：固定點的起算值不含任何裝備
  const self = getTotalAttributes(char, activeEffects);
  const active = resolveActiveGear(equippedGear, self);
  if (equippedGear.every(g => areAffixesActive(g, active) || !g)) return equippedGear;
  return equippedGear.map(g => (!g || areAffixesActive(g, active) ? g : { ...g, affixes: [] }));
}

/**
 * 已裝備部位的陣列，且已套過素質需求的凍結。
 *
 * 取代散在各處的 `Object.values(equippedGear).filter(Boolean)` ——
 * 那個寫法拿到的是生詞綴，會把凍結的件也算進加成。
 */
export function getEffectiveGearArray(
  char: Character,
  activeEffects: ActiveEffect[],
  gear: Record<string, EquipmentInstance | null | undefined>,
): EquipmentInstance[] {
  const list = Object.values(gear).filter((g): g is EquipmentInstance => !!g);
  return getEffectiveGear(char, activeEffects, list) as EquipmentInstance[];
}

/**
 * 整套裡**詞綴被凍結**的那些件。UI 一次解完再逐格查，
 * 逐格各解一次會變成 O(部位²)，而且連鎖時每格看到的答案要一致。
 */
export function getFrozenGear(
  char: Character,
  activeEffects: ActiveEffect[],
  equippedGear: (EquipmentInstance | null | undefined)[],
): Set<EquipmentInstance> {
  const self = getTotalAttributes(char, activeEffects);
  const active = resolveActiveGear(equippedGear, self);
  const frozen = new Set<EquipmentInstance>();
  for (const g of equippedGear) {
    if (g && !areAffixesActive(g, active)) frozen.add(g);
  }
  return frozen;
}

/**
 * 這件裝備現在穿不穿得動 —— UI 用來標「素質不足 · 詞綴未生效」。
 *
 * `item` 不在 `equippedGear` 裡也可以問（商店、鐵匠鋪的預覽），會把它併進去一起解。
 * 一件**撐不起自己**：固定點納入它時，總和還沒加上它自己的額外屬性。
 */
export function isGearRequirementMet(
  char: Character,
  activeEffects: ActiveEffect[],
  equippedGear: (EquipmentInstance | null)[],
  item: EquipmentInstance,
): boolean {
  if (!item.requiredAttributes) return true;
  const pool = equippedGear.includes(item) ? equippedGear : [...equippedGear, item];
  const self = getTotalAttributes(char, activeEffects);
  return areAffixesActive(item, resolveActiveGear(pool, self));
}

/**
 * 需求裡**哪些屬性還沒達標**（UI 逐項標紅用）。回空陣列＝全部達標。
 * 判定基準與 `isGearRequirementMet()` 相同：不含這件自己的額外屬性。
 */
export function getUnmetAttributes(
  char: Character,
  activeEffects: ActiveEffect[],
  equippedGear: (EquipmentInstance | null)[],
  item: EquipmentInstance,
): (keyof Attributes)[] {
  const req = item.requiredAttributes;
  if (!req) return [];
  const self = getTotalAttributes(char, activeEffects);
  const others = equippedGear.filter(g => g && g !== item) as EquipmentInstance[];
  const active = resolveActiveGear(others, self);
  const total = { ...self };
  for (const g of others) {
    if (!areAffixesActive(g, active)) continue;
    for (const k of ATTRIBUTE_KEYS) total[k] += getGearAttributeBonus([g], k);
  }
  return ATTRIBUTE_KEYS.filter(k => (req[k] ?? 0) > total[k]);
}
