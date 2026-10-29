import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateBasePhysicalDamage,
  calculatePlayerAttack,
  getWeaponDamageRange,
  rollWeaponDamage,
} from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

/** `21-combat-formula.md` § 21.3：武器基傷 = randomInt(floor(W / 2), W)，W = 白字 + 強化 */

function char(): Character {
  return {
    name: 'T', className: 'knight', level: 5, exp: 0, expToNext: 100,
    hp: 100, maxHp: 100, mp: 30, maxMp: 30,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [],
    areaEnteredAt: Date.now(), createdAt: Date.now(), userId: 1,
  };
}

function monster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '木樁', level: 5, currentHp: 9999, maxHp: 9999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 0,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    ...overrides,
  };
}

function weapon(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 15, largeMonsterDamage: 10, defense: 0,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...overrides,
  };
}

function mockRandomSequence(...values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[i++] ?? 0.5);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('getWeaponDamageRange', () => {
  it('依體型取白字，下限為一半', () => {
    expect(getWeaponDamageRange(weapon(), 'small')).toEqual({ min: 7, max: 15 });
    expect(getWeaponDamageRange(weapon(), 'large')).toEqual({ min: 5, max: 10 });
  });

  it('奇數下限無條件捨去', () => {
    expect(getWeaponDamageRange(weapon({ smallMonsterDamage: 5 }), 'small')).toEqual({ min: 2, max: 5 });
  });

  it('強化併入 W 一起擲', () => {
    expect(getWeaponDamageRange(weapon({ enhancement: 3 }), 'small')).toEqual({ min: 9, max: 18 });
  });

  it('額外攻擊不併入擲骰範圍', () => {
    expect(getWeaponDamageRange(weapon({ extraAttack: 4 }), 'small')).toEqual({ min: 7, max: 15 });
  });

  it('物理快照取小怪大怪平均（捨去）再加強化', () => {
    // floor((15 + 10) / 2) = 12，+2 → 14
    expect(getWeaponDamageRange(weapon({ enhancement: 2 }), 'average')).toEqual({ min: 7, max: 14 });
  });

  it('未裝備武器固定 1', () => {
    expect(getWeaponDamageRange(null, 'small')).toEqual({ min: 1, max: 1 });
    expect(getWeaponDamageRange(null, 'average')).toEqual({ min: 1, max: 1 });
  });
});

describe('rollWeaponDamage', () => {
  it('範圍兩端皆可擲出', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollWeaponDamage(weapon(), 'small')).toBe(7);
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(rollWeaponDamage(weapon(), 'small')).toBe(15);
  });

  it('擲出值永遠落在範圍內', () => {
    vi.restoreAllMocks();
    const w = weapon({ enhancement: 4 });
    for (let i = 0; i < 500; i++) {
      const v = rollWeaponDamage(w, 'large');
      expect(v).toBeGreaterThanOrEqual(7);
      expect(v).toBeLessThanOrEqual(14);
    }
  });
});

describe('普攻與快照套用擲骰', () => {
  it('普攻：擲骰下限與上限的傷害差即為範圍寬度', () => {
    const m = monster();
    // 亂數順序：命中 → 武器基傷 → 爆擊
    mockRandomSequence(0.1, 0, 0.5);
    const low = calculatePlayerAttack(char(), weapon(), m).damage;
    mockRandomSequence(0.1, 0.9999, 0.5);
    const high = calculatePlayerAttack(char(), weapon(), m).damage;
    // STR 14 → +7：7 + 7 = 14、15 + 7 = 22
    expect(low).toBe(14);
    expect(high).toBe(22);
  });

  it('雙持每一下各自擲骰', () => {
    const claw = weapon({ type: 'claw', isTwoHanded: true, smallMonsterDamage: 10 });
    // 第一下：命中、基傷下限、不暴擊；第二下：命中、基傷上限、不暴擊
    mockRandomSequence(0.1, 0, 0.5, 0.1, 0.9999, 0.5);
    const r = calculatePlayerAttack(char(), claw, monster());
    expect(r.hits.map(h => h.damage)).toEqual([5 + 7, 10 + 7]);
  });

  it('基礎物理傷害（快照）也擲骰', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateBasePhysicalDamage(char(), weapon(), [weapon()])).toBe(6 + 7);
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(calculateBasePhysicalDamage(char(), weapon(), [weapon()])).toBe(12 + 7);
  });

  it('未裝備武器時快照基傷固定 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(calculateBasePhysicalDamage(char(), null, [])).toBe(1 + 7);
  });
});
