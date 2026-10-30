import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSkillBookLevels, rollClassSkillBookDrops } from '../classSkillBookDrop';
import { getItemId } from '../../models/items';

/** 掉落回傳的是道具 id；測試以名稱書寫，這裡一次換算 */
const ids = (...names: string[]) => names.map(n => getItemId(n)!);

const LEVEL_3_BOOKS = ids(
  '鋼鐵護盾技能書', '三連射技能書', '元素增幅技能書', '群體治癒技能書', '煙霧彈技能書',
);
const LEVEL_4_BOOKS = ids(
  '挑釁怒吼技能書', '鷹眼技能書', '強化冷卻縮減技能書', '聖光審判技能書', '精準打擊技能書',
);
const LEVEL_5_BOOKS = ids(
  '衝鋒突進技能書', '束縛箭技能書', '魔力護盾技能書', '血魔轉換技能書', '背刺技能書',
);

describe('getSkillBookLevels（23-class-magic.md § 23.1）', () => {
  it.each([
    { areaLevel: 30, levels: [] },
    { areaLevel: 31, levels: [3] },
    { areaLevel: 38, levels: [3, 4] },
    { areaLevel: 43, levels: [4, 5] },
    { areaLevel: 50, levels: [5] },
    { areaLevel: 56, levels: [6] },
    { areaLevel: 63, levels: [6, 7] },
    { areaLevel: 80, levels: [7] },
    { areaLevel: 99, levels: [] },
  ])('區域 levelMax $areaLevel → $levels', ({ areaLevel, levels }) => {
    expect(getSkillBookLevels(areaLevel)).toEqual(levels);
  });
});

describe('rollClassSkillBookDrops', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('不在任何區間時不掉也不耗亂數', () => {
    const random = vi.spyOn(Math, 'random');
    expect(rollClassSkillBookDrops(30, false, 1000)).toEqual([]);
    expect(rollClassSkillBookDrops(99, true, 1000)).toEqual([]);
    expect(random).not.toHaveBeenCalled();
  });

  it.each([
    { areaLevel: 33, books: LEVEL_3_BOOKS },
    { areaLevel: 48, books: LEVEL_5_BOOKS },
  ])('區域 levelMax $areaLevel 只掉該級的書', ({ areaLevel, books }) => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);
    const drops = rollClassSkillBookDrops(areaLevel, false);
    expect(drops).toHaveLength(1);
    expect(books).toContain(drops[0]);
  });

  it('區間重疊時各級獨立判定，可同時掉兩本', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const drops = rollClassSkillBookDrops(38, true);
    expect(drops).toEqual([LEVEL_3_BOOKS[0], LEVEL_4_BOOKS[0]]);
  });

  it('區間重疊時其中一級沒中不影響另一級', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);
    expect(rollClassSkillBookDrops(38, true)).toEqual([LEVEL_4_BOOKS[0]]);
  });

  it('6、7 級的池子：五職業各一本，由騎士排到盜賊', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollClassSkillBookDrops(63, true)).toEqual(ids('血濺咒殺技能書', '復仇之刃技能書'));
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(rollClassSkillBookDrops(63, true)).toEqual([]);
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0).mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    expect(rollClassSkillBookDrops(63, true)).toEqual(ids('毒霧技能書', '閃避反擊技能書'));
  });

  it('掉寶倍率作用在一般怪', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.00075);
    expect(rollClassSkillBookDrops(33, false)).toEqual([]);

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.00075)
      .mockReturnValueOnce(0);
    expect(rollClassSkillBookDrops(33, false, 2)).toEqual([LEVEL_3_BOOKS[0]]);
  });

  it('最終掉率上限 100%', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.999999)
      .mockReturnValueOnce(0);
    expect(rollClassSkillBookDrops(48, false, 10000)).toEqual([LEVEL_5_BOOKS[0]]);
  });
});
