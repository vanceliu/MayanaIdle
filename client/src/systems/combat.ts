import type { Character } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import type { EquipmentInstance, WeaponMaterial } from '../models/equipment';
import type { ActiveEffect } from '../models/effect';
import { getTotalAttributes, getEffectiveSTR, getEffectiveAGI, getEffectiveINT } from '../models/character';
import { collectAffixBonuses, getEffectiveAffixValue, type AffixBonuses } from '../models/affix';

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

function getWeaponDamage(gear: EquipmentInstance | null, monsterSize: 'small' | 'large'): number {
  if (!gear) return 1;
  if (monsterSize === 'small') return gear.smallMonsterDamage ?? 1;
  return gear.largeMonsterDamage ?? 1;
}

function getTotalDefense(equippedGear: (EquipmentInstance | null)[]): number {
  return equippedGear.reduce((sum, g) => {
    if (!g) return sum;
    const base = g.defense ?? 0;
    const enhance = base > 0 ? (g.enhancement ?? 0) : 0;
    return sum + base + enhance;
  }, 0);
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

const BASE_ATTACK_INTERVAL_MS = 1200;
const MIN_ATTACK_INTERVAL_MS = 300;

export function getPlayerAttackInterval(equippedGear: (EquipmentInstance | null)[], activeEffects: ActiveEffect[] = []): number {
  const bonuses = getAffixBonusesFromGear(equippedGear);
  let attackSpeedPercent = bonuses.attack_speed;
  for (const effect of activeEffects) {
    if (effect.type === 'buff' && effect.target === 'player' && effect.modifiers) {
      for (const mod of effect.modifiers) {
        if (mod.stat === 'attack_speed' && mod.isPercent) {
          attackSpeedPercent += mod.value;
        }
      }
    }
  }
  // 減速 debuff（攻擊速度 -30%）
  attackSpeedPercent += getPlayerDebuffModifier(activeEffects, 'attack_speed');
  const interval = Math.floor(BASE_ATTACK_INTERVAL_MS / Math.max(0.1, 1 + attackSpeedPercent / 100));
  return Math.max(MIN_ATTACK_INTERVAL_MS, interval);
}

export function getSkillCooldownReduction(equippedGear: (EquipmentInstance | null)[]): number {
  const bonuses = getAffixBonusesFromGear(equippedGear);
  return Math.min(bonuses.cooldown_reduction, 50);
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
  const attrs = getTotalAttributes(char, activeEffects);
  const effSTR = getEffectiveSTR(attrs.STR);
  const bonuses = getAffixBonusesFromGear(equippedGear);

  const weaponDmg = weapon ? ((weapon.smallMonsterDamage ?? 0) + (weapon.largeMonsterDamage ?? 0)) / 2 : 1;
  const strBonus = Math.floor(effSTR / 2);
  const rawFireEnchantDmg = getFireEnchantBonus(activeEffects);
  const isBow = weapon?.type === 'bow';
  const fireEnchantDmg = isBow ? rawFireEnchantDmg : 0;

  let damage = Math.floor(weaponDmg) + strBonus + (weapon?.extraAttack ?? 0) + fireEnchantDmg;
  damage = Math.floor(damage * (1 + bonuses.attack_power / 100));
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
  const attrs = getTotalAttributes(char, activeEffects);
  const effSTR = getEffectiveSTR(attrs.STR);
  const effAGI = getEffectiveAGI(attrs.AGI);
  const bonuses = getAffixBonusesFromGear(equippedGear);

  // Hit check (with weapon attackSuccess and race hit bonus from buffs)
  const baseHit = 80;
  const agiBonus = Math.floor(effAGI / 3);
  const levelDiff = char.level - monster.level;
  const monsterDodge = 5;
  const weaponHitBonus = getWeaponAttackSuccess(weapon);
  const raceHitBonus = getRaceHitBonus(activeEffects, monster.race);
  const hitRate = Math.min(95, Math.max(5, baseHit + agiBonus + weaponHitBonus + levelDiff + raceHitBonus - monsterDodge));

  const hit = Math.random() * 100 < hitRate;
  if (!hit) {
    return {
      damage: 0,
      hit: false,
      isCritical: false,
      log: { type: 'player_miss', message: '攻擊未命中' },
    };
  }

  // Base damage (including race/element counter bonuses)
  const weaponDmg = getWeaponDamage(weapon, monster.size);
  const strBonus = Math.floor(effSTR / 2);
  const rawFireEnchantDmg = getFireEnchantBonus(activeEffects);
  const isBow = weapon?.type === 'bow';
  const fireEnchantDmg = isBow ? rawFireEnchantDmg : 0;
  const hasFireEnchantActive = rawFireEnchantDmg > 0;
  const attackElement = weapon?.element && weapon.element !== 'none' ? weapon.element : (hasFireEnchantActive ? 'fire' : undefined);
  let damage = weaponDmg + strBonus + (weapon?.extraAttack ?? 0) + fireEnchantDmg + getMaterialRaceBonus(weapon?.material, monster.race) + getElementCounterBonus(attackElement, monster.element);

  // Apply attack% multiplier
  damage = Math.floor(damage * (1 + bonuses.attack_power / 100));
  // 虛弱 debuff（攻擊力 -20%）
  damage = applyWeaken(damage, activeEffects);

  // Apply attack elemental% multiplier (weapon element OR fire enchant)
  const hasElement = (weapon?.element && weapon.element !== 'none') || hasFireEnchantActive;
  if (hasElement) {
    damage = Math.floor(damage * (1 + bonuses.attack_elemental / 100));
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
  const effectiveMonsterDef = Math.max(0, Math.floor(monster.defense * (100 + defDebuffPercent) / 100));
  const monsterReduction = Math.min(effectiveMonsterDef, 75);
  damage = Math.max(1, Math.floor(damage * (100 - monsterReduction) / 100));

  const log: CombatLog = isCritical
    ? { type: 'player_crit', message: `暴擊！對 ${monster.name} 造成 ${damage} 點傷害` }
    : { type: 'player_hit', message: `對 ${monster.name} 造成 ${damage} 點傷害` };

  return { damage, hit: true, isCritical, log };
}

export function calculatePhysicalSkillHit(
  char: Character,
  weapon: EquipmentInstance | null,
  monster: MonsterInstance,
  equippedGear: (EquipmentInstance | null)[],
  hasFireEnchant: boolean,
  skillName: string,
  activeEffects: ActiveEffect[] = [],
  targetIdx: number = 0
): { damage: number; hit: boolean; isCritical: boolean; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects);
  const effAGI = getEffectiveAGI(attrs.AGI);
  const bonuses = getAffixBonusesFromGear(equippedGear);

  // Hit check (each hit independently, with weapon attackSuccess and race hit bonus)
  const baseHit = 80;
  const agiBonus = Math.floor(effAGI / 3);
  const levelDiff = char.level - monster.level;
  const monsterDodge = 5;
  const weaponHitBonus = getWeaponAttackSuccess(weapon);
  const raceHitBonus = getRaceHitBonus(activeEffects, monster.race);
  const hitRate = Math.min(95, Math.max(5, baseHit + agiBonus + weaponHitBonus + levelDiff + raceHitBonus - monsterDodge));

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
  const attackElement = weapon?.element && weapon.element !== 'none' ? weapon.element : (hasFireEnchant ? 'fire' : undefined);
  let damage = weaponDmg + strBonus + (weapon?.extraAttack ?? 0) + fireEnchantDmg + getMaterialRaceBonus(weapon?.material, monster.race) + getElementCounterBonus(attackElement, monster.element);

  // Apply attack% multiplier
  damage = Math.floor(damage * (1 + bonuses.attack_power / 100));
  // 虛弱 debuff（攻擊力 -20%）
  damage = applyWeaken(damage, activeEffects);

  // Apply attack elemental% multiplier (weapon element OR fire enchant)
  const hasElement = (weapon?.element && weapon.element !== 'none') || hasFireEnchant;
  if (hasElement) {
    damage = Math.floor(damage * (1 + bonuses.attack_elemental / 100));
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
  const monsterReduction = Math.min(effectiveMonsterDef2, 75);
  damage = Math.max(1, Math.floor(damage * (100 - monsterReduction) / 100));

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
  targetIdx: number = 0
): { damage: number; isCritical: boolean; log: CombatLog } {
  const attrs = getTotalAttributes(char, activeEffects);
  const bonuses = getAffixBonusesFromGear(equippedGear);

  // Base magic damage (including element counter bonus)
  const effINT = getEffectiveINT(attrs.INT);
  const intBonus = Math.floor(skillPower * (effINT / 2 * 10) / 100);
  let damage = skillPower + intBonus + getElementCounterBonus(skillElement, monster.element);

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
  const monsterReduction = Math.min(effectiveMonsterDef3, 75);
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
  const attrs = getTotalAttributes(char, activeEffects);
  const effAGI = getEffectiveAGI(attrs.AGI);
  const bonuses = getAffixBonusesFromGear(equippedGear);

  // Player dodge
  const baseDodge = char.className === 'thief' ? 10 : 5;
  const agiDodge = Math.floor(effAGI / 3);
  const rawDefense = getTotalDefense(equippedGear) + getBuffDefenseBonus(activeEffects);
  // 詛咒 debuff（防禦力 -20%）
  const curseDefPercent = getPlayerDebuffModifier(activeEffects, 'defense');
  const finalDefense = Math.max(0, Math.floor(rawDefense * (1 + bonuses.defense / 100) * (100 + curseDefPercent) / 100));
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

  // Player defense reduction (with affix bonus)
  const playerDefense = Math.min(finalDefense, 75);
  let finalDamage = Math.max(1, Math.floor(rawDamage * (100 - playerDefense) / 100));

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
