/**
 * 元素克制三段（`42-element-system.md` § 42.2、`21-combat-formula.md` § 21.15）：
 * 克制 +5、無克制 +3、被克制 +0；攻擊方無屬性固定 +0。物理普攻與技能共用。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateSkillAttack, getElementCounterBonus } from '../combat';
import type { Character } from '../../models/character';
import type { ElementType, MonsterInstance } from '../../models/monster';

const ELEMENTS: ElementType[] = ['fire', 'wind', 'earth', 'ice', 'light', 'dark'];
const ALL: ElementType[] = [...ELEMENTS, 'none'];

const ADVANTAGE: ReadonlyArray<[string, string]> = [
  ['fire', 'wind'], ['wind', 'earth'], ['earth', 'ice'], ['ice', 'fire'],
  ['light', 'dark'], ['dark', 'light'],
];

const DISADVANTAGE: ReadonlyArray<[string, string]> = [
  ['fire', 'ice'], ['ice', 'earth'], ['earth', 'wind'], ['wind', 'fire'],
];

const isPair = (list: ReadonlyArray<[string, string]>, a: string, b: string) =>
  list.some(([x, y]) => x === a && y === b);

afterEach(() => { vi.restoreAllMocks(); });

describe('getElementCounterBonus', () => {
  it('克制 +5', () => {
    for (const [attack, target] of ADVANTAGE) {
      expect(getElementCounterBonus(attack, target), `${attack}→${target}`).toBe(5);
    }
  });

  it('被克制 +0', () => {
    for (const [attack, target] of DISADVANTAGE) {
      expect(getElementCounterBonus(attack, target), `${attack}→${target}`).toBe(0);
    }
  });

  it('其餘元素組合一律 +3（同屬性、無關係、光暗與四元素互打）', () => {
    for (const attack of ELEMENTS) {
      for (const target of ELEMENTS) {
        if (isPair(ADVANTAGE, attack, target) || isPair(DISADVANTAGE, attack, target)) continue;
        expect(getElementCounterBonus(attack, target), `${attack}→${target}`).toBe(3);
      }
    }
  });

  it('目標無屬性視為無克制 +3', () => {
    for (const attack of ELEMENTS) {
      expect(getElementCounterBonus(attack, 'none'), attack).toBe(3);
    }
  });

  it('攻擊方無屬性固定 +0', () => {
    for (const target of ALL) {
      expect(getElementCounterBonus('none', target), target).toBe(0);
      expect(getElementCounterBonus(undefined, target), target).toBe(0);
    }
  });

  it('光闇互克，光／闇攻擊不會落到 +0', () => {
    for (const attack of ['light', 'dark'] as const) {
      for (const target of ALL) {
        expect(getElementCounterBonus(attack, target)).toBeGreaterThan(0);
      }
    }
  });
});

describe('技能路徑套用同一套克制', () => {
  function char(): Character {
    return {
      name: 'T', className: 'elementalist', level: 50, exp: 0, expToNext: 1_000_000,
      hp: 300, maxHp: 300, mp: 200, maxMp: 200,
      baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 20, CHA: 10 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
      currentRegion: 'dawn-plains', currentFloor: null, skills: [],
      unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
    };
  }

  function dummy(element: ElementType): MonsterInstance {
    return {
      templateId: 1, name: '木樁', level: 50, currentHp: 99999, maxHp: 99999,
      attackMin: 1, attackMax: 1, defense: 0, exp: 0,
      race: 'normal', size: 'small', element, isBoss: false,
      attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    };
  }

  it('火系技能打風 +5、打地 +3、打冰 +0，加在基礎魔攻', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // 不暴擊
    const hit = (element: ElementType) => calculateSkillAttack(char(), 40, 'fire', dummy(element), []).damage;
    const base = hit('ice');
    expect(hit('wind')).toBe(base + 5);
    expect(hit('earth')).toBe(base + 3);
    expect(hit('none')).toBe(base + 3);
  });

  it('無屬性技能對任何目標都不加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const hit = (element: ElementType) => calculateSkillAttack(char(), 40, 'none', dummy(element), []).damage;
    for (const element of ALL) {
      expect(hit(element), element).toBe(hit('none'));
    }
  });
});
