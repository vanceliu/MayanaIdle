import { describe, it, expect } from 'vitest';
import { buildCombatRules, buildPersistentRules, slotSkipReason } from '../talentRules';
import type { TalentSlot, TalentSlotEntry, TalentSlotTier, TalentType } from '../../models/talent';

const CHAR = 1;
const TPL = 'default';

/** 一筆槽位內容。`params` 為 null ＝ 玩家還沒填 */
function e(ruleId: string, params: Record<string, unknown> | null = null): TalentSlotEntry {
  return { ruleId, params };
}

function slot(
  id: number,
  type: TalentType | null,
  order: number | null,
  opts: {
    tier?: TalentSlotTier;
    enabled?: boolean;
    conditions?: (TalentSlotEntry | null)[];
    action?: TalentSlotEntry | null;
  } = {},
): TalentSlot {
  const tier = opts.tier ?? 1;
  return {
    id,
    characterId: CHAR,
    tier,
    assignedType: type,
    templateId: type === null ? null : TPL,
    order,
    enabled: opts.enabled ?? true,
    conditions: opts.conditions ?? Array.from({ length: tier }, () => null),
    action: opts.action ?? null,
  };
}

describe('天賦格 → 規則（`systems/talentRules.ts`）', () => {
  it('條件槽依 index 排序，動作槽變成 action', () => {
    const slots = [slot(1, 'combat', 0, {
      tier: 2,
      conditions: [e('hp_below', { value: 30 }), e('hp_above', { value: 80 })],
      action: e('normal_attack'),
    })];

    const [rule] = buildCombatRules(slots, TPL);

    expect(rule.action).toEqual({ type: 'normal_attack' });
    expect(rule.conditions).toEqual([
      { type: 'hp_below', value: 30 },
      { type: 'hp_above', value: 80 },
    ]);
  });

  it('天賦格依 order 排序 —— 判定是由上往下取第一個成立的', () => {
    const slots = [
      slot(1, 'combat', 1, { action: e('normal_attack') }),
      slot(2, 'combat', 0, { action: e('wait') }),
    ];

    expect(buildCombatRules(slots, TPL).map(r => r.id)).toEqual(['slot-2', 'slot-1']);
  });

  it('條件槽全空＝恆真（空陣列，既有 evaluator 當「永遠」）', () => {
    const slots = [slot(1, 'combat', 0, { action: e('normal_attack') })];

    expect(buildCombatRules(slots, TPL)[0].conditions).toEqual([]);
  });

  it('動作槽留空的天賦格不參與判定（§ 51.3.1）', () => {
    const slots = [slot(1, 'combat', 0, { conditions: [e('hp_below', { value: 30 })] })];

    expect(buildCombatRules(slots, TPL)).toHaveLength(0);
  });

  it('未安裝的天賦格不參與判定（躺在背包，§ 51.3.4）', () => {
    expect(buildCombatRules([slot(1, null, null, { action: e('normal_attack') })], TPL))
      .toHaveLength(0);
  });

  it('停用的天賦格照樣組出來，但帶 enabled: false（由 evaluator 跳過）', () => {
    const slots = [slot(1, 'combat', 0, { enabled: false, action: e('normal_attack') })];

    expect(buildCombatRules(slots, TPL)[0].enabled).toBe(false);
  });

  it('只組指定類型的天賦格', () => {
    const slots = [
      slot(1, 'combat', 0, { action: e('normal_attack') }),
      slot(2, 'persistent', 0, { action: e('potion', { potionType: 'red' }) }),
    ];

    expect(buildCombatRules(slots, TPL)).toHaveLength(1);
    expect(buildPersistentRules(slots, TPL)).toHaveLength(1);
  });

  it('只組指定天賦配置的天賦格', () => {
    const other: TalentSlot = {
      ...slot(1, 'combat', 0, { action: e('normal_attack') }),
      templateId: 'other',
    };

    expect(buildCombatRules([other], TPL)).toHaveLength(0);
    expect(buildCombatRules([other], 'other')).toHaveLength(1);
  });

  /* 同一個 ruleId 可以出現在任意多格，各自帶各自的參數（§ 51.5.1） */
  it('同一個條件可重複用在多格，參數各自獨立', () => {
    const slots = [
      slot(1, 'combat', 0, {
        conditions: [e('hp_below', { value: 30 })], action: e('normal_attack'),
      }),
      slot(2, 'combat', 1, {
        conditions: [e('hp_below', { value: 70 })], action: e('wait'),
      }),
    ];

    const rules = buildCombatRules(slots, TPL);
    expect(rules[0].conditions).toEqual([{ type: 'hp_below', value: 30 }]);
    expect(rules[1].conditions).toEqual([{ type: 'hp_below', value: 70 }]);
  });

  it('blocked 的項目不進規則（引擎未接上，§ 51.4.3.2）', () => {
    const slots = [slot(1, 'combat', 0, {
      conditions: [e('can_kill_target')],
      action: e('normal_attack'),
    })];

    const [rule] = buildCombatRules(slots, TPL);

    // 動作照樣成立，但那個條件被濾掉 —— 不會讓整條規則變成無法判定
    expect(rule.conditions).toEqual([]);
  });

  /*
   * 技能沒選定的規則放不出來，判定必須往下一條走 —— 不跳過的話
   * 起始那三格未選定的「施放攻擊技能」會把普通攻擊卡在後面，角色整場不出手。
   */
  describe('技能／道具沒選定就跳過（§ 51.3.1）', () => {
    it('未選定技能的施放不進規則列表', () => {
      const slots = [
        slot(1, 'combat', 0, { action: e('skill') }),
        slot(2, 'combat', 1, { action: e('normal_attack') }),
      ];
      const rules = buildCombatRules(slots, TPL);
      expect(rules).toHaveLength(1);
      expect((rules[0] as unknown as { action: { type: string } }).action.type)
        .toBe('normal_attack');
    });

    it('選定之後就進來，順序照天賦格', () => {
      const slots = [
        slot(1, 'combat', 0, { action: e('skill', { skillId: 'wind-blade' }) }),
        slot(2, 'combat', 1, { action: e('normal_attack') }),
      ];
      const rules = buildCombatRules(slots, TPL);
      expect(rules).toHaveLength(2);
      const first = rules[0] as unknown as { action: { type: string; skillId: string } };
      expect(first.action.type).toBe('skill');
      expect(first.action.skillId).toBe('wind-blade');
    });

    it('條件的技能沒選定，整條規則跳過', () => {
      const slots = [
        slot(1, 'combat', 0, { conditions: [e('skill_ready')], action: e('normal_attack') }),
        slot(2, 'combat', 1, { action: e('normal_attack') }),
      ];
      const rules = buildCombatRules(slots, TPL);
      expect(rules).toHaveLength(1);
      expect((rules[0] as unknown as { id: string }).id).toBe('slot-2');
    });

    it('數值型參數有預設值，不算沒選定', () => {
      const slots = [slot(1, 'persistent', 0, {
        conditions: [e('hp_below', { value: 30 })],
        action: e('potion', { potionType: 'red' }),
      })];
      expect(buildPersistentRules(slots, TPL)).toHaveLength(1);
    });
  });

  /* 編輯器靠這支在沒進判定的列上掛警示標記 */
  describe('slotSkipReason', () => {
    it('動作槽留空回 no-action', () => {
      expect(slotSkipReason(slot(1, 'combat', 0))).toBe('no-action');
    });

    it('技能未選定回 unresolved', () => {
      expect(slotSkipReason(slot(1, 'combat', 0, { action: e('skill') }))).toBe('unresolved');
    });

    it('條件的技能未選定也回 unresolved', () => {
      expect(slotSkipReason(slot(1, 'combat', 0, {
        conditions: [e('skill_ready')], action: e('normal_attack'),
      }))).toBe('unresolved');
    });

    it('正常的列回 null', () => {
      expect(slotSkipReason(slot(1, 'combat', 0, { action: e('normal_attack') }))).toBeNull();
    });

    // 停用是玩家自己關的，勾選框已經表達了，不必再掛警示 ——
    // 由 `TalentEditor` 先看 enabled 決定要不要問，這支本身不看
    it('停用的列照樣回報原因，過濾由編輯器負責', () => {
      expect(slotSkipReason(slot(1, 'combat', 0, { enabled: false }))).toBe('no-action');
    });
  });
});
