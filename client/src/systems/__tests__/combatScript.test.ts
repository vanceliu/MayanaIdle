import { describe, it, expect } from 'vitest';
import { evaluateCombatScript } from '../scriptRunner';
import type { CombatRule } from '../../models/scriptEngine';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { CombatScriptContext } from '../scriptRunner';

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'elementalist',
    level: 10,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 18, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0,
    currentArea: 'dawn-plains',
    currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [],
    unspentAttributePoints: 0,
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    userId: 1,
    ...overrides,
  };
}

function createTestMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1,
    name: '暴牙兔',
    level: 3,
    currentHp: 30,
    maxHp: 30,
    attackMin: 5,
    attackMax: 10,
    defense: 5,
    exp: 20,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
    ...overrides,
  };
}

function createFireball(): Skill {
  return {
    id: 'fireball',
    name: '火球',
    level: 3,
    element: 'fire',
    type: 'attack',
    target: 'aoe',
    power: 25,
    mpCost: 15,
    cooldown: 6000,
    aoeMin: 2,
    aoeMax: 3,
    lastUsedAt: 0,
  };
}

function createWindBlade(): Skill {
  return {
    id: 'wind-blade',
    name: '風刃',
    level: 1,
    element: 'wind',
    type: 'attack',
    target: 'single',
    power: 10,
    mpCost: 5,
    cooldown: 3000,
    lastUsedAt: 0,
  };
}

function createCombatContext(overrides: Partial<CombatScriptContext> = {}): CombatScriptContext {
  return {
    character: createTestCharacter(),
    monsters: [createTestMonster()],
    skills: [createWindBlade()],
    now: 10000,
    ...overrides,
  };
}

describe('evaluateCombatScript', () => {
  it('should return null for empty rules', () => {
    const result = evaluateCombatScript([], createCombatContext());
    expect(result).toBeNull();
  });

  it('should skip disabled rules', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: false, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toBeNull();
  });

  it('should return null when all rules are disabled (character idles)', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: false, condition: { type: 'always' }, action: { type: 'normal_attack' } },
      { id: 'r2', enabled: false, condition: { type: 'always' }, action: { type: 'skill', skillId: 'wind-blade' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toBeNull();
  });

  it('should match "always" condition and return normal_attack', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toEqual({ type: 'normal_attack' });
  });

  it('should match "always" condition and return wait action', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'wait' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toEqual({ type: 'wait' });
  });

  it('should return skill action when skill is ready', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const ctx = createCombatContext({ skills: [createWindBlade()] });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'skill', skillId: 'wind-blade' });
  });

  it('should skip skill rule when on cooldown and fall to next rule', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const skill = createWindBlade();
    skill.lastUsedAt = 9000; // used 1s ago, cooldown 3s -> not ready
    const ctx = createCombatContext({ skills: [skill], now: 10000 });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'normal_attack' });
  });

  it('should skip skill rule when MP insufficient and fall to next rule', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'skill', skillId: 'fireball' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'wait' } },
    ];
    const ctx = createCombatContext({
      character: createTestCharacter({ mp: 5 }),
      skills: [createFireball()],
    });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'wait' });
  });

  it('should match monster_count_gte condition', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'monster_count_gte', value: 2 }, action: { type: 'skill', skillId: 'fireball' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const monsters = [createTestMonster(), createTestMonster()];
    const ctx = createCombatContext({ monsters, skills: [createFireball()] });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'skill', skillId: 'fireball' });
  });

  it('should not match monster_count_gte when not enough alive monsters', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'monster_count_gte', value: 3 }, action: { type: 'skill', skillId: 'fireball' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const monsters = [createTestMonster(), createTestMonster({ currentHp: 0 })];
    const ctx = createCombatContext({ monsters, skills: [createFireball()] });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'normal_attack' });
  });

  it('should match monster_hp_below condition', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'monster_hp_below', value: 50 }, action: { type: 'normal_attack' } },
    ];
    const monsters = [createTestMonster({ currentHp: 10, maxHp: 30 })];
    const ctx = createCombatContext({ monsters });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'normal_attack' });
  });

  it('should not match monster_hp_below when all monsters above threshold', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'monster_hp_below', value: 50 }, action: { type: 'normal_attack' } },
    ];
    const monsters = [createTestMonster({ currentHp: 25, maxHp: 30 })];
    const ctx = createCombatContext({ monsters });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toBeNull();
  });

  it('should evaluate rules in priority order (first match wins)', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'monster_count_gte', value: 2 }, action: { type: 'skill', skillId: 'fireball' } },
      { id: 'r2', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r3', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const monsters = [createTestMonster(), createTestMonster()];
    const ctx = createCombatContext({ monsters, skills: [createFireball(), createWindBlade()] });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'skill', skillId: 'fireball' });
  });

  it('wait action should always be executable', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'wait' } },
    ];
    const ctx = createCombatContext({ character: createTestCharacter({ mp: 0 }) });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'wait' });
  });

  it('should respect cooldown reduction for skill_ready condition', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    // skill cooldown: 3000ms, used at 8000, now=10000 → 2000ms elapsed
    // without reduction: not ready (2000 < 3000)
    // with 50% reduction: ready (2000 >= 3000 * 0.5 = 1500)
    const skill = createWindBlade();
    skill.lastUsedAt = 8000;
    const ctxNoReduction = createCombatContext({ skills: [skill], now: 10000 });
    expect(evaluateCombatScript(rules, ctxNoReduction)).toEqual({ type: 'normal_attack' });

    const ctxWithReduction = createCombatContext({ skills: [skill], now: 10000, cooldownReduction: 50 });
    expect(evaluateCombatScript(rules, ctxWithReduction)).toEqual({ type: 'skill', skillId: 'wind-blade' });
  });
});
