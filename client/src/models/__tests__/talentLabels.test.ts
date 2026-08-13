import { describe, it, expect } from 'vitest';
import { affixDropLabel, affixLabelOf, boundParamLabel } from '../talentLabels';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';

const defOf = (ruleId: string, form?: string) =>
  TALENT_AFFIX_DEFS.find(d => d.ruleId === ruleId && (!form || d.form === form))!;

/*
 * 掉落日誌要看得出撿到什麼（§ 51.6.1）。
 * 只有階級的話，同一階十幾種鑲材玩家得開背包翻。
 */
describe('鑲材的掉落日誌名稱', () => {
  it('自選型只有名稱與階級', () => {
    const def = defOf('hp_below');
    expect(affixDropLabel(def, null)).toBe(`${affixLabelOf(def)}（T${def.tier}）`);
  });

  // 池型在掉落時 roll 出子集，不顯示的話兩份長得一樣但綁的不同
  it('池型帶出 roll 到的子集', () => {
    const def = defOf('skill', 'pool');
    expect(affixDropLabel(def, 'fire')).toContain('・火系');
    expect(affixDropLabel(def, 'aoe')).toContain('・範圍');
  });

  it('道具類別的池型也帶得出來', () => {
    const def = defOf('buy_item', 'pool');
    expect(affixDropLabel(def, 'potion')).toContain('・藥水');
  });

  it('查不到的綁定值不顯示，不印出原始 key', () => {
    expect(boundParamLabel('nonsense-key')).toBeNull();
    const def = defOf('hp_below');
    expect(affixDropLabel(def, 'nonsense-key')).not.toContain('nonsense');
  });
});
