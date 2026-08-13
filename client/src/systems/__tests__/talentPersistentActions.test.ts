import { describe, it, expect } from 'vitest';
import { evaluatePersistentScript, type PersistentScriptContext } from '../scriptRunner';
import type { PersistentRule } from '../../models/scriptEngine';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';
import { getParamFields } from '../../models/talentParams';
import { TOWN_SCROLL_CONFIG } from '../../models/townScroll';
import { buildPersistentRules } from '../talentRules';
import type { TalentAffixInstance, TalentSlot } from '../../models/talent';

/**
 * 常駐 T3 實作鑲材（`51-auto-talent.md` § 51.4.10）：
 * 使用回城卷軸、使用指定消耗品、補至指定百分比、依序補滿多個 buff。
 */

const CHAR = 1;
const TPL = 'default';

function ctx(over: Partial<PersistentScriptContext> = {}): PersistentScriptContext {
  return {
    character: { hp: 50, maxHp: 100, mp: 50, maxMp: 100, level: 10 } as never,
    effectiveMaxHp: 100,
    effectiveMaxMp: 100,
    bagItems: [],
    skills: [],
    activeEffects: [],
    lastPotionUsedAt: 0,
    now: 100000,
    ...over,
  } as PersistentScriptContext;
}

function rule(action: PersistentRule['action']): PersistentRule {
  return { id: 'r', enabled: true, conditions: [], action };
}

function slot(id: number): TalentSlot {
  return { id, characterId: CHAR, tier: 1, assignedType: 'persistent', templateId: TPL, order: 0, enabled: true };
}

function affix(id: number, definitionId: number, params: Record<string, unknown> | null): TalentAffixInstance {
  return { id, characterId: CHAR, definitionId, boundParam: null, params, slotId: 1, slotIndex: null };
}

describe('常駐 T3 實作鑲材（§ 51.4.10）', () => {
  const RULE_IDS = ['use_town_scroll', 'use_consumable', 'refill_to_percent', 'refill_all_buffs'];

  it('四個都已接上判定引擎，不再是 blocked', () => {
    const defs = TALENT_AFFIX_DEFS.filter(d => RULE_IDS.includes(d.ruleId));
    expect(defs).toHaveLength(4);
    expect(defs.every(d => !d.blocked)).toBe(true);
  });

  it('回城卷軸：背包有卷軸才成立', () => {
    const scroll = { itemId: TOWN_SCROLL_CONFIG['neutral-town'].itemId, amount: 1 } as never;
    expect(evaluatePersistentScript([rule({ type: 'use_town_scroll' })], ctx())).toBeNull();
    expect(evaluatePersistentScript([rule({ type: 'use_town_scroll' })], ctx({ bagItems: [scroll] }))?.type)
      .toBe('use_town_scroll');
  });

  it('使用指定消耗品：背包有那個道具才成立', () => {
    const action = { type: 'use_consumable', itemId: 1 } as const;
    expect(evaluatePersistentScript([rule(action)], ctx())).toBeNull();
    expect(evaluatePersistentScript([rule(action)], ctx({ bagItems: [{ itemId: 1, amount: 3 } as never] }))?.type)
      .toBe('use_consumable');
  });

  /* 到標了就不再成立，所以「連續使用」會自己停下來 */
  it('補至指定百分比：已達標就不成立', () => {
    const action = { type: 'refill_to_percent', potionType: 'red', value: 80 } as const;
    const bag = [{ itemId: 1, amount: 5 } as never];
    expect(evaluatePersistentScript([rule(action)], ctx({ bagItems: bag }))?.type).toBe('refill_to_percent');
    expect(evaluatePersistentScript([rule(action)], ctx({
      bagItems: bag,
      character: { hp: 90, maxHp: 100, mp: 50, maxMp: 100, level: 10 } as never,
    }))).toBeNull();
  });

  it('補至指定百分比：沒藥水就不成立', () => {
    const action = { type: 'refill_to_percent', potionType: 'red', value: 80 } as const;
    expect(evaluatePersistentScript([rule(action)], ctx())).toBeNull();
  });

  it('依序補滿多個 buff：學過的技能放得出來才成立', () => {
    const skill = { id: 'bless', name: '祝福', type: 'buff', mpCost: 0, cooldown: 0, lastUsedAt: 0, buffCategory: 'bless' } as never;
    const action = { type: 'refill_all_buffs', skillId: 'bless' } as const;
    expect(evaluatePersistentScript([rule(action)], ctx())).toBeNull();
    expect(evaluatePersistentScript([rule(action)], ctx({ skills: [skill] }))?.type).toBe('refill_all_buffs');
  });

  it('使用回城卷軸不需要參數', () => {
    expect(getParamFields('use_town_scroll')).toHaveLength(0);
  });

  /* 只選一個 buff 也要能用，第 2、3 個是選填（§ 51.3.1） */
  it('依序補滿多個 buff 只填第一個也進判定', () => {
    const rules = buildPersistentRules(
      [slot(1)],
      [affix(10, defIdOf('refill_all_buffs'), { skillId: 'bless' })],
      TPL,
    );
    expect(rules).toHaveLength(1);
  });

  it('依序補滿多個 buff 完全沒填就跳過', () => {
    const rules = buildPersistentRules(
      [slot(1)],
      [affix(10, defIdOf('refill_all_buffs'), {})],
      TPL,
    );
    expect(rules).toEqual([]);
  });

  it('補至指定百分比帶藥水種類與目標百分比', () => {
    const keys = getParamFields('refill_to_percent').map(f => f.key);
    expect(keys).toEqual(['potionType', 'value']);
  });
});

function defIdOf(ruleId: string): number {
  return TALENT_AFFIX_DEFS.find(d => d.ruleId === ruleId)!.id;
}
