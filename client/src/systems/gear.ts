/**
 * 裝備的素質需求結算（`06-equipment.md` § 6A.8.8）。
 *
 * 需求未滿足時**仍可裝備**：基礎防禦、隨機額外防禦、強化與重量照算，
 * 只有那件的 4 條詞綴與 T7 獨有詞綴凍結。本模組是唯一的凍結入口 ——
 * 戰鬥、狀態面板、UI 一律先過 `getEffectiveGear()` 再往下算，
 * 各自判斷會漏掉「詞綴給的屬性也不該算」這件事。
 *
 * T7 獨有詞綴的同類去重（`07-affix-tier7.md` § 7T.3）也在這裡，排在凍結之後。
 */
import { getTotalAttributes, getGearAttributeBonus } from '../models/character';
import { ATTRIBUTE_KEYS } from '../models/attributes';
import type { Attributes } from '../models/attributes';
import { areAffixesActive, resolveActiveGear, SLOT_ORDER } from '../models/equipment';
import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { ActiveEffect } from '../models/effect';

/**
 * 把需求未滿足的件換成「詞綴清空」的副本，再把同類去重落敗的獨有詞綴拿掉，其餘欄位原樣保留。
 *
 * 起算值是角色自身屬性（建角＋升級配點＋buff，**不含裝備**），
 * 之後反覆納入需求已滿足的件 —— 最小固定點，見 `resolveActiveGear()`。
 * 沒有任何一件被改動時回傳原陣列，避免每幀產生新物件。
 */
export function getEffectiveGear(
  char: Character,
  activeEffects: ActiveEffect[],
  equippedGear: (EquipmentInstance | null)[],
): (EquipmentInstance | null)[] {
  return suppressDuplicateUniqueAffixes(freezeUnmetGear(char, activeEffects, equippedGear));
}

function freezeUnmetGear(
  char: Character,
  activeEffects: ActiveEffect[],
  equippedGear: (EquipmentInstance | null)[],
): (EquipmentInstance | null)[] {
  if (!equippedGear.some(g => g?.requiredAttributes)) return equippedGear;
  // 不傳 equippedGear：固定點的起算值不含任何裝備
  const self = getTotalAttributes(char, activeEffects);
  const active = resolveActiveGear(equippedGear, self);
  if (equippedGear.every(g => areAffixesActive(g, active) || !g)) return equippedGear;
  return equippedGear.map(g => (!g || areAffixesActive(g, active) ? g : { ...g, affixes: [], uniqueAffix: undefined }));
}

/** 同值時的部位順序（§ 7T.3）；部位相同再比 instance id */
function uniqueAffixRank(g: EquipmentInstance): [number, number] {
  return [SLOT_ORDER.indexOf(g.slot), g.id ?? Number.MAX_SAFE_INTEGER];
}

function outranks(a: EquipmentInstance, b: EquipmentInstance): boolean {
  const va = a.uniqueAffix!.value;
  const vb = b.uniqueAffix!.value;
  if (va !== vb) return va > vb;
  const [sa, ia] = uniqueAffixRank(a);
  const [sb, ib] = uniqueAffixRank(b);
  return sa !== sb ? sa < sb : ia < ib;
}

/**
 * 同類獨有詞綴只留一件生效的那些件（§ 7T.3）。傳入的陣列應已套過凍結 ——
 * 凍結件的獨有詞綴已清空，不參與比較。
 */
export function getSuppressedUniqueGear<T extends EquipmentInstance | null | undefined>(gear: T[]): Set<EquipmentInstance> {
  const winners = new Map<string, EquipmentInstance>();
  for (const g of gear) {
    if (!g?.uniqueAffix) continue;
    const current = winners.get(g.uniqueAffix.type);
    if (!current || outranks(g, current)) winners.set(g.uniqueAffix.type, g);
  }
  const losers = new Set<EquipmentInstance>();
  for (const g of gear) {
    if (g?.uniqueAffix && winners.get(g.uniqueAffix.type) !== g) losers.add(g);
  }
  return losers;
}

/** 落敗件換成拿掉 `uniqueAffix` 的副本。沒有落敗者時回傳原陣列 */
export function suppressDuplicateUniqueAffixes<T extends EquipmentInstance | null>(gear: T[]): T[] {
  const losers = getSuppressedUniqueGear(gear);
  if (losers.size === 0) return gear;
  return gear.map(g => (g && losers.has(g) ? { ...g, uniqueAffix: undefined } : g)) as T[];
}

/**
 * 這件已裝備的 T7 獨有詞綴是否因同類去重而未生效（UI 劃線用）。
 * 未裝備、沒有獨有詞綴、或已被素質需求凍結時回 false。
 */
export function isUniqueAffixSuppressed(
  char: Character,
  activeEffects: ActiveEffect[],
  gear: Record<string, EquipmentInstance | null | undefined>,
  item: EquipmentInstance,
): boolean {
  if (!item.uniqueAffix) return false;
  const list = Object.values(gear).filter((g): g is EquipmentInstance => !!g);
  const idx = list.findIndex(g => g === item || (item.id != null && g.id === item.id));
  if (idx < 0) return false;
  const frozen = freezeUnmetGear(char, activeEffects, list);
  const self = frozen[idx];
  if (!self?.uniqueAffix) return false;
  return getSuppressedUniqueGear(frozen).has(self);
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
  return getUnmetRequirement(char, activeEffects, equippedGear, item.requiredAttributes, item);
}

/**
 * 同上，但直接收需求本身 —— 商店與鐵匠鋪看的是**模板**，手上還沒有實例。
 * `exclude` 是「這件自己」，已裝備時要排掉自己的額外屬性（不可自我認證，§ 6A.8.8）。
 */
export function getUnmetRequirement(
  char: Character,
  activeEffects: ActiveEffect[],
  equippedGear: (EquipmentInstance | null)[],
  requirement: Partial<Attributes> | undefined,
  exclude?: EquipmentInstance,
): (keyof Attributes)[] {
  if (!requirement) return [];
  const self = getTotalAttributes(char, activeEffects);
  const others = equippedGear.filter(g => g && g !== exclude) as EquipmentInstance[];
  const active = resolveActiveGear(others, self);
  const total = { ...self };
  const admitted = suppressDuplicateUniqueAffixes(others.filter(g => areAffixesActive(g, active)));
  for (const k of ATTRIBUTE_KEYS) total[k] += getGearAttributeBonus(admitted, k);
  return ATTRIBUTE_KEYS.filter(k => (requirement[k] ?? 0) > total[k]);
}
