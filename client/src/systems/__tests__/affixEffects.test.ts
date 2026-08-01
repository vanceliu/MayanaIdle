import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPlayerAttackInterval, getSkillCooldownReduction, getAffixBonusesFromGear } from '../combat';
import { canUseSkill, isSkillReady } from '../../models/skill';
import type { EquipmentInstance } from '../../models/equipment';
import type { Skill } from '../../models/skill';
import type { Character } from '../../models/character';

/** INT 每 2 點 +1% 冷卻縮減（§ 20.6），因此測詞綴時預設用 INT 0 隔離變因 */
function charWithInt(int: number): Character {
  return {
    name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 100,
    hp: 100, maxHp: 100, mp: 100, maxMp: 100,
    baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: int, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

function createTestArmor(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 2,
    name: '鐵甲',
    type: 'armor',
    slot: 'chest',
    isTwoHanded: false,
    defense: 20,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: true,
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

describe('affix effects integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('attack_speed', () => {
    it('should return base interval (1200ms) with no attack_speed affix', () => {
      const gear = [createTestWeapon()];
      const interval = getPlayerAttackInterval(gear);
      expect(interval).toBe(1200);
    });

    it('should reduce attack interval with attack_speed affix', () => {
      const weapon = createTestWeapon({
        affixes: [{ type: 'attack_speed', tier: 3, value: 20 }],
      });
      const interval = getPlayerAttackInterval([weapon]);
      // 1200 / (1 + 20/100) = 1200 / 1.2 = 1000
      expect(interval).toBe(1000);
    });

    it('should stack attack_speed from multiple gear pieces', () => {
      const weapon = createTestWeapon({
        affixes: [{ type: 'attack_speed', tier: 2, value: 10 }],
      });
      const armor = createTestArmor({
        affixes: [{ type: 'attack_speed', tier: 2, value: 10 }],
      });
      const interval = getPlayerAttackInterval([weapon, armor]);
      // 1200 / (1 + 20/100) = 1000
      expect(interval).toBe(1000);
    });

    it('should clamp to minimum 300ms interval', () => {
      const weapon = createTestWeapon({
        affixes: [{ type: 'attack_speed', tier: 7, value: 500 }],
      });
      const interval = getPlayerAttackInterval([weapon]);
      expect(interval).toBe(300);
    });
  });

  describe('cooldown_reduction', () => {
    it('should return 0 with no cooldown_reduction affix', () => {
      const gear = [createTestWeapon()];
      const cdr = getSkillCooldownReduction(charWithInt(0), gear);
      expect(cdr).toBe(0);
    });

    it('should return affix value when present', () => {
      const weapon = createTestWeapon({
        affixes: [{ type: 'cooldown_reduction', tier: 3, value: 12 }],
      });
      const cdr = getSkillCooldownReduction(charWithInt(0), [weapon]);
      expect(cdr).toBe(12);
    });

    it('should cap at 50%', () => {
      const weapon = createTestWeapon({
        affixes: [{ type: 'cooldown_reduction', tier: 7, value: 60 }],
      });
      const cdr = getSkillCooldownReduction(charWithInt(0), [weapon]);
      expect(cdr).toBe(50);
    });

    it('智力每 2 點提供 1% 冷卻縮減，與詞綴加算', () => {
      const weapon = createTestWeapon({
        affixes: [{ type: 'cooldown_reduction', tier: 3, value: 12 }],
      });
      // INT 21 → 有效 20 → 20 / 2 × 1% = 10%
      expect(getSkillCooldownReduction(charWithInt(21), [weapon])).toBe(22);
      // 沒有詞綴時也生效
      expect(getSkillCooldownReduction(charWithInt(21), [createTestWeapon()])).toBe(10);
    });

    it('智力提供的冷卻縮減同樣受 50% 上限', () => {
      const weapon = createTestWeapon({
        affixes: [{ type: 'cooldown_reduction', tier: 7, value: 40 }],
      });
      // 40 + (40 / 2 × 1) = 60 → clamp 50
      expect(getSkillCooldownReduction(charWithInt(40), [weapon])).toBe(50);
    });

    it('should reduce effective skill cooldown in isSkillReady', () => {
      const skill: Skill = {
        id: 'test',
        name: 'Test',
        level: 1,
        element: 'fire',
        type: 'attack',
        target: 'single',
        power: 10,
        mpCost: 5,
        cooldown: 3000,
        lastUsedAt: 1000,
      };

      // Without CDR: need 3000ms elapsed
      expect(isSkillReady(skill, 3500, 0)).toBe(false);
      expect(isSkillReady(skill, 4000, 0)).toBe(true);

      // With 20% CDR: effective cooldown = 2400ms
      expect(isSkillReady(skill, 3300, 20)).toBe(false);
      expect(isSkillReady(skill, 3400, 20)).toBe(true);
    });

    it('should apply CDR in canUseSkill', () => {
      const skill: Skill = {
        id: 'test',
        name: 'Test',
        level: 1,
        element: 'fire',
        type: 'attack',
        target: 'single',
        power: 10,
        mpCost: 5,
        cooldown: 3000,
        lastUsedAt: 1000,
      };

      // With 50% CDR: effective cooldown = 1500ms, ready at 2500
      expect(canUseSkill(skill, 10, 2400, 50)).toBe(false);
      expect(canUseSkill(skill, 10, 2500, 50)).toBe(true);

      // Not enough MP
      expect(canUseSkill(skill, 3, 5000, 50)).toBe(false);
    });
  });

  describe('max_hp / max_mp via getAffixBonusesFromGear', () => {
    it('should return 0 max_hp/max_mp bonus with no affixes', () => {
      const gear = [createTestArmor()];
      const bonuses = getAffixBonusesFromGear(gear);
      expect(bonuses.max_hp).toBe(0);
      expect(bonuses.max_mp).toBe(0);
    });

    it('should aggregate max_hp/max_mp from multiple gear', () => {
      const armor1 = createTestArmor({
        affixes: [{ type: 'max_hp', tier: 2, value: 10 }],
      });
      const armor2 = createTestArmor({
        slot: 'legs' as any,
        affixes: [{ type: 'max_hp', tier: 3, value: 12 }, { type: 'max_mp', tier: 2, value: 8 }],
      });
      const bonuses = getAffixBonusesFromGear([armor1, armor2]);
      expect(bonuses.max_hp).toBe(22);
      expect(bonuses.max_mp).toBe(8);
    });
  });

  describe('heal_effect', () => {
    it('should return heal_effect bonus from gear', () => {
      const armor = createTestArmor({
        affixes: [{ type: 'heal_effect', tier: 3, value: 15 }],
      });
      const bonuses = getAffixBonusesFromGear([armor]);
      expect(bonuses.heal_effect).toBe(15);
    });
  });

  describe('potion_effect', () => {
    it('should return potion_effect bonus from gear', () => {
      const armor = createTestArmor({
        affixes: [{ type: 'potion_effect', tier: 2, value: 10 }],
      });
      const bonuses = getAffixBonusesFromGear([armor]);
      expect(bonuses.potion_effect).toBe(10);
    });
  });

  describe('drop_rate / gold_rate', () => {
    it('should return drop_rate and gold_rate from gear', () => {
      const armor = createTestArmor({
        affixes: [
          { type: 'drop_rate', tier: 3, value: 12 },
          { type: 'gold_rate', tier: 2, value: 8 },
        ],
      });
      const bonuses = getAffixBonusesFromGear([armor]);
      expect(bonuses.drop_rate).toBe(12);
      expect(bonuses.gold_rate).toBe(8);
    });

    it('should stack across multiple gear', () => {
      const armor1 = createTestArmor({
        affixes: [{ type: 'drop_rate', tier: 2, value: 8 }],
      });
      const armor2 = createTestArmor({
        slot: 'legs' as any,
        affixes: [{ type: 'drop_rate', tier: 3, value: 12 }],
      });
      const bonuses = getAffixBonusesFromGear([armor1, armor2]);
      expect(bonuses.drop_rate).toBe(20);
    });
  });

  describe('quality scaling', () => {
    it('should scale affix value with gear quality', () => {
      const armor = createTestArmor({
        quality: 50,
        affixes: [{ type: 'attack_speed', tier: 3, value: 10 }],
      });
      const bonuses = getAffixBonusesFromGear([armor]);
      // getEffectiveAffixValue: floor(10 * (1 + 50/100)) = floor(15) = 15
      expect(bonuses.attack_speed).toBe(15);
    });
  });
});
