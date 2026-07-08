import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculatePlayerAttack, calculateMonsterAttack, calculateSkillAttack, getMonsterDebuffModifier } from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'knight',
    level: 10,
    exp: 0,
    expToNext: 100,
    hp: 200,
    maxHp: 200,
    mp: 80,
    maxMp: 80,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
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
    name: '石甲獸',
    level: 10,
    currentHp: 100,
    maxHp: 100,
    attackMin: 20,
    attackMax: 20,
    defense: 30,
    exp: 50,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    ...overrides,
  };
}

function createTestWeapon(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1,
    name: '鐵劍',
    type: 'sword',
    slot: 'rightHand',
    isTwoHanded: false,
    smallMonsterDamage: 15,
    largeMonsterDamage: 12,
    defense: 0,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: true,
    ...overrides,
  };
}

describe('Monster Debuff System', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(Date, 'now').mockReturnValue(10000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMonsterDebuffModifier', () => {
    it('should return 0 when no debuffs exist', () => {
      const result = getMonsterDebuffModifier([], 0, 'defense');
      expect(result).toBe(0);
    });

    it('should return defense debuff percentage for correct target', () => {
      const effects: ActiveEffect[] = [{
        id: 'debuff-defense-down-0-5000',
        sourceSkillId: 'armor-break',
        sourceSkillName: '護甲崩壞',
        category: 'defense-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'defense', value: -15, isPercent: true }],
        startTime: 5000,
        duration: 15000,
        tags: ['armor-break'],
        name: '護甲崩壞',
        description: '防禦值降低15%',
      }];
      const result = getMonsterDebuffModifier(effects, 0, 'defense');
      expect(result).toBe(-15);
    });

    it('should not apply debuff to wrong target index', () => {
      const effects: ActiveEffect[] = [{
        id: 'debuff-defense-down-0-5000',
        sourceSkillId: 'armor-break',
        sourceSkillName: '護甲崩壞',
        category: 'defense-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'defense', value: -15, isPercent: true }],
        startTime: 5000,
        duration: 15000,
        tags: ['armor-break'],
        name: '護甲崩壞',
        description: '防禦值降低15%',
      }];
      const result = getMonsterDebuffModifier(effects, 1, 'defense');
      expect(result).toBe(0);
    });

    it('should not apply expired debuff', () => {
      const effects: ActiveEffect[] = [{
        id: 'debuff-defense-down-0-1000',
        sourceSkillId: 'armor-break',
        sourceSkillName: '護甲崩壞',
        category: 'defense-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'defense', value: -15, isPercent: true }],
        startTime: 1000,
        duration: 5000,
        tags: ['armor-break'],
        name: '護甲崩壞',
        description: '防禦值降低15%',
      }];
      // Date.now() = 10000, startTime=1000, duration=5000 → expired at 6000
      const result = getMonsterDebuffModifier(effects, 0, 'defense');
      expect(result).toBe(0);
    });

    it('should return attack debuff from curse', () => {
      const effects: ActiveEffect[] = [{
        id: 'debuff-atk-down-0-5000',
        sourceSkillId: 'curse',
        sourceSkillName: '詛咒',
        category: 'atk-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'attack', value: -15, isPercent: true }],
        startTime: 5000,
        duration: 10000,
        tags: ['curse'],
        name: '詛咒',
        description: '攻擊力降低15%',
      }];
      const result = getMonsterDebuffModifier(effects, 0, 'attack');
      expect(result).toBe(-15);
    });
  });

  describe('calculatePlayerAttack with defense debuff (armor-break)', () => {
    it('should deal more damage when monster has defense-down debuff', () => {
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 30 });
      const weapon = createTestWeapon();

      // Without debuff
      const resultNormal = calculatePlayerAttack(char, weapon, monster, [weapon], [], 0);

      // With defense-down debuff (-15%)
      const effects: ActiveEffect[] = [{
        id: 'debuff-defense-down-0-5000',
        sourceSkillId: 'armor-break',
        sourceSkillName: '護甲崩壞',
        category: 'defense-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'defense', value: -15, isPercent: true }],
        startTime: 5000,
        duration: 15000,
        tags: ['armor-break'],
        name: '護甲崩壞',
        description: '防禦值降低15%',
      }];
      const resultDebuffed = calculatePlayerAttack(char, weapon, monster, [weapon], effects, 0);

      // Both should hit (random is 0.5, hitRate > 50)
      expect(resultNormal.hit).toBe(true);
      expect(resultDebuffed.hit).toBe(true);
      // Debuffed should deal more damage due to lower monster defense
      expect(resultDebuffed.damage).toBeGreaterThan(resultNormal.damage);
    });
  });

  describe('calculateMonsterAttack with attack debuff (curse/taunt)', () => {
    it('should deal less damage when monster has attack-down debuff', () => {
      const char = createTestCharacter({ className: 'knight' });
      // Fixed attack values for deterministic test
      const monster = createTestMonster({ attackMin: 20, attackMax: 20 });

      // Without debuff — mock random for no dodge
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const resultNormal = calculateMonsterAttack(monster, char, [], [], 0);

      // With attack-down debuff (-15%)
      const effects: ActiveEffect[] = [{
        id: 'debuff-atk-down-0-5000',
        sourceSkillId: 'curse',
        sourceSkillName: '詛咒',
        category: 'atk-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'attack', value: -15, isPercent: true }],
        startTime: 5000,
        duration: 10000,
        tags: ['curse'],
        name: '詛咒',
        description: '攻擊力降低15%',
      }];
      const resultDebuffed = calculateMonsterAttack(monster, char, [], effects, 0);

      expect(resultNormal.hit).toBe(true);
      expect(resultDebuffed.hit).toBe(true);
      // Debuffed monster should deal less damage
      expect(resultDebuffed.damage).toBeLessThan(resultNormal.damage);
    });

    it('should apply taunt -20% attack reduction', () => {
      const char = createTestCharacter({ className: 'knight' });
      const monster = createTestMonster({ attackMin: 100, attackMax: 100 });

      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      const effects: ActiveEffect[] = [{
        id: 'debuff-atk-down-0-5000',
        sourceSkillId: 'taunt',
        sourceSkillName: '挑釁怒吼',
        category: 'atk-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'attack', value: -20, isPercent: true }],
        startTime: 5000,
        duration: 10000,
        tags: ['taunt'],
        name: '挑釁',
        description: '攻擊力降低20%',
      }];

      const resultNormal = calculateMonsterAttack(monster, char, [], [], 0);
      const resultDebuffed = calculateMonsterAttack(monster, char, [], effects, 0);

      expect(resultNormal.hit).toBe(true);
      expect(resultDebuffed.hit).toBe(true);
      // With 100 base damage and -20% debuff, damage should be 80 before defense
      expect(resultDebuffed.damage).toBeLessThan(resultNormal.damage);
    });
  });

  describe('calculateSkillAttack with defense debuff', () => {
    it('should deal more skill damage with defense-down debuff', () => {
      const char = createTestCharacter({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 20, CHA: 12 } });
      const monster = createTestMonster({ defense: 30 });

      const resultNormal = calculateSkillAttack(char, 50, 'fire', monster, [], '火球', [], 0);

      const effects: ActiveEffect[] = [{
        id: 'debuff-defense-down-0-5000',
        sourceSkillId: 'armor-break',
        sourceSkillName: '護甲崩壞',
        category: 'defense-down',
        type: 'debuff',
        target: 'monster',
        targetIdx: 0,
        modifiers: [{ stat: 'defense', value: -15, isPercent: true }],
        startTime: 5000,
        duration: 15000,
        tags: ['armor-break'],
        name: '護甲崩壞',
        description: '防禦值降低15%',
      }];
      const resultDebuffed = calculateSkillAttack(char, 50, 'fire', monster, [], '火球', effects, 0);

      expect(resultDebuffed.damage).toBeGreaterThan(resultNormal.damage);
    });
  });
});
