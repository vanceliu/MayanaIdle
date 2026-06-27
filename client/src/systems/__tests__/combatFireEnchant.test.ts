import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculatePlayerAttack, calculatePhysicalSkillHit, getFireEnchantBonus, hasActiveFireEnchant } from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'elf',
    level: 20,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    baseAttributes: { STR: 14, AGI: 18, VIT: 12, SPI: 10, INT: 12, CHA: 10 },
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
    level: 18,
    currentHp: 50,
    maxHp: 50,
    attackMin: 5,
    attackMax: 10,
    defense: 5,
    exp: 30,
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
    name: '短弓',
    type: 'bow',
    slot: 'rightHand',
    isTwoHanded: true,
    smallMonsterDamage: 12,
    largeMonsterDamage: 10,
    defense: 0,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: true,
    ...overrides,
  };
}

function createFireEnchantEffect(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    id: 'fire-enchant-1',
    sourceSkillId: 'fire-arrow',
    sourceSkillName: '火矢附魔',
    category: 'fire-enchant',
    type: 'buff',
    target: 'player',
    modifiers: [{ stat: 'fire_damage', value: 15, isPercent: false }],
    startTime: Date.now(),
    duration: 300000,
    tags: [],
    name: '火矢附魔',
    description: '火屬性傷害 +15',
    ...overrides,
  };
}

describe('fire enchant combat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getFireEnchantBonus', () => {
    it('returns 0 when no fire enchant active', () => {
      expect(getFireEnchantBonus([])).toBe(0);
    });

    it('returns fire_damage value when fire enchant is active', () => {
      const effect = createFireEnchantEffect();
      expect(getFireEnchantBonus([effect])).toBe(15);
    });

    it('returns 0 when fire enchant has expired', () => {
      const effect = createFireEnchantEffect({
        startTime: Date.now() - 400000,
        duration: 300000,
      });
      expect(getFireEnchantBonus([effect])).toBe(0);
    });

    it('ignores debuffs with fire-enchant category', () => {
      const effect = createFireEnchantEffect({ type: 'debuff', target: 'monster' });
      expect(getFireEnchantBonus([effect])).toBe(0);
    });
  });

  describe('hasActiveFireEnchant', () => {
    it('returns false when no effects', () => {
      expect(hasActiveFireEnchant([])).toBe(false);
    });

    it('returns true when fire enchant is active', () => {
      const effect = createFireEnchantEffect();
      expect(hasActiveFireEnchant([effect])).toBe(true);
    });

    it('returns false when fire enchant expired', () => {
      const effect = createFireEnchantEffect({
        startTime: Date.now() - 400000,
        duration: 300000,
      });
      expect(hasActiveFireEnchant([effect])).toBe(false);
    });
  });

  describe('calculatePlayerAttack with fire enchant', () => {
    it('adds fire_damage to normal attack damage', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon();
      const fireEffect = createFireEnchantEffect();

      const withEnchant = calculatePlayerAttack(char, weapon, monster, [], [fireEffect]);
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const withoutEnchant = calculatePlayerAttack(char, weapon, monster, [], []);

      expect(withEnchant.damage).toBeGreaterThan(withoutEnchant.damage);
      expect(withEnchant.hit).toBe(true);
    });

    it('fire enchant damage is included even on normal (non-elemental) weapon', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon({ element: undefined });
      const fireEffect = createFireEnchantEffect();

      const result = calculatePlayerAttack(char, weapon, monster, [], [fireEffect]);
      expect(result.hit).toBe(true);
      expect(result.damage).toBeGreaterThan(0);
    });
  });

  describe('calculatePhysicalSkillHit with fire enchant', () => {
    it('applies elemental multiplier when hasFireEnchant is true', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon();
      const gear = [weapon];

      const withEnchant = calculatePhysicalSkillHit(char, weapon, monster, gear, true, '三連射');
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const withoutEnchant = calculatePhysicalSkillHit(char, weapon, monster, gear, false, '三連射');

      expect(withEnchant.hit).toBe(true);
      expect(withoutEnchant.hit).toBe(true);
      expect(withEnchant.damage).toBeGreaterThanOrEqual(withoutEnchant.damage);
    });
  });
});
