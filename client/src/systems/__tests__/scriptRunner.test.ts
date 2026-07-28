import { describe, it, expect } from 'vitest';
import { evaluateScript } from '../scriptRunner';
import type { ScriptRule } from '../../models/scriptEngine';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { ScriptContext } from '../scriptRunner';

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'knight',
    level: 5,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 30,
    maxMp: 30,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0,
    currentArea: 'dawn-plains',
    currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    userId: 1,
    unspentAttributePoints: 0,
    quests: [],
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

function createTestSkill(overrides: Partial<Skill> = {}): Skill {
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
    ...overrides,
  };
}

function createContext(overrides: Partial<ScriptContext> = {}): ScriptContext {
  return {
    character: createTestCharacter(),
    monsters: [createTestMonster()],
    skills: [createTestSkill()],
    lastPotionUsedAt: 0,
    now: 10000,
    bagItems: [
      { name: '紅色藥水', type: 'potion', amount: 5 },
      { name: '橙色藥水', type: 'potion', amount: 3 },
      { name: '白色藥水', type: 'potion', amount: 1 },
    ],
    ...overrides,
  };
}

describe('scriptRunner', () => {
  describe('evaluateScript', () => {
    it('should return null for empty rules', () => {
      const result = evaluateScript([], createContext());
      expect(result).toBeNull();
    });

    it('should skip disabled rules', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: false, condition: { type: 'always' }, action: { type: 'normal_attack' } },
      ];
      const result = evaluateScript(rules, createContext());
      expect(result).toBeNull();
    });

    it('should match "always" condition', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
      ];
      const result = evaluateScript(rules, createContext());
      expect(result).toEqual({ type: 'normal_attack' });
    });

    it('should match hp_below condition', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'potion', potionType: 'red' } },
      ];
      const ctx = createContext({ character: createTestCharacter({ hp: 30, maxHp: 100 }) });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'potion', potionType: 'red' });
    });

    it('should not match hp_below when HP is above threshold', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'potion', potionType: 'red' } },
      ];
      const ctx = createContext({ character: createTestCharacter({ hp: 80, maxHp: 100 }) });
      const result = evaluateScript(rules, ctx);
      expect(result).toBeNull();
    });

    it('should match hp_above condition', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_above', value: 50 }, action: { type: 'normal_attack' } },
      ];
      const ctx = createContext({ character: createTestCharacter({ hp: 80, maxHp: 100 }) });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'normal_attack' });
    });

    it('should match mp_below condition', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'mp_below', value: 30 }, action: { type: 'flee_town' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ mp: 5, maxMp: 30 }),
        bagItems: [{ name: '薄暮村回城卷軸', type: 'scroll', amount: 1 }],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_town' });
    });

    it('should match monster_count_gte condition', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'monster_count_gte', value: 3 }, action: { type: 'skill', skillId: 'fireball' } },
      ];
      const monsters = [createTestMonster(), createTestMonster(), createTestMonster()];
      const fireball: Skill = { id: 'fireball', name: '火球', level: 3, element: 'fire', type: 'attack', target: 'aoe', power: 25, mpCost: 15, cooldown: 6000, lastUsedAt: 0 };
      const ctx = createContext({ monsters, skills: [fireball] });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'skill', skillId: 'fireball' });
    });

    it('should not count dead monsters for monster_count_gte', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'monster_count_gte', value: 2 }, action: { type: 'skill', skillId: 'fireball' } },
      ];
      const monsters = [
        createTestMonster({ currentHp: 30 }),
        createTestMonster({ currentHp: 0 }),
        createTestMonster({ currentHp: 0 }),
      ];
      const fireball: Skill = { id: 'fireball', name: '火球', level: 3, element: 'fire', type: 'attack', target: 'aoe', power: 25, mpCost: 15, cooldown: 6000, lastUsedAt: 0 };
      const ctx = createContext({ monsters, skills: [fireball] });
      const result = evaluateScript(rules, ctx);
      expect(result).toBeNull();
    });

    it('should match monster_hp_below condition', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'monster_hp_below', value: 50 }, action: { type: 'normal_attack' } },
      ];
      const monsters = [createTestMonster({ currentHp: 10, maxHp: 30 })];
      const ctx = createContext({ monsters });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'normal_attack' });
    });

    it('should match skill_ready condition when cooldown expired', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
      ];
      const skill = createTestSkill({ lastUsedAt: 0 }); // used at 0, now=10000, cooldown=3000 → ready
      const ctx = createContext({ skills: [skill], now: 10000 });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'skill', skillId: 'wind-blade' });
    });

    it('should not match skill_ready when on cooldown', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
      ];
      const skill = createTestSkill({ lastUsedAt: 9000 }); // used 1s ago, cooldown=3s → not ready
      const ctx = createContext({ skills: [skill], now: 10000 });
      const result = evaluateScript(rules, ctx);
      expect(result).toBeNull();
    });

    it('should not execute potion action when no potions available', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'potion', potionType: 'red' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 20, maxHp: 100 }),
        bagItems: [],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toBeNull();
    });

    it('should not execute skill when MP insufficient', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'skill', skillId: 'wind-blade' } },
      ];
      const skill = createTestSkill({ mpCost: 50 });
      const ctx = createContext({
        character: createTestCharacter({ mp: 10 }),
        skills: [skill],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toBeNull();
    });

    it('should execute rules in priority order (first match wins)', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_town' } },
        { id: 'r2', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'potion', potionType: 'red' } },
        { id: 'r3', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 20, maxHp: 100 }),
        bagItems: [
          { name: '紅色藥水', type: 'potion', amount: 5 },
          { name: '薄暮村回城卷軸', type: 'scroll', amount: 1 },
        ],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_town' });
    });

    it('should skip to next rule when action cannot execute', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'potion', potionType: 'red' } },
        { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'flee_teleport' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 20, maxHp: 100 }),
        bagItems: [],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_teleport' });
    });

    it('should support orange and white potion types', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'potion', potionType: 'orange' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 50, maxHp: 100 }),
        bagItems: [{ name: '橙色藥水', type: 'potion', amount: 5 }],
      });
      expect(evaluateScript(rules, ctx)).toEqual({ type: 'potion', potionType: 'orange' });

      const rules2: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'potion', potionType: 'white' } },
      ];
      const ctx2 = createContext({
        character: createTestCharacter({ hp: 50, maxHp: 100 }),
        bagItems: [{ name: '白色藥水', type: 'potion', amount: 2 }],
      });
      expect(evaluateScript(rules2, ctx2)).toEqual({ type: 'potion', potionType: 'white' });
    });

    it('should not execute potion when HP is full', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'potion', potionType: 'red' } },
      ];
      const ctx = createContext({ character: createTestCharacter({ hp: 100, maxHp: 100 }) });
      expect(evaluateScript(rules, ctx)).toBeNull();
    });

    it('should not execute flee_town when no scroll in bag', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_town' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 10, maxHp: 100 }),
        bagItems: [],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toBeNull();
    });

    it('should execute flee_town when scroll available in bag', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_town' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 10, maxHp: 100 }),
        bagItems: [{ name: '艾爾薩斯回城卷軸', type: 'scroll', amount: 3 }],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_town' });
    });

    it('should fall through flee_town to next rule when no scroll', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_town' } },
        { id: 'r2', enabled: true, condition: { type: 'hp_below', value: 50 }, action: { type: 'flee_teleport' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 10, maxHp: 100 }),
        bagItems: [],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_teleport' });
    });

    it('should always allow flee_teleport without scroll', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'flee_teleport' } },
      ];
      const ctx = createContext({ bagItems: [] });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_teleport' });
    });

    it('should execute flee_town with specific scrollTownId when that scroll is available', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_town', scrollTownId: 'elsarth-town' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 10 }),
        bagItems: [{ name: '艾爾薩斯回城卷軸', type: 'scroll', amount: 2 }],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_town', scrollTownId: 'elsarth-town' });
    });

    it('should not execute flee_town with specific scrollTownId when that scroll is unavailable', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_town', scrollTownId: 'elsarth-town' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 10 }),
        bagItems: [{ name: '薄暮村回城卷軸', type: 'scroll', amount: 5 }],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toBeNull();
    });

    it('should execute flee_town without scrollTownId using any available scroll', () => {
      const rules: ScriptRule[] = [
        { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_town' } },
      ];
      const ctx = createContext({
        character: createTestCharacter({ hp: 10 }),
        bagItems: [{ name: '瓦爾登回城卷軸', type: 'scroll', amount: 1 }],
      });
      const result = evaluateScript(rules, ctx);
      expect(result).toEqual({ type: 'flee_town' });
    });
  });
});
