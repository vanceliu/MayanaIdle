// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CombatScriptEditor } from '../CombatScriptEditor';
import { useGameStore } from '../../stores/gameStore';
import { DEFAULT_COMBAT_SCRIPT } from '../../models/scriptEngine';
import type { CombatRule } from '../../models/scriptEngine';
import type { Skill } from '../../models/skill';

/**
 * 引擎不再偷偷退回普通攻擊（`41-arpg-combat.md`），因此「一條啟用的攻擊規則都沒有」
 * 等於角色完全不出手 —— 這個狀態必須在腳本面板上看得見。
 */

const WARNING = /沒有任何啟用的攻擊規則/;

const fireball: Skill = {
  id: 'fireball', name: '火球', level: 1, element: 'fire', type: 'attack',
  target: 'single', power: 10, mpCost: 5, cooldown: 3000, range: 8,
} as Skill;

function setup(rules: CombatRule[], skills: Skill[] = []) {
  useGameStore.setState({ combatRules: rules, skills });
  render(<CombatScriptEditor />);
}

describe('戰鬥腳本：沒有攻擊規則的警告', () => {
  beforeEach(() => {
    useGameStore.setState({ combatRules: [], skills: [] });
  });

  it('預設腳本有啟用的普通攻擊，不顯示警告', () => {
    setup(DEFAULT_COMBAT_SCRIPT, [fireball]);
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('完全沒有規則時顯示警告', () => {
    setup([]);
    expect(screen.getByText(WARNING)).toBeDefined();
  });

  it('唯一的普通攻擊規則被停用時顯示警告', () => {
    setup([{ id: 'r1', enabled: false, condition: { type: 'always' }, action: { type: 'normal_attack' } }]);
    expect(screen.getByText(WARNING)).toBeDefined();
  });

  it('只有 buff／不動作規則時仍算沒有攻擊手段', () => {
    setup([{ id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'wait' } }]);
    expect(screen.getByText(WARNING)).toBeDefined();
  });

  it('啟用的攻擊技能規則算數，不顯示警告', () => {
    setup(
      [{ id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'skill', skillId: 'fireball' } }],
      [fireball],
    );
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('技能規則指到還沒學會的技能時，不能當作有攻擊手段', () => {
    setup([{ id: 'r1', enabled: true, condition: { type: 'always' }, action: { type: 'skill', skillId: 'fireball' } }], []);
    expect(screen.getByText(WARNING)).toBeDefined();
  });
});
