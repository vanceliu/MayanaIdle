import type { Character } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import type { EquipmentInstance, WeaponMaterial } from '../models/equipment';
import { isAccessorySlot } from '../models/equipment';
import { getAccessoryMagicResist } from './enhancement';
import type { ActiveEffect } from '../models/effect';
import { getTotalAttributes, getEffectiveSTR, getEffectiveAGI, getEffectiveINT, getMagicResist } from '../models/character';
import { collectAffixBonuses, getEffectiveAffixValue, getBrandElement, type AffixBonuses, type BrandElement } from '../models/affix';

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
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

const ELEMENT_COUNTER: Record<string, string> = {
  fire: 'wind',
  wind: 'earth',
  earth: 'ice',
  ice: 'fire',
  light: 'dark',
  dark: 'light',
};

export function getElementCounterBonus(attackElement: string | undefined, monsterElement: string): number {
  if (!attackElement || attackElement === 'none') return 0;
  if (monsterElement === 'none') return 0;
  if (ELEMENT_COUNTER[attackElement] === monsterElement) return 3;
  return 0;
}

export function getFireEnchantBonus(activeEffects: ActiveEffect[]): number {
  const now = Date.now();
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
  const now = Date.now();
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (effect.category === 'fire-enchant') return true;
  }
  return false;
}

/** 角色 buff 的固定值加成（非百分比），例如 命中 +3、額外攻擊 +5 */
export function getBuffFlatBonus(activeEffects: ActiveEffect[], stat: string): number {
  const now = Date.now();
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
  const now = Date.now();
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
  const now = Date.now();
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
  const now = Date.now();
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
  const now = Date.now();
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

/** 無視防禦：直接扣減目標的減傷率 */
function applyIgnoreDefense(reduction: number, ignorePercent: number): number {
  if (ignorePercent <= 0) return reduction;
  return Math.max(0, Math.floor(reduction * (100 - Math.min(ignorePercent, 100)) / 100));
}

/** 強化可提升魔法攻擊的武器類型（§ 6.9：每 +2 強化 → 魔攻 +1） */
const MAGIC_ATTACK_WEAPON_TYPES = new Set(['staff', 'twoHandStaff', 'magicBook']);

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

function getWeaponDamage(gear: EquipmentInstance | null, monsterSize: 'small' | 'large'): number {
  if (!gear) return 1;
  const base = monsterSize === 'small' ? gear.smallMonsterDamage : gear.largeMonsterDamage;
  if (base == null) return 1;
  // § 6.9：每 +1 強化 → smallMonsterDamage / largeMonsterDamage 各 +1
  return base + (gear.enhancement ?? 0);
}

/**
 * 一次普攻打幾下（`21-combat-formula.md` § 21.4）。
 *
 * 雙刀與鋼爪是**雙持**武器，一次攻擊打兩下 —— 每下獨立判定命中與爆擊，
 * 額外攻擊、STR 加成、材質克制兩下都算（每下都是完整公式）。
 * 它們的基傷因此只有其他雙手武器的一半（`21-combat-formula.md` § 21.4）。
 */
export function getWeaponHitCount(weapon: EquipmentInstance | null): number {
  return weapon?.type === 'dualBlade' || weapon?.type === 'claw' ? 2 : 1;
}

/** § 21.4：魔法公式裡技能側（技能攻擊力＋INT加成＋裝備魔攻）的權重 */
export const SKILL_SIDE_WEIGHT = 0.5;
/** § 21.4：魔法公式裡武器白字的權重 */
export const WEAPON_WHITE_WEIGHT = 0.2;

/**
 * 武器白字（`21-combat-formula.md` § 21.4）。
 *
 * `((小怪傷害 + 大怪傷害) / 2 + 強化 + 額外攻擊) × (1 + 攻擊力%)`
 *
 * 技能不分怪物體型，所以取小怪／大怪的平均。**刻意不含「普攻元素傷害%」**
 * —— 那是普攻的乘區，與魔法傷害無關。沒有武器時為 0（不套普攻的保底值 1）。
 */
export function getWeaponWhiteDamage(
  weapon: EquipmentInstance | null,
  attackPowerPercent: number,
): number {
  if (!weapon || weapon.smallMonsterDamage == null || weapon.largeMonsterDamage == null) return 0;
  const enh = weapon.enhancement ?? 0;
  const base = (weapon.smallMonsterDamage + weapon.largeMonsterDamage) / 2 + enh + (weapon.extraAttack ?? 0);
  return base * (1 + attackPowerPercent / 100);
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

export function getTotalDefense(equippedGear: (EquipmentInstance | null)[]): number {
  return equippedGear.reduce((sum, g) => {
    if (!g) return sum;
    const base = g.defense ?? 0;
    const enhance = base > 0 ? (g.enhancement ?? 0) : 0;
    return sum + base + enhance;
  }, 0);
}

/**
 * 可由 buff 提供的詞綴類加成。
 * 這些 stat 原本只從裝備詞綴聚合，導致同名的技能 buff 完全失效。
 */
const BUFFABLE_AFFIX_STATS = ['attack_power', 'crit_rate', 'crit_damage', 'skill_elemental', 'cooldown_reduction'] as const;

function getBuffPercentBonus(activeEffects: ActiveEffect[], stat: string): number {
  const now = Date.now();
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
 * 初始防禦放在最後而不是併進括號，是為了不讓防禦%詞綴放大這個負值 ——
 * 否則穿越多防禦詞綴，懲罰反而越重（`21-combat-formula.md` § 21.5）。
 * 夾底於 0：裸裝時是 0% 減傷，不會出現承受超過 100% 傷害的情況。
 *
 * 戰鬥與角色狀態面板共用，避免兩邊各算一份而漂移。
 */
export function getEffectiveDefense(
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[],
  defensePercent: number,
): number {
  const rawDefense = getTotalDefense(equippedGear) + getBuffDefenseBonus(activeEffects);
  const curseDefPercent = getPlayerDebuffModifier(activeEffects, 'defense');
  const geared = Math.floor(rawDefense * (1 + defensePercent / 100) * (100 + curseDefPercent) / 100);
  return Math.max(0, geared + BASE_CHARACTER_DEFENSE);
}

export function getAffixBonusesFromGear(equippedGear: (EquipmentInstance | null)[]): AffixBonuses {
  const validGear = equippedGear.filter((g): g is EquipmentInstance => g != null);
  return collectAffixBonuses(validGear);
}

function getPlayerBlockRate(equippedGear: (EquipmentInstance | null)[]): number {
  let blockRate = 0;
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
  return Math.min(50, blockRate);
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
  return getMagicResist(attrs.SPI) + getGearMagicResist(equippedGear);
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

/** § 20.6：INT 每 2 點提供的技能威力% */
export const INT_SKILL_DAMAGE_PERCENT_PER_2 = 10;
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
  activeEffects: ActiveEffect[] = []
): number {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const effSTR = getEffectiveSTR(attrs.STR);
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  // § 6.9：強化同時提升小怪／大怪基傷，取平均後等同直接加上強化等級
  const weaponDmg = weapon
    ? ((weapon.smallMonsterDamage ?? 0) + (weapon.largeMonsterDamage ?? 0)) / 2 + (weapon.enhancement ?? 0)
    : 1;
  const strBonus = Math.floor(effSTR / 2);
  const rawFireEnchantDmg = getFireEnchantBonus(activeEffects);
  const isBow = weapon?.type === 'bow';
  const fireEnchantDmg = isBow ? rawFireEnchantDmg : 0;

  let damage = Math.floor(weaponDmg) + strBonus + (weapon?.extraAttack ?? 0) + getRangedAttackBonus(weapon, activeEffects) + fireEnchantDmg;
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
  targetIdx: number = 0
): { damage: number; hit: boolean; isCritical: boolean; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const effSTR = getEffectiveSTR(attrs.STR);
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
  const strBonus = Math.floor(effSTR / 2);
  const rawFireEnchantDmg = getFireEnchantBonus(activeEffects);
  const isBow = weapon?.type === 'bow';
  const fireEnchantDmg = isBow ? rawFireEnchantDmg : 0;
  const hasFireEnchantActive = rawFireEnchantDmg > 0;
  const brandElement = getWeaponElement(weapon);
  const attackElement = brandElement ?? (hasFireEnchantActive ? 'fire' : undefined);
  const hasElement = !!brandElement || hasFireEnchantActive;
  const critRate = Math.min(75, 5 + bonuses.crit_rate);
  const defDebuffPercent = getMonsterDebuffModifier(activeEffects, targetIdx, 'defense');
  const effectiveMonsterDef = Math.max(0, Math.floor(monster.defense * (100 + defDebuffPercent) / 100));
  const monsterReduction = Math.min(effectiveMonsterDef, 75);

  let total = 0;
  let anyHit = false;
  let anyCrit = false;

  for (let i = 0; i < hitCount; i++) {
    if (!(Math.random() * 100 < hitRate)) continue;
    anyHit = true;

    // Base damage (including race/element counter bonuses)
    let damage = getWeaponDamage(weapon, monster.size) + strBonus + (weapon?.extraAttack ?? 0)
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
    if (Math.random() * 100 < critRate) {
      anyCrit = true;
      damage = Math.floor(damage * (2.0 + bonuses.crit_damage / 100));
    }

    // Monster defense reduction (last, with debuff)
    damage = Math.max(1, Math.floor(damage * (100 - monsterReduction) / 100));

    // 虛弱 debuff（攻擊力 -20%）作用於最終傷害（§ 21.3）
    total += applyWeaken(damage, activeEffects);
  }

  if (!anyHit) {
    return { damage: 0, hit: false, isCritical: false, log: { type: 'player_miss', message: '攻擊未命中' } };
  }

  const prefix = hitCount > 1 ? '雙擊！' : '';
  const log: CombatLog = anyCrit
    ? { type: 'player_crit', message: `${prefix}暴擊！對 ${monster.name} 造成 ${total} 點傷害` }
    : { type: 'player_hit', message: `${prefix}對 ${monster.name} 造成 ${total} 點傷害` };

  return { damage: total, hit: true, isCritical: anyCrit, log };
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

  const hit = Math.random() * 100 < hitRate;
  if (!hit) {
    return {
      damage: 0,
      hit: false,
      isCritical: false,
      log: { type: 'player_miss', message: `${skillName} 未命中` },
    };
  }

  // Base damage (physical formula, including race/element counter bonuses + fire enchant)
  const weaponDmg = getWeaponDamage(weapon, monster.size);
  const strBonus = Math.floor(getEffectiveSTR(attrs.STR) / 2);
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
  const isCritical = Math.random() * 100 < critRate;
  if (isCritical) {
    const critMultiplier = 2.0 + bonuses.crit_damage / 100;
    damage = Math.floor(damage * critMultiplier);
  }

  // Monster defense reduction (last, with debuff)
  const defDebuffPercent = getMonsterDebuffModifier(activeEffects, targetIdx, 'defense');
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
): { damage: number; isCritical: boolean; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const bonuses = getCombatBonuses(equippedGear, activeEffects);

  // Base magic damage (including element counter bonus)
  // § 21.4：基礎魔攻 = (技能攻擊力 + INT加成 + 裝備魔攻) × 0.5 + 武器白字 × 0.2
  const effINT = getEffectiveINT(attrs.INT);
  const intBonus = Math.floor(skillPower * (effINT / 2 * INT_SKILL_DAMAGE_PERCENT_PER_2) / 100);
  const gearMagicAttack = getTotalMagicAttack(equippedGear);
  const skillSide = (skillPower + intBonus + gearMagicAttack) * SKILL_SIDE_WEIGHT;
  const weaponSide = getWeaponWhiteDamage(getEquippedWeapon(equippedGear), bonuses.attack_power) * WEAPON_WHITE_WEIGHT;
  let damage = Math.floor(skillSide + weaponSide) + getElementCounterBonus(skillElement, monster.element);

  // Apply skill elemental% multiplier (only if skill has element)
  if (skillElement && skillElement !== 'none') {
    damage = Math.floor(damage * (1 + bonuses.skill_elemental / 100));
  }

  // Critical check
  const critRate = Math.min(75, 5 + bonuses.crit_rate);
  const isCritical = Math.random() * 100 < critRate;
  if (isCritical) {
    const critMultiplier = 2.0 + bonuses.crit_damage / 100;
    damage = Math.floor(damage * critMultiplier);
  }

  // Monster defense reduction (last, with debuff)
  const defDebuffPercent = getMonsterDebuffModifier(activeEffects, targetIdx, 'defense');
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
  now: number = Date.now(),
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

/** 是否處於無敵狀態（絕對屏障）：完全免疫傷害 */
export function isPlayerInvincible(activeEffects: ActiveEffect[], now: number = Date.now()): boolean {
  return activeEffects.some(
    e => e.type === 'buff' && e.target === 'player' && e.invincible && now < e.startTime + e.duration
  );
}

export function getBuffDamageReduction(activeEffects: ActiveEffect[]): number {
  const now = Date.now();
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
  const now = Date.now();
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
  monsterIdx: number = 0
): { damage: number; hit: boolean; dodged: boolean; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects, equippedGear);
  const effAGI = getEffectiveAGI(attrs.AGI);
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

  // Player dodge
  const baseDodge = char.className === 'thief' ? 10 : 5;
  const agiDodge = Math.floor(effAGI / 3);
  const finalDefense = getEffectiveDefense(equippedGear, activeEffects, bonuses.defense);
  const defOverflowDodge = finalDefense > 75 ? Math.floor((finalDefense - 75) / 5) : 0;
  // Evasion buff bonus (e.g. Smoke Bomb +15%)
  let evasionBuffBonus = 0;
  for (const effect of activeEffects) {
    if (effect.type === 'buff' && effect.target === 'player' && effect.modifiers) {
      for (const mod of effect.modifiers) {
        if (mod.stat === 'evasion') {
          evasionBuffBonus += mod.isPercent ? mod.value : mod.value;
        }
      }
    }
  }
  const dodgeRate = Math.min(35, baseDodge + agiDodge + defOverflowDodge + evasionBuffBonus);

  const dodged = Math.random() * 100 < dodgeRate;
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
  const atkDebuffPercent = getMonsterDebuffModifier(activeEffects, monsterIdx, 'attack');
  if (atkDebuffPercent !== 0) {
    rawDamage = Math.max(1, Math.floor(rawDamage * (100 + atkDebuffPercent) / 100));
  }

  // Player defense reduction（§ 21.5 物理／§ 21.16 魔法）
  // 魔法：裝備防禦只有一半效力（貢獻上限 37.5%），不足部分由魔法抗性補，總上限同樣 75%
  const reductionRate = monster.attackType === 'magic'
    ? Math.min(
        getMagicDefenseContribution(finalDefense)
          + getMagicResist(attrs.SPI) + getGearMagicResist(equippedGear),
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
  const totalBlockRate = getPlayerBlockRate(equippedGear);
  const blocked = totalBlockRate > 0 && Math.random() * 100 < totalBlockRate;
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
