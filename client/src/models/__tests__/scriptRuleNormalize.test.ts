import { describe, it, expect } from 'vitest';
import {
  normalizeCombatRules,
  normalizePersistentRules,
  DEFAULT_COMBAT_SCRIPT,
  DEFAULT_PERSISTENT_SCRIPT,
} from '../scriptEngine';

/**
 * 讀檔防線：認不得的舊格式**整份重置成預設**，不做欄位轉換。
 * 玩家自訂的順序會消失，這是刻意接受的代價。
 */

describe('normalizeCombatRules / normalizePersistentRules', () => {
  it('現行格式原樣保留（含多條件）', () => {
    const current = [
      {
        id: 'r1',
        enabled: true,
        conditions: [{ type: 'aoe_hit_count_gte', value: 3 }, { type: 'mp_above', value: 40 }],
        action: { type: 'skill', skillId: 'storm' },
      },
    ];
    expect(normalizeCombatRules(current)).toEqual(current);
  });

  it('條件為空陣列也算現行格式（等同無條件）', () => {
    const rules = [{ id: 'r1', enabled: true, conditions: [], action: { type: 'normal_attack' } }];
    expect(normalizeCombatRules(rules)).toEqual(rules);
  });

  it('舊格式的單一 condition 整份重置成預設腳本', () => {
    const legacy = [
      { id: 'r1', enabled: true, condition: { type: 'monster_count_gte', value: 3 }, action: { type: 'skill', skillId: 'fireball' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'normal_attack' } },
    ];
    expect(normalizeCombatRules(legacy)).toEqual(DEFAULT_COMBAT_SCRIPT);
  });

  it('只要有一條規則是舊格式，整份都重置（不留混合狀態）', () => {
    const mixed = [
      { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      { id: 'r2', enabled: true, condition: { type: 'always' }, action: { type: 'wait' } },
    ];
    expect(normalizeCombatRules(mixed)).toEqual(DEFAULT_COMBAT_SCRIPT);
  });

  it('不是陣列、空值、亂資料一律回預設', () => {
    expect(normalizeCombatRules(undefined)).toEqual(DEFAULT_COMBAT_SCRIPT);
    expect(normalizeCombatRules('nonsense')).toEqual(DEFAULT_COMBAT_SCRIPT);
    expect(normalizeCombatRules([null])).toEqual(DEFAULT_COMBAT_SCRIPT);
    expect(normalizePersistentRules(null)).toEqual(DEFAULT_PERSISTENT_SCRIPT);
  });

  it('常駐腳本套用同一套規則', () => {
    const legacy = [
      { id: 'r1', enabled: true, condition: { type: 'hp_below', value: 30 }, action: { type: 'potion', potionType: 'red' } },
    ];
    expect(normalizePersistentRules(legacy)).toEqual(DEFAULT_PERSISTENT_SCRIPT);
  });
});
