import { describe, it, expect } from 'vitest';
import { evaluatePersistentScript, type PersistentScriptContext } from '../scriptRunner';
import type { PersistentCondition, PersistentRule } from '../../models/scriptEngine';
import { TALENT_RULE_DEFS } from '../../db/seed/talentSeeds';
import { buildPersistentRules } from '../talentRules';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { TalentSlot } from '../../models/talent';

/** 隊友 HP 條件（`51-auto-talent.md` § 51.4.7）與施放治癒的可執行條件（§ 51.4.10） */

const groupHeal = instantiateFromTemplate('group-heal', -1_000_000)!;
const heal = instantiateFromTemplate('heal', -1_000_000)!;

function ctx(over: Partial<PersistentScriptContext> = {}): PersistentScriptContext {
  return {
    character: { hp: 100, mp: 500, level: 30 } as never,
    effectiveMaxHp: 100,
    effectiveMaxMp: 500,
    bagItems: [],
    skills: [groupHeal, heal],
    activeEffects: [],
    lastPotionUsedAt: 0,
    now: 100000,
    ...over,
  } as PersistentScriptContext;
}

function rule(conditions: PersistentCondition[], skillId = 'group-heal'): PersistentRule {
  return { id: 'r', enabled: true, conditions, action: { type: 'heal_skill', skillId } };
}

const partyBelow = (value: number, count?: number): PersistentCondition =>
  ({ type: 'party_hp_below', value, ...(count === undefined ? {} : { count }) });

describe('隊友 HP 條件', () => {
  it('只放常駐格，全職業可選', () => {
    const def = TALENT_RULE_DEFS.find(d => d.ruleId === 'party_hp_below');
    expect(def).toMatchObject({ kind: 'condition', appliesTo: ['persistent'], group: 'party' });
    expect(def?.blocked).toBeFalsy();
  });

  it('至少 N 位隊友低於 X% 才成立', () => {
    const teammates = { teammateHpPercents: [40, 60, 90] };
    expect(evaluatePersistentScript([rule([partyBelow(50, 1)])], ctx(teammates))?.type).toBe('heal_skill');
    expect(evaluatePersistentScript([rule([partyBelow(50, 2)])], ctx(teammates))).toBeNull();
    expect(evaluatePersistentScript([rule([partyBelow(70, 2)])], ctx(teammates))?.type).toBe('heal_skill');
  });

  it('未填人數視為 1；沒有隊友時不成立', () => {
    expect(evaluatePersistentScript([rule([partyBelow(50)])], ctx({ teammateHpPercents: [10] }))?.type).toBe('heal_skill');
    expect(evaluatePersistentScript([rule([partyBelow(50)])], ctx({ teammateHpPercents: [] }))).toBeNull();
    expect(evaluatePersistentScript([rule([partyBelow(50)])], ctx())).toBeNull();
  });

  it('天賦格參數照欄位寫進條件', () => {
    const slot: TalentSlot = {
      id: 1, characterId: 1, tier: 1, assignedType: 'persistent', templateId: 'default', order: 0, enabled: true,
      conditions: [{ ruleId: 'party_hp_below', params: { count: 2, value: 60 } }],
      action: { ruleId: 'heal_skill', params: { skillId: 'group-heal' } },
    };
    expect(buildPersistentRules([slot], 'default')[0].conditions).toEqual([{ type: 'party_hp_below', count: 2, value: 60 }]);
  });
});

describe('施放治癒的可執行條件', () => {
  it('全隊治癒：自己滿血但有隊友未滿血時可施放', () => {
    expect(evaluatePersistentScript([rule([])], ctx({ teammateHpPercents: [99] }))?.type).toBe('heal_skill');
    expect(evaluatePersistentScript([rule([])], ctx({ teammateHpPercents: [100] }))).toBeNull();
  });

  it('單體治癒：自己滿血時不施放，不看隊友', () => {
    expect(evaluatePersistentScript([rule([], 'heal')], ctx({ teammateHpPercents: [10] }))).toBeNull();
  });
});
