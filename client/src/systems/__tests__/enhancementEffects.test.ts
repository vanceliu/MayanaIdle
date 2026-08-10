import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateBasePhysicalDamage,
  calculatePlayerAttack,
  calculateSkillAttack,
  getTotalMagicAttack,
  getWeaponAttackSuccess,
} from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

function char(overrides: Partial<Character> = {}): Character {
  return {
    name: 'T', className: 'knight', level: 5, exp: 0, expToNext: 100,
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

function monster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '暴牙兔', level: 3, currentHp: 300, maxHp: 300,
    attackMin: 5, attackMax: 10, defense: 0, exp: 20,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    ...overrides,
  };
}

function weapon(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 10, largeMonsterDamage: 8, defense: 0,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...overrides,
  };
}

describe('武器強化基傷（06-equipment.md § 6.9）', () => {
  it('每 +1 強化讓基礎物理傷害 +1', () => {
    const c = char();
    const plain = calculateBasePhysicalDamage(c, weapon(), [weapon()], []);
    const plus6 = calculateBasePhysicalDamage(c, weapon({ enhancement: 6 }), [weapon({ enhancement: 6 })], []);
    expect(plus6 - plain).toBe(6);
  });

  it('普攻對小怪的傷害隨強化等級線性提升', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 命中（<95%）且不暴擊（≥5%）
    const c = char();
    const m = monster({ size: 'small', defense: 0 });
    const base = calculatePlayerAttack(c, weapon(), m, [weapon()]).damage;
    const enhanced = calculatePlayerAttack(c, weapon({ enhancement: 5 }), m, [weapon({ enhancement: 5 })]).damage;
    expect(enhanced - base).toBe(5);
  });

  it('對大怪同樣每 +1 強化 +1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = char();
    const m = monster({ size: 'large', defense: 0 });
    const base = calculatePlayerAttack(c, weapon(), m, [weapon()]).damage;
    const enhanced = calculatePlayerAttack(c, weapon({ enhancement: 3 }), m, [weapon({ enhancement: 3 })]).damage;
    expect(enhanced - base).toBe(3);
  });

  it('無武器時走空手基傷 1，不會誤加強化', () => {
    // 空手基傷 1 + STR加成 floor(14/2) = 8
    expect(calculateBasePhysicalDamage(char(), null, [], [])).toBe(8);
  });

  it('攻擊成功仍為每 +2 強化 +1（未因基傷修正而改變）', () => {
    expect(getWeaponAttackSuccess(weapon({ attackSuccess: 2, enhancement: 6 }))).toBe(5);
    expect(getWeaponAttackSuccess(weapon({ attackSuccess: 0, enhancement: 7 }))).toBe(3);
  });
});

describe('裝備魔法攻擊（21-combat-formula.md § 21.4）', () => {
  const book = (overrides: Partial<EquipmentInstance> = {}): EquipmentInstance => ({
    templateId: 9, name: '學徒魔導書', type: 'magicBook', slot: 'leftHand', isTwoHanded: false,
    magicAttack: 4, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...overrides,
  });

  it('加總所有裝備的基底魔攻', () => {
    expect(getTotalMagicAttack([book({ magicAttack: 4 }), book({ magicAttack: 2 })])).toBe(6);
  });

  it('法杖／雙手法杖／魔導書每 +2 強化 → 魔攻 +1', () => {
    expect(getTotalMagicAttack([book({ magicAttack: 0, enhancement: 8 })])).toBe(4);
    const staff = book({ type: 'staff', slot: 'rightHand', magicAttack: 0, enhancement: 6 });
    expect(getTotalMagicAttack([staff])).toBe(3);
    const twoStaff = book({ type: 'twoHandStaff', slot: 'rightHand', magicAttack: 0, enhancement: 5 });
    expect(getTotalMagicAttack([twoStaff])).toBe(2);
  });

  it('非法杖／魔導書的武器強化不提供魔攻', () => {
    expect(getTotalMagicAttack([weapon({ enhancement: 10 })])).toBe(0);
  });

  it('忽略 null 欄位', () => {
    expect(getTotalMagicAttack([null, book({ magicAttack: 3 }), null])).toBe(3);
  });

  it('裝備魔攻是乘在技能攻擊力上的乘區（§ 21.4）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 不暴擊
    const c = char();
    const m = monster({ defense: 0 });
    const without = calculateSkillAttack(c, 20, 'none', m, []).damage;
    const withBook = calculateSkillAttack(c, 20, 'none', m, [book({ magicAttack: 30 })]).damage;
    // 技能攻擊力 20 × (1 + 30/100) = 26 → 多 6 點
    expect(withBook - without).toBe(6);
  });

  it('技能攻擊力越高，同一件魔攻裝備給的絕對值越大', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const c = char();
    const m = monster({ defense: 0 });
    const gain = (power: number) =>
      calculateSkillAttack(c, power, 'none', m, [book({ magicAttack: 50 })]).damage
      - calculateSkillAttack(c, power, 'none', m, []).damage;
    // ×1.5 的乘區：威力 10 → +5、威力 40 → +20
    expect(gain(10)).toBe(5);
    expect(gain(40)).toBe(20);
  });

  it('裝備魔攻不進 INT 倍率（只乘技能攻擊力那一段）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const m = monster({ defense: 0 });
    const lowInt = char({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 } });
    const highInt = char({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 18, CHA: 12 } });
    const deltaLow = calculateSkillAttack(lowInt, 20, 'none', m, [book({ magicAttack: 30 })]).damage
      - calculateSkillAttack(lowInt, 20, 'none', m, []).damage;
    const deltaHigh = calculateSkillAttack(highInt, 20, 'none', m, [book({ magicAttack: 30 })]).damage
      - calculateSkillAttack(highInt, 20, 'none', m, []).damage;
    // 高低 INT 的增量相同 → 魔攻沒有被 INT 放大
    expect(deltaLow).toBe(6);
    expect(deltaHigh).toBe(6);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
