import { describe, it, expect } from 'vitest';
import { migrateSlotContent, LEGACY_AFFIX_RULE_IDS } from '../talentAffixLegacy';
import { getTalentRuleDef } from '../../seed/talentSeeds';

/**
 * v22 遷移：鑲材實例 → 天賦格欄位（`51-auto-talent.md` § 51.4.1）。
 *
 * 玩家已經擺好的配置要原地搬過去 —— 搬丟了等於把整份天賦配置清空，
 * 而天賦格是用等級與合成換來的。
 */

const affix = (
  definitionId: number,
  slotIndex: number | null,
  params: Record<string, unknown> | null = null,
  boundParam: string | null = null,
) => ({ definitionId, boundParam, params, slotId: 1, slotIndex });

describe('鑲材 → 天賦格欄位的遷移', () => {
  it('動作槽（slotIndex 為 null）搬成 action', () => {
    const { action } = migrateSlotContent(1, [affix(2001, null)]);
    expect(action).toEqual({ ruleId: 'normal_attack', params: null });
  });

  it('條件槽依 index 落位，沒填的留 null', () => {
    const { conditions } = migrateSlotContent(3, [affix(1001, 0, { value: 30 })]);
    expect(conditions).toEqual([{ ruleId: 'hp_below', params: { value: 30 } }, null, null]);
  });

  it('條件槽陣列長度＝天賦格 tier', () => {
    expect(migrateSlotContent(4, []).conditions).toHaveLength(4);
    expect(migrateSlotContent(1, []).conditions).toHaveLength(1);
  });

  /* 舊的指定型把技能 roll 在實例上，新形狀一律走參數（§ 51.4.1） */
  it('boundParam 併回 params.skillId', () => {
    const { action } = migrateSlotContent(1, [affix(2003, null, null, 'wind-blade')]);
    expect(action).toEqual({ ruleId: 'skill', params: { skillId: 'wind-blade' } });
  });

  it('boundParam 蓋過同名的舊參數 —— 那是綁死的那一個', () => {
    const { action } = migrateSlotContent(1, [affix(2003, null, { skillId: 'fireball' }, 'wind-blade')]);
    expect(action).toEqual({ ruleId: 'skill', params: { skillId: 'wind-blade' } });
  });

  /* 多階塌成完整版之後指向同一個 ruleId（§ 51.4.1） */
  it('原本分階的鑲材都搬到塌陷後的那一筆', () => {
    for (const id of [2003, 2004, 2005, 2006]) {
      expect(LEGACY_AFFIX_RULE_IDS[id]).toBe('skill');
    }
    expect(LEGACY_AFFIX_RULE_IDS[2103]).toBe(LEGACY_AFFIX_RULE_IDS[2106]);
    expect(LEGACY_AFFIX_RULE_IDS[2206]).toBe(LEGACY_AFFIX_RULE_IDS[2208]);
    expect(LEGACY_AFFIX_RULE_IDS[2207]).toBe(LEGACY_AFFIX_RULE_IDS[2209]);
  });

  it('查不到對照的丟掉，不會組出無效規則', () => {
    const { action, conditions } = migrateSlotContent(1, [affix(9999, null), affix(9998, 0)]);
    expect(action).toBeNull();
    expect(conditions).toEqual([null]);
  });

  it('index 超出 tier 的丟掉，不會長出多的條件槽', () => {
    const { conditions } = migrateSlotContent(1, [affix(1001, 3, { value: 30 })]);
    expect(conditions).toEqual([null]);
  });

  /* 對照表指向的每一個 ruleId 都必須在新 seed 裡找得到，否則搬過去就是死規則 */
  it('對照表的每一個 ruleId 在新 seed 裡都存在', () => {
    const missing = [...new Set(Object.values(LEGACY_AFFIX_RULE_IDS))]
      .filter(ruleId => !getTalentRuleDef(ruleId));
    expect(missing).toEqual([]);
  });
});
