import { describe, it, expect } from 'vitest';
import { evaluateCombatScript, type CombatScriptContext } from '../scriptRunner';
import type { CombatRule, CombatActionType } from '../../models/scriptEngine';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';

/**
 * 戰鬥動作的可執行閘門（`51-auto-talent.md` § 51.4.9）。
 * 閘門漏了哪一個，那個鑲材就永遠選不上，而且不會報錯。
 */

function ctx(over: Partial<CombatScriptContext> = {}): CombatScriptContext {
  return {
    character: { hp: 100, maxHp: 100, mp: 100, maxMp: 100, level: 10 } as never,
    monsters: [{ id: 'm1', position: { x: 1, y: 0 }, instance: { currentHp: 50, maxHp: 100 } } as never],
    skills: [],
    now: 1000,
    playerPos: { x: 0, y: 0 },
    primaryTargetId: 'm1',
    weaponRange: 1.5,
    ...over,
  } as CombatScriptContext;
}

function rule(type: CombatActionType): CombatRule {
  return { id: 'r', enabled: true, conditions: [], action: { type } } as CombatRule;
}

describe('戰鬥動作閘門', () => {
  const MOVE: CombatActionType[] = ['keep_distance', 'close_in', 'disengage'];
  const SWITCH: CombatActionType[] = [
    'switch_target_lowest_hp', 'switch_target_highest_hp',
    'switch_target_farthest', 'switch_target_by_kind', 'switch_target_by_debuff',
  ];

  it('切換目標：場上有怪就可執行', () => {
    for (const type of SWITCH) {
      expect(evaluateCombatScript([rule(type)], ctx())?.type).toBe(type);
    }
  });

  it('切換目標：場上沒怪就跳過', () => {
    for (const type of SWITCH) {
      expect(evaluateCombatScript([rule(type)], ctx({ monsters: [] }))).toBeNull();
    }
  });

  it('走位與鎖定：有目標才可執行', () => {
    for (const type of [...MOVE, 'lock_target' as CombatActionType]) {
      expect(evaluateCombatScript([rule(type)], ctx())?.type).toBe(type);
      expect(evaluateCombatScript([rule(type)], ctx({ primaryTargetId: null }))).toBeNull();
    }
  });

  /* 沒被 blocked 的戰鬥實作鑲材，閘門一定要認得 */
  it('所有可用的戰鬥實作鑲材，閘門都認得', () => {
    const actions = TALENT_AFFIX_DEFS
      .filter(d => !d.blocked && d.kind === 'action' && d.appliesTo.includes('combat'));
    for (const def of actions) {
      const skills = [{ id: 'x', name: 'x', type: 'attack', mpCost: 0, cooldown: 0, lastUsedAt: 0 } as never];
      const action = { type: def.ruleId as CombatActionType, skillId: 'x' };
      const result = evaluateCombatScript(
        [{ id: 'r', enabled: true, conditions: [], action } as CombatRule],
        ctx({ skills }),
      );
      expect(result, `${def.ruleId} 閘門不認得`).not.toBeNull();
    }
  });
});
