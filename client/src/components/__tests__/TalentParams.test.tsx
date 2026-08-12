// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getParamFields, defaultParams } from '../../models/talentParams';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';

/**
 * 參數 schema（`51-auto-talent.md` § 51.4.1）。
 *
 * 這批測試守的是「規則不會變成 HP 低於 ??」——
 * 有門檻語意的鑲材一定要有欄位，鑲入時一定要有預設值。
 */

/** 名稱裡帶比較詞的，判定一定要吃參數，不能沒有欄位 */
const NEEDS_PARAM = /_below$|_above$|_gte$|_lte$|_over$|_diff$|_distance$|_recently$/;

describe('參數 schema', () => {
  it('所有帶門檻語意的條件都有可填欄位', () => {
    const missing = TALENT_AFFIX_DEFS
      .filter(d => d.kind === 'condition' && NEEDS_PARAM.test(d.ruleId))
      .filter(d => getParamFields(d.ruleId).length === 0)
      .map(d => d.ruleId);
    expect(missing).toEqual([]);
  });

  it('需要指定對象的動作都有可填欄位', () => {
    // 施放技能要選招、喝藥要選顏色、買東西要選道具
    for (const ruleId of ['skill', 'potion', 'heal_skill', 'buff_skill', 'buy_item', 'cure_item']) {
      expect(getParamFields(ruleId).length, ruleId).toBeGreaterThan(0);
    }
  });

  it('沒有參數的鑲材回空陣列，不會硬塞欄位', () => {
    for (const ruleId of ['normal_attack', 'wait', 'return_town', 'use_inn', 'lock_target']) {
      expect(getParamFields(ruleId), ruleId).toEqual([]);
    }
  });

  it('數字與下拉欄位都有預設值 —— 鑲入即可用，不必逐格填', () => {
    for (const [ruleId, fields] of Object.entries({
      hp_below: getParamFields('hp_below'),
      potion: getParamFields('potion'),
      target_distance: getParamFields('target_distance'),
    })) {
      const seeded = defaultParams(ruleId)!;
      for (const f of fields) {
        if (f.kind === 'number' || f.kind === 'select') {
          expect(seeded[f.key], `${ruleId}.${f.key}`).toBeDefined();
        }
      }
    }
  });

  it('技能與道具欄位不給預設 —— 那要看角色學了什麼、背包有什麼', () => {
    // 硬給一個 id 會在別的職業變成指向沒學會的技能
    expect(defaultParams('skill')).toEqual({});
    expect(defaultParams('buy_item')).toEqual({ targetAmount: 100 });
  });

  it('預設值落在 min/max 之內', () => {
    for (const [ruleId, fields] of Object.entries(
      Object.fromEntries(TALENT_AFFIX_DEFS.map(d => [d.ruleId, getParamFields(d.ruleId)])),
    )) {
      for (const f of fields) {
        if (f.kind !== 'number') continue;
        if (f.min != null) expect(f.def, `${ruleId}.${f.key}`).toBeGreaterThanOrEqual(f.min);
        if (f.max != null) expect(f.def, `${ruleId}.${f.key}`).toBeLessThanOrEqual(f.max);
      }
    }
  });

  it('下拉的預設值一定在選項裡', () => {
    for (const d of TALENT_AFFIX_DEFS) {
      for (const f of getParamFields(d.ruleId)) {
        if (f.kind !== 'select') continue;
        expect(f.options.map(o => o.value), `${d.ruleId}.${f.key}`).toContain(f.def);
      }
    }
  });
});

describe('可選範圍軸的三種型態（§ 51.4.1）', () => {
  const bySkill = TALENT_AFFIX_DEFS.filter(d => d.ruleId === 'skill');

  it('施放攻擊技能的階梯：T1 指定、T2 池、T4 自選', () => {
    expect(bySkill.find(d => d.tier === 1)?.form).toBe('fixed');
    expect(bySkill.find(d => d.tier === 2)?.form).toBe('pool');
    expect(bySkill.find(d => d.tier === 4)?.form).toBe('free');
  });

  it('三階都吃同一組參數欄位 —— 差別在能選的範圍，不在參數形狀', () => {
    // 判定拿到的都是 `{ type: 'skill', skillId }`，只是誰能改、能改成什麼不同
    for (const d of bySkill) {
      expect(getParamFields(d.ruleId).some(f => f.kind === 'skill'), `T${d.tier}`).toBe(true);
    }
  });
});
