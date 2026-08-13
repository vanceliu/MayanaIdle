import type {
  ScriptRule, ScriptAction, CombatRule, CombatCondition, CombatAction,
  PersistentRule, PersistentCondition, PersistentAction, EmergencyRetreat,
  ScriptDebuffCondition,
} from '../models/scriptEngine';
import { SCRIPT_DEBUFF_TYPES, DEFAULT_NEAR_SELF_RADIUS } from '../models/scriptEngine';
import type { Position } from '../models/mapControl';
import { resolveActionTargets, resolvePrimaryTarget, type TargetCandidate } from './targeting';
import { getDistance } from './lineOfSight';
import type { Character } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import type { Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { BagItem } from '../models/bagItem';
import { hasBagItem, getBagItemAmount } from '../models/bagItem';
import { getPotionCount, SPEED_POTION_CONFIG, POTION_CONFIG } from '../stores/gameStore';
import { canUseSkill } from '../models/skill';
import { findScrollInBag, TOWN_SCROLL_CONFIG } from '../models/townScroll';
import { PLAYER_DEBUFF_DEFS } from '../models/playerDebuff';
import { getCureItem, hasCurableDebuff } from '../models/cureItem';
import { hasActivePlayerDebuff, isPlayerStunned } from './playerDebuffSystem';

// === Combat Script ===

/**
 * 腳本看到的一隻怪。位置與 id 是必要的 —— 「範圍內怪數」「AoE 命中數」要算距離，
 * 「當前目標 HP」要能認出主目標是哪一隻。
 */
export interface ScriptMonsterView {
  id: string;
  instance: MonsterInstance;
  position: Position;
}

export interface CombatScriptContext {
  character: Character;
  /** 只放活著的怪 */
  monsters: ScriptMonsterView[];
  skills: Skill[];
  now: number;
  cooldownReduction?: number;
  /** 目前手持武器的 `type`（空手為 undefined），用於 `requiredWeaponType` 判定 */
  weaponType?: string;
  playerPos: Position;
  /** FSM 選定的主目標 id；null 時退回距離最近的一隻 */
  primaryTargetId: string | null;
  /** 普通攻擊射程（武器原值）。沒有技能的動作用它當「攻擊範圍」 */
  weaponRange: number;
  /** `self_shielded` 用。未帶＝當作沒有護盾（`51-auto-talent.md` § 51.4.10 的「接線」項） */
  activeEffects?: ActiveEffect[];
  /** `weight_over` 用：當前負重百分比 */
  weightPercent?: number;
  /** `hp_below`／`hp_above` 用的有效上限，未帶時退回 `character.maxHp` */
  effectiveMaxHp?: number;
  /** `hp_dropped_recently` 用：短期 HP 取樣 */
  hpHistory?: HpSample[];
}

/** HP 取樣點。`hp_dropped_recently` 要看的是「掉多快」，單一數值答不了 */
export interface HpSample {
  t: number;
  /** 當下 HP 佔有效上限的百分比 */
  percent: number;
}

/**
 * 在 `seconds` 秒內 HP 掉了幾個百分點。
 *
 * 取樣窗內的**最高值**減現在 —— 用「窗起點」會在剛補完血時誤判成沒掉，
 * 而爆發傷害的重點正是「剛剛還很滿」。
 */
export function hpDropInWindow(history: HpSample[], now: number, seconds: number): number {
  const from = now - seconds * 1000;
  const inWindow = history.filter(s => s.t >= from);
  if (inWindow.length === 0) return 0;
  const peak = Math.max(...inWindow.map(s => s.percent));
  const current = inWindow[inWindow.length - 1].percent;
  return peak - current;
}

/**
 * 技能的武器需求（`23-class-magic.md` § 23.4 的「【需裝備弓】」）。
 * 沒有標 `requiredWeaponType` 的技能一律通過；標了就必須手持該類武器，
 * 空手（`weaponType` 為 undefined）同樣不通過。
 */
export function skillMeetsWeaponRequirement(skill: Skill, weaponType: string | undefined): boolean {
  if (!skill.requiredWeaponType) return true;
  return weaponType === skill.requiredWeaponType;
}

function meetsWeaponRequirement(skill: Skill, ctx: CombatScriptContext): boolean {
  return skillMeetsWeaponRequirement(skill, ctx.weaponType);
}

export function evaluateCombatScript(rules: CombatRule[], ctx: CombatScriptContext): CombatAction | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    // AND：任何一個條件不成立這條就跳過。空陣列＝無條件
    if (!rule.conditions.every(c => checkCombatCondition(c, rule.action, ctx))) continue;
    if (canExecuteCombatAction(rule.action, ctx)) {
      return rule.action;
    }
  }
  return null;
}

/** 腳本看到的怪 → `targeting.ts` 的候選清單 */
function toCandidates(ctx: CombatScriptContext): TargetCandidate[] {
  return ctx.monsters.map(m => ({ id: m.id, position: m.position }));
}

/**
 * 這個動作自己的射程：技能有 `range` 就用技能的，其餘（普攻／不動作）用武器射程。
 * 「攻擊範圍內的怪物數」要跟著規則走 —— 同一條「範圍內 ≥ 3 隻」掛在近戰普攻與
 * 12 格的火球上，本來就該是兩個不同的圈。
 */
function getActionRange(action: CombatAction, ctx: CombatScriptContext): number {
  if (action.type === 'skill' && action.skillId) {
    const skill = ctx.skills.find(s => s.id === action.skillId);
    if (skill?.range) return skill.range;
  }
  return ctx.weaponRange;
}

/** 當前主目標（FSM 指定的，或最近的一隻） */
function getPrimaryTarget(ctx: CombatScriptContext): ScriptMonsterView | null {
  const id = resolvePrimaryTarget(toCandidates(ctx), ctx.playerPos, ctx.primaryTargetId);
  if (!id) return null;
  return ctx.monsters.find(m => m.id === id) ?? null;
}

function countMonstersWithin(ctx: CombatScriptContext, radius: number): number {
  return ctx.monsters.filter(m => getDistance(ctx.playerPos, m.position) <= radius).length;
}

/**
 * 共用條件的自身狀態判定（§ 51.4.5）。
 * 戰鬥與常駐**必須同一套** —— 兩邊各寫一份，改了一邊就會出現
 * 「同一條規則放在戰鬥格與常駐格結果不同」這種難查的 bug。
 */
function isSelfBuffExpired(
  skillId: string | undefined, skills: Skill[], activeEffects: ActiveEffect[], now: number,
): boolean {
  const category = skills.find(s => s.id === skillId)?.buffCategory;
  const active = category
    ? activeEffects.find(e => e.category === category && e.type === 'buff' && e.target === 'player')
    : activeEffects.find(e => e.sourceSkillId === skillId && e.type === 'buff' && e.target === 'player');
  if (!active) return true;
  return now - active.startTime >= active.duration;
}

function hasActiveSpeedBuff(activeEffects: ActiveEffect[], now: number): boolean {
  const buff = activeEffects.find(
    e => e.category === 'speed' && e.type === 'buff' && e.target === 'player',
  );
  return buff !== undefined && now - buff.startTime < buff.duration;
}

function hasSelfDebuff(
  debuffType: ScriptDebuffCondition | undefined, activeEffects: ActiveEffect[], now: number,
): boolean {
  if (!debuffType) return false;
  // 合併條件（如「詛咒或虛弱」）只要其中一項成立即可
  return SCRIPT_DEBUFF_TYPES[debuffType].some(
    t => hasActivePlayerDebuff(activeEffects, PLAYER_DEBUFF_DEFS[t].category, now),
  );
}

function checkCombatCondition(
  condition: CombatCondition,
  action: CombatAction,
  ctx: CombatScriptContext,
): boolean {
  const { skills, now } = ctx;
  const mpPercent = ctx.character.maxMp > 0 ? (ctx.character.mp / ctx.character.maxMp) * 100 : 100;

  switch (condition.type) {
    case 'always':
      return true;
    case 'monster_count_gte':
      return countMonstersWithin(ctx, getActionRange(action, ctx)) >= (condition.value ?? 1);
    case 'monsters_near_self_gte':
      return countMonstersWithin(ctx, condition.radius ?? DEFAULT_NEAR_SELF_RADIUS)
        >= (condition.value ?? 1);
    case 'aoe_hit_count_gte': {
      /**
       * 用真正出手時的同一份目標選取算命中數，條件說幾隻就是幾隻。
       *
       * `maxRange: Infinity` 是刻意的：角色還在往怪群移動的路上，主目標必然超出射程，
       * 套了射程 gate 條件就永遠不成立 —— 連帶讓 `getScriptChaseRange` 的預評估
       * 看不到這條範圍技，射程塌回武器射程，角色反而跑去貼身平A。
       * 真正的射程判定由 `arpgEngine.resolveTargets` 在出手當下負責。
       */
      const hits = resolveActionTargets({
        candidates: toCandidates(ctx),
        playerPos: ctx.playerPos,
        primaryTargetId: ctx.primaryTargetId,
        action,
        skills,
        maxRange: Infinity,
      });
      return hits.length >= (condition.value ?? 1);
    }
    case 'monster_hp_below': {
      const target = getPrimaryTarget(ctx);
      if (!target) return false;
      return (target.instance.currentHp / target.instance.maxHp) * 100 < (condition.value ?? 50);
    }
    case 'monster_hp_above': {
      const target = getPrimaryTarget(ctx);
      if (!target) return false;
      return (target.instance.currentHp / target.instance.maxHp) * 100 > (condition.value ?? 50);
    }
    case 'mp_above':
      return mpPercent > (condition.value ?? 0);
    case 'mp_below':
      return mpPercent < (condition.value ?? 0);
    case 'skill_ready': {
      const skill = skills.find(s => s.id === condition.skillId);
      if (!skill) return false;
      if (!meetsWeaponRequirement(skill, ctx)) return false;
      return canUseSkill(skill, ctx.character.mp, now, ctx.cooldownReduction ?? 0);
    }

    // === 共用條件（§ 51.4.5）===
    case 'hp_below':
    case 'hp_above': {
      const maxHp = ctx.effectiveMaxHp ?? ctx.character.maxHp;
      const pct = maxHp > 0 ? (ctx.character.hp / maxHp) * 100 : 100;
      return condition.type === 'hp_below'
        ? pct < (condition.value ?? 0)
        : pct > (condition.value ?? 0);
    }
    case 'weapon_type_is':
      return ctx.weaponType === condition.match;
    case 'area_dwell_gte': {
      // 直接對應 `26-spawn-pressure.md` 的壓力累積：待越久怪越多
      const minutes = (now - ctx.character.areaEnteredAt) / 60000;
      return minutes >= (condition.value ?? 0);
    }
    case 'weight_over':
      return (ctx.weightPercent ?? 0) > (condition.value ?? 0);
    case 'self_shielded':
      return hasActiveShield(ctx.activeEffects ?? [], now, 'player');
    /*
     * 共用條件（§ 51.4.5）判定的是**自身**狀態，與常駐版完全同一套邏輯。
     * 兩邊各寫一份會走鐘，所以抽成共用函式。
     */
    case 'buff_not_active':
      return isSelfBuffExpired(condition.skillId, ctx.skills, ctx.activeEffects ?? [], now);
    case 'speed_not_active':
      return !hasActiveSpeedBuff(ctx.activeEffects ?? [], now);
    case 'debuff_active':
      return hasSelfDebuff(condition.debuffType, ctx.activeEffects ?? [], now);
    case 'hp_dropped_recently': {
      if (!ctx.hpHistory) return false;
      // value ＝ 掉了幾個百分點；radius 借用來當秒數，避免再開一個欄位
      return hpDropInWindow(ctx.hpHistory, now, condition.radius ?? 3) > (condition.value ?? 0);
    }
    case 'current_area_is':
      return ctx.character.currentArea === condition.match
        || ctx.character.currentRegion === condition.match;

    // === 戰鬥專屬條件（§ 51.4.6）===
    case 'target_distance': {
      const target = getPrimaryTarget(ctx);
      if (!target) return false;
      const d = getDistance(ctx.playerPos, target.position);
      return compareValue(d, condition.value ?? 0, condition.compare);
    }
    case 'target_attack_type': {
      const target = getPrimaryTarget(ctx);
      return !!target && target.instance.attackType === condition.match;
    }
    case 'target_race': {
      const target = getPrimaryTarget(ctx);
      return !!target && target.instance.race === condition.match;
    }
    /*
     * 場上判定（§ 51.4.6 T6）：看的是**全場活著的怪**，不是當前目標。
     * `match` 同時吃種族與元素 —— 兩者的取值不重疊，不必分成兩個條件。
     */
    case 'field_has_race':
      return ctx.monsters.some(
        m => m.instance.race === condition.match || m.instance.element === condition.match,
      );
    case 'field_avg_hp_below': {
      if (ctx.monsters.length === 0) return false;
      const total = ctx.monsters.reduce(
        (sum, m) => sum + (m.instance.maxHp > 0 ? (m.instance.currentHp / m.instance.maxHp) * 100 : 0),
        0,
      );
      return total / ctx.monsters.length < (condition.value ?? 0);
    }
    case 'target_element': {
      const target = getPrimaryTarget(ctx);
      return !!target && target.instance.element === condition.match;
    }
    case 'target_size': {
      const target = getPrimaryTarget(ctx);
      return !!target && target.instance.size === condition.match;
    }
    case 'target_is_boss': {
      const target = getPrimaryTarget(ctx);
      return !!target && target.instance.isBoss;
    }
    case 'target_defense': {
      const target = getPrimaryTarget(ctx);
      if (!target) return false;
      return compareValue(target.instance.defense, condition.value ?? 0, condition.compare);
    }
    case 'target_level_diff': {
      const target = getPrimaryTarget(ctx);
      if (!target) return false;
      const diff = target.instance.level - ctx.character.level;
      return compareValue(diff, condition.value ?? 0, condition.compare);
    }
    case 'target_range_gt': {
      const target = getPrimaryTarget(ctx);
      return !!target && target.instance.attackRange > (condition.value ?? 0);
    }
    case 'target_has_debuff':
    case 'target_lacks_debuff': {
      const target = getPrimaryTarget(ctx);
      if (!target) return false;
      const has = (ctx.activeEffects ?? []).some(e =>
        e.target === 'monster'
        && e.targetMonsterId === target.id
        && now - e.startTime < e.duration
        && (condition.match ? e.tags.includes(condition.match) : true));
      return condition.type === 'target_has_debuff' ? has : !has;
    }
    case 'target_cc_immune': {
      const target = getPrimaryTarget(ctx);
      // § 24.6：被控場後 10 秒內免疫。免疫窗內放控場技是純浪費 MP
      return !!target && (target.instance.ccImmuneUntil ?? 0) > now;
    }
    case 'target_shielded': {
      const target = getPrimaryTarget(ctx);
      return !!target && hasActiveShield(ctx.activeEffects ?? [], now, 'monster', target.id);
    }

    default:
      return false;
  }
}

/** `compare` 沒帶時當作 `gt` —— 舊資料與手寫測試不必每次都填 */
function compareValue(actual: number, threshold: number, mode?: 'gt' | 'lt'): boolean {
  return mode === 'lt' ? actual < threshold : actual > threshold;
}

/** 無敵或還有護盾量。兩者都表示「這一下不會照常吃傷害」 */
function hasActiveShield(
  effects: ActiveEffect[], now: number,
  target: 'player' | 'monster', monsterId?: string,
): boolean {
  return effects.some(e => {
    if (e.target !== target) return false;
    if (monsterId !== undefined && e.targetMonsterId !== monsterId) return false;
    if (now - e.startTime >= e.duration) return false;
    return e.invincible === true || (e.shieldRemaining ?? 0) > 0;
  });
}

function canExecuteCombatAction(action: CombatAction, ctx: CombatScriptContext): boolean {
  switch (action.type) {
    case 'skill': {
      const skill = ctx.skills.find(s => s.id === action.skillId);
      if (!skill || skill.type !== 'attack') return false;
      if (!meetsWeaponRequirement(skill, ctx)) return false;
      return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
    }
    case 'normal_attack':
      return true;
    case 'wait':
      return true;
    // 切換目標：場上至少要有別的怪可以切
    case 'switch_target_lowest_hp':
    case 'switch_target_highest_hp':
    case 'switch_target_farthest':
    case 'switch_target_by_kind':
    case 'switch_target_by_debuff':
      return ctx.monsters.length > 0;
    // 鎖定目標：要先有目標才鎖得住
    case 'lock_target':
      return ctx.primaryTargetId !== null;
    // 走位：有目標才有「靠近／拉開」的對象
    case 'keep_distance':
    case 'close_in':
    case 'disengage':
      return ctx.primaryTargetId !== null;
    default:
      return false;
  }
}

// === Persistent Script ===

export interface PersistentScriptContext {
  character: Character;
  skills: Skill[];
  bagItems: BagItem[];
  lastPotionUsedAt: number;
  /** 上次使用的那瓶藥水的冷卻長度。冷卻全域共用（`30-items.md` § 30.1） */
  lastPotionCooldown?: number;
  /** 走位動作用：現在在不在戰鬥中 */
  inCombat?: boolean;
  now: number;
  activeEffects: ActiveEffect[];
  cooldownReduction?: number;
  phase?: string;
  effectiveMaxHp?: number;
  effectiveMaxMp?: number;
  /**
   * 共用條件要用的欄位（`51-auto-talent.md` § 51.4.5）。
   * 共用鑲材兩邊都鑲得進去，常駐這側缺欄位就等於那些鑲材鑲了也不會成立。
   */
  playerPos?: Position;
  /**
   * 只餵**位置**，不是完整的 `MonsterInstance` ——
   * 常駐這側唯一用到怪物的條件是「周圍幾隻」，數個數不必知道牠們是什麼。
   * 完整實例只存在於 `PixiGame` 的 ref 裡，硬要傳得先把戰鬥狀態搬進 store。
   */
  monsterPositions?: Position[];
  weaponType?: string;
  weightPercent?: number;
  hpHistory?: HpSample[];
}

export function evaluatePersistentScript(rules: PersistentRule[], ctx: PersistentScriptContext): PersistentAction | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    // AND：任何一個條件不成立這條就跳過。空陣列＝無條件
    if (!rule.conditions.every(c => checkPersistentCondition(c, ctx))) continue;
    if (canExecutePersistentAction(rule.action, ctx)) {
      return rule.action;
    }
  }
  return null;
}

function checkPersistentCondition(condition: PersistentCondition, ctx: PersistentScriptContext): boolean {
  const { character, skills, now, activeEffects } = ctx;
  const maxHp = ctx.effectiveMaxHp ?? character.maxHp;
  const maxMp = ctx.effectiveMaxMp ?? character.maxMp;
  const hpPercent = (character.hp / maxHp) * 100;
  const mpPercent = maxMp > 0 ? (character.mp / maxMp) * 100 : 100;

  switch (condition.type) {
    case 'always':
      return true;
    case 'hp_below':
      return hpPercent < (condition.value ?? 0);
    case 'hp_above':
      return hpPercent > (condition.value ?? 0);
    case 'mp_below':
      return mpPercent < (condition.value ?? 0);
    case 'mp_above':
      return mpPercent > (condition.value ?? 0);
    case 'buff_not_active':
      return isSelfBuffExpired(condition.skillId, skills, activeEffects, now);
    case 'speed_not_active':
      return !hasActiveSpeedBuff(activeEffects, now);
    case 'skill_ready': {
      const skill = skills.find(s => s.id === condition.skillId);
      if (!skill) return false;
      return canUseSkill(skill, character.mp, now, ctx.cooldownReduction ?? 0);
    }
    case 'debuff_active':
      return hasSelfDebuff(condition.debuffType, activeEffects, now);

    // === 共用條件（§ 51.4.5）===
    case 'monsters_near_self_gte': {
      if (!ctx.playerPos || !ctx.monsterPositions) return false;
      const radius = condition.radius ?? DEFAULT_NEAR_SELF_RADIUS;
      const count = ctx.monsterPositions.filter(p => getDistance(ctx.playerPos!, p) <= radius).length;
      return count >= (condition.value ?? 1);
    }
    case 'weapon_type_is':
      return ctx.weaponType === condition.match;
    case 'area_dwell_gte':
      return (now - character.areaEnteredAt) / 60000 >= (condition.value ?? 0);
    case 'weight_over':
      return (ctx.weightPercent ?? 0) > (condition.value ?? 0);
    case 'self_shielded':
      return activeEffects.some(e =>
        e.target === 'player'
        && now - e.startTime < e.duration
        && (e.invincible === true || (e.shieldRemaining ?? 0) > 0));
    case 'hp_dropped_recently': {
      if (!ctx.hpHistory) return false;
      return hpDropInWindow(ctx.hpHistory, now, condition.radius ?? 3) > (condition.value ?? 0);
    }
    case 'current_area_is':
      return character.currentArea === condition.match
        || character.currentRegion === condition.match;
    case 'item_count_below': {
      if (condition.itemId == null) return false;
      return getBagItemAmount(ctx.bagItems, condition.itemId) < (condition.value ?? 0);
    }

    // === 常駐專屬條件（§ 51.4.7）===
    case 'buff_remaining_below': {
      // 提前續 buff，而不是等它掉光才補
      const active = activeEffects.find(
        e => e.sourceSkillId === condition.skillId && e.type === 'buff' && e.target === 'player',
      );
      if (!active) return false;
      const remaining = active.duration - (now - active.startTime);
      return remaining > 0 && remaining < (condition.value ?? 0) * 1000;
    }
    case 'potion_cooldown_ready': {
      // 冷卻的唯一出處是 `POTION_CONFIG`（`30-items.md` § 30.1），不另抄一份
      const cd = condition.potionType ? POTION_CONFIG[condition.potionType].cooldown : 0;
      return now - ctx.lastPotionUsedAt >= cd;
    }

    default:
      return false;
  }
}

/**
 * 藥水冷卻好了沒。**冷卻全域共用**（`30-items.md` § 30.1）——
 * 使用任一藥水後，所有藥水一起進入該藥水對應的冷卻。
 */
function isPotionReady(ctx: PersistentScriptContext): boolean {
  return ctx.now - ctx.lastPotionUsedAt >= (ctx.lastPotionCooldown ?? 0);
}

function canExecutePersistentAction(action: PersistentAction, ctx: PersistentScriptContext): boolean {
  switch (action.type) {
    case 'potion': {
      // 有效上限含裝備加血；用基礎 maxHp 的話有加血裝就永遠判定為滿血
      if (ctx.character.hp >= (ctx.effectiveMaxHp ?? ctx.character.maxHp)) return false;
      const { potionType } = action;
      if (!potionType) return false;
      // 冷卻中不算可執行
      if (!isPotionReady(ctx)) return false;
      return getPotionCount(ctx.bagItems, potionType) > 0;
    }
    case 'speed_potion': {
      const { speedPotionType } = action;
      if (!speedPotionType) return false;
      const config = SPEED_POTION_CONFIG[speedPotionType];
      return hasBagItem(ctx.bagItems, config.itemId);
    }
    case 'buff_skill': {
      const skill = ctx.skills.find(s => s.id === action.skillId);
      if (skill?.type !== 'buff') return false;
      return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
    }
    case 'heal_skill': {
      if (ctx.character.hp >= (ctx.effectiveMaxHp ?? ctx.character.maxHp)) return false;
      const skill = ctx.skills.find(s => s.id === action.skillId);
      if (skill?.type !== 'heal') return false;
      return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
    }
    case 'cure_item': {
      // 暈眩中無法使用任何道具（§ 24.10.1）
      if (isPlayerStunned(ctx.activeEffects, ctx.now)) return false;
      const def = action.cureItemId != null ? getCureItem(action.cureItemId) : undefined;
      if (!def) return false;
      if (!hasBagItem(ctx.bagItems, def.itemId)) return false;
      // 無對應 debuff 時不可使用（§ 24.10.1）
      return hasCurableDebuff(def, ctx.activeEffects, ctx.now);
    }
    case 'use_town_scroll':
      // 暈眩中無法使用任何道具（§ 24.10.1）
      if (isPlayerStunned(ctx.activeEffects, ctx.now)) return false;
      return findScrollInBag(ctx.bagItems) !== null;
    case 'use_consumable': {
      if (isPlayerStunned(ctx.activeEffects, ctx.now)) return false;
      return action.itemId != null && hasBagItem(ctx.bagItems, action.itemId);
    }
    case 'refill_to_percent': {
      if (isPlayerStunned(ctx.activeEffects, ctx.now)) return false;
      const { potionType } = action;
      if (!potionType) return false;
      if (!isPotionReady(ctx)) return false;
      const maxHp = ctx.effectiveMaxHp ?? ctx.character.maxHp;
      if ((ctx.character.hp / maxHp) * 100 >= (action.value ?? 0)) return false;
      return getPotionCount(ctx.bagItems, potionType) > 0;
    }
    // 依序檢查，只要還有一個沒生效且放得出來就成立
    // 走位：要在戰鬥中且有目標才有「靠近／拉開」的對象
    case 'keep_distance':
    case 'close_in':
    case 'disengage':
      return ctx.inCombat === true;
    case 'refill_all_buffs': {
      const ids = [action.skillId, action.skillId2, action.skillId3]
        .filter((id): id is string => Boolean(id));
      return ids.some(id => {
        const skill = ctx.skills.find(sk => sk.id === id);
        if (!skill) return false;
        return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
      });
    }
    default:
      return false;
  }
}

// === Emergency Retreat ===

export interface EmergencyRetreatContext {
  character: Character;
  bagItems: BagItem[];
  /** § 3.13：僅在角色附近存在敵對目標時生效 */
  inCombat: boolean;
  effectiveMaxHp?: number;
}

export function evaluateEmergencyRetreat(retreat: EmergencyRetreat, ctx: EmergencyRetreatContext): EmergencyRetreat | null {
  if (!retreat.enabled) return null;
  if (!ctx.inCombat) return null;

  const maxHp = ctx.effectiveMaxHp ?? ctx.character.maxHp;
  const hpPercent = (ctx.character.hp / maxHp) * 100;
  if (hpPercent >= retreat.hpThreshold) return null;

  if (retreat.action === 'flee_town') {
    if (retreat.scrollTownId) {
      const scrollInfo = TOWN_SCROLL_CONFIG[retreat.scrollTownId];
      if (!scrollInfo) return null;
      if (!hasBagItem(ctx.bagItems, scrollInfo.itemId)) return null;
    } else {
      if (findScrollInBag(ctx.bagItems) === null) return null;
    }
  }

  return retreat;
}

// === Legacy (used during migration period) ===

export interface ScriptContext {
  character: Character;
  monsters: MonsterInstance[];
  skills: Skill[];
  bagItems: BagItem[];
  lastPotionUsedAt: number;
  now: number;
  cooldownReduction?: number;
}

export function evaluateScript(rules: ScriptRule[], ctx: ScriptContext): ScriptAction | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (checkLegacyCondition(rule, ctx)) {
      if (canExecuteLegacyAction(rule.action, ctx)) {
        return rule.action;
      }
    }
  }
  return null;
}

function checkLegacyCondition(rule: ScriptRule, ctx: ScriptContext): boolean {
  const { condition } = rule;
  const { character, monsters, skills, now } = ctx;
  const hpPercent = (character.hp / character.maxHp) * 100;
  const mpPercent = character.maxMp > 0 ? (character.mp / character.maxMp) * 100 : 100;

  switch (condition.type) {
    case 'always':
      return true;
    case 'hp_below':
      return hpPercent < (condition.value ?? 0);
    case 'hp_above':
      return hpPercent > (condition.value ?? 0);
    case 'mp_below':
      return mpPercent < (condition.value ?? 0);
    case 'mp_above':
      return mpPercent > (condition.value ?? 0);
    case 'monster_count_gte':
      return monsters.filter(m => m.currentHp > 0).length >= (condition.value ?? 1);
    case 'monster_hp_below': {
      const alive = monsters.filter(m => m.currentHp > 0);
      return alive.some(m => (m.currentHp / m.maxHp) * 100 < (condition.value ?? 50));
    }
    case 'monster_hp_above': {
      const alive = monsters.filter(m => m.currentHp > 0);
      return alive.some(m => (m.currentHp / m.maxHp) * 100 > (condition.value ?? 50));
    }
    case 'skill_ready': {
      const skill = skills.find(s => s.id === condition.skillId);
      if (!skill) return false;
      return canUseSkill(skill, character.mp, now, ctx.cooldownReduction ?? 0);
    }
    default:
      return false;
  }
}

function canExecuteLegacyAction(action: ScriptAction, ctx: ScriptContext): boolean {
  switch (action.type) {
    case 'skill': {
      const skill = ctx.skills.find(s => s.id === action.skillId);
      if (!skill) return false;
      return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
    }
    case 'potion': {
      if (ctx.character.hp >= ctx.character.maxHp) return false;
      const { potionType } = action;
      if (!potionType) return false;
      return getPotionCount(ctx.bagItems, potionType) > 0;
    }
    case 'flee_town': {
      if (action.scrollTownId) {
        const scrollInfo = TOWN_SCROLL_CONFIG[action.scrollTownId];
        if (!scrollInfo) return false;
        return hasBagItem(ctx.bagItems, scrollInfo.itemId);
      }
      return findScrollInBag(ctx.bagItems) !== null;
    }
    case 'flee_teleport':
      return true;
    case 'normal_attack':
      return true;
    default:
      return false;
  }
}
