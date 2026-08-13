import { describe, it, expect } from 'vitest';
import { evaluateCombatScript } from '../scriptRunner';
import type { CombatRule } from '../../models/scriptEngine';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { CombatScriptContext, ScriptMonsterView } from '../scriptRunner';

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

/** 腳本看到的一隻怪：預設站在角色腳邊（0,0 是玩家位置） */
let monSeq = 0;
function mon(
  position: { x: number; y: number } = { x: 1, y: 0 },
  overrides: Partial<MonsterInstance> = {},
): ScriptMonsterView {
  monSeq += 1;
  return {
    id: `m${monSeq}`,
    instance: createTestMonster(overrides),
    position,
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
    range: 12,
    aoeCenter: 'target',
    aoeRadius: 3,
    maxTargets: 3,
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
    range: 10,
    lastUsedAt: 0,
  };
}

function createCombatContext(overrides: Partial<CombatScriptContext> = {}): CombatScriptContext {
  return {
    character: createTestCharacter(),
    monsters: [mon()],
    skills: [createWindBlade()],
    now: 10000,
    playerPos: { x: 0, y: 0 },
    primaryTargetId: null,
    weaponRange: 1.5,
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
      { id: 'r1', enabled: false, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toBeNull();
  });

  it('should return null when all rules are disabled (character idles)', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: false, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      { id: 'r2', enabled: false, conditions: [{ type: 'always' }], action: { type: 'skill', skillId: 'wind-blade' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toBeNull();
  });

  it('should match "always" condition and return normal_attack', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toEqual({ type: 'normal_attack' });
  });

  it('should treat an empty conditions array as unconditional', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [], action: { type: 'normal_attack' } },
    ];
    expect(evaluateCombatScript(rules, createCombatContext())).toEqual({ type: 'normal_attack' });
  });

  it('should match "always" condition and return wait action', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'wait' } },
    ];
    const result = evaluateCombatScript(rules, createCombatContext());
    expect(result).toEqual({ type: 'wait' });
  });

  it('should return skill action when skill is ready', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'skill_ready', skillId: 'wind-blade' }], action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
    ];
    const ctx = createCombatContext({ skills: [createWindBlade()] });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'skill', skillId: 'wind-blade' });
  });

  it('should skip skill rule when on cooldown and fall to next rule', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'skill_ready', skillId: 'wind-blade' }], action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
    ];
    const skill = createWindBlade();
    skill.lastUsedAt = 9000; // used 1s ago, cooldown 3s -> not ready
    const ctx = createCombatContext({ skills: [skill], now: 10000 });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'normal_attack' });
  });

  it('should skip skill rule when MP insufficient and fall to next rule', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'skill', skillId: 'fireball' } },
      { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'wait' } },
    ];
    const ctx = createCombatContext({
      character: createTestCharacter({ mp: 5 }),
      skills: [createFireball()],
    });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'wait' });
  });

  describe('monster_count_gte（攻擊範圍內怪數）', () => {
    it('should count monsters within the rule skill range', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monster_count_gte', value: 2 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      // 火球射程 12，兩隻都在圈內
      const monsters = [mon({ x: 3, y: 0 }), mon({ x: 8, y: 0 })];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'skill', skillId: 'fireball' });
    });

    it('should ignore monsters outside the rule action range', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monster_count_gte', value: 2 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      // 第二隻在 20 格外，超出火球的 12 格射程 → 圈內只有 1 隻
      const monsters = [mon({ x: 3, y: 0 }), mon({ x: 20, y: 0 })];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'normal_attack' });
    });

    it('should use weapon range for normal attack rules', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monster_count_gte', value: 2 }], action: { type: 'normal_attack' } },
      ];
      // 武器射程 1.5：一隻貼身、一隻 5 格外 → 不成立
      const ctx = createCombatContext({ monsters: [mon({ x: 1, y: 0 }), mon({ x: 5, y: 0 })] });
      expect(evaluateCombatScript(rules, ctx)).toBeNull();
    });
  });

  describe('monsters_near_self_gte（自身周圍怪數）', () => {
    it('should count monsters within the given radius of the player', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monsters_near_self_gte', value: 3, radius: 5 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      const monsters = [mon({ x: 1, y: 0 }), mon({ x: 0, y: 2 }), mon({ x: 3, y: 3 })];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'skill', skillId: 'fireball' });
    });

    it('should not count monsters outside the radius', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monsters_near_self_gte', value: 3, radius: 2 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      const monsters = [mon({ x: 1, y: 0 }), mon({ x: 0, y: 2 }), mon({ x: 9, y: 9 })];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'normal_attack' });
    });
  });

  describe('aoe_hit_count_gte（本招命中數）', () => {
    it('should cast the AoE skill when monsters are clustered around the target', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'aoe_hit_count_gte', value: 3 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      // 火球 aoeRadius 3：三隻擠在一起
      const monsters = [mon({ x: 5, y: 0 }), mon({ x: 6, y: 0 }), mon({ x: 5, y: 2 })];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'skill', skillId: 'fireball' });
    });

    it('should fall through when the same three monsters are scattered', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'aoe_hit_count_gte', value: 3 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      // 三隻活怪，但彼此距離都超過 aoeRadius 3 → 只會打到主目標
      const monsters = [mon({ x: 5, y: 0 }), mon({ x: 5, y: 10 }), mon({ x: 11, y: 0 })];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'normal_attack' });
    });

    it('should not gate on range: monsters far away still count as hits', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'aoe_hit_count_gte', value: 3 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      // 怪群在 40 格外（遠超火球 12 格射程）：條件仍要成立
      const monsters = [mon({ x: 40, y: 0 }), mon({ x: 41, y: 0 }), mon({ x: 40, y: 2 })];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'skill', skillId: 'fireball' });
    });

    it('should count 1 for a single-target skill no matter how many monsters', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'aoe_hit_count_gte', value: 2 }], action: { type: 'skill', skillId: 'wind-blade' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      const monsters = [mon({ x: 1, y: 0 }), mon({ x: 1, y: 1 }), mon({ x: 2, y: 1 })];
      const ctx = createCombatContext({ monsters });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'normal_attack' });
    });

    it('should respect the skill maxTargets cap', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'aoe_hit_count_gte', value: 4 }], action: { type: 'skill', skillId: 'fireball' } },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      // 五隻擠在一起，但火球 maxTargets 只有 3 → 命中數永遠到不了 4
      const monsters = [
        mon({ x: 5, y: 0 }), mon({ x: 5, y: 1 }), mon({ x: 6, y: 0 }),
        mon({ x: 6, y: 1 }), mon({ x: 5, y: 2 }),
      ];
      const ctx = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'normal_attack' });
    });
  });

  describe('目標 HP 條件', () => {
    it('should match monster_hp_below on the current target', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monster_hp_below', value: 50 }], action: { type: 'normal_attack' } },
      ];
      const target = mon({ x: 1, y: 0 }, { currentHp: 10, maxHp: 30 });
      const ctx = createCombatContext({ monsters: [target], primaryTargetId: target.id });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'normal_attack' });
    });

    it('should not match when the current target is above the threshold, even if another monster is hurt', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monster_hp_below', value: 50 }], action: { type: 'normal_attack' } },
      ];
      const target = mon({ x: 1, y: 0 }, { currentHp: 25, maxHp: 30 });
      const other = mon({ x: 9, y: 9 }, { currentHp: 1, maxHp: 30 });
      const ctx = createCombatContext({ monsters: [target, other], primaryTargetId: target.id });
      expect(evaluateCombatScript(rules, ctx)).toBeNull();
    });

    it('should fall back to the nearest monster when no target is selected', () => {
      const rules: CombatRule[] = [
        { id: 'r1', enabled: true, conditions: [{ type: 'monster_hp_below', value: 50 }], action: { type: 'normal_attack' } },
      ];
      const near = mon({ x: 1, y: 0 }, { currentHp: 3, maxHp: 30 });
      const far = mon({ x: 20, y: 0 }, { currentHp: 30, maxHp: 30 });
      const ctx = createCombatContext({ monsters: [far, near], primaryTargetId: null });
      expect(evaluateCombatScript(rules, ctx)).toEqual({ type: 'normal_attack' });
    });
  });

  describe('多條件 AND', () => {
    it('should require every condition to hold', () => {
      const rules: CombatRule[] = [
        {
          id: 'r1',
          enabled: true,
          conditions: [
            { type: 'aoe_hit_count_gte', value: 3 },
            { type: 'mp_above', value: 80 },
          ],
          action: { type: 'skill', skillId: 'fireball' },
        },
        { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      ];
      const monsters = [mon({ x: 5, y: 0 }), mon({ x: 6, y: 0 }), mon({ x: 5, y: 2 })];
      // MP 50/50 = 100% > 80 → 兩條都成立
      const ok = createCombatContext({ monsters, skills: [createFireball()] });
      expect(evaluateCombatScript(rules, ok)).toEqual({ type: 'skill', skillId: 'fireball' });

      // 怪聚在一起但 MP 只有 60% → 整條規則不成立
      const lowMp = createCombatContext({
        monsters,
        skills: [createFireball()],
        character: createTestCharacter({ mp: 30 }),
      });
      expect(evaluateCombatScript(rules, lowMp)).toEqual({ type: 'normal_attack' });
    });
  });

  it('should evaluate rules in priority order (first match wins)', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'monster_count_gte', value: 2 }], action: { type: 'skill', skillId: 'fireball' } },
      { id: 'r2', enabled: true, conditions: [{ type: 'skill_ready', skillId: 'wind-blade' }], action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r3', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
    ];
    const monsters = [mon({ x: 3, y: 0 }), mon({ x: 4, y: 0 })];
    const ctx = createCombatContext({ monsters, skills: [createFireball(), createWindBlade()] });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'skill', skillId: 'fireball' });
  });

  it('wait action should always be executable', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'wait' } },
    ];
    const ctx = createCombatContext({ character: createTestCharacter({ mp: 0 }) });
    const result = evaluateCombatScript(rules, ctx);
    expect(result).toEqual({ type: 'wait' });
  });

  it('should respect cooldown reduction for skill_ready condition', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'skill_ready', skillId: 'wind-blade' }], action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
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
