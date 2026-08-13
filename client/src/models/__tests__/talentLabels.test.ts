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

/*
 * 可選範圍階梯（§ 51.4.1）共用同一個 `ruleId`，名稱是玩家唯一分得出階級的線索。
 * 同名的話合成台與背包會出現好幾份「施放攻擊技能」，看不出差別。
 */
describe('同一條規則橫跨多階時名稱不同', () => {
  it('攻擊技能三階各有各的名字', () => {
    expect(affixLabelOf(defOf('skill', 'fixed'))).toBe('施放指定攻擊技能');
    expect(affixLabelOf(defOf('skill', 'pool'))).toBe('施放指定系別攻擊技能');
    expect(affixLabelOf(defOf('skill', 'free'))).toBe('施放攻擊技能');
  });

  it('buff 技能、購買、從倉庫取也分得開', () => {
    expect(affixLabelOf(defOf('buff_skill', 'fixed'))).toBe('施放特定招式');
    expect(affixLabelOf(defOf('buff_skill', 'free'))).not.toBe('施放特定招式');
    expect(affixLabelOf(defOf('buy_item', 'pool'))).toContain('指定類別');
    expect(affixLabelOf(defOf('buy_item', 'free'))).not.toContain('指定類別');
    expect(affixLabelOf(defOf('withdraw_item', 'pool'))).toContain('指定類別');
    expect(affixLabelOf(defOf('withdraw_item', 'free'))).not.toContain('指定類別');
  });

  it('沒有兩筆定義叫同一個名字', () => {
    const names = TALENT_AFFIX_DEFS.map(affixLabelOf);
    expect(new Set(names).size).toBe(names.length);
  });
});
