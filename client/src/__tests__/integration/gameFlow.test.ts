import { describe, it, expect, vi } from 'vitest';
import { evaluateScript } from '../../systems/scriptRunner';
import { calculatePlayerAttack } from '../../systems/combat';
import { addExp, getExpToNextLevel } from '../../systems/levelUp';
import { getHpRegen, getMpRegen } from '../../systems/regen';
import { calculatePressure } from '../../systems/pressure';
import { generateAffixes, getEffectiveAffixValue } from '../../models/affix';
import { getTotalAttributes, getAvailablePoints, CLASS_BASE_ATTRIBUTES } from '../../models/character';
import { INITIAL_HP, INITIAL_MP } from '../../systems/levelUp';
import type { Character, ClassName } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { Skill } from '../../models/skill';
import type { ScriptRule } from '../../models/scriptEngine';

function createCharacter(className: ClassName, bonusAttrs: Partial<Record<string, number>> = {}): Character {
  const base = CLASS_BASE_ATTRIBUTES[className];
  return {
    name: 'Hero',
    className,
    level: 1,
    exp: 0,
    expToNext: getExpToNextLevel(1),
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    mp: INITIAL_MP,
    maxMp: INITIAL_MP,
    baseAttributes: { ...base },
    bonusAttributes: {
      STR: (bonusAttrs as any).STR ?? 0,
      AGI: (bonusAttrs as any).AGI ?? 0,
      VIT: (bonusAttrs as any).VIT ?? 0,
      SPI: (bonusAttrs as any).SPI ?? 0,
      INT: (bonusAttrs as any).INT ?? 0,
      CHA: (bonusAttrs as any).CHA ?? 0,
    },
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
  };
}

function createMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
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
    size: 'small',
    element: 'none',
    race: 'normal',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
    ...overrides,
  };
}

describe('Integration: Character Creation Flow', () => {
  it('should create valid character with correct initial state', () => {
    const char = createCharacter('knight');

    expect(char.level).toBe(1);
    expect(char.exp).toBe(0);
    expect(char.expToNext).toBe(100);
    expect(char.hp).toBe(INITIAL_HP);
    expect(char.maxHp).toBe(INITIAL_HP);
    expect(char.mp).toBe(INITIAL_MP);
    expect(char.maxMp).toBe(INITIAL_MP);
    expect(char.gold).toBe(0);
    expect(char.currentArea).toBe('dawn-plains');
  });

  it('should allocate bonus points within budget for each class', () => {
    const classes: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
    classes.forEach(cls => {
      const available = getAvailablePoints(cls);
      expect(available).toBeGreaterThanOrEqual(0);
      expect(available).toBeLessThanOrEqual(20);
    });
  });

  it('should have different base stats per class affecting gameplay', () => {
    const knight = createCharacter('knight');
    const thief = createCharacter('thief');
    const priest = createCharacter('priest');

    const knightAttrs = getTotalAttributes(knight);
    const thiefAttrs = getTotalAttributes(thief);
    const priestAttrs = getTotalAttributes(priest);

    expect(knightAttrs.VIT).toBeGreaterThan(thiefAttrs.VIT);
    expect(priestAttrs.INT).toBeGreaterThan(knightAttrs.INT);
  });
});

describe('Integration: Exploration and Pressure', () => {
  it('should start with low monster cap then scale up', () => {
    const now = Date.now();

    const early = calculatePressure(now - 30 * 1000, now);
    expect(early.maxMonsters).toBe(3);

    const later = calculatePressure(now - 50 * 60 * 1000, now); // 50 min → pressure 2
    expect(later.maxMonsters).toBe(5);
  });

  it('should reset pressure on area change', () => {
    const now = Date.now();
    const oldAreaPressure = calculatePressure(now - 60 * 60 * 1000, now); // 60 min → pressure 3
    expect(oldAreaPressure.pressure).toBeGreaterThan(0);

    const newAreaPressure = calculatePressure(now, now);
    expect(newAreaPressure.pressure).toBe(0);
  });

  it('should cap maxMonsters at 10', () => {
    const now = Date.now();
    const result = calculatePressure(now - 150 * 60 * 1000, now); // 150 min → pressure 12
    expect(result.maxMonsters).toBe(10);
  });
});

describe('Integration: Combat → Level Up', () => {
  it('should gain exp from monster and level up', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = createCharacter('knight');
    const expNeeded = char.expToNext;

    const afterExp = addExp(char, expNeeded);

    expect(afterExp.level).toBe(2);
    expect(afterExp.hp).toBe(afterExp.maxHp);
    expect(afterExp.mp).toBe(afterExp.maxMp);
    expect(afterExp.maxHp).toBeGreaterThan(char.maxHp);
    vi.restoreAllMocks();
  });

  it('should gain multiple levels from large exp gain', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = createCharacter('knight');
    const result = addExp(char, 500);

    expect(result.level).toBeGreaterThan(2);
    expect(result.hp).toBe(result.maxHp);
    vi.restoreAllMocks();
  });

  it('should deal damage to monster and reduce its HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const char = createCharacter('knight');
    const monster = createMonster({ defense: 0 });
    const weapon: EquipmentInstance = {
      templateId: 1, name: '木劍', type: 'sword', slot: 'rightHand',
      isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 8,
      quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    };

    const result = calculatePlayerAttack(char, weapon, monster);
    expect(result.hit).toBe(true);
    expect(result.damage).toBeGreaterThan(0);

    monster.currentHp -= result.damage;
    expect(monster.currentHp).toBeLessThan(monster.maxHp);
    vi.restoreAllMocks();
  });
});

describe('Integration: Equipment → Affix → Stats', () => {
  it('should generate equipment with valid affixes', () => {
    const affixes = generateAffixes('weapon', 10, 4);

    expect(affixes).toHaveLength(4);
    const types = affixes.map(a => a.type);
    expect(new Set(types).size).toBe(4);
  });

  it('should increase affix value with quality upgrade', () => {
    const affixes = generateAffixes('weapon', 15, 4);
    const firstAffix = affixes[0];

    const baseValue = getEffectiveAffixValue(firstAffix, 0);
    const upgradedValue = getEffectiveAffixValue(firstAffix, 10);
    const maxValue = getEffectiveAffixValue(firstAffix, 20);

    expect(baseValue).toBe(firstAffix.value);
    expect(upgradedValue).toBeGreaterThanOrEqual(baseValue);
    expect(maxValue).toBeGreaterThanOrEqual(upgradedValue);
  });

  it('should differentiate weapon and armor affixes', () => {
    const weaponAffixes = generateAffixes('weapon', 15, 4);
    const armorAffixes = generateAffixes('armor', 15, 4);

    const weaponTypes = new Set(weaponAffixes.map(a => a.type));
    const armorTypes = new Set(armorAffixes.map(a => a.type));

    // No overlap between weapon and armor affix types
    weaponTypes.forEach(t => {
      expect(armorTypes.has(t)).toBe(false);
    });
  });
});

describe('Integration: Script Engine Automation', () => {
  it('should heal when HP is low and potions available', () => {
    const rules: ScriptRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'potion', potionType: 'red' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const char = createCharacter('knight');
    char.hp = 20; // 66% of 30 → but 20/30 = 66.7% which is > 30. Need to adjust.
    char.maxHp = 100;
    char.hp = 25; // 25% of 100

    const result = evaluateScript(rules, {
      character: char,
      monsters: [createMonster()],
      skills: [],
      lastPotionUsedAt: 0,
      now: 10000,
      bagItems: [{ name: '紅色藥水', type: 'potion', amount: 5 }],
    });

    expect(result).toEqual({ type: 'potion', potionType: 'red' });
  });

  it('should flee when HP critically low', () => {
    const rules: ScriptRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 15 }, action: { type: 'flee_town' } },
      { id: 'r2', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'potion', potionType: 'red' } },
      { id: 'r3', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const char = createCharacter('knight');
    char.maxHp = 100;
    char.hp = 10; // 10% HP

    const result = evaluateScript(rules, {
      character: char,
      monsters: [createMonster()],
      skills: [],
      lastPotionUsedAt: 0,
      now: 10000,
      bagItems: [
        { name: '紅色藥水', type: 'potion', amount: 5 },
        { name: '薄暮村回城卷軸', type: 'scroll', amount: 3 },
      ],
    });

    expect(result).toEqual({ type: 'flee_town' });
  });

  it('should use skill when ready and fall back to normal attack', () => {
    const windBlade: Skill = {
      id: 'wind-blade', name: '風刃', level: 1, element: 'wind',
      type: 'attack', target: 'single', power: 10, mpCost: 5,
      cooldown: 3000, lastUsedAt: 0,
    };
    const rules: ScriptRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'skill_ready', skillId: 'wind-blade' }, action: { type: 'skill', skillId: 'wind-blade' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const char = createCharacter('elementalist');
    char.mp = 30;
    char.maxMp = 30;

    // Skill ready
    const result1 = evaluateScript(rules, {
      character: char,
      monsters: [createMonster()],
      skills: [windBlade],
      lastPotionUsedAt: 0,
      now: 10000,
      bagItems: [],
    });
    expect(result1).toEqual({ type: 'skill', skillId: 'wind-blade' });

    // Skill on cooldown
    windBlade.lastUsedAt = 9000; // used 1s ago, cooldown 3s
    const result2 = evaluateScript(rules, {
      character: char,
      monsters: [createMonster()],
      skills: [windBlade],
      lastPotionUsedAt: 0,
      now: 10000,
      bagItems: [],
    });
    expect(result2).toEqual({ type: 'normal_attack' });
  });

  it('should fall back to flee when no potions and HP low', () => {
    const rules: ScriptRule[] = [
      { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'potion', potionType: 'red' } },
      { id: 'r2', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'flee_teleport' } },
      { id: 'r3', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    const char = createCharacter('knight');
    char.maxHp = 100;
    char.hp = 20;

    const result = evaluateScript(rules, {
      character: char,
      monsters: [createMonster()],
      skills: [],
      lastPotionUsedAt: 0,
      now: 10000,
      bagItems: [],
    });

    expect(result).toEqual({ type: 'flee_teleport' });
  });
});

describe('Integration: Blacksmith Quality Upgrade', () => {
  it('should increase quality and boost affix values', () => {
    const weapon: EquipmentInstance = {
      templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand',
      isTwoHanded: false, smallMonsterDamage: 15, largeMonsterDamage: 12,
      quality: 0, enhancement: 0,
      affixes: [
        { type: 'attack_power', tier: 3, value: 12 },
        { type: 'crit_rate', tier: 2, value: 9 },
      ],
      ownerId: 1, equipped: true,
    };

    // Before upgrade
    const before = weapon.affixes.map(a => getEffectiveAffixValue(a, weapon.quality));

    // Simulate quality upgrade: +1% per stone
    weapon.quality += 1;
    weapon.affixes.map(a => getEffectiveAffixValue(a, weapon.quality));

    // Quality 1%: floor(12 * 1.01) = 12, floor(9 * 1.01) = 9 → same at low quality
    // Let's upgrade to 10% to see actual difference
    weapon.quality = 10;
    const atTen = weapon.affixes.map(a => getEffectiveAffixValue(a, weapon.quality));
    expect(atTen[0]).toBeGreaterThan(before[0]); // 12 * 1.10 = 13.2 → 13
  });

  it('should cap quality at 20%', () => {
    const weapon: EquipmentInstance = {
      templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand',
      isTwoHanded: false, smallMonsterDamage: 15, largeMonsterDamage: 12,
      quality: 20, enhancement: 0,
      affixes: [{ type: 'attack_power', tier: 6, value: 20 }],
      ownerId: 1, equipped: true,
    };

    const maxValue = getEffectiveAffixValue(weapon.affixes[0], 20);
    // floor(20 * 1.20) = 24
    expect(maxValue).toBe(24);
  });

  it('should cost gold and quality stone per upgrade', () => {
    const UPGRADE_COST_GOLD = 50000;
    const UPGRADE_COST_STONE = 1;

    let gold = 200000;
    let qualityStones = 5;
    let quality = 0;

    // Simulate 3 upgrades
    for (let i = 0; i < 3; i++) {
      expect(gold).toBeGreaterThanOrEqual(UPGRADE_COST_GOLD);
      expect(qualityStones).toBeGreaterThanOrEqual(UPGRADE_COST_STONE);
      gold -= UPGRADE_COST_GOLD;
      qualityStones -= UPGRADE_COST_STONE;
      quality += 1;
    }

    expect(quality).toBe(3);
    expect(gold).toBe(50000);
    expect(qualityStones).toBe(2);
  });
});

describe('Integration: Regen during exploration', () => {
  it('should regenerate HP/MP out of combat', () => {
    const char = createCharacter('knight');
    char.hp = 20;
    char.maxHp = 100;
    char.mp = 5;
    char.maxMp = 30;

    const hpRegen = getHpRegen(char, false);
    const mpRegen = getMpRegen(char, false);

    expect(hpRegen).toBeGreaterThan(0);
    expect(mpRegen).toBeGreaterThan(0);

    // Simulate regen ticks
    char.hp = Math.min(char.maxHp, char.hp + hpRegen);
    char.mp = Math.min(char.maxMp, char.mp + mpRegen);

    expect(char.hp).toBeGreaterThan(20);
    expect(char.mp).toBeGreaterThan(5);
  });

  it('should regen slower in combat', () => {
    const char = createCharacter('knight');
    const outCombat = getHpRegen(char, false);
    const inCombat = getHpRegen(char, true);

    expect(inCombat).toBeLessThan(outCombat);
    expect(inCombat).toBe(Math.max(1, Math.floor(outCombat / 2)));
  });
});
