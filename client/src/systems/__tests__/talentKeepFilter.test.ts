import { describe, it, expect } from 'vitest';
import { buildVillageRules } from '../talentRules';
import { getParamFields, sanitizeParams, visibleParamFields, KEEP_TEMPLATE_IDS } from '../../models/talentParams';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { TalentSlot } from '../../models/talent';

/** 補給天賦保留條件（`49-village-script.md` § 49.4）：「本角色穿得起的」兼總開關、三種多選 */

function supply(ruleId: string, params: Record<string, unknown> | null): TalentSlot {
  return {
    id: 1, characterId: 1, tier: 1, assignedType: 'supply', templateId: 'default',
    order: 0, enabled: true, conditions: [null], action: { ruleId, params },
  };
}

const keepOf = (ruleId: string, params: Record<string, unknown> | null) =>
  buildVillageRules([supply(ruleId, params)], 'default')[0].action.keep;

const TEMPLATE_ID = [...KEEP_TEMPLATE_IDS][0];
const STARTER_ID = EQUIPMENT_SEEDS.find(t => t.acquireType === 'starter')!.id!;

describe('保留條件組成 `keep`', () => {
  it('沒存過任何保留欄位：照預設開啟，本角色穿得起的＋詞綴 Tier 高於 5', () => {
    expect(keepOf('sell_equipment', { maxTier: 3 })).toEqual({
      classUsable: true, affixTierAbove: 5, affixTypes: undefined, equipTypes: undefined, templateIds: undefined,
    });
  });

  it('本角色穿得起的沒勾：沒有保留條件，其餘四種一併忽略', () => {
    expect(keepOf('dismantle_equipment', { maxTier: 4, keepClassUsable: false, keepAffixTypes: ['crit_rate'] })).toBeUndefined();
    expect(keepOf('deposit_equipment', { keepClassUsable: false })).toBeUndefined();
  });

  it('三種多選帶進 `keep`，平的 keepXxx 參數不留在動作上', () => {
    const action = buildVillageRules([supply('sell_equipment', {
      maxTier: 3, keepClassUsable: true, keepAffixTierAbove: 6,
      keepAffixTypes: ['crit_rate'], keepEquipTypes: ['bow'], keepTemplateIds: [TEMPLATE_ID],
    })], 'default')[0].action;
    expect(action.keep).toEqual({
      classUsable: true, affixTierAbove: 6, affixTypes: ['crit_rate'], equipTypes: ['bow'], templateIds: [TEMPLATE_ID],
    });
    expect(Object.keys(action).filter(k => k.startsWith('keep') && k !== 'keep')).toEqual([]);
  });
});

describe('多選參數驗證', () => {
  it('值域內、不重複的陣列才收', () => {
    expect(sanitizeParams('sell_equipment', { keepAffixTypes: ['crit_rate', 'defense'] }))
      .toEqual({ keepAffixTypes: ['crit_rate', 'defense'] });
    expect(sanitizeParams('sell_equipment', { keepEquipTypes: ['bow', 'armor'] })).toEqual({ keepEquipTypes: ['bow', 'armor'] });
    expect(sanitizeParams('sell_equipment', { keepTemplateIds: [TEMPLATE_ID] })).toEqual({ keepTemplateIds: [TEMPLATE_ID] });
  });

  it.each([
    ['不是陣列', { keepAffixTypes: 'crit_rate' }],
    ['不認得的詞綴', { keepAffixTypes: ['nope'] }],
    ['重複', { keepEquipTypes: ['bow', 'bow'] }],
    ['新手裝模板', { keepTemplateIds: [STARTER_ID] }],
    ['模板 id 給字串', { keepTemplateIds: [String(TEMPLATE_ID)] }],
  ])('%s：回 null', (_name, params) => {
    expect(sanitizeParams('sell_equipment', params)).toBeNull();
  });
});

describe('編輯器顯示', () => {
  const fields = getParamFields('sell_equipment');
  const keys = (params: Record<string, unknown>) => visibleParamFields(fields, params).map(f => f.key);

  it('預設（未存）視為勾選，四種條件都顯示', () => {
    expect(keys({})).toEqual([
      'maxTier', 'keepClassUsable', 'keepAffixTierAbove', 'keepAffixTypes', 'keepEquipTypes', 'keepTemplateIds',
    ]);
  });

  it('沒勾時只剩總開關', () => {
    expect(keys({ keepClassUsable: false })).toEqual(['maxTier', 'keepClassUsable']);
  });

  it('存入裝備的字樣為「存入」', () => {
    expect(getParamFields('deposit_equipment').find(f => f.key === 'keepClassUsable')!.label).toBe('存入本角色穿得起的');
    expect(fields.find(f => f.key === 'keepClassUsable')!.label).toBe('保留本角色穿得起的');
  });
});
