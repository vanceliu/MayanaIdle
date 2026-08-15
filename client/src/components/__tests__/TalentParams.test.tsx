// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getParamFields, defaultParams } from '../../models/talentParams';
import { TALENT_RULE_DEFS } from '../../db/seed/talentSeeds';

/**
 * 參數 schema（`51-auto-talent.md` § 51.4.1）。
 *
 * 這批測試守的是「規則不會變成 HP 低於 ??」——
 * 有門檻語意的條件一定要有欄位，放進槽位時一定要有預設值。
 */

/** 名稱裡帶比較詞的，判定一定要吃參數，不能沒有欄位 */
const NEEDS_PARAM = /_below$|_above$|_gte$|_lte$|_over$|_diff$|_distance$|_recently$/;

describe('參數 schema', () => {
  it('所有帶門檻語意的條件都有可填欄位', () => {
    const missing = TALENT_RULE_DEFS
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

  it('沒有參數的項目回空陣列，不會硬塞欄位', () => {
    for (const ruleId of ['normal_attack', 'wait', 'return_town', 'use_inn', 'lock_target']) {
      expect(getParamFields(ruleId), ruleId).toEqual([]);
    }
  });

  it('數字與下拉欄位都有預設值 —— 選了即可用，不必逐格填', () => {
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
      Object.fromEntries(TALENT_RULE_DEFS.map(d => [d.ruleId, getParamFields(d.ruleId)])),
    )) {
      for (const f of fields) {
        if (f.kind !== 'number' || f.def === null) continue;
        if (f.min != null) expect(f.def, `${ruleId}.${f.key}`).toBeGreaterThanOrEqual(f.min);
        if (f.max != null) expect(f.def, `${ruleId}.${f.key}`).toBeLessThanOrEqual(f.max);
      }
    }
  });

  it('下拉的預設值一定在選項裡', () => {
    for (const d of TALENT_RULE_DEFS) {
      for (const f of getParamFields(d.ruleId)) {
        if (f.kind !== 'select') continue;
        expect(f.options.map(o => o.value), `${d.ruleId}.${f.key}`).toContain(f.def);
      }
    }
  });
});

describe('一律內建、一律完整版（§ 51.4.1）', () => {
  it('施放攻擊技能只有一筆定義，沒有階梯', () => {
    expect(TALENT_RULE_DEFS.filter(d => d.ruleId === 'skill')).toHaveLength(1);
  });

  it('原本分階的動作都塌成一筆', () => {
    for (const ruleId of ['skill', 'buff_skill', 'buy_item', 'withdraw_item',
      'sell_materials', 'sell_equipment']) {
      expect(TALENT_RULE_DEFS.filter(d => d.ruleId === ruleId), ruleId).toHaveLength(1);
    }
  });

  /* 限縮版刪掉之後，完整版必須真的帶著完整參數（§ 51.4.1 既有能力不可流失） */
  it('販售素材與販售裝備留的是完整版，不是僅門檻版', () => {
    expect(getParamFields('sell_materials').map(f => f.key)).toContain('skipCraftMaterials');
    expect(getParamFields('sell_equipment').length).toBeGreaterThan(1);
  });
});
