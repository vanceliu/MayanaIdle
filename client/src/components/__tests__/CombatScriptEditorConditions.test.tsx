// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CombatScriptEditor } from '../CombatScriptEditor';
import { useGameStore, selectCombatRules } from '../../stores/gameStore';
import { setActiveScripts } from '../../testing/scriptFixtures';
import type { CombatRule } from '../../models/scriptEngine';

/**
 * 一條規則可以掛多個條件（AND，見 `03-combat.md` § 3.12）。
 * 面板要能增刪條件，且第二條之後的接續詞是「且」而不是「如果」。
 */

function setup(rules: CombatRule[]) {
  setActiveScripts({ combatRules: rules });
  useGameStore.setState({ skills: [] });
  render(<CombatScriptEditor />);
}

const oneRule: CombatRule[] = [
  { id: 'r1', enabled: true, conditions: [{ type: 'monster_count_gte', value: 3 }], action: { type: 'normal_attack' } },
];

describe('戰鬥腳本編輯器：多條件', () => {
  beforeEach(() => {
    setActiveScripts({ combatRules: [] });
    useGameStore.setState({ skills: [] });
  });

  it('「＋ 條件」會加一條預設為「永遠」的條件，並以「且」串接', () => {
    setup(oneRule);
    expect(screen.queryByText('且')).toBeNull();

    fireEvent.click(screen.getByText('＋ 條件'));

    const rules = selectCombatRules(useGameStore.getState());
    expect(rules[0].conditions).toHaveLength(2);
    expect(rules[0].conditions[1]).toEqual({ type: 'always' });
    expect(screen.getByText('且')).toBeDefined();
  });

  it('刪除條件只移除該條，不動其他條件', () => {
    setup([
      {
        id: 'r1',
        enabled: true,
        conditions: [{ type: 'monster_count_gte', value: 3 }, { type: 'mp_above', value: 50 }],
        action: { type: 'normal_attack' },
      },
    ]);

    fireEvent.click(screen.getAllByLabelText('刪除條件')[0]);

    expect(selectCombatRules(useGameStore.getState())[0].conditions).toEqual([{ type: 'mp_above', value: 50 }]);
  });

  it('條件全刪光時標示為無條件（等同永遠成立）', () => {
    setup(oneRule);
    fireEvent.click(screen.getByLabelText('刪除條件'));

    expect(selectCombatRules(useGameStore.getState())[0].conditions).toEqual([]);
    expect(screen.getByText(/無條件/)).toBeDefined();
  });

  it('選到「自身周圍怪物數」時才出現半徑欄位', () => {
    setup(oneRule);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1);

    // 第一個下拉是條件類型（第二個是動作）
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'monsters_near_self_gte' },
    });

    // 隻數 + 半徑兩個數字欄位
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    expect(selectCombatRules(useGameStore.getState())[0].conditions[0].type).toBe('monsters_near_self_gte');
  });
});
