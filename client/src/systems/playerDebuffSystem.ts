import type { ActiveEffect } from '../models/effect';
import type { EquipmentInstance } from '../models/equipment';
import type { MonsterInstance } from '../models/monster';
import type { PlayerDebuffType } from '../models/playerDebuff';
import { PLAYER_DEBUFF_DEFS, PLAYER_DEBUFF_TYPES } from '../models/playerDebuff';
import { collectSpecialAffixTypes, type SpecialAffixType } from '../models/affix';

/**
 * 角色 Debuff 觸發系統
 * 設計來源：docs/design/24-buff-debuff.md § 24.4、docs/design/25-monster-system.md § 25.9.2
 */

/**
 * debuff 類型 → 對應免疫詞綴。
 * 詛咒／虛弱／減速改由魔法抗性抵抗（§ 24.4.2），已無免疫詞綴；暈眩僅有抵抗詞綴。
 */
export const IMMUNITY_AFFIX_BY_DEBUFF: Record<PlayerDebuffType, SpecialAffixType | null> = {
  poison: 'immune_poison',
  bleed: 'immune_bleed',
  curse: null,
  weaken: null,
  slow: null,
  stun: null,
};

/**
 * 受魔法抗性影響的 debuff 類型（§ 24.4.2）。
 * 中毒／流血（物理 DoT）與暈眩不受魔抗影響，仍只能靠免疫詞綴。
 */
export const MAGIC_RESIST_DEBUFF_TYPES: PlayerDebuffType[] = ['curse', 'weaken', 'slow'];

export function isMagicResistibleDebuff(type: PlayerDebuffType): boolean {
  return MAGIC_RESIST_DEBUFF_TYPES.includes(type);
}

/** 暈眩抵抗提供的時間減免（§ 7.10.4：50% 時間減免，不是免疫） */
export const STUN_RESIST_DURATION_MULTIPLIER = 0.5;

export function getEquippedSpecialAffixes(equippedGear: (EquipmentInstance | null)[]): Set<SpecialAffixType> {
  return collectSpecialAffixTypes(equippedGear.filter((g): g is EquipmentInstance => g != null));
}

/**
 * § 7.10.4：最終觸發率 = 怪物基礎觸發率 × (1 - 免疫率)
 * 免疫詞綴提供 100% 免疫率，多件不疊加。
 */
export function getDebuffImmunityRate(
  type: PlayerDebuffType,
  specials: Set<SpecialAffixType>,
  activeEffects: ActiveEffect[] = [],
  now: number = Date.now(),
): number {
  // 生效中的「免疫負面狀態」buff（神聖領域，§ 23.6）對所有 debuff 類型提供 100% 免疫
  if (hasDebuffImmunityBuff(activeEffects, now)) return 1;
  const affix = IMMUNITY_AFFIX_BY_DEBUFF[type];
  if (!affix) return 0;
  return specials.has(affix) ? 1 : 0;
}

/** buff 來源的全類型 debuff 免疫（`immuneDebuff` 標記），目前唯一來源為神聖領域 */
export function hasDebuffImmunityBuff(
  activeEffects: ActiveEffect[],
  now: number = Date.now(),
): boolean {
  return activeEffects.some(
    e => e.type === 'buff' && e.target === 'player' && e.immuneDebuff === true
      && now < e.startTime + e.duration
  );
}

export function hasStunResist(specials: Set<SpecialAffixType>): boolean {
  return specials.has('resist_stun');
}

/** 角色身上該 category 的 debuff 是否仍在存續期間 */
export function hasActivePlayerDebuff(
  activeEffects: ActiveEffect[],
  category: string,
  now: number = Date.now(),
): boolean {
  return activeEffects.some(
    e => e.type === 'debuff' && e.target === 'player' && e.category === category
      && now < e.startTime + e.duration
  );
}

export function isPlayerStunned(activeEffects: ActiveEffect[], now: number = Date.now()): boolean {
  return activeEffects.some(
    e => e.type === 'debuff' && e.target === 'player' && e.stun && now < e.startTime + e.duration
  );
}

export function getPlayerDebuffTags(activeEffects: ActiveEffect[], now: number = Date.now()): string[] {
  const tags: string[] = [];
  for (const e of activeEffects) {
    if (e.type !== 'debuff' || e.target !== 'player') continue;
    if (now >= e.startTime + e.duration) continue;
    tags.push(...e.tags);
  }
  return tags;
}

/**
 * 依 debuff 類型建立角色 ActiveEffect。
 * DoT 傷害以「怪物攻擊力」（attackMin/attackMax 平均值）× 係數快照。
 */
export function createPlayerDebuffEffect(
  type: PlayerDebuffType,
  monster: MonsterInstance,
  now: number,
  specials: Set<SpecialAffixType>,
): ActiveEffect {
  const def = PLAYER_DEBUFF_DEFS[type];
  const duration = def.stun && hasStunResist(specials)
    ? Math.floor(def.duration * STUN_RESIST_DURATION_MULTIPLIER)
    : def.duration;

  const effect: ActiveEffect = {
    id: `player-debuff-${def.category}-${now}`,
    sourceSkillId: `monster-${monster.templateId}`,
    sourceSkillName: monster.name,
    category: def.category,
    type: 'debuff',
    target: 'player',
    startTime: now,
    duration,
    tags: [def.tag],
    name: def.name,
    description: def.description,
  };

  if (def.dotPercent) {
    const monsterAttack = (monster.attackMin + monster.attackMax) / 2;
    const damage = Math.max(1, Math.floor(monsterAttack * def.dotPercent));
    effect.dot = {
      damage,
      element: def.dotElement!,
      interval: def.dotInterval ?? 1000,
      totalDuration: duration,
    };
    effect.description = `每秒 ${damage} 傷害`;
  }

  if (def.modifiers) effect.modifiers = def.modifiers;
  if (def.stun) effect.stun = true;

  return effect;
}

export interface DebuffRollResult {
  /** 命中並成功施加的 debuff（已存在不可刷新的 debuff 時為 null） */
  effect: ActiveEffect | null;
  /** 是否有任一 debuff 判定命中（命中即停，無論是否成功施加） */
  triggered: boolean;
  type: PlayerDebuffType | null;
  /** true = 命中後被魔法抗性擋下（§ 24.4.2） */
  resisted?: boolean;
}

/**
 * 怪物普攻命中角色後的 debuff 判定。
 * § 25.9.2：依表格順序判定、命中即停；每次攻擊最多觸發一種 debuff。
 */
export function rollMonsterDebuff(
  monster: MonsterInstance,
  equippedGear: (EquipmentInstance | null)[],
  activeEffects: ActiveEffect[],
  now: number = Date.now(),
  magicResist: number = 0,
): DebuffRollResult {
  const none: DebuffRollResult = { effect: null, triggered: false, type: null };
  if (!monster.debuffs || monster.debuffs.length === 0) return none;

  const specials = getEquippedSpecialAffixes(equippedGear);

  for (const ability of monster.debuffs) {
    const def = PLAYER_DEBUFF_DEFS[ability.type];
    if (!def) continue;

    const immunity = getDebuffImmunityRate(ability.type, specials, activeEffects, now);
    const finalChance = ability.chance * (1 - immunity);
    if (finalChance <= 0) continue;

    if (Math.random() * 100 >= finalChance) continue;

    // § 24.4.2：詛咒／虛弱／減速 命中後，再以魔法抗性判定是否被擋下。
    // 擋下仍消耗本次判定（§ 25.9.2 命中即停），與「免疫詞綴讓觸發率歸零、直接換下一種」不同。
    if (isMagicResistibleDebuff(ability.type) && magicResist > 0) {
      const resistChance = Math.min(magicResist, 100);
      if (Math.random() * 100 < resistChance) {
        return { effect: null, triggered: true, type: ability.type, resisted: true };
      }
    }

    // 命中：不可刷新的 debuff 若仍在存續期間則不重複施加，但仍消耗本次判定
    if (!def.refreshable && hasActivePlayerDebuff(activeEffects, def.category, now)) {
      return { effect: null, triggered: true, type: ability.type };
    }

    return {
      effect: createPlayerDebuffEffect(ability.type, monster, now, specials),
      triggered: true,
      type: ability.type,
    };
  }

  return none;
}

/** 加速 buff 的 category（見 24-buff-debuff.md § 24.3.1） */
export const SPEED_BUFF_CATEGORY = 'speed';

export function hasActiveSpeedBuff(activeEffects: ActiveEffect[], now: number = Date.now()): boolean {
  return activeEffects.some(
    e => e.type === 'buff' && e.target === 'player' && e.category === SPEED_BUFF_CATEGORY
      && now < e.startTime + e.duration
  );
}

export interface DebuffApplyResult {
  effects: ActiveEffect[];
  /** true = 減速被加速抵銷（消除加速，不施加減速） */
  cancelledSpeedBuff: boolean;
}

/**
 * 施加角色 debuff 後的效果清單。
 * - 可刷新的 debuff（詛咒/虛弱/減速）以同 category 覆蓋
 * - 減速與加速互相抵銷：身上有加速時，減速改為消除加速且不生效（§ 24.4.6）
 */
export function applyPlayerDebuff(
  activeEffects: ActiveEffect[],
  effect: ActiveEffect,
  now: number = Date.now(),
): DebuffApplyResult {
  if (effect.category === PLAYER_DEBUFF_DEFS.slow.category && hasActiveSpeedBuff(activeEffects, now)) {
    return {
      effects: activeEffects.filter(
        e => !(e.type === 'buff' && e.target === 'player' && e.category === SPEED_BUFF_CATEGORY)
      ),
      cancelledSpeedBuff: true,
    };
  }

  const def = PLAYER_DEBUFF_TYPES
    .map(t => PLAYER_DEBUFF_DEFS[t])
    .find(d => d.category === effect.category);

  if (def?.refreshable) {
    const filtered = activeEffects.filter(
      e => !(e.type === 'debuff' && e.target === 'player' && e.category === effect.category)
    );
    return { effects: [...filtered, effect], cancelledSpeedBuff: false };
  }
  return { effects: [...activeEffects, effect], cancelledSpeedBuff: false };
}

export interface SpeedBuffApplyResult {
  effects: ActiveEffect[];
  /** true = 加速被用來解除減速（消除減速，不施加加速） */
  cancelledSlow: boolean;
}

/**
 * 施加加速 buff。
 * 減速與加速互相抵銷：身上有減速時，加速改為解除減速且本身不生效（§ 24.4.6）
 */
export function applySpeedBuff(
  activeEffects: ActiveEffect[],
  buffEffect: ActiveEffect,
  now: number = Date.now(),
): SpeedBuffApplyResult {
  const slowCategory = PLAYER_DEBUFF_DEFS.slow.category;
  if (hasActivePlayerDebuff(activeEffects, slowCategory, now)) {
    return {
      effects: activeEffects.filter(
        e => !(e.type === 'debuff' && e.target === 'player' && e.category === slowCategory)
      ),
      cancelledSlow: true,
    };
  }
  const filtered = activeEffects.filter(
    e => !(e.type === 'buff' && e.target === 'player' && e.category === SPEED_BUFF_CATEGORY)
  );
  return { effects: [...filtered, buffEffect], cancelledSlow: false };
}

/**
 * 施加角色 buff 的統一入口：同 category 覆蓋前者（§ 24.3.1），
 * 加速類另外套用與減速的互相抵銷規則。
 */
export function applyPlayerBuff(
  activeEffects: ActiveEffect[],
  buffEffect: ActiveEffect,
  now: number = Date.now(),
): SpeedBuffApplyResult {
  if (buffEffect.category === SPEED_BUFF_CATEGORY) {
    return applySpeedBuff(activeEffects, buffEffect, now);
  }
  const filtered = activeEffects.filter(
    e => !(e.type === 'buff' && e.target === buffEffect.target && e.category === buffEffect.category)
  );
  return { effects: [...filtered, buffEffect], cancelledSlow: false };
}
