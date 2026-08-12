import { describe, it, expect } from 'vitest';
import { buildCombatRules, buildPersistentRules } from '../talentRules';
import type { TalentAffixInstance, TalentSlot, TalentType } from '../../models/talent';

const CHAR = 1;
const TPL = 'default';

function slot(
  id: number, type: TalentType | null, order: number | null, tier: 1 | 2 | 3 | 4 = 1, enabled = true,
): TalentSlot {
  return {
    id, characterId: CHAR, tier,
    assignedType: type,
    templateId: type === null ? null : TPL,
    order, enabled,
  };
}

function affix(
  id: number, definitionId: number, slotId: number | null, slotIndex: number | null,
  params: Record<string, unknown> | null = null, boundParam: string | null = null,
): TalentAffixInstance {
  return { id, characterId: CHAR, definitionId, boundParam, params, slotId, slotIndex };
}

describe('天賦格 → 規則（`systems/talentRules.ts`）', () => {
  it('條件槽依 index 排序，實作槽變成 action', () => {
    const slots = [slot(1, 'combat', 0, 2)];
    const affixes = [
      affix(10, 2001, 1, null),                        // 普通攻擊 → action
      affix(11, 1002, 1, 1, { value: 80 }),            // HP 高於 80（第 2 個條件）
      affix(12, 1001, 1, 0, { value: 30 }),            // HP 低於 30（第 1 個條件）
    ];

    const [rule] = buildCombatRules(slots, affixes, TPL);

    expect(rule.action).toEqual({ type: 'normal_attack' });
    expect(rule.conditions).toEqual([
      { type: 'hp_below', value: 30 },
      { type: 'hp_above', value: 80 },
    ]);
  });

  it('天賦格依 order 排序 —— 判定是由上往下取第一個成立的', () => {
    const slots = [slot(1, 'combat', 1), slot(2, 'combat', 0)];
    const affixes = [affix(10, 2001, 1, null), affix(11, 2002, 2, null)];

    const rules = buildCombatRules(slots, affixes, TPL);

    expect(rules.map(r => r.id)).toEqual(['slot-2', 'slot-1']);
  });

  it('條件槽全空＝恆真（空陣列，既有 evaluator 當「永遠」）', () => {
    const slots = [slot(1, 'combat', 0)];
    const affixes = [affix(10, 2001, 1, null)];

    const [rule] = buildCombatRules(slots, affixes, TPL);

    expect(rule.conditions).toEqual([]);
  });

  it('實作槽留空的天賦格不參與判定（§ 51.3.1）', () => {
    const slots = [slot(1, 'combat', 0)];
    // 只鑲了條件，沒有動作
    const affixes = [affix(10, 1001, 1, 0, { value: 30 })];

    expect(buildCombatRules(slots, affixes, TPL)).toHaveLength(0);
  });

  it('未安裝的天賦格不參與判定（躺在背包，§ 51.3.4）', () => {
    const slots = [slot(1, null, null)];
    const affixes = [affix(10, 2001, 1, null)];

    expect(buildCombatRules(slots, affixes, TPL)).toHaveLength(0);
  });

  it('停用的天賦格照樣組出來，但帶 enabled: false（由 evaluator 跳過）', () => {
    const slots = [slot(1, 'combat', 0, 1, false)];
    const affixes = [affix(10, 2001, 1, null)];

    const [rule] = buildCombatRules(slots, affixes, TPL);
    expect(rule.enabled).toBe(false);
  });

  it('只組指定類型的天賦格', () => {
    const slots = [slot(1, 'combat', 0), slot(2, 'persistent', 0)];
    const affixes = [affix(10, 2001, 1, null), affix(11, 2101, 2, null, { potionType: 'red' })];

    expect(buildCombatRules(slots, affixes, TPL)).toHaveLength(1);
    expect(buildPersistentRules(slots, affixes, TPL)).toHaveLength(1);
  });

  it('只組指定天賦配置的天賦格', () => {
    const other: TalentSlot = { ...slot(1, 'combat', 0), templateId: 'other' };
    const affixes = [affix(10, 2001, 1, null)];

    expect(buildCombatRules([other], affixes, TPL)).toHaveLength(0);
    expect(buildCombatRules([other], affixes, 'other')).toHaveLength(1);
  });

  describe('指定型的綁定值（§ 51.4.1）', () => {
    it('蓋過玩家參數 —— 掉落時 roll 死的不可更改', () => {
      const slots = [slot(1, 'combat', 0)];
      // 2003 ＝ 施放指定攻擊技能（fixed），綁的是風刃
      const affixes = [affix(10, 2003, 1, null, { skillId: 'fireball' }, 'wind-blade')];

      const [rule] = buildCombatRules(slots, affixes, TPL);

      expect(rule.action).toEqual({ type: 'skill', skillId: 'wind-blade' });
    });

    it('未綁定時沿用玩家參數（起始鑲材首次鑲入前）', () => {
      const slots = [slot(1, 'combat', 0)];
      const affixes = [affix(10, 2003, 1, null, { skillId: 'wind-blade' }, null)];

      const [rule] = buildCombatRules(slots, affixes, TPL);

      expect(rule.action).toEqual({ type: 'skill', skillId: 'wind-blade' });
    });
  });

  it('blocked 的鑲材不進規則（怪物側機制未做，§ 51.4.4）', () => {
    const slots = [slot(1, 'combat', 0)];
    const affixes = [
      affix(10, 2001, 1, null),
      affix(11, 1118, 1, 0), // 目標正在詠唱，blocked
    ];

    const [rule] = buildCombatRules(slots, affixes, TPL);

    // 動作照樣成立，但那個條件被濾掉 —— 不會讓整條規則變成無法判定
    expect(rule.conditions).toEqual([]);
  });
});
