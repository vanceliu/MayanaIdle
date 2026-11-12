/**
 * 隨機技能的戰鬥觸發（`07-affix-ability.md` § 7S.4／§ 7S.5 共通池）。
 *
 * 追打計數、專注打擊層數、怒氣、平靜放在 `session.loop`，不進 store：不存檔、不同步給 client。
 */
import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { ActiveEffect } from '../models/effect';
import type { Skill } from '../models/skill';
import type { PlayerAttackEvent } from './arpgEngine';
import {
  ABILITY_CALM_MAX, ABILITY_FOCUS_MAX_PERCENT,
  ABILITY_RAGE_DEFENSE, ABILITY_RAGE_MAGIC_RESIST, ABILITY_RAGE_MAX,
  maxAbilityParam, minAbilityParam, type Ability,
} from '../models/ability';
import { ABILITY_CALM_CATEGORY, CALM_RATE_STAT, RAGE_DECAY_STAT } from '../models/abilityMeter';

export interface AbilityComboState {
  /** 武器實例 id 與進入地圖時間；任一改變即歸零（換武器、換地圖、死亡、回城） */
  key: string;
  count: number;
}

export function comboKey(weapon: EquipmentInstance | null, character: Character): string {
  return `${weapon?.id ?? 0}|${character.areaEnteredAt}`;
}

/** 普攻類（§ 7S.4）：普攻、三連射等走普攻公式的多段攻擊 */
export function isBasicAttackClass(event: PlayerAttackEvent, skill: Skill | undefined): boolean {
  return event.action.type === 'normal_attack' || !!skill?.hits;
}

/** 技能類中會造成直接傷害的攻擊技能 */
export function isDirectDamageSkill(skill: Skill | undefined): skill is Skill {
  return !!skill && skill.type === 'attack' && !skill.dotOnly && (skill.power > 0 || !!skill.physicalSnapshot);
}

/** 單體技能（§ 7S.4）：技能類中的單體攻擊 */
export function isSingleTargetSkill(skill: Skill | undefined): boolean {
  return isDirectDamageSkill(skill) && skill.target === 'single' && !skill.hits;
}

/**
 * 計一次出手；達到第 N 次時回傳加成%並歸零，否則回 0。
 * `state` 為 undefined 或鍵值不同時從 0 起算。
 */
export function advanceCombo(
  holder: { abilityCombo?: AbilityComboState },
  ability: Ability | undefined,
  key: string,
): number {
  if (!ability) return 0;
  const prev = holder.abilityCombo?.key === key ? holder.abilityCombo.count : 0;
  const count = prev + 1;
  if (count >= ability.params.every) {
    holder.abilityCombo = { key, count: 0 };
    return ability.params.bonus;
  }
  holder.abilityCombo = { key, count };
  return 0;
}

export function applyComboBonus(damage: number, bonusPercent: number): number {
  return bonusPercent > 0 ? Math.floor(damage * (100 + bonusPercent) / 100) : damage;
}

export interface AbilityFocusState {
  /** 進入地圖時間；改變即全部清除（換地圖、死亡、回城） */
  key: string;
  /** 怪物 id → 層數 */
  stacks: Map<string, number>;
}

export function focusKey(character: Character): string {
  return String(character.areaEnteredAt);
}

/** 層數表超過此數時，清掉已不在場的怪 */
const FOCUS_PRUNE_SIZE = 32;

/**
 * 專注打擊（§ 7S.5）：逐下套用加成後才加層。回傳加成後的各下傷害；未命中的下不變、不加層。
 * `alive` 用於層數表過大時清掉已不在場的怪。
 */
export function applyFocusStrike(
  holder: { abilityFocus?: AbilityFocusState },
  ability: Ability | undefined,
  key: string,
  targetId: string,
  hits: readonly { damage: number; isMiss: boolean }[],
  alive: (monsterId: string) => boolean,
): number[] {
  if (!ability) return hits.map(h => h.damage);
  if (holder.abilityFocus?.key !== key) holder.abilityFocus = { key, stacks: new Map() };
  const { stacks } = holder.abilityFocus;
  let count = stacks.get(targetId) ?? 0;
  const out = hits.map(h => {
    if (h.isMiss) return h.damage;
    const bonus = Math.min(ABILITY_FOCUS_MAX_PERCENT, count * ability.params.percent / 10);
    count++;
    return bonus > 0 ? Math.floor(h.damage * (100 + bonus) / 100) : h.damage;
  });
  stacks.set(targetId, count);
  if (stacks.size > FOCUS_PRUNE_SIZE) for (const id of stacks.keys()) if (!alive(id)) stacks.delete(id);
  return out;
}

/** 該怪死亡時清除層數 */
export function clearFocusTarget(holder: { abilityFocus?: AbilityFocusState }, targetId: string): void {
  holder.abilityFocus?.stacks.delete(targetId);
}

/** 擴散傷害：主目標該下最終傷害 × X%（§ 7S.5），不足 1 不擴散 */
export function splashDamage(primaryDamage: number, ability: Ability): number {
  return Math.floor(primaryDamage * ability.params.percent / 100);
}

/** 怒氣狀態 buff 的 category（§ 7S.5） */
export const ABILITY_RAGE_CATEGORY = 'ability-rage';

export interface RageCalmState {
  /** 怒氣值與最後更新時間；衰減在讀取時依經過時間計算 */
  abilityRage?: number;
  abilityRageAt?: number;
  /** 平靜開始累積的時間；未設時從進入地圖起算 */
  abilityCalmSince?: number;
}

/**
 * 被命中時累積怒氣，回傳怒氣狀態 buff（持續到怒氣歸零為止）；沒有怒氣技能時回 undefined。
 * `damage` 為減傷後的傷害（§ 7S.4「實際受到的傷害」）。
 */
export function gainRage(
  holder: RageCalmState,
  gear: readonly (EquipmentInstance | null)[],
  damage: number,
  now: number,
): ActiveEffect | undefined {
  const decay = minAbilityParam(gear, 'rage', 'decay');
  if (decay === undefined || damage <= 0) return undefined;
  const elapsed = holder.abilityRageAt === undefined ? 0 : now - holder.abilityRageAt;
  const current = Math.max(0, (holder.abilityRage ?? 0) - decay * elapsed / 1000);
  const rage = Math.min(ABILITY_RAGE_MAX, current + damage);
  holder.abilityRage = rage;
  holder.abilityRageAt = now;
  return {
    id: `buff-${ABILITY_RAGE_CATEGORY}-${now}`,
    sourceSkillId: 'rage',
    sourceSkillName: '怒氣',
    category: ABILITY_RAGE_CATEGORY,
    type: 'buff',
    target: 'player',
    modifiers: [
      { stat: 'magic_resist', value: ABILITY_RAGE_MAGIC_RESIST, isPercent: false },
      { stat: 'defense', value: ABILITY_RAGE_DEFENSE, isPercent: false },
      { stat: RAGE_DECAY_STAT, value: decay, isPercent: false },
    ],
    startTime: now,
    duration: Math.ceil(rage / decay * 1000),
    tags: [],
    name: '怒氣',
    description: `魔法抗性 +${ABILITY_RAGE_MAGIC_RESIST}、防禦 +${ABILITY_RAGE_DEFENSE}；每秒減少 ${decay}`,
  };
}

/** 被命中時取出當下平靜值並從頭累積（§ 7S.5）；沒有平靜技能時回 0 */
export function consumeCalm(
  holder: RageCalmState,
  gear: readonly (EquipmentInstance | null)[],
  areaEnteredAt: number,
  now: number,
): number {
  const rate = maxAbilityParam(gear, 'calm', 'rate');
  if (rate <= 0) return 0;
  const since = Math.max(holder.abilityCalmSince ?? areaEnteredAt, areaEnteredAt);
  holder.abilityCalmSince = now;
  return Math.min(ABILITY_CALM_MAX, Math.floor(Math.max(0, now - since) / 1000) * rate);
}

/** 平靜的狀態列 buff 持續；到期後由 `syncCalmEffect()` 依計時重掛 */
const CALM_EFFECT_DURATION_MS = 3_600_000;

/**
 * 平靜的狀態列 buff（數值由 `models/abilityMeter.ts` 從開始時間推算）：
 * 有平靜技能時掛著、開始時間＝平靜起算時間；沒有時移除。不需變動時回 undefined。
 */
export function syncCalmEffect(
  holder: RageCalmState,
  gear: readonly (EquipmentInstance | null)[],
  effects: readonly ActiveEffect[],
  areaEnteredAt: number,
  now: number,
): ActiveEffect[] | undefined {
  const rate = maxAbilityParam(gear, 'calm', 'rate');
  const current = effects.find(e => e.category === ABILITY_CALM_CATEGORY);
  if (rate <= 0) return current ? effects.filter(e => e !== current) : undefined;
  const since = Math.max(holder.abilityCalmSince ?? areaEnteredAt, areaEnteredAt);
  const live = current && now < current.startTime + current.duration;
  const currentRate = current?.modifiers?.find(m => m.stat === CALM_RATE_STAT)?.value;
  if (live && current.startTime === since && currentRate === rate) return undefined;
  const calm: ActiveEffect = {
    id: `buff-${ABILITY_CALM_CATEGORY}-${since}`,
    sourceSkillId: 'calm',
    sourceSkillName: '平靜',
    category: ABILITY_CALM_CATEGORY,
    type: 'buff',
    target: 'player',
    modifiers: [{ stat: CALM_RATE_STAT, value: rate, isPercent: false }],
    startTime: since,
    duration: Math.max(CALM_EFFECT_DURATION_MS, now - since + CALM_EFFECT_DURATION_MS),
    tags: [],
    name: '平靜',
    description: `每秒累積 ${rate}（上限 ${ABILITY_CALM_MAX}）；被命中時消耗，冷卻中技能縮短同等 %`,
  };
  return [...effects.filter(e => e !== current), calm];
}

/** 冷卻中技能的剩餘冷卻縮短 X%：把 `lastUsedAt` 往前推（`effectiveCooldown` 已含冷卻縮減與隨機技能） */
export function shortenCooldown(lastUsedAt: number, effectiveCooldown: number, percent: number, now: number): number {
  const remaining = lastUsedAt + effectiveCooldown - now;
  if (remaining <= 0 || percent <= 0) return lastUsedAt;
  return lastUsedAt - Math.floor(remaining * percent / 100);
}
