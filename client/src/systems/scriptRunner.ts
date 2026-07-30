import type { ScriptRule, ScriptAction, CombatRule, CombatAction, PersistentRule, PersistentAction, EmergencyRetreat } from '../models/scriptEngine';
import { SCRIPT_DEBUFF_TYPES } from '../models/scriptEngine';
import type { Character } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import type { Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { BagItem } from '../stores/gameStore';
import { getPotionCount, SPEED_POTION_CONFIG } from '../stores/gameStore';
import { canUseSkill } from '../models/skill';
import { findScrollInBag, TOWN_SCROLL_CONFIG } from '../models/townScroll';
import { PLAYER_DEBUFF_DEFS } from '../models/playerDebuff';
import { getCureItem, hasCurableDebuff } from '../models/cureItem';
import { hasActivePlayerDebuff, isPlayerStunned } from './playerDebuffSystem';

// === Combat Script ===

export interface CombatScriptContext {
  character: Character;
  monsters: MonsterInstance[];
  skills: Skill[];
  now: number;
  cooldownReduction?: number;
}

export function evaluateCombatScript(rules: CombatRule[], ctx: CombatScriptContext): CombatAction | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (checkCombatCondition(rule, ctx)) {
      if (canExecuteCombatAction(rule.action, ctx)) {
        return rule.action;
      }
    }
  }
  return null;
}

function checkCombatCondition(rule: CombatRule, ctx: CombatScriptContext): boolean {
  const { condition } = rule;
  const { monsters, skills, now } = ctx;
  const mpPercent = ctx.character.maxMp > 0 ? (ctx.character.mp / ctx.character.maxMp) * 100 : 100;

  switch (condition.type) {
    case 'always':
      return true;
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
    case 'mp_above':
      return mpPercent > (condition.value ?? 0);
    case 'mp_below':
      return mpPercent < (condition.value ?? 0);
    case 'skill_ready': {
      const skill = skills.find(s => s.id === condition.skillId);
      if (!skill) return false;
      return canUseSkill(skill, ctx.character.mp, now, ctx.cooldownReduction ?? 0);
    }
    default:
      return false;
  }
}

function canExecuteCombatAction(action: CombatAction, ctx: CombatScriptContext): boolean {
  switch (action.type) {
    case 'skill': {
      const skill = ctx.skills.find(s => s.id === action.skillId);
      if (!skill) return false;
      return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
    }
    case 'normal_attack':
      return true;
    case 'wait':
      return true;
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
  now: number;
  activeEffects: ActiveEffect[];
  cooldownReduction?: number;
  phase?: string;
  effectiveMaxHp?: number;
  effectiveMaxMp?: number;
}

export function evaluatePersistentScript(rules: PersistentRule[], ctx: PersistentScriptContext): PersistentAction | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (checkPersistentCondition(rule, ctx)) {
      if (canExecutePersistentAction(rule.action, ctx)) {
        return rule.action;
      }
    }
  }
  return null;
}

function checkPersistentCondition(rule: PersistentRule, ctx: PersistentScriptContext): boolean {
  const { condition } = rule;
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
    case 'buff_not_active': {
      const skill = skills.find(s => s.id === condition.skillId);
      const category = skill?.buffCategory;
      if (category) {
        const active = activeEffects.find(
          e => e.category === category && e.type === 'buff' && e.target === 'player'
        );
        if (!active) return true;
        return now - active.startTime >= active.duration;
      }
      const active = activeEffects.find(
        e => e.sourceSkillId === condition.skillId && e.type === 'buff' && e.target === 'player'
      );
      if (!active) return true;
      return now - active.startTime >= active.duration;
    }
    case 'speed_not_active': {
      const speedBuff = activeEffects.find(
        e => e.category === 'speed' && e.type === 'buff' && e.target === 'player'
      );
      if (!speedBuff) return true;
      return now - speedBuff.startTime >= speedBuff.duration;
    }
    case 'skill_ready': {
      const skill = skills.find(s => s.id === condition.skillId);
      if (!skill) return false;
      return canUseSkill(skill, character.mp, now, ctx.cooldownReduction ?? 0);
    }
    case 'debuff_active': {
      if (!condition.debuffType) return false;
      // 合併條件（如「詛咒或虛弱」）只要其中一項成立即可
      return SCRIPT_DEBUFF_TYPES[condition.debuffType].some(
        t => hasActivePlayerDebuff(activeEffects, PLAYER_DEBUFF_DEFS[t].category, now)
      );
    }
    default:
      return false;
  }
}

function canExecutePersistentAction(action: PersistentAction, ctx: PersistentScriptContext): boolean {
  switch (action.type) {
    case 'potion': {
      if (ctx.character.hp >= ctx.character.maxHp) return false;
      const { potionType } = action;
      if (!potionType) return false;
      return getPotionCount(ctx.bagItems, potionType) > 0;
    }
    case 'speed_potion': {
      const { speedPotionType } = action;
      if (!speedPotionType) return false;
      const config = SPEED_POTION_CONFIG[speedPotionType];
      const bagItem = ctx.bagItems.find(i => i.name === config.bagName);
      return !!(bagItem && bagItem.amount > 0);
    }
    case 'buff_skill': {
      const skill = ctx.skills.find(s => s.id === action.skillId);
      if (!skill) return false;
      return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
    }
    case 'heal_skill': {
      if (ctx.character.hp >= ctx.character.maxHp) return false;
      const skill = ctx.skills.find(s => s.id === action.skillId);
      if (!skill) return false;
      return canUseSkill(skill, ctx.character.mp, ctx.now, ctx.cooldownReduction ?? 0);
    }
    case 'cure_item': {
      // 暈眩中無法使用任何道具（§ 24.10.1）
      if (isPlayerStunned(ctx.activeEffects, ctx.now)) return false;
      const def = action.cureItemName ? getCureItem(action.cureItemName) : undefined;
      if (!def) return false;
      const bagItem = ctx.bagItems.find(i => i.name === def.name);
      if (!bagItem || bagItem.amount <= 0) return false;
      // 無對應 debuff 時不可使用（§ 24.10.1）
      return hasCurableDebuff(def, ctx.activeEffects, ctx.now);
    }
    default:
      return false;
  }
}

// === Emergency Retreat ===

export interface EmergencyRetreatContext {
  character: Character;
  bagItems: BagItem[];
  phase: string;
}

export function evaluateEmergencyRetreat(retreat: EmergencyRetreat, ctx: EmergencyRetreatContext): EmergencyRetreat | null {
  if (!retreat.enabled) return null;
  if (ctx.phase !== 'combat') return null;

  const hpPercent = (ctx.character.hp / ctx.character.maxHp) * 100;
  if (hpPercent >= retreat.hpThreshold) return null;

  if (retreat.action === 'flee_town') {
    if (retreat.scrollTownId) {
      const scrollInfo = TOWN_SCROLL_CONFIG[retreat.scrollTownId];
      if (!scrollInfo) return null;
      const item = ctx.bagItems.find(b => b.name === scrollInfo.name);
      if (!item || item.amount <= 0) return null;
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
        const item = ctx.bagItems.find(b => b.name === scrollInfo.name);
        return !!(item && item.amount > 0);
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
