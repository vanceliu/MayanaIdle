import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollClassSkillBookDrop } from '../classSkillBookDrop';

const LEVEL_3_BOOKS = [
  '鋼鐵護盾技能書', '三連射技能書', '元素增幅技能書', '群體治癒技能書', '煙霧彈技能書',
];
const LEVEL_4_BOOKS = [
  '挑釁怒吼技能書', '鷹眼技能書', '連鎖詠唱技能書', '聖光審判技能書', '精準打擊技能書',
];
const LEVEL_5_BOOKS = [
  '復仇之刃技能書', '穿透箭雨技能書', '元素風暴技能書', '神聖領域技能書', '背刺技能書',
];

describe('classSkillBookDrop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null below level 35 without consuming RNG', () => {
    const random = vi.spyOn(Math, 'random');

    expect(rollClassSkillBookDrop(34, false, 1000)).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });

  it.each([
    { areaLevel: 42, books: LEVEL_3_BOOKS },
    { areaLevel: 44, books: LEVEL_4_BOOKS },
    { areaLevel: 48, books: LEVEL_5_BOOKS },
  ])('selects only a level-appropriate book at area level $areaLevel', ({ areaLevel, books }) => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);

    expect(books).toContain(rollClassSkillBookDrop(areaLevel, false));
  });

  it('applies the drop multiplier to normal monster skill books', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.00075);
    expect(rollClassSkillBookDrop(42, false)).toBeNull();

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.00075)
      .mockReturnValueOnce(0);
    expect(rollClassSkillBookDrop(42, false, 2)).toBe(LEVEL_3_BOOKS[0]);
  });

  it('applies the drop multiplier to boss skill books', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.06);
    expect(rollClassSkillBookDrop(44, true)).toBeNull();

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.06)
      .mockReturnValueOnce(0);
    expect(rollClassSkillBookDrop(44, true, 1.5)).toBe(LEVEL_4_BOOKS[0]);
  });

  it('caps the final skill book drop rate at 100%', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.999999)
      .mockReturnValueOnce(0);

    expect(rollClassSkillBookDrop(48, false, 10000)).toBe(LEVEL_5_BOOKS[0]);
  });
});
