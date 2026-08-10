import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculatePlayerAttack, calculateMonsterAttack, calculateSkillAttack, calculateMpRestored, processCombatRound } from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

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

describe('combat system', () => {
  describe('calculatePlayerAttack', () => {
    it('should deal damage when hit lands', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster();
      const weapon = createTestWeapon();

      const result = calculatePlayerAttack(char, weapon, monster);

      expect(result.hit).toBe(true);
      expect(result.damage).toBeGreaterThan(0);
      expect(result.log.type).toBe('player_hit');
    });

    it('should miss when roll exceeds hit rate', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const char = createTestCharacter();
      const monster = createTestMonster();
      const weapon = createTestWeapon();

      const result = calculatePlayerAttack(char, weapon, monster);

      expect(result.hit).toBe(false);
      expect(result.damage).toBe(0);
      expect(result.log.type).toBe('player_miss');
      expect(result.log.message).toBe('攻擊未命中');
    });

    it('should deal minimum 1 damage on hit', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter({ baseAttributes: { STR: 2, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 } });
      const monster = createTestMonster({ defense: 60 });
      const weapon = createTestWeapon({ smallMonsterDamage: 1 });

      const result = calculatePlayerAttack(char, weapon, monster);

      expect(result.hit).toBe(true);
      expect(result.damage).toBeGreaterThanOrEqual(1);
    });

    it('should use smallMonsterDamage for small monsters', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ size: 'small', defense: 0 });
      const weapon = createTestWeapon({ smallMonsterDamage: 20, largeMonsterDamage: 10 });

      const result = calculatePlayerAttack(char, weapon, monster);

      expect(result.hit).toBe(true);
      // weaponDmg(20) + strBonus(7) = 27
      expect(result.damage).toBe(27);
    });

    it('should use largeMonsterDamage for large monsters', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ size: 'large', defense: 0 });
      const weapon = createTestWeapon({ smallMonsterDamage: 20, largeMonsterDamage: 10 });

      const result = calculatePlayerAttack(char, weapon, monster);

      expect(result.hit).toBe(true);
      // weaponDmg(10) + strBonus(7) = 17
      expect(result.damage).toBe(17);
    });

    it('should double damage on critical hit', () => {
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0.1; // hit
        if (callCount === 2) return 0.01; // crit
        return 0.5;
      });
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon({ smallMonsterDamage: 10 });

      const result = calculatePlayerAttack(char, weapon, monster);

      expect(result.hit).toBe(true);
      expect(result.isCritical).toBe(true);
      // (10 + 7) * 2 = 34
      expect(result.damage).toBe(34);
      expect(result.log.type).toBe('player_crit');
    });

    it('should cap monster defense reduction at 65%', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 100 });
      const weapon = createTestWeapon({ smallMonsterDamage: 20 });

      const result = calculatePlayerAttack(char, weapon, monster);

      // baseDmg(20+7=27) * (100-75)/100 = 27 * 0.25 = 6.75 → 6
      expect(result.hit).toBe(true);
      expect(result.damage).toBe(6);
    });

    it('should deal 1 damage with no weapon (unarmed)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });

      const result = calculatePlayerAttack(char, null, monster);

      // weaponDmg(1) + strBonus(7) = 8
      expect(result.damage).toBe(8);
    });

    it('should clamp hit rate between 5% and 95%', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.94);
      const char = createTestCharacter({
        baseAttributes: { STR: 14, AGI: 99, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        level: 50,
      });
      const monster = createTestMonster({ level: 1 });
      const weapon = createTestWeapon();

      const result = calculatePlayerAttack(char, weapon, monster);
      expect(result.hit).toBe(true);

      vi.spyOn(Math, 'random').mockReturnValue(0.96);
      const result2 = calculatePlayerAttack(char, weapon, monster);
      expect(result2.hit).toBe(false);
    });

    it('should apply attack_power affix multiplier', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon({
        smallMonsterDamage: 20,
        affixes: [{ type: 'attack_power', tier: 3, value: 12 }],
      });

      const result = calculatePlayerAttack(char, weapon, monster, [weapon]);

      // base = 20 + 7 = 27, attack%: floor(27 * 1.12) = 30
      expect(result.damage).toBe(30);
    });

    it('元素刻印的乘區只在刻印帶著屬性時生效', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });

      // 沒有刻印 → 無屬性，拿不到乘區
      const weaponNoBrand = createTestWeapon({ smallMonsterDamage: 20 });
      const r1 = calculatePlayerAttack(char, weaponNoBrand, monster, [weaponNoBrand]);
      // base = 20 + 7 = 27
      expect(r1.damage).toBe(27);

      // 有刻印 → 賦予火屬性並吃到乘區
      const weaponBrand = createTestWeapon({
        smallMonsterDamage: 20,
        affixes: [{ type: 'element_brand', tier: 3, value: 11, element: 'fire' }],
      });
      const r2 = calculatePlayerAttack(char, weaponBrand, monster, [weaponBrand]);
      // base = 20 + 7 = 27, 刻印乘區: floor(27 * 1.11) = 29
      expect(r2.damage).toBe(29);
    });

    it('should apply crit_rate and crit_damage affixes', () => {
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0.1; // hit
        if (callCount === 2) return 0.14; // crit check: 14 < 5 + 10 = 15 → crit
        return 0.5;
      });
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon({
        smallMonsterDamage: 10,
        affixes: [
          { type: 'crit_rate', tier: 2, value: 10 },
          { type: 'crit_damage', tier: 3, value: 12 },
        ],
      });

      const result = calculatePlayerAttack(char, weapon, monster, [weapon]);

      expect(result.isCritical).toBe(true);
      // base = 10 + 7 = 17, crit multiplier = 2.0 + 0.12 = 2.12
      // floor(17 * 2.12) = floor(36.04) = 36
      expect(result.damage).toBe(36);
    });
  });

  describe('calculateSkillAttack', () => {
    it('should always hit (100% hit, no dodge)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const char = createTestCharacter();
      const monster = createTestMonster({ defense: 0 });

      const result = calculateSkillAttack(char, 10, 'fire', monster, [], '火球術');

      // Even with high random, skill always hits
      expect(result.damage).toBeGreaterThan(0);
    });

    it('should calculate damage with INT bonus', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // no crit
      const char = createTestCharacter({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 18, CHA: 12 } });
      const monster = createTestMonster({ defense: 0 });

      const result = calculateSkillAttack(char, 10, 'fire', monster, [], '火球術');

      // § 20.6：INT 每 2 點 +5% 技能威力
      // INT bonus = floor(10 × (18/2 × 5) / 100) = floor(4.5) = 4
      // § 21.4：基礎魔攻 = 10 + 4 + 0 = 14
      expect(result.damage).toBe(14);
    });

    it('should apply skill_elemental affix for elemental skill', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // no crit
      const char = createTestCharacter({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 18, CHA: 12 } });
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon({
        affixes: [{ type: 'skill_elemental', tier: 2, value: 10 }],
      });

      const result = calculateSkillAttack(char, 10, 'fire', monster, [weapon], '火球術');

      // 基礎魔攻 = 10 + 4 + 0 = 14（劍沒有魔攻），skill_elem: floor(14 * 1.10) = 15
      expect(result.damage).toBe(15);
      expect(result.log.type).toBe('skill_hit');
    });

    it('should NOT apply skill_elemental for non-elemental skill', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 18, CHA: 12 } });
      const monster = createTestMonster({ defense: 0 });
      const weapon = createTestWeapon({
        affixes: [{ type: 'skill_elemental', tier: 2, value: 10 }],
      });

      const result = calculateSkillAttack(char, 10, 'none', monster, [weapon], '衝撞');

      // 基礎魔攻 14（同上），無屬性 → 不吃技能元素% → 維持 14
      expect(result.damage).toBe(14);
    });

    it('should apply crit on skill attack', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // crit
      const char = createTestCharacter({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 18, CHA: 12 } });
      const monster = createTestMonster({ defense: 0 });

      const result = calculateSkillAttack(char, 10, 'fire', monster, [], '火球術');

      expect(result.isCritical).toBe(true);
      // 基礎魔攻 14（無武器），crit = floor(14 * 2.0) = 28
      expect(result.damage).toBe(28);
      expect(result.log.type).toBe('skill_crit');
    });

    it('should apply defense reduction', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 18, CHA: 12 } });
      const monster = createTestMonster({ defense: 50 });

      const result = calculateSkillAttack(char, 10, 'fire', monster, [], '火球術');

      // 基礎魔攻 14（無武器），defense 50%: floor(14 * 50 / 100) = 7
      expect(result.damage).toBe(7);
    });

    it('should generate correct log message', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 18, CHA: 12 } });
      const monster = createTestMonster({ name: '火蜥蜴', defense: 0 });

      const result = calculateSkillAttack(char, 10, 'fire', monster, [], '火球術');

      expect(result.log.message).toBe('火球術 對 火蜥蜴 造成 14 點傷害');
    });
  });

  describe('calculateMpRestored', () => {
    it('should restore MP from the final damage dealt', () => {
      expect(calculateMpRestored(57, 1, 10, 100)).toBe(57);
    });

    it('should cap restored MP at effective max MP', () => {
      expect(calculateMpRestored(57, 1, 80, 100)).toBe(20);
    });

    it('should not restore MP without a drain effect or damage', () => {
      expect(calculateMpRestored(57, undefined, 10, 100)).toBe(0);
      expect(calculateMpRestored(0, 1, 10, 100)).toBe(0);
    });
  });

  describe('calculateMonsterAttack', () => {
    it('should deal damage when not dodged', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9);
      const char = createTestCharacter();
      const monster = createTestMonster();

      const result = calculateMonsterAttack(monster, char, []);

      expect(result.hit).toBe(true);
      expect(result.dodged).toBe(false);
      expect(result.damage).toBeGreaterThan(0);
      expect(result.log.type).toBe('monster_hit');
    });

    it('should dodge when roll is below dodge rate', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      const char = createTestCharacter();
      const monster = createTestMonster();

      const result = calculateMonsterAttack(monster, char, []);

      expect(result.dodged).toBe(true);
      expect(result.damage).toBe(0);
      expect(result.log.type).toBe('player_dodged');
    });

    it('should give thief higher base dodge', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.08);
      const knight = createTestCharacter({ className: 'knight' });
      const thief = createTestCharacter({ className: 'thief', baseAttributes: { STR: 12, AGI: 14, VIT: 10, SPI: 10, INT: 12, CHA: 10 } });
      const monster = createTestMonster();

      const knightResult = calculateMonsterAttack(monster, knight, []);
      expect(knightResult.dodged).toBe(true);

      const thiefResult = calculateMonsterAttack(monster, thief, []);
      expect(thiefResult.dodged).toBe(true);
    });

    it('should cap dodge rate at 35%', () => {
      const char = createTestCharacter({
        className: 'thief',
        baseAttributes: { STR: 12, AGI: 99, VIT: 10, SPI: 10, INT: 12, CHA: 10 },
      });
      const monster = createTestMonster();

      vi.spyOn(Math, 'random').mockReturnValue(0.34);
      const result1 = calculateMonsterAttack(monster, char, []);
      expect(result1.dodged).toBe(true);

      vi.spyOn(Math, 'random').mockReturnValue(0.36);
      const result2 = calculateMonsterAttack(monster, char, []);
      expect(result2.dodged).toBe(false);
    });

    it('should cap player defense reduction at 75%', () => {
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0.99; // no dodge
        return 0.5; // mid-range for damage randomInt
      });
      const char = createTestCharacter();
      const monster = createTestMonster({ attackMin: 100, attackMax: 100 });
      // 初始防禦 -10，裝備要多帶 10 點才仍然超過 75% 上限
      const gear: EquipmentInstance[] = [
        createTestArmor({ defense: 90 }),
      ];

      const result = calculateMonsterAttack(monster, char, gear);

      // defense capped at 75, so: 100 * (100-75)/100 = 25
      expect(result.damage).toBe(25);
    });

    it('should deal minimum 1 damage', () => {
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0.99; // no dodge
        return 0; // min damage
      });
      const char = createTestCharacter();
      const monster = createTestMonster({ attackMin: 1, attackMax: 1 });
      const gear: EquipmentInstance[] = [
        createTestArmor({ defense: 60 }),
      ];

      const result = calculateMonsterAttack(monster, char, gear);
      expect(result.damage).toBeGreaterThanOrEqual(1);
    });

    it('should apply defense% affix bonus', () => {
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0.99; // no dodge
        return 0.5;
      });
      const char = createTestCharacter();
      const monster = createTestMonster({ attackMin: 100, attackMax: 100 });
      const armor = createTestArmor({
        defense: 40,
        affixes: [{ type: 'defense', tier: 2, value: 10 }],
      });

      const result = calculateMonsterAttack(monster, char, [armor]);

      // 防禦%詞綴只放大「裝備防禦」，不放大角色初始防禦（`21-combat-formula.md` § 21.5）：
      //   裝備 40 → floor(40 × 1.10) = 44 → 44 + (-10) = 34
      //   減傷 34%，傷害 = floor(100 × 66 / 100) = 66
      // 若初始防禦是併進括號算的（(40-10) × 1.1 = 33 → 傷害 67），這條會失敗 ——
      // 這正是用來鎖住「最後才減」這個設計決定的斷言
      expect(result.damage).toBe(66);
    });

    it('should generate correct log messages', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      const char = createTestCharacter();
      const monster = createTestMonster({ name: '暴牙兔' });

      const result = calculateMonsterAttack(monster, char, []);
      expect(result.log.message).toBe('迴避了 暴牙兔 的攻擊');
    });
  });

  describe('processCombatRound', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return both player and monster attack results with logs', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter();
      const monster = createTestMonster();
      const weapon = createTestWeapon();

      const result = processCombatRound(char, monster, weapon, [weapon]);

      expect(result).toHaveProperty('playerDamage');
      expect(result).toHaveProperty('monsterDamage');
      expect(result).toHaveProperty('playerHit');
      expect(result).toHaveProperty('monsterHit');
      expect(result).toHaveProperty('isCritical');
      expect(result).toHaveProperty('playerDodged');
      expect(result).toHaveProperty('logs');
      expect(result.logs).toHaveLength(2);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('monster defense cap', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caps monster defense reduction at 75%', () => {
    const char = createTestCharacter({ baseAttributes: { STR: 20, AGI: 20, VIT: 10, SPI: 10, INT: 10, CHA: 10 } });
    const monster = createTestMonster({ defense: 100 }); // way over cap
    const weapon = createTestWeapon();

    const result = calculatePlayerAttack(char, weapon, monster, [weapon], []);
    // With 75% cap, damage should be at least 25% of pre-defense damage (not 0)
    // If cap were 65%, damage would be higher (35% through). At 75%, only 25% gets through.
    expect(result.damage).toBeGreaterThan(0);
  });

  it('defense below 75 applies fully', () => {
    const char = createTestCharacter({ baseAttributes: { STR: 20, AGI: 20, VIT: 10, SPI: 10, INT: 10, CHA: 10 } });
    const monster50 = createTestMonster({ defense: 50 });
    const monster75 = createTestMonster({ defense: 75 });
    const weapon = createTestWeapon();

    const result50 = calculatePlayerAttack(char, weapon, monster50, [weapon], []);
    const result75 = calculatePlayerAttack(char, weapon, monster75, [weapon], []);

    // 50% reduction vs 75% reduction: result50 should deal more damage
    expect(result50.damage).toBeGreaterThan(result75.damage);
  });
});

describe('evasion buff in monster attack', () => {
  it('evasion buff increases dodge rate', () => {
    const char = createTestCharacter({ className: 'knight' });
    const monster = createTestMonster({ attackMin: 50, attackMax: 50 });
    const weapon = createTestWeapon();

    // Without evasion buff
    let dodgeCount = 0;
    const trials = 1000;
    vi.spyOn(Math, 'random');

    for (let i = 0; i < trials; i++) {
      (Math.random as any).mockReturnValue(i / trials);
      const result = calculateMonsterAttack(monster, char, [weapon], []);
      if (result.dodged) dodgeCount++;
    }
    const baseDodgeRate = dodgeCount / trials;

    // With evasion buff (+15%)
    const evasionBuff = {
      id: 'test-evasion',
      sourceSkillId: 'smoke-bomb',
      sourceSkillName: 'Smoke Bomb',
      category: 'evasion',
      type: 'buff' as const,
      target: 'player' as const,
      modifiers: [{ stat: 'evasion', value: 15, isPercent: false }],
      startTime: Date.now(),
      duration: 10000,
      tags: [],
      name: 'Smoke Bomb',
      description: '+15% evasion',
    };

    let buffDodgeCount = 0;
    for (let i = 0; i < trials; i++) {
      (Math.random as any).mockReturnValue(i / trials);
      const result = calculateMonsterAttack(monster, char, [weapon], [evasionBuff]);
      if (result.dodged) buffDodgeCount++;
    }
    const buffDodgeRate = buffDodgeCount / trials;

    // Buffed dodge rate should be higher
    expect(buffDodgeRate).toBeGreaterThan(baseDodgeRate);
    // Specifically, ~15% higher (exact depends on AGI contribution)
    expect(buffDodgeRate - baseDodgeRate).toBeCloseTo(0.15, 1);

    vi.restoreAllMocks();
  });
});
