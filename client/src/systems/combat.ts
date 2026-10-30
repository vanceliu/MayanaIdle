import type { Character } from '../models/character';
import type { Attributes } from '../models/attributes';
import type { MonsterInstance } from '../models/monster';
import type { EquipmentInstance, WeaponMaterial } from '../models/equipment';
import { isAccessorySlot, enhancementCountsAsDefense, isRangedWeapon } from '../models/equipment';
import { getAccessoryMagicResist } from './enhancement';
import type { ActiveEffect } from '../models/effect';
import { getTotalAttributes, getEffectiveSTR, getEffectiveAGI, getEffectiveINT, getMagicResist } from '../models/character';
import { collectAffixBonuses, getEffectiveAffixValue, getBrandElement, HIT_DOWN_STAT, type AffixBonuses, type BrandElement } from '../models/affix';
import { sumUniqueAffix, type UniqueAffixType } from '../models/uniqueAffix';
import { random } from '../core/rng';
import { gameNow } from '../core/clock';

export type CombatLogType =
  | 'player_miss'
  | 'player_hit'
  | 'player_crit'
  | 'skill_hit'
  | 'skill_crit'
  | 'player_dodged'
  | 'monster_hit';

export interface CombatLog {
  type: CombatLogType;
  message: string;
}

export interface CombatResult {
  playerDamage: number;
  monsterDamage: number;
  playerHit: boolean;
  monsterHit: boolean;
  isCritical: boolean;
  playerDodged: boolean;
  logs: CombatLog[];
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

const MATERIAL_RACE_TABLE: Record<string, { races: string[]; min: number; max: number }> = {
  silver: { races: ['undead', 'demon'], min: 1, max: 4 },
  mithril: { races: ['undead'], min: 1, max: 6 },
  orichalcum: { races: ['undead'], min: 1, max: 10 },
  dragon: { races: ['dragon'], min: 1, max: 6 },
};

export function getMaterialRaceBonus(material: WeaponMaterial | undefined, monsterRace: string): number {
  if (!material) return 0;
  const entry = MATERIAL_RACE_TABLE[material];
  if (!entry) return 0;
  if (!entry.races.includes(monsterRace)) return 0;
  return randomInt(entry.min, entry.max);
}

/** 攻擊元素 → 被它克制的元素（§ 42.2）。 */
export const ELEMENT_COUNTER: Record<string, string> = {
  fire: 'wind',
  wind: 'earth',
  earth: 'ice',
  ice: 'fire',
  light: 'dark',
  dark: 'light',
};

/** 元素克制的固定額外攻擊（§ 42.2）：克制／無克制／被克制。攻擊方無屬性固定 0。 */
export const ELEMENT_COUNTER_BONUS = {
  advantage: 5,
  neutral: 3,
  disadvantage: 0,
} as const;

export function getElementCounterBonus(attackElement: string | undefined, monsterElement: string): number {
  if (!attackElement || attackElement === 'none') return 0;
  if (ELEMENT_COUNTER[attackElement] === monsterElement) return ELEMENT_COUNTER_BONUS.advantage;
  if (ELEMENT_COUNTER[monsterElement] === attackElement) return ELEMENT_COUNTER_BONUS.disadvantage;
  return ELEMENT_COUNTER_BONUS.neutral;
}

export function getFireEnchantBonus(activeEffects: ActiveEffect[]): number {
  const now = gameNow();
  let bonus = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (effect.category !== 'fire-enchant') continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === 'fire_damage' && !mod.isPercent) bonus += mod.value;
    }
  }
  return bonus;
}

export function hasActiveFireEnchant(activeEffects: ActiveEffect[]): boolean {
  const now = gameNow();
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (effect.category === 'fire-enchant') return true;
  }
  return false;
}

/** 角色 buff 的固定值加成（非百分比），例如 命中 +3、額外攻擊 +5 */
export function getBuffFlatBonus(activeEffects: ActiveEffect[], stat: string): number {
  const now = gameNow();
  let bonus = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === stat && !mod.isPercent) bonus += mod.value;
    }
  }
  return bonus;
}

/**
 * 遠程攻擊力加成：僅在裝備遠程武器（弓）時生效。
 * 見 21-combat-formula.md § 遠程攻擊力（普攻）
 */
export function getRangedAttackBonus(
  weapon: EquipmentInstance | null,
  activeEffects: ActiveEffect[],
): number {
  if (weapon?.type !== 'bow') return 0;
  return getBuffFlatBonus(activeEffects, 'ranged_attack');
}

export function getRaceHitBonus(activeEffects: ActiveEffect[], monsterRace: string): number {
  const now = gameNow();
  let bonus = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === `hit_${monsterRace}` && !mod.isPercent) bonus += mod.value;
    }
  }
  return bonus;
}

export function getMonsterDebuffModifier(activeEffects: ActiveEffect[], targetIdx: number, stat: string): number {
  const now = gameNow();
  let percentMod = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'debuff' || effect.target !== 'monster') continue;
    if (effect.targetIdx !== targetIdx) continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === stat && mod.isPercent) percentMod += mod.value;
    }
  }
  return percentMod;
}

/**
 * 角色身上 debuff 的百分比修正合計（詛咒 defense / 虛弱 attack / 減速 attack_speed）
 * 設計來源：docs/design/24-buff-debuff.md § 24.4.1
 */
export function getPlayerDebuffModifier(activeEffects: ActiveEffect[], stat: string): number {
  const now = gameNow();
  let percentMod = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'debuff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === stat && mod.isPercent) percentMod += mod.value;
    }
  }
  return percentMod;
}

function applyWeaken(damage: number, activeEffects: ActiveEffect[]): number {
  const weakenPercent = getPlayerDebuffModifier(activeEffects, 'attack');
  if (weakenPercent === 0) return damage;
  return Math.max(1, Math.floor(damage * (100 + weakenPercent) / 100));
}

/**
 * 以 monsterId 查詢怪物身上的 debuff 百分比修正。
 * targetIdx 會隨怪物死亡/生成而位移，需要跨 tick 穩定對應時使用此版本。
 */
export function getMonsterDebuffModifierById(
  activeEffects: ActiveEffect[],
  monsterId: string,
  stat: string,
): number {
  const now = gameNow();
  let percentMod = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'debuff' || effect.target !== 'monster') continue;
    if (effect.targetMonsterId !== monsterId) continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === stat && mod.isPercent) percentMod += mod.value;
    }
  }
  return percentMod;
}

/** 怪物身上的 debuff 修正：有 `targetId` 一律以 id 查（`24-buff-debuff.md`），未給時退回位置索引 */
function monsterDebuff(activeEffects: ActiveEffect[], targetIdx: number, targetId: string | undefined, stat: string): number {
  return targetId !== undefined
    ? getMonsterDebuffModifierById(activeEffects, targetId, stat)
    : getMonsterDebuffModifier(activeEffects, targetIdx, stat);
}

/** 無視防禦：直接扣減目標的減傷率 */
function applyIgnoreDefense(reduction: number, ignorePercent: number): number {
  if (ignorePercent <= 0) return reduction;
  return Math.max(0, Math.floor(reduction * (100 - Math.min(ignorePercent, 100)) / 100));
}

/** 強化可提升魔法攻擊的武器類型（§ 6.9：每 +2 強化 → 魔攻 +1） */
/**
 * 強化會提供魔法攻擊的**武器**類型（`06-equipment.md` § 6.9）。
 *
 * **`magicBook` 不在此列。** 魔導書是防具（§ 6.5：詞綴走防具池、用防具強化卷軸、
 * 走 § 6.10 的防具成功率），強化只給防禦。把它加回來會讓它成為唯一同時吃到
 * 武器強化與防具強化兩套效果的裝備 —— 兩套系統是獨立的，不可合併。
 * 魔導書的 `magicAttack` 基底照算，不受影響。
 */
const MAGIC_ATTACK_WEAPON_TYPES = new Set(['staff', 'twoHandStaff']);

/**
 * 手持武器的**唯一取用來源**：依 slot 語意取，右手優先，右手空手時才看左手。
 *
 * 不可改回用陣列位置（`equippedGear[0]`）—— 傳進戰鬥系統的陣列是
 * `Object.values(equippedGear).filter(Boolean)` 拍平的，順序是 record 的 key
 * 插入順序（＝ instance id 順序）。玩家一換掉新手武器，`rightHand` 就會排到
 * 防具後面，第 0 格變防具：武器基傷退回保底值 1，額外攻擊／攻擊成功／材質
 * 克制／火矢的 `isBow` 判定全部靜默失效。
 */
export function getEquippedWeapon(
  equippedGear: (EquipmentInstance | null)[],
): EquipmentInstance | null {
  return equippedGear.find(g => g?.slot === 'rightHand')
    ?? equippedGear.find(g => g?.slot === 'leftHand')
    ?? null;
}

/** 左手是否裝備盾牌（雙手武器佔用左手，必為 false） */
export function isShieldEquipped(equippedGear: (EquipmentInstance | null)[]): boolean {
  return equippedGear.some(g => g?.slot === 'leftHand' && g.type === 'shield');
}

/** 白字取哪一個：依怪物體型，或物理快照用的小怪大怪平均（§ 21.4a） */
export type WeaponDamageBasis = 'small' | 'large' | 'average';

/**
 * 武器基傷擲骰範圍（`21-combat-formula.md` § 21.3）：floor(W / 2) ~ W，W = 白字 + 強化。
 * 未裝備武器或無白字固定 1。
 */
export function getWeaponDamageRange(
  gear: EquipmentInstance | null,
  basis: WeaponDamageBasis,
): { min: number; max: number } {
  if (!gear) return { min: 1, max: 1 };
  const white = basis === 'average'
    ? Math.floor(((gear.smallMonsterDamage ?? 0) + (gear.largeMonsterDamage ?? 0)) / 2)
    : basis === 'small' ? gear.smallMonsterDamage : gear.largeMonsterDamage;
  if (white == null) return { min: 1, max: 1 };
  const max = white + (gear.enhancement ?? 0);
  return { min: Math.floor(max / 2), max };
}

export function rollWeaponDamage(gear: EquipmentInstance | null, basis: WeaponDamageBasis): number {
  const { min, max } = getWeaponDamageRange(gear, basis);
  return randomInt(min, max);
}

/**
 * 一次普攻打幾下（`21-combat-formula.md` § 21.4）。
 *
 * 雙刀與鋼爪是**雙持**武器，一次攻擊打兩下 —— 每下獨立判定命中與爆擊，
 * 額外攻擊、STR 加成、材質克制兩下都算（每下都是完整公式）。
 * 它們的基傷因此只有其他雙手武器的一半（`21-combat-formula.md` § 21.4）。
 */
/**
 * 一次攻擊裡**單獨一下**的結果。
 *
 * 多下判定（雙持雙擊、多段技能）要讓畫面一下跳一個數字，
 * 所以判定層不能只回合計 —— 合計看不出「第二下 MISS」。
 */
export interface HitBreakdown {
  damage: number;
  isCrit: boolean;
  isMiss: boolean;
}

export function getWeaponHitCount(weapon: EquipmentInstance | null): number {
  return weapon?.type === 'dualBlade' || weapon?.type === 'claw' ? 2 : 1;
}

/**
 * 裝備提供的魔法攻擊固定值。
 * 基底 `magicAttack` + 法杖／雙手法杖／魔導書的強化加成（§ 6.9 每 +2 強化 → 魔攻 +1）。
 * 依 `21-combat-formula.md` § 21.4 以固定值加算進基礎魔攻，不受 INT 倍率與攻擊力%詞綴影響。
 */
export function getTotalMagicAttack(equippedGear: (EquipmentInstance | null)[]): number {
  let total = 0;
  for (const g of equippedGear) {
    if (!g) continue;
    total += g.magicAttack ?? 0;
    if (MAGIC_ATTACK_WEAPON_TYPES.has(g.type)) {
      total += Math.floor((g.enhancement ?? 0) / 2);
    }
  }
  return total;
}

/**
 * 裝備防禦合計 —— 逐件三段相加（`21-combat-formula.md` § 21.5）：
 * 基礎 `defense` + 隨機額外 `defenseBonus`(0~2) + 強化等級，再加 T7 額外防禦（`07-affix-tier7.md`）。
 *
 * 後兩段與強化同一條規則：**看裝備分類，不看基礎防禦數值**，
 * 所以基礎 0 的 T4 上衣照樣吃隨機額外與強化，飾品則兩者都不計入。
 * 素質需求未滿足時三段全部照算（凍結的只有詞綴）。
 */
export function getTotalDefense(equippedGear: (EquipmentInstance | null)[]): number {
  return equippedGear.reduce((sum, g) => {
    if (!g) return sum;
    const counts = enhancementCountsAsDefense(g);
    const base = g.defense ?? 0;
    return sum + base + (counts ? (g.defenseBonus ?? 0) + (g.enhancement ?? 0) : 0);
  }, 0) + sumUniqueAffix(equippedGear, 'extra_defense');
}

/**
 * 可由 buff 提供的詞綴類加成。
 * 這些 stat 原本只從裝備詞綴聚合，導致同名的技能 buff 完全失效。
 */
const BUFFABLE_AFFIX_STATS = ['attack_power', 'crit_rate', 'crit_damage', 'skill_elemental', 'cooldown_reduction'] as const;

function getBuffPercentBonus(activeEffects: ActiveEffect[], stat: string): number {
  const now = gameNow();
  let bonus = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === stat && mod.isPercent) bonus += mod.value;
    }
  }
  return bonus;
}

/** 裝備詞綴 + 角色 buff 的合計加成 */
export function getCombatBonuses(
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
): AffixBonuses {
  const bonuses = getAffixBonusesFromGear(equippedGear);
  for (const stat of BUFFABLE_AFFIX_STATS) {
    bonuses[stat] += getBuffPercentBonus(activeEffects, stat);
  }
  return bonuses;
}

/**
 * 角色初始防禦（`21-combat-formula.md` § 21.5）。
 *
 * 防禦值**直接等於減傷百分比**，所以這個負值等於全體減傷少 10 個百分點。
 * 前 10 點裝備防禦形同填坑，前期生存壓力明顯，高階裝早已頂到 75% 上限故無感。
 */
export const BASE_CHARACTER_DEFENSE = -10;

/**
 * 最終防禦值：裝備防禦 + buff 固定防禦，套用防禦%詞綴與詛咒（防禦 -20%），
 * **最後**才加上角色初始防禦，再夾底於 0。
 *
 * 初始防禦**必須放在最後**，不可併進括號被防禦%詞綴放大（`21-combat-formula.md` § 21.5）。
 * 夾底於 0：裸裝時是 0% 減傷。
 *
 * 戰鬥與角色狀態面板共用同一支。
 */
export function getEffectiveDefense(
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[],
  defensePercent: number,
): number {
  return Math.max(0, getUnclampedDefense(equippedGear, activeEffects, defensePercent));
}

/**
 * 未夾底的最終防禦值 —— **顯示專用**，戰鬥一律走 `getEffectiveDefense()`。
 *
 * 起始防禦是 -10（§ 21.5），所以新手裝一整套也還在負值區。
 * 夾底到 0 顯示的話，玩家換上前幾件防具時面板紋風不動，看起來像裝備沒作用；
 * 顯示負值才看得出「還差幾點才開始減傷」。
 * 減傷率仍以夾底後的值計算，負防禦不會讓玩家承受超過 100% 傷害。
 */
export function getUnclampedDefense(
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[],
  defensePercent: number,
): number {
  const rawDefense = getTotalDefense(equippedGear) + getBuffDefenseBonus(activeEffects);
  const curseDefPercent = getPlayerDebuffModifier(activeEffects, 'defense');
  const geared = Math.floor(rawDefense * (1 + defensePercent / 100) * (100 + curseDefPercent) / 100);
  return geared + BASE_CHARACTER_DEFENSE;
}

/** T7 獨有詞綴中併入同名加成欄位的常駐數值（`07-affix-tier7.md` § 7T.2：與一般詞綴加算） */
const UNIQUE_AFFIX_BONUS_STATS: [keyof AffixBonuses, UniqueAffixType][] = [
  ['crit_rate', 'crit_rate'],
  ['crit_damage', 'crit_damage'],
  ['attack_speed', 'attack_speed'],
  ['drop_rate', 'drop_rate'],
  ['magic_resist', 'magic_resist'],
  ['evasion', 'evasion'],
];

/** 一般詞綴與 T7 獨有詞綴的合計。傳入的裝備須已過 `getEffectiveGear()`（凍結與同類去重） */
export function getAffixBonusesFromGear(equippedGear: (EquipmentInstance | null)[]): AffixBonuses {
  const validGear = equippedGear.filter((g): g is EquipmentInstance => g != null);
  const bonuses = collectAffixBonuses(validGear);
  for (const [stat, unique] of UNIQUE_AFFIX_BONUS_STATS) {
    bonuses[stat] += sumUniqueAffix(validGear, unique);
  }
  return bonuses;
}

/** § 21.9 格擋率上限 */
export const BLOCK_RATE_CAP = 50;

/** 格擋率：副手基礎 + 格擋率詞綴 + buff（T7 不朽壁壘），上限 50%。戰鬥與狀態面板共用 */
export function getPlayerBlockRate(
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
): number {
  let blockRate = getBuffFlatBonus(activeEffects, 'block_rate');
  for (const item of equippedGear) {
    if (!item) continue;
    if (item.blockRate) blockRate += item.blockRate;
    if (item.affixes) {
      for (const affix of item.affixes) {
        if (affix.type === 'block_rate') {
          blockRate += getEffectiveAffixValue(affix, item.quality);
        }
      }
    }
  }
  return Math.min(BLOCK_RATE_CAP, blockRate);
}

/** § 21.6 迴避率上限 */
export const DODGE_RATE_CAP = 35;

/**
 * 迴避率（§ 21.6）：基礎 + AGI + 防禦溢出 + 迴避詞綴（一般與 T7）+ 迴避 buff，上限 35%。
 * 命中下降不在此列 —— 它只對施加對象生效，且加在上限之後（`calculateMonsterAttack()`）。
 * 戰鬥與狀態面板共用。
 */
export function getPlayerDodgeRate(
  char: Character,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
): number {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const bonuses = getCombatBonuses(equippedGear, activeEffects);
  const baseDodge = char.className === 'thief' ? 10 : 5;
  const agiDodge = Math.floor(getEffectiveAGI(attrs.AGI) / 3);
  const finalDefense = getEffectiveDefense(equippedGear, activeEffects, bonuses.defense);
  const defOverflowDodge = finalDefense > DAMAGE_REDUCTION_CAP ? Math.floor((finalDefense - DAMAGE_REDUCTION_CAP) / 5) : 0;
  const buffDodge = getBuffPercentBonus(activeEffects, 'evasion') + getBuffFlatBonus(activeEffects, 'evasion');
  return Math.min(DODGE_RATE_CAP, baseDodge + agiDodge + defOverflowDodge + bonuses.evasion + buffDodge);
}

/** buff 提供的魔法抗性（T7 受擊魔抗，`07-affix-tier7.md`） */
export function getBuffMagicResist(activeEffects: ActiveEffect[]): number {
  return getBuffFlatBonus(activeEffects, 'magic_resist');
}

/** § 21.5：防禦減傷（含魔法）的總上限 */
export const DAMAGE_REDUCTION_CAP = 75;
/** § 21.16：裝備防禦對魔法傷害只有一半效力 */
export const MAGIC_DEFENSE_EFFECTIVENESS = 0.5;
/** § 21.16：因此裝備防禦對魔法的減傷貢獻上限為物理上限的一半（75 × 0.5 = 37.5%） */
export const MAGIC_DEFENSE_CONTRIBUTION_CAP = DAMAGE_REDUCTION_CAP * MAGIC_DEFENSE_EFFECTIVENESS;

/**
 * 裝備防禦對魔法傷害的減傷貢獻（§ 21.16）：先套物理上限，再取一半。
 * 等價於 `min(最終防禦 / 2, 37.5)`。
 */
export function getMagicDefenseContribution(finalDefense: number): number {
  return Math.min(finalDefense, DAMAGE_REDUCTION_CAP) * MAGIC_DEFENSE_EFFECTIVENESS;
}

/**
 * 裝備提供的魔法抗性（%）：詞綴（受品質放大）+ 飾品強化（每 +1 給 2%）。
 * 見 `21-combat-formula.md` § 21.16。
 */
export function getGearMagicResist(equippedGear: (EquipmentInstance | null)[]): number {
  const affixResist = getAffixBonusesFromGear(equippedGear).magic_resist;
  let enhanceResist = 0;
  for (const g of equippedGear) {
    if (!g || !isAccessorySlot(g.slot)) continue;
    enhanceResist += getAccessoryMagicResist(g.enhancement ?? 0);
  }
  return affixResist + enhanceResist;
}

/** 角色的魔法抗性總值：SPI + 裝備（詞綴與飾品強化） */
export function getTotalMagicResist(
  char: Character,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
): number {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  return getMagicResist(attrs.SPI) + getGearMagicResist(equippedGear) + getBuffMagicResist(activeEffects);
}

const BASE_ATTACK_INTERVAL_MS = 1200;
const MIN_ATTACK_INTERVAL_MS = 300;

/**
 * 攻速百分比合計：裝備詞綴 + 加速 buff + 減速 debuff。
 * 戰鬥與角色狀態面板共用。
 */
export function getTotalAttackSpeedPercent(
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
): number {
  return getAffixBonusesFromGear(equippedGear).attack_speed
    + getBuffPercentBonus(activeEffects, 'attack_speed')
    + getPlayerDebuffModifier(activeEffects, 'attack_speed');
}

export function getPlayerAttackInterval(equippedGear: (EquipmentInstance | null)[], activeEffects: ActiveEffect[] = []): number {
  const attackSpeedPercent = getTotalAttackSpeedPercent(equippedGear, activeEffects);
  const interval = Math.floor(BASE_ATTACK_INTERVAL_MS / Math.max(0.1, 1 + attackSpeedPercent / 100));
  return Math.max(MIN_ATTACK_INTERVAL_MS, interval);
}

/**
 * § 20.6：INT 每 2 點提供的技能威力%。
 *
 * 9.5 ＝ 每 2 點 +9.5%，即 `INT加成 = floor(技能攻擊力 × (有效INT / 2 × 0.095))`（§ 21.4）。
 * 這個值與 `MAGIC_ATTACK_PERCENT_PER_POINT` 共同決定基礎魔攻的組成 ——
 * 滿裝法系（有效INT 42、裝備魔攻 15）為 智力 50%／技能攻擊力 25%／裝備魔攻 25%。
 * 技能攻擊力表已依此係數縮放（§ 22.4、§ 23.7.1），**改係數就要重新縮表**。
 */
export const INT_SKILL_DAMAGE_PERCENT_PER_2 = 9.5;

/**
 * § 21.4：裝備魔攻每 1 點換算的技能威力%。
 *
 * 6.5 ＝ 滿裝魔攻 15 點給 +97.5%，讓裝備魔攻與技能攻擊力本體在基礎魔攻裡各佔約 25%。
 * 它是**乘在技能攻擊力上的乘區**，不是加項 —— 同一件魔攻裝備在高階魔法上給的絕對值更大。
 *
 * 與 `INT_SKILL_DAMAGE_PERCENT_PER_2` 是一組的：兩者任一改動都會讓 50:25:25 跑掉，
 * 也都需要重新縮技能攻擊力表並重跑 `scripts/simulateReaperKill.mts` 驗證。
 */
export const MAGIC_ATTACK_PERCENT_PER_POINT = 6.5;

/**
 * § 21.4 的「技能側」：`floor(技能攻擊力 × (1 + 裝備魔攻%)) + INT加成`。
 *
 * 傷害與治癒共用同一段 —— 傷害在這之上再加元素克制（`getBaseMagicAttack()`），
 * 治癒則換上治癒效果%乘區（`calculateHealAmount()`）。
 * **兩邊不可各自展開這段算式**：任何一次係數調整都必須同時反映在傷害與治癒上。
 */
export function getSkillSideValue(
  char: Character,
  skillPower: number,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[],
): number {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const effINT = getEffectiveINT(attrs.INT);
  const intBonus = Math.floor(skillPower * (effINT / 2 * INT_SKILL_DAMAGE_PERCENT_PER_2) / 100);
  const magicAttack = getTotalMagicAttack(equippedGear) + getBuffFlatBonus(activeEffects, 'magic_attack');
  const magicAttackPercent = magicAttack * MAGIC_ATTACK_PERCENT_PER_POINT;
  return Math.floor(skillPower * (1 + magicAttackPercent / 100)) + intBonus;
}

/**
 * 治癒量（`21-combat-formula.md` § 21.4c）。
 *
 * 與傷害走**同一條技能側公式**，兩點差異：
 * - 沒有元素克制
 * - 最後的乘區是「治癒效果%」而非「技能元素傷害%」
 *
 * **唯一實作**：常駐腳本、戰鬥腳本、快捷格手動施放全部走這一支。
 * 回傳的是「打算回多少」，呼叫端自行夾在有效最大 HP 之內。
 */
export function calculateHealAmount(
  char: Character,
  skillPower: number,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
): number {
  const base = getSkillSideValue(char, skillPower, equippedGear, activeEffects);
  const healEffect = getAffixBonusesFromGear(equippedGear).heal_effect;
  return Math.floor(base * (1 + healEffect / 100));
}

/** § 20.6：INT 每 2 點提供的冷卻縮減% */
export const INT_COOLDOWN_PERCENT_PER_2 = 1;
/** § 21.4：冷卻縮減總上限 */
export const COOLDOWN_REDUCTION_CAP = 50;

/** INT 提供的冷卻縮減%（未套上限）：`有效INT / 2 × 1%` */
export function getIntCooldownReduction(
  char: Character,
  activeEffects: ActiveEffect[] = [],
  equippedGear: (EquipmentInstance | null)[] = [],
): number {
  const effINT = getEffectiveINT(getTotalAttributes(char, activeEffects, equippedGear).INT);
  return (effINT / 2) * INT_COOLDOWN_PERCENT_PER_2;
}

/**
 * 技能冷卻縮減總量：「減少冷卻時間」詞綴 + 冷卻縮減 buff + INT，加總後受 50% 上限。
 */
export function getSkillCooldownReduction(
  char: Character,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
): number {
  const bonuses = getCombatBonuses(equippedGear, activeEffects);
  const total = bonuses.cooldown_reduction + getIntCooldownReduction(char, activeEffects, equippedGear);
  return Math.min(total, COOLDOWN_REDUCTION_CAP);
}

/**
 * 武器的元素（`07-affix.md` § 7.4）。
 * **唯一來源是武器自己的「元素刻印」詞綴** —— 沒有刻印的武器就是無屬性，
 * 不吃元素刻印的乘區、也不吃 § 21.15 的克制加成。
 */
export function getWeaponElement(weapon: EquipmentInstance | null): BrandElement | undefined {
  return getBrandElement(weapon?.affixes);
}

/**
 * 普攻基礎攻擊力裡的屬性加成（`21-combat-formula.md` § 21.3）。
 *
 * | 武器 | 屬性 |
 * |---|---|
 * | 近戰（劍／斧／錘／杖／雙刀／鋼爪） | 有效力量 / 2 |
 * | 遠程（弓） | 有效敏捷 / 2 |
 *
 * 換算率相同，但有效敏捷走每 3 點門檻、有效力量走每 2 點（`20-attributes.md` § 20.2），
 * 所以遠程的每點邊際比近戰鈍。盜賊的雙刀與鋼爪是近戰，維持吃力量。
 */
export function getWeaponAttributeBonus(
  weapon: EquipmentInstance | null,
  attrs: Attributes,
): number {
  const effective = isRangedWeapon(weapon?.type)
    ? getEffectiveAGI(attrs.AGI)
    : getEffectiveSTR(attrs.STR);
  return Math.floor(effective / 2);
}

export function getWeaponAttackSuccess(weapon: EquipmentInstance | null): number {
  if (!weapon) return 0;
  const baseSuccess = weapon.attackSuccess ?? 0;
  const enhanceBonus = Math.floor((weapon.enhancement ?? 0) / 2);
  return baseSuccess + enhanceBonus;
}


export function calculateBasePhysicalDamage(
  char: Character,
  weapon: EquipmentInstance | null,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
  /** 火矢附魔 +15 只作用於普攻（`23-class-magic.md` § 23.4）；A 組技能傳 false */
  includeFireEnchant = true,
): number {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  const weaponDmg = rollWeaponDamage(weapon, 'average');
  const strBonus = getWeaponAttributeBonus(weapon, attrs);
  const rawFireEnchantDmg = getFireEnchantBonus(activeEffects);
  const isBow = weapon?.type === 'bow';
  const fireEnchantDmg = isBow && includeFireEnchant ? rawFireEnchantDmg : 0;

  let damage = weaponDmg + strBonus + (weapon?.extraAttack ?? 0) + getRangedAttackBonus(weapon, activeEffects) + fireEnchantDmg;
  damage = Math.floor(damage * (1 + bonuses.attack_power / 100));
  // 虛弱作用於最終傷害（§ 21.3）——此函式不含防禦減傷，最末端即為最終值
  damage = applyWeaken(damage, activeEffects);

  return Math.max(1, damage);
}

export function calculatePlayerAttack(
  char: Character,
  weapon: EquipmentInstance | null,
  monster: MonsterInstance,
  equippedGear: (EquipmentInstance | null)[] = [],
  activeEffects: ActiveEffect[] = [],
  targetIdx: number = 0,
  /** 目標怪物 id；有給時以 id 查怪物 debuff */
  targetId?: string,
): { damage: number; hit: boolean; isCritical: boolean; hits: HitBreakdown[]; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const effAGI = getEffectiveAGI(attrs.AGI);
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  // Hit check (with weapon attackSuccess and race hit bonus from buffs)
  const baseHit = 80;
  const agiBonus = Math.floor(effAGI / 3);
  const levelDiff = char.level - monster.level;
  const monsterDodge = 5;
  const weaponHitBonus = getWeaponAttackSuccess(weapon);
  const raceHitBonus = getRaceHitBonus(activeEffects, monster.race);
  const buffHitBonus = getBuffFlatBonus(activeEffects, 'hit');
  const hitRate = Math.min(95, Math.max(5, baseHit + agiBonus + weaponHitBonus + levelDiff + raceHitBonus + buffHitBonus - monsterDodge));

  // `21-combat-formula.md` § 21.4：雙刀與鋼爪是雙持，一次攻擊打兩下，每下獨立判定命中與爆擊
  const hitCount = getWeaponHitCount(weapon);
  const strBonus = getWeaponAttributeBonus(weapon, attrs);
  const rawFireEnchantDmg = getFireEnchantBonus(activeEffects);
  const isBow = weapon?.type === 'bow';
  const fireEnchantDmg = isBow ? rawFireEnchantDmg : 0;
  const hasFireEnchantActive = rawFireEnchantDmg > 0;
  const brandElement = getWeaponElement(weapon);
  const attackElement = brandElement ?? (hasFireEnchantActive ? 'fire' : undefined);
  const hasElement = !!brandElement || hasFireEnchantActive;
  const critRate = Math.min(75, 5 + bonuses.crit_rate);
  const defDebuffPercent = monsterDebuff(activeEffects, targetIdx, targetId, 'defense');
  const effectiveMonsterDef = Math.max(0, Math.floor(monster.defense * (100 + defDebuffPercent) / 100));
  const monsterReduction = Math.min(effectiveMonsterDef, 75);

  let total = 0;
  let anyHit = false;
  let anyCrit = false;
  /**
   * 逐下明細 —— 演出層要一下跳一個數字（`48-vfx.md` § 48.7.3）。
   * 只回合計的話，畫面沒有辦法把「第二下 MISS」這件事表現出來。
   */
  const hits: HitBreakdown[] = [];

  for (let i = 0; i < hitCount; i++) {
    if (!(random() * 100 < hitRate)) {
      hits.push({ damage: 0, isCrit: false, isMiss: true });
      continue;
    }
    anyHit = true;
    let hitCrit = false;

    // Base damage (including race/element counter bonuses)
    let damage = rollWeaponDamage(weapon, monster.size) + strBonus + (weapon?.extraAttack ?? 0)
      + getBuffFlatBonus(activeEffects, 'extra_attack') + getRangedAttackBonus(weapon, activeEffects)
      + fireEnchantDmg + getMaterialRaceBonus(weapon?.material, monster.race)
      + getElementCounterBonus(attackElement, monster.element);

    // Apply attack% multiplier
    damage = Math.floor(damage * (1 + bonuses.attack_power / 100));

    // Apply attack elemental% multiplier (weapon element OR fire enchant)
    if (hasElement) {
      damage = Math.floor(damage * (1 + bonuses.element_brand / 100));
    }

    // Critical check
    if (random() * 100 < critRate) {
      anyCrit = true;
      hitCrit = true;
      damage = Math.floor(damage * (2.0 + bonuses.crit_damage / 100));
    }

    // Monster defense reduction (last, with debuff)
    damage = Math.max(1, Math.floor(damage * (100 - monsterReduction) / 100));

    // 虛弱 debuff（攻擊力 -20%）作用於最終傷害（§ 21.3）
    const final = applyWeaken(damage, activeEffects);
    total += final;
    hits.push({ damage: final, isCrit: hitCrit, isMiss: false });
  }

  if (!anyHit) {
    return {
      damage: 0, hit: false, isCritical: false, hits,
      log: { type: 'player_miss', message: '攻擊未命中' },
    };
  }

  const prefix = hitCount > 1 ? '雙擊！' : '';
  const log: CombatLog = anyCrit
    ? { type: 'player_crit', message: `${prefix}暴擊！對 ${monster.name} 造成 ${total} 點傷害` }
    : { type: 'player_hit', message: `${prefix}對 ${monster.name} 造成 ${total} 點傷害` };

  return { damage: total, hit: true, isCritical: anyCrit, hits, log };
}

export function calculatePhysicalSkillHit(
  char: Character,
  weapon: EquipmentInstance | null,
  monster: MonsterInstance,
  equippedGear: (EquipmentInstance | null)[],
  hasFireEnchant: boolean,
  skillName: string,
  activeEffects: ActiveEffect[] = [],
  targetIdx: number = 0,
  ignoreDefensePercent: number = 0,
  targetId?: string,
): { damage: number; hit: boolean; isCritical: boolean; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const effAGI = getEffectiveAGI(attrs.AGI);
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  // Hit check (each hit independently, with weapon attackSuccess and race hit bonus)
  const baseHit = 80;
  const agiBonus = Math.floor(effAGI / 3);
  const levelDiff = char.level - monster.level;
  const monsterDodge = 5;
  const weaponHitBonus = getWeaponAttackSuccess(weapon);
  const raceHitBonus = getRaceHitBonus(activeEffects, monster.race);
  const buffHitBonus = getBuffFlatBonus(activeEffects, 'hit');
  const hitRate = Math.min(95, Math.max(5, baseHit + agiBonus + weaponHitBonus + levelDiff + raceHitBonus + buffHitBonus - monsterDodge));

  const hit = random() * 100 < hitRate;
  if (!hit) {
    return {
      damage: 0,
      hit: false,
      isCritical: false,
      log: { type: 'player_miss', message: `${skillName} 未命中` },
    };
  }

  // Base damage (physical formula, including race/element counter bonuses + fire enchant)
  const weaponDmg = rollWeaponDamage(weapon, monster.size);
  const strBonus = getWeaponAttributeBonus(weapon, attrs);
  const fireEnchantDmg = hasFireEnchant ? getFireEnchantBonus(activeEffects) : 0;
  const brandElement = getWeaponElement(weapon);
  const attackElement = brandElement ?? (hasFireEnchant ? 'fire' : undefined);
  let damage = weaponDmg + strBonus + (weapon?.extraAttack ?? 0) + getBuffFlatBonus(activeEffects, 'extra_attack') + getRangedAttackBonus(weapon, activeEffects) + fireEnchantDmg + getMaterialRaceBonus(weapon?.material, monster.race) + getElementCounterBonus(attackElement, monster.element);

  // Apply attack% multiplier
  damage = Math.floor(damage * (1 + bonuses.attack_power / 100));

  // Apply attack elemental% multiplier (weapon element OR fire enchant)
  const hasElement = !!brandElement || hasFireEnchant;
  if (hasElement) {
    damage = Math.floor(damage * (1 + bonuses.element_brand / 100));
  }

  // Critical check
  const critRate = Math.min(75, 5 + bonuses.crit_rate);
  const isCritical = random() * 100 < critRate;
  if (isCritical) {
    const critMultiplier = 2.0 + bonuses.crit_damage / 100;
    damage = Math.floor(damage * critMultiplier);
  }

  // Monster defense reduction (last, with debuff)
  const defDebuffPercent = monsterDebuff(activeEffects, targetIdx, targetId, 'defense');
  const effectiveMonsterDef2 = Math.max(0, Math.floor(monster.defense * (100 + defDebuffPercent) / 100));
  const monsterReduction = applyIgnoreDefense(Math.min(effectiveMonsterDef2, 75), ignoreDefensePercent);
  damage = Math.max(1, Math.floor(damage * (100 - monsterReduction) / 100));

  // 虛弱 debuff（攻擊力 -20%）作用於最終傷害（§ 21.3）
  damage = applyWeaken(damage, activeEffects);

  const log: CombatLog = isCritical
    ? { type: 'skill_crit', message: `${skillName} 暴擊！對 ${monster.name} 造成 ${damage} 點傷害` }
    : { type: 'skill_hit', message: `${skillName} 對 ${monster.name} 造成 ${damage} 點傷害` };

  return { damage, hit: true, isCritical, log };
}

/**
 * 基礎魔攻（`21-combat-formula.md` § 21.4）：
 * `floor(技能攻擊力 × (1 + 裝備魔攻/100)) + INT加成 + 元素克制`。
 *
 * **裝備魔攻是乘區不是加項** —— 它乘在技能攻擊力上，因此高階魔法才吃得到魔攻的價值。
 *
 * § 21.4 的魔法技能與 § 21.4a 的物理快照技能共用這一段，
 * 兩者的技能側必須完全一致 —— 不可各算各的。
 */
export function getBaseMagicAttack(
  char: Character,
  skillPower: number,
  skillElement: string,
  monster: MonsterInstance,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[],
): number {
  return getSkillSideValue(char, skillPower, equippedGear, activeEffects)
    + getElementCounterBonus(skillElement, monster.element);
}

/**
 * 物理快照技能（`21-combat-formula.md` § 21.4a）：盾擊／裂傷斬／挑釁怒吼。
 *
 * `傷害 = 基礎魔攻 + 當下基礎物理傷害` → 爆擊 → 怪物防禦減傷。
 *
 * 技能側與 § 21.4 完全相同（含 INT 加成與裝備魔攻）；
 * 物理側取 `calculateBasePhysicalDamage()`（與流血／毒 DoT 的快照同一顆），
 * 因此含 STR 加成、強化、額外攻擊、攻擊力%與虛弱，**不含元素刻印%與材質種族克制**。
 * 與普攻不同的是**必定命中**，不做命中判定。
 */
export function calculatePhysicalSnapshotSkill(
  char: Character,
  skillPower: number,
  skillElement: string,
  weapon: EquipmentInstance | null,
  monster: MonsterInstance,
  equippedGear: (EquipmentInstance | null)[] = [],
  skillName: string = '技能',
  activeEffects: ActiveEffect[] = [],
  targetIdx: number = 0,
  ignoreDefensePercent: number = 0,
  targetId?: string,
): { damage: number; isCritical: boolean; log: CombatLog } {
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  let damage = getBaseMagicAttack(char, skillPower, skillElement, monster, equippedGear, activeEffects)
    + calculateBasePhysicalDamage(char, weapon, equippedGear, activeEffects, false);

  const critRate = Math.min(75, 5 + bonuses.crit_rate);
  const isCritical = random() * 100 < critRate;
  if (isCritical) {
    damage = Math.floor(damage * (2.0 + bonuses.crit_damage / 100));
  }

  const defDebuffPercent = monsterDebuff(activeEffects, targetIdx, targetId, 'defense');
  const effectiveMonsterDef = Math.max(0, Math.floor(monster.defense * (100 + defDebuffPercent) / 100));
  const monsterReduction = applyIgnoreDefense(Math.min(effectiveMonsterDef, 75), ignoreDefensePercent);
  damage = Math.max(1, Math.floor(damage * (100 - monsterReduction) / 100));

  const log: CombatLog = isCritical
    ? { type: 'skill_crit', message: `${skillName} 暴擊！對 ${monster.name} 造成 ${damage} 點傷害` }
    : { type: 'skill_hit', message: `${skillName} 對 ${monster.name} 造成 ${damage} 點傷害` };

  return { damage, isCritical, log };
}

export function calculateSkillAttack(
  char: Character,
  skillPower: number,
  skillElement: string,
  monster: MonsterInstance,
  equippedGear: (EquipmentInstance | null)[] = [],
  skillName: string = '技能',
  activeEffects: ActiveEffect[] = [],
  targetIdx: number = 0,
  ignoreDefensePercent: number = 0,
  targetId?: string,
  /** § 21.8：只有物理系技能（`Skill.physicalDamage`）判定爆擊 */
  canCrit: boolean = false,
): { damage: number; isCritical: boolean; log: CombatLog } {
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  // § 21.4：基礎魔攻 = 技能攻擊力 + INT加成 + 裝備魔攻 + 元素克制
  let damage = getBaseMagicAttack(char, skillPower, skillElement, monster, equippedGear, activeEffects);

  // Apply skill elemental% multiplier (only if skill has element)
  if (skillElement && skillElement !== 'none') {
    damage = Math.floor(damage * (1 + bonuses.skill_elemental / 100));
  }

  const isCritical = canCrit && random() * 100 < Math.min(75, 5 + bonuses.crit_rate);
  if (isCritical) {
    damage = Math.floor(damage * (2.0 + bonuses.crit_damage / 100));
  }

  // Monster defense reduction (last, with debuff)
  const defDebuffPercent = monsterDebuff(activeEffects, targetIdx, targetId, 'defense');
  const effectiveMonsterDef3 = Math.max(0, Math.floor(monster.defense * (100 + defDebuffPercent) / 100));
  const monsterReduction = applyIgnoreDefense(Math.min(effectiveMonsterDef3, 75), ignoreDefensePercent);
  damage = Math.max(1, Math.floor(damage * (100 - monsterReduction) / 100));

  const log: CombatLog = isCritical
    ? { type: 'skill_crit', message: `${skillName} 暴擊！對 ${monster.name} 造成 ${damage} 點傷害` }
    : { type: 'skill_hit', message: `${skillName} 對 ${monster.name} 造成 ${damage} 點傷害` };

  return { damage, isCritical, log };
}

export function calculateMpRestored(
  damage: number,
  mpDrainRatio: number | undefined,
  currentMp: number,
  maxMp: number,
): number {
  if (!mpDrainRatio || damage <= 0 || currentMp >= maxMp) return 0;
  const requested = Math.floor(damage * mpDrainRatio);
  return Math.max(0, Math.min(requested, maxMp - currentMp));
}

/**
 * 生效中 buff 提供的減傷率（%），同類加算。
 * 與防禦減傷「類間乘算」，見 21-combat-formula.md § 21.5。
 */
export interface ShieldAbsorbResult {
  /** 扣除吸收後實際造成的傷害 */
  damage: number;
  /** 本次被護盾吸收的量 */
  absorbed: number;
  /** 更新後的效果清單（護盾耗盡的效果已移除） */
  effects: ActiveEffect[];
  /** 是否有護盾在本次被打破 */
  broken: boolean;
}

/**
 * 護盾吸收：在所有減傷之後結算，優先扣除護盾池（§ 24.4.9）。
 * 護盾剩餘量歸零時該 buff 立即消失。
 */
export function absorbWithShield(
  damage: number,
  activeEffects: ActiveEffect[],
  now: number = gameNow(),
): ShieldAbsorbResult {
  if (damage <= 0) return { damage, absorbed: 0, effects: activeEffects, broken: false };

  let remaining = damage;
  let absorbed = 0;
  let broken = false;
  const effects: ActiveEffect[] = [];

  for (const effect of activeEffects) {
    const isActiveShield = effect.type === 'buff'
      && effect.target === 'player'
      && effect.shieldRemaining !== undefined
      && effect.shieldRemaining > 0
      && now < effect.startTime + effect.duration;

    if (!isActiveShield || remaining <= 0) {
      effects.push(effect);
      continue;
    }

    const pool = effect.shieldRemaining!;
    const used = Math.min(pool, remaining);
    remaining -= used;
    absorbed += used;

    const left = pool - used;
    if (left <= 0) {
      broken = true; // 護盾破裂，效果移除
    } else {
      effects.push({ ...effect, shieldRemaining: left });
    }
  }

  return { damage: remaining, absorbed, effects, broken };
}

export interface ManaShieldResult {
  /** 扣除 MP 承擔後仍要扣 HP 的傷害 */
  damage: number;
  /** 本次扣掉的 MP */
  mpUsed: number;
  /** 更新後的效果清單（MP 歸 0 時魔力護盾已移除） */
  effects: ActiveEffect[];
  /** 魔力護盾是否因 MP 歸 0 解除 */
  broken: boolean;
}

/**
 * 魔力護盾（`23-class-magic.md` § 23.5）：聖光護盾吸收之後，剩餘傷害的 X%（無條件捨去）
 * 改扣 MP，1 點傷害扣 1 MP；MP 不足的部分照扣 HP。MP 歸 0 時護盾解除。
 */
export function absorbWithManaShield(
  damage: number,
  mp: number,
  activeEffects: ActiveEffect[],
  now: number = gameNow(),
): ManaShieldResult {
  const shield = activeEffects.find(e => e.type === 'buff' && e.target === 'player'
    && now < e.startTime + e.duration
    && e.modifiers?.some(m => m.stat === MANA_SHIELD_STAT));
  if (!shield || damage <= 0) return { damage, mpUsed: 0, effects: activeEffects, broken: false };

  const percent = shield.modifiers!.find(m => m.stat === MANA_SHIELD_STAT)!.value;
  const mpUsed = Math.min(Math.floor(damage * percent / 100), Math.max(0, mp));
  const broken = mp - mpUsed <= 0;
  return {
    damage: damage - mpUsed,
    mpUsed,
    effects: broken ? activeEffects.filter(e => e !== shield) : activeEffects,
    broken,
  };
}

/** 魔力護盾的 buff 修正值 stat：傷害改由 MP 承擔的百分比 */
export const MANA_SHIELD_STAT = 'mana_shield';

/**
 * 煙霧彈的絕對迴避（`23-class-magic.md` § 23.7）：有剩餘次數就扣 1，歸 0 移除該 buff。
 * 回 null ＝ 沒有可用的次數。
 */
export function consumeEvadeCharge(activeEffects: ActiveEffect[], now: number = gameNow()): ActiveEffect[] | null {
  const idx = activeEffects.findIndex(e => e.type === 'buff' && e.target === 'player'
    && (e.evadeCharges ?? 0) > 0 && now < e.startTime + e.duration);
  if (idx < 0) return null;
  const left = activeEffects[idx].evadeCharges! - 1;
  return left > 0
    ? activeEffects.map((e, i) => (i === idx ? { ...e, evadeCharges: left } : e))
    : activeEffects.filter((_, i) => i !== idx);
}

/** 是否處於無敵狀態（絕對屏障）：完全免疫傷害 */
export function isPlayerInvincible(activeEffects: ActiveEffect[], now: number = gameNow()): boolean {
  return activeEffects.some(
    e => e.type === 'buff' && e.target === 'player' && e.invincible && now < e.startTime + e.duration
  );
}

export function getBuffDamageReduction(activeEffects: ActiveEffect[]): number {
  const now = gameNow();
  let reduction = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === 'damageReduction' && mod.isPercent) reduction += mod.value;
    }
  }
  return Math.min(reduction, 100);
}

export function getBuffDefenseBonus(activeEffects: ActiveEffect[]): number {
  const now = gameNow();
  let bonus = 0;
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === 'defense' && !mod.isPercent) bonus += mod.value;
    }
  }
  return bonus;
}

export function calculateMonsterAttack(
  monster: MonsterInstance,
  char: Character,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
  monsterIdx: number = 0,
  /** 詠唱攻擊的傷害倍率，套在基礎傷害上（`25-monster-system.md` § 25.11） */
  damageMultiplier: number = 1,
  /** 有給時以 id 查命中下降與攻擊下降（跨 tick 穩定）；未給時退回 `monsterIdx` */
  monsterId?: string,
): { damage: number; hit: boolean; dodged: boolean; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  // 無敵：完全免疫傷害（§ 24.4.8）
  if (isPlayerInvincible(activeEffects)) {
    return {
      damage: 0,
      hit: false,
      dodged: false,
      log: { type: 'player_dodged', message: `無敵！完全擋下 ${monster.name} 的攻擊` },
    };
  }

  // § 21.6 迴避；命中下降（§ 7.9）以負值存在怪物身上，加在 35% 上限之後
  const finalDefense = getEffectiveDefense(equippedGear, activeEffects, bonuses.defense);
  const hitDown = monsterDebuff(activeEffects, monsterIdx, monsterId, HIT_DOWN_STAT);
  const dodgeRate = getPlayerDodgeRate(char, equippedGear, activeEffects) - hitDown;

  const dodged = random() * 100 < dodgeRate;
  if (dodged) {
    return {
      damage: 0,
      hit: false,
      dodged: true,
      log: { type: 'player_dodged', message: `迴避了 ${monster.name} 的攻擊` },
    };
  }

  // Monster damage (apply attack debuffs)
  let rawDamage = randomInt(monster.attackMin, monster.attackMax);
  if (damageMultiplier !== 1) {
    rawDamage = Math.max(1, Math.floor(rawDamage * damageMultiplier));
  }
  const atkDebuffPercent = monsterDebuff(activeEffects, monsterIdx, monsterId, 'attack');
  if (atkDebuffPercent !== 0) {
    rawDamage = Math.max(1, Math.floor(rawDamage * (100 + atkDebuffPercent) / 100));
  }

  // Player defense reduction（§ 21.5 物理／§ 21.16 魔法）
  // 魔法：裝備防禦只有一半效力（貢獻上限 37.5%），不足部分由魔法抗性補，總上限同樣 75%
  const reductionRate = monster.attackType === 'magic'
    ? Math.min(
        getMagicDefenseContribution(finalDefense)
          + getMagicResist(attrs.SPI) + getGearMagicResist(equippedGear) + getBuffMagicResist(activeEffects),
        DAMAGE_REDUCTION_CAP,
      )
    : Math.min(finalDefense, DAMAGE_REDUCTION_CAP);
  let finalDamage = Math.max(1, Math.floor(rawDamage * (100 - reductionRate) / 100));

  // buff 減傷與防禦減傷為類間乘算（§ 21.5）
  const buffReduction = getBuffDamageReduction(activeEffects);
  if (buffReduction > 0) {
    finalDamage = Math.max(1, Math.floor(finalDamage * (100 - buffReduction) / 100));
  }

  // Block check (only with shield equipped, after defense reduction)
  const totalBlockRate = getPlayerBlockRate(equippedGear, activeEffects);
  const blocked = totalBlockRate > 0 && random() * 100 < totalBlockRate;
  if (blocked) {
    finalDamage = Math.max(1, Math.floor(finalDamage / 2));
    return {
      damage: finalDamage,
      hit: true,
      dodged: false,
      log: { type: 'monster_hit', message: `格擋！${monster.name} 對你造成 ${finalDamage} 點傷害` },
    };
  }

  return {
    damage: finalDamage,
    hit: true,
    dodged: false,
    log: { type: 'monster_hit', message: `${monster.name} 對你造成 ${finalDamage} 點傷害` },
  };
}

export function processCombatRound(
  char: Character,
  monster: MonsterInstance,
  weapon: EquipmentInstance | null,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[] = [],
  targetIdx: number = 0
): CombatResult {
  const playerAtk = calculatePlayerAttack(char, weapon, monster, equippedGear, activeEffects, targetIdx);
  const logs: CombatLog[] = [playerAtk.log];

  const monsterAtk = calculateMonsterAttack(monster, char, equippedGear, activeEffects, targetIdx);
  logs.push(monsterAtk.log);

  return {
    playerDamage: playerAtk.damage,
    monsterDamage: monsterAtk.damage,
    playerHit: playerAtk.hit,
    monsterHit: monsterAtk.hit,
    isCritical: playerAtk.isCritical,
    playerDodged: monsterAtk.dodged,
    logs,
  };
}
