import { describe, it, expect } from 'vitest';
import { evaluateCombatScript, evaluatePersistentScript, evaluateEmergencyRetreat } from '../scriptRunner';
import type { CombatRule } from '../../models/scriptEngine';
import type { PersistentRule, EmergencyRetreat } from '../../models/scriptEngine';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { ActiveEffect } from '../../models/effect';
import type { CombatScriptContext, PersistentScriptContext, EmergencyRetreatContext } from '../scriptRunner';

function createChar(overrides: Partial<Character> = {}): Character {
  return {
    name: 'Test', className: 'knight', level: 5, exp: 0, expToNext: 100,
    hp: 100, maxHp: 100, mp: 30, maxMp: 30,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [],
    areaEnteredAt: Date.now(), createdAt: Date.now(), userId: 1,
    ...overrides,
  };
}

function createMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '暴牙兔', level: 3, currentHp: 30, maxHp: 30,
    attackMin: 5, attackMax: 10, defense: 5, exp: 20, race: 'normal', size: 'small', element: 'none',
    isBoss: false,
    ...overrides,
  };
}

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'wind-blade', name: '風刃', level: 1, element: 'wind', type: 'attack',
    target: 'single', power: 10, mpCost: 5, cooldown: 3000, lastUsedAt: 0,
    ...overrides,
  };
}

describe('evaluateCombatScript', () => {
  function createCtx(overrides: Partial<CombatScriptContext> = {}): CombatScriptContext {
    return {
      character: createChar(),
      monsters: [createMonster()],
      skills: [createSkill()],
      now: 10000,
      ...overrides,
    };
  }

  it('returns null for empty rules', () => {
    expect(evaluateCombatScript([], createCtx())).toBeNull();
  });

  it('matches always condition', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    expect(evaluateCombatScript(rules, createCtx())).toEqual({ type: 'normal_attack' });
  });

  it('matches skill_ready and returns skill action', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
    ];
    expect(evaluateCombatScript(rules, createCtx())).toEqual({ type: 'skill', skillId: 'wind-blade' });
  });

  it('does not match skill_ready when on cooldown', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
    ];
    const ctx = createCtx({ skills: [createSkill({ lastUsedAt: 9000 })], now: 10000 });
    expect(evaluateCombatScript(rules, ctx)).toBeNull();
  });

  it('matches monster_count_gte', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'monster_count_gte', value: 2 }, action: { type: 'skill', skillId: 'wind-blade' } },
    ];
    const ctx = createCtx({ monsters: [createMonster(), createMonster()] });
    expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'skill', skillId: 'wind-blade' });
  });

  it('skips disabled rules', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: false, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    expect(evaluateCombatScript(rules, createCtx())).toBeNull();
  });
});

describe('evaluatePersistentScript', () => {
  function createCtx(overrides: Partial<PersistentScriptContext> = {}): PersistentScriptContext {
    return {
      character: createChar(),
      skills: [],
      lastPotionUsedAt: 0,
      now: 10000,
      bagItems: [
        { name: '紅色藥水', type: 'potion', amount: 5 },
        { name: '橙色藥水', type: 'potion', amount: 3 },
        { name: '白色藥水', type: 'potion', amount: 1 },
      ],
      activeEffects: [],
      ...overrides,
    };
  }

  it('returns null for empty rules', () => {
    expect(evaluatePersistentScript([], createCtx())).toBeNull();
  });

  it('matches hp_below and returns potion action', () => {
    const rules: PersistentRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'potion', potionType: 'red' } },
    ];
    const ctx = createCtx({ character: createChar({ hp: 30, maxHp: 100 }) });
    expect(evaluatePersistentScript(rules, ctx)).toEqual({ type: 'potion', potionType: 'red' });
  });

  it('does not match hp_below when HP is above threshold', () => {
    const rules: PersistentRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'potion', potionType: 'red' } },
    ];
    const ctx = createCtx({ character: createChar({ hp: 80, maxHp: 100 }) });
    expect(evaluatePersistentScript(rules, ctx)).toBeNull();
  });

  it('does not execute potion when HP is full', () => {
    const rules: PersistentRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'potion', potionType: 'red' } },
    ];
    const ctx = createCtx({ character: createChar({ hp: 100, maxHp: 100 }) });
    expect(evaluatePersistentScript(rules, ctx)).toBeNull();
  });

  it('matches buff_not_active when no buff exists', () => {
    const buffSkill = createSkill({ id: 'magic-armor', name: '魔法盔甲', type: 'buff', mpCost: 20, cooldown: 3000, lastUsedAt: 0 });
    const rules: PersistentRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'buff_not_active', skillId: 'magic-armor' }, action: { type: 'buff_skill', skillId: 'magic-armor' } },
    ];
    const ctx = createCtx({ skills: [buffSkill], activeEffects: [] });
    expect(evaluatePersistentScript(rules, ctx)).toEqual({ type: 'buff_skill', skillId: 'magic-armor' });
  });

  it('does not match buff_not_active when buff is active', () => {
    const buffSkill = createSkill({ id: 'magic-armor', name: '魔法盔甲', type: 'buff', mpCost: 20, cooldown: 3000, lastUsedAt: 0 });
    const activeEffect: ActiveEffect = {
      id: 'buff-magic-armor-5000',
      sourceSkillId: 'magic-armor',
      sourceSkillName: '魔法盔甲',
      category: 'magic-armor',
      type: 'buff',
      target: 'player',
      modifiers: [{ stat: 'defense', value: 5, isPercent: false }],
      startTime: 5000,
      duration: 600000,
      tags: [],
      name: '魔法盔甲',
      description: '防禦+5',
    };
    const rules: PersistentRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'buff_not_active', skillId: 'magic-armor' }, action: { type: 'buff_skill', skillId: 'magic-armor' } },
    ];
    const ctx = createCtx({ skills: [buffSkill], activeEffects: [activeEffect], now: 10000 });
    expect(evaluatePersistentScript(rules, ctx)).toBeNull();
  });

  it('matches buff_not_active when buff has expired', () => {
    const buffSkill = createSkill({ id: 'magic-armor', name: '魔法盔甲', type: 'buff', mpCost: 20, cooldown: 3000, lastUsedAt: 0 });
    const expiredEffect: ActiveEffect = {
      id: 'buff-magic-armor-1000',
      sourceSkillId: 'magic-armor',
      sourceSkillName: '魔法盔甲',
      category: 'magic-armor',
      type: 'buff',
      target: 'player',
      modifiers: [{ stat: 'defense', value: 5, isPercent: false }],
      startTime: 1000,
      duration: 5000,
      tags: [],
      name: '魔法盔甲',
      description: '防禦+5',
    };
    const rules: PersistentRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'buff_not_active', skillId: 'magic-armor' }, action: { type: 'buff_skill', skillId: 'magic-armor' } },
    ];
    const ctx = createCtx({ skills: [buffSkill], activeEffects: [expiredEffect], now: 10000 });
    expect(evaluatePersistentScript(rules, ctx)).toEqual({ type: 'buff_skill', skillId: 'magic-armor' });
  });
});

describe('evaluateEmergencyRetreat', () => {
  function createCtx(overrides: Partial<EmergencyRetreatContext> = {}): EmergencyRetreatContext {
    return {
      character: createChar(),
      bagItems: [],
      phase: 'combat',
      ...overrides,
    };
  }

  const defaultRetreat: EmergencyRetreat = {
    enabled: true,
    hpThreshold: 15,
    action: 'flee_town',
  };

  it('returns null when disabled', () => {
    const retreat = { ...defaultRetreat, enabled: false };
    const ctx = createCtx({ character: createChar({ hp: 5, maxHp: 100 }) });
    expect(evaluateEmergencyRetreat(retreat, ctx)).toBeNull();
  });

  it('returns null when not in combat', () => {
    const ctx = createCtx({ character: createChar({ hp: 5, maxHp: 100 }), phase: 'explore' });
    expect(evaluateEmergencyRetreat(defaultRetreat, ctx)).toBeNull();
  });

  it('returns null when HP is above threshold', () => {
    const ctx = createCtx({ character: createChar({ hp: 50, maxHp: 100 }) });
    expect(evaluateEmergencyRetreat(defaultRetreat, ctx)).toBeNull();
  });

  it('returns retreat when HP below threshold and scroll available', () => {
    const ctx = createCtx({
      character: createChar({ hp: 10, maxHp: 100 }),
      bagItems: [{ name: '薄暮村回城卷軸', type: 'scroll', amount: 1 }],
    });
    expect(evaluateEmergencyRetreat(defaultRetreat, ctx)).toEqual(defaultRetreat);
  });

  it('returns null for flee_town when no scroll available', () => {
    const ctx = createCtx({
      character: createChar({ hp: 10, maxHp: 100 }),
      bagItems: [],
    });
    expect(evaluateEmergencyRetreat(defaultRetreat, ctx)).toBeNull();
  });

  it('returns retreat for flee_teleport regardless of scrolls', () => {
    const retreat: EmergencyRetreat = { ...defaultRetreat, action: 'flee_teleport' };
    const ctx = createCtx({
      character: createChar({ hp: 10, maxHp: 100 }),
      bagItems: [],
    });
    expect(evaluateEmergencyRetreat(retreat, ctx)).toEqual(retreat);
  });

  it('checks specific town scroll when scrollTownId is set', () => {
    const retreat: EmergencyRetreat = { ...defaultRetreat, scrollTownId: 'neutral-town' };
    const ctx = createCtx({
      character: createChar({ hp: 10, maxHp: 100 }),
      bagItems: [{ name: '薄暮村回城卷軸', type: 'scroll', amount: 1 }],
    });
    expect(evaluateEmergencyRetreat(retreat, ctx)).toEqual(retreat);
  });

  it('returns null when specific town scroll is not in bag', () => {
    const retreat: EmergencyRetreat = { ...defaultRetreat, scrollTownId: 'neutral-town' };
    const ctx = createCtx({
      character: createChar({ hp: 10, maxHp: 100 }),
      bagItems: [{ name: '艾爾薩斯回城卷軸', type: 'scroll', amount: 1 }],
    });
    expect(evaluateEmergencyRetreat(retreat, ctx)).toBeNull();
  });
});
