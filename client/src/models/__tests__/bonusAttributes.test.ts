import { describe, it, expect } from 'vitest';
import {
  CLASS_BASE_ATTRIBUTES,
  CREATION_ATTRIBUTE_CAP,
  getAvailablePoints,
  validateBonusAttributes,
  type ClassName,
} from '../character';

/** 建角加點驗證（`04-character.md` § 4.2） */
const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];

/** 依屬性順序把可分配點數填到上限為止，得出一組合法加點 */
function validBonus(className: ClassName) {
  const base = CLASS_BASE_ATTRIBUTES[className];
  let left = getAvailablePoints(className);
  const bonus = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
  for (const key of Object.keys(bonus) as (keyof typeof bonus)[]) {
    const add = Math.min(left, CREATION_ATTRIBUTE_CAP - base[key]);
    bonus[key] = add;
    left -= add;
  }
  return bonus;
}

const KNIGHT_OK = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

describe('validateBonusAttributes', () => {
  it.each(CLASSES)('%s 點數剛好分配完且不超過上限即通過', className => {
    expect(validateBonusAttributes(className, validBonus(className))).toBeNull();
  });

  it.each([null, undefined, 0, 'x', [], [1, 2, 3, 4, 5, 6]])('非物件 %j 為 shape', bonus => {
    expect(validateBonusAttributes('knight', bonus)).toBe('shape');
  });

  it('缺少屬性為 shape', () => {
    const { CHA: _omit, ...rest } = KNIGHT_OK;
    expect(validateBonusAttributes('knight', rest)).toBe('shape');
  });

  it('多出屬性為 shape', () => {
    expect(validateBonusAttributes('knight', { ...KNIGHT_OK, LUK: 0 })).toBe('shape');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null])('加點 %j 為 not_integer', value => {
    expect(validateBonusAttributes('knight', { ...KNIGHT_OK, VIT: value })).toBe('not_integer');
  });

  it('初始 + 加點超過 18 為 over_cap', () => {
    // 騎士 VIT 初始 16，+3 = 19
    expect(validateBonusAttributes('knight', { STR: 1, AGI: 0, VIT: 3, SPI: 0, INT: 0, CHA: 0 })).toBe('over_cap');
  });

  it('初始已達 18 的屬性不可再加', () => {
    // 牧師 INT 初始 18
    expect(validateBonusAttributes('priest', { ...validBonus('priest'), INT: 1 })).toBe('over_cap');
  });

  it('巨大數值為 over_cap，不會建出超標角色', () => {
    const huge = { STR: 100000, AGI: 100000, VIT: 100000, SPI: 100000, INT: 100000, CHA: 100000 };
    expect(validateBonusAttributes('knight', huge)).toBe('over_cap');
  });

  it('點數沒分配完為 wrong_total', () => {
    expect(validateBonusAttributes('knight', { ...KNIGHT_OK, AGI: 1 })).toBe('wrong_total');
  });

  it('全 0 為 wrong_total', () => {
    expect(validateBonusAttributes('knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 })).toBe('wrong_total');
  });
});
