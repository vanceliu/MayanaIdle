import { describe, it, expect } from 'vitest';
import { buildTalentView } from '../adminTalentView';
import type { TalentSlot } from '../../../client/src/models/talent';
import { DEFAULT_AFTER_COMBAT_THRESHOLDS } from '../../../client/src/models/scriptEngine';
import { ALL_TOWN_SCROLLS } from '../../../client/src/models/townScroll';

const slot = (over: Partial<TalentSlot>): TalentSlot => ({
  characterId: 1, tier: 1, assignedType: 'combat', templateId: 'default', order: 0, enabled: true, conditions: [null], action: null, ...over,
});
const retreat = { enabled: true, hpThreshold: 15, action: 'flee_town' as const };

describe('管理介面角色查詢的天賦配置（`97-selfhosted-server.md` § 97.8）', () => {
  it('沒有存過配置：只有使用中的「預設」，戰鬥後等待用預設門檻', () => {
    const view = buildTalentView([], {});
    expect(view.templates).toHaveLength(1);
    expect(view.templates[0]).toMatchObject({ name: '預設', active: true });
    expect(view.templates[0].types.map(t => t.type)).toEqual(['常駐', '戰鬥', '補給']);
    expect(view.afterCombat[0]).toBe(`HP ≤ ${DEFAULT_AFTER_COMBAT_THRESHOLDS.afterCombatHpThreshold}%、MP ≤ ${DEFAULT_AFTER_COMBAT_THRESHOLDS.afterCombatMpThreshold}% 時停下休息`);
  });

  it('天賦格依配置與類型分開、依順序排列；未安裝的另計', () => {
    const view = buildTalentView([
      slot({ order: 1, action: { ruleId: 'normal_attack', params: null } }),
      slot({ order: 0, action: { ruleId: 'skill', params: { skillId: 'shield-bash' } } }),
      slot({ templateId: 'boss', assignedType: 'persistent' }),
      slot({ assignedType: null, templateId: null, order: null }),
    ], {
      scriptTemplates: [{ id: 'default', name: '預設', emergencyRetreat: retreat }, { id: 'boss', name: '打王', emergencyRetreat: retreat }],
      activeTemplateId: 'boss',
    });
    const [main, boss] = view.templates;
    expect([main.active, boss.active]).toEqual([false, true]);
    expect(main.types[1].slots.map(s => s.action?.name)).toEqual(['施放攻擊技能', '普通攻擊']);
    expect(main.types[1].slots[0].action?.params).toEqual(['盾擊']);
    expect(main.types[0].slots).toEqual([]);
    expect(boss.types[0].slots).toHaveLength(1);
    expect(view.uninstalled).toBe(1);
  });

  it('參數：單一參數只列值，多個參數加欄位名稱，未選與預設值照遊戲', () => {
    const [entry] = buildTalentView([slot({
      tier: 2,
      conditions: [
        { ruleId: 'hp_below', params: { value: 30 } },
        { ruleId: 'hp_dropped_recently', params: { value: 40 } },
      ],
      action: { ruleId: 'skill', params: null },
    })], {}).templates[0].types[1].slots;
    expect(entry.conditions).toEqual([
      { name: 'HP 低於', params: ['30%'] },
      { name: expect.any(String), params: ['下降超過 40%', '在 3秒內'] },
    ]);
    expect(entry.action).toEqual({ name: '施放攻擊技能', params: ['未選擇'] });
  });

  it('緊急撤退：關閉、任意卷軸、指定城鎮', () => {
    const town = ALL_TOWN_SCROLLS[0];
    const [off, any, picked] = buildTalentView([], {
      scriptTemplates: [
        { id: 'a', name: 'A', emergencyRetreat: { ...retreat, enabled: false } },
        { id: 'b', name: 'B', emergencyRetreat: retreat },
        { id: 'c', name: 'C', emergencyRetreat: { ...retreat, hpThreshold: 40, scrollTownId: town.townId } },
      ],
    }).templates;
    expect(off.retreat).toBe('關閉');
    expect(any.retreat).toBe('HP 低於 15% → 回城（任意卷軸）');
    expect(picked.retreat).toBe(`HP 低於 40% → 回城（${town.townName}）`);
  });
});
