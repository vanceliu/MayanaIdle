/**
 * `21-combat-formula.md` § 21.4：魔法公式納入武器白字。
 *
 *   武器白字 = ((小怪傷害 + 大怪傷害) / 2 + 強化 + 額外攻擊) × (1 + 攻擊力%)
 *   基礎魔攻 = (技能攻擊力 + INT加成 + 裝備魔攻) × 0.5 + 武器白字 × 0.2
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateSkillAttack, getWeaponWhiteDamage, SKILL_SIDE_WEIGHT, WEAPON_WHITE_WEIGHT } from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

function char(overrides: Partial<Character> = {}): Character {
  return {
    name: 'T', className: 'elementalist', level: 50, exp: 0, expToNext: 1_000_000,
    hp: 300, maxHp: 300, mp: 200, maxMp: 200,
    baseAttributes: { STR: 6, AGI: 10, VIT: 15, SPI: 15, INT: 20, CHA: 16 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
    ...overrides,
  };
}

function dummy(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '木樁', level: 50, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 0,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    ...overrides,
  };
}

function staff(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: '測試法杖', type: 'staff', slot: 'rightHand',
    isTwoHanded: false, smallMonsterDamage: 20, largeMonsterDamage: 10,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...overrides,
  } as EquipmentInstance;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('getWeaponWhiteDamage', () => {
  it('取小怪與大怪傷害的平均，並加上強化與額外攻擊', () => {
    // (20 + 10) / 2 = 15，+3 強化，+4 額外攻擊 → 22
    expect(getWeaponWhiteDamage(staff({ enhancement: 3, extraAttack: 4 }), 0)).toBe(22);
  });

  it('攻擊力% 會放大白字', () => {
    // 15 × 1.24 = 18.6
    expect(getWeaponWhiteDamage(staff(), 24)).toBeCloseTo(18.6, 5);
  });

  it('沒有武器時白字為 0（不套普攻的保底值 1）', () => {
    expect(getWeaponWhiteDamage(null, 0)).toBe(0);
  });

  it('魔導書之類沒有基傷欄位的裝備白字為 0', () => {
    const book = { ...staff({ type: 'magicBook', slot: 'leftHand' }) } as EquipmentInstance;
    delete (book as Partial<EquipmentInstance>).smallMonsterDamage;
    delete (book as Partial<EquipmentInstance>).largeMonsterDamage;
    expect(getWeaponWhiteDamage(book, 0)).toBe(0);
  });

  it('權重常數與 § 21.4 一致', () => {
    expect(SKILL_SIDE_WEIGHT).toBe(0.5);
    expect(WEAPON_WHITE_WEIGHT).toBe(0.2);
  });
});

describe('武器白字進入魔法傷害', () => {
  it('換更高基傷的武器會提升技能傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 不暴擊
    const m = dummy();
    const weak = calculateSkillAttack(char(), 40, 'none', m, [staff()]).damage;
    const strong = calculateSkillAttack(char(), 40, 'none', m, [staff({ smallMonsterDamage: 40, largeMonsterDamage: 30 })]).damage;
    // 白字 15 → 35，差 20 × 0.2 = 4
    expect(strong - weak).toBe(4);
  });

  it('強化會透過白字提升技能傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const m = dummy();
    const plain = calculateSkillAttack(char(), 40, 'none', m, [staff()]).damage;
    const enhanced = calculateSkillAttack(char(), 40, 'none', m, [staff({ enhancement: 10 })]).damage;
    // 兩條管道各貢獻 2：白字 +10 × 0.2，以及 § 6.9 法杖每 +2 強化 → 魔攻 +1（5 × 0.5）
    expect(enhanced - plain).toBe(4);
  });

  it('攻擊力%詞綴對法系生效（透過白字）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const m = dummy();
    const big = { smallMonsterDamage: 60, largeMonsterDamage: 40 };
    const plain = calculateSkillAttack(char(), 40, 'none', m, [staff(big)]).damage;
    const withAtk = calculateSkillAttack(char(), 40, 'none', m, [
      staff({ ...big, affixes: [{ type: 'attack_power', tier: 5, value: 20 }] }),
    ]).damage;
    // 白字 50 → 60，差 10 × 0.2 = 2
    expect(withAtk - plain).toBe(2);
  });

  it('普攻元素傷害%不影響魔法傷害（`21-combat-formula.md` § 21.4）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const m = dummy({ element: 'wind' });
    const plain = calculateSkillAttack(char(), 40, 'fire', m, [staff({ element: 'fire' })]).damage;
    const withAttackElem = calculateSkillAttack(char(), 40, 'fire', m, [
      staff({ element: 'fire', affixes: [{ type: 'attack_elemental', tier: 7, value: 20 }] }),
    ]).damage;
    expect(withAttackElem).toBe(plain);
  });

  it('技能元素傷害%仍然作用於整包（技能側 ＋ 白字）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const m = dummy();
    const plain = calculateSkillAttack(char(), 40, 'fire', m, [staff()]).damage;
    const withSkillElem = calculateSkillAttack(char(), 40, 'fire', m, [
      staff({ affixes: [{ type: 'skill_elemental', tier: 5, value: 20 }] }),
    ]).damage;
    expect(withSkillElem).toBe(Math.floor(plain * 1.2));
  });
});
