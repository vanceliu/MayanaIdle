import { describe, it, expect } from 'vitest';
import { evaluateCombatScript, type CombatScriptContext } from '../scriptRunner';
import type { CombatRule, CombatActionType } from '../../models/scriptEngine';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';
import { CLASS_SKILLS } from '../../models/classSkills';

/** 職業魔法閘門會驗 id 是否真的在 `CLASS_SKILLS` 裡，所以測試不能用假 id */
const CLASS_ATTACK_ID = CLASS_SKILLS.find(c => c.skill.type === 'attack')!.id;

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
      const skillId = def.ruleId === 'skill_class_only' ? CLASS_ATTACK_ID : 'x';
      const skills = [{ id: skillId, name: 'x', type: 'attack', mpCost: 0, cooldown: 0, lastUsedAt: 0 } as never];
      const action = { type: def.ruleId as CombatActionType, skillId };
      const result = evaluateCombatScript(
        [{ id: 'r', enabled: true, conditions: [], action } as CombatRule],
        ctx({ skills }),
      );
      expect(result, `${def.ruleId} 閘門不認得`).not.toBeNull();
    }
  });

  /*
   * `skill_class_only` 只是可選範圍窄一階，執行路徑必須與一般技能相同 ——
   * 走到普通攻擊那條的話，傷害用武器白值、日誌印「攻擊」而不是技能名。
   */
  it('職業魔法與一般技能走同一條路徑', () => {
    for (const type of ['skill', 'skill_class_only'] as CombatActionType[]) {
      const skillId = type === 'skill_class_only' ? CLASS_ATTACK_ID : 'x';
      const skill = {
        id: skillId, name: '火球', type: 'attack', mpCost: 0, cooldown: 0, lastUsedAt: 0,
        range: 12, target: 'single',
      } as never;
      const action = { type, skillId };
      const result = evaluateCombatScript(
        [{ id: 'r', enabled: true, conditions: [], action } as CombatRule],
        ctx({ skills: [skill] }),
      );
      expect(result?.type).toBe(type);
      expect((result as { skillId?: string }).skillId).toBe(skillId);
    }
  });

  /* 職業魔法鑲材只吃職業魔法（§ 51.4.9 T3），基礎魔法必須被擋下 */
  it('職業魔法鑲材放基礎魔法不成立', () => {
    const skill = {
      id: 'wind-blade', name: '風刃', type: 'attack', mpCost: 0, cooldown: 0, lastUsedAt: 0,
      range: 10, target: 'single',
    } as never;
    const action = { type: 'skill_class_only' as CombatActionType, skillId: 'wind-blade' };
    expect(evaluateCombatScript(
      [{ id: 'r', enabled: true, conditions: [], action } as CombatRule],
      ctx({ skills: [skill] }),
    )).toBeNull();
  });
});