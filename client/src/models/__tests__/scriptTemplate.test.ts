import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEMPLATE_ID,
  createDefaultTemplate,
  createScriptTemplate,
  isDeletableTemplate,
  nextTemplateName,
  normalizeScriptTemplates,
  resolveActiveTemplate,
} from '../scriptTemplate';
import { DEFAULT_EMERGENCY_RETREAT } from '../scriptEngine';

describe('腳本 Template', () => {
  it('預設 template 不可刪，其餘可刪', () => {
    expect(isDeletableTemplate(DEFAULT_TEMPLATE_ID)).toBe(false);
    expect(isDeletableTemplate('tpl-123')).toBe(true);
  });

  it('新分頁只帶 id、名稱與緊急撤退，規則本體在天賦格', () => {
    const created = createScriptTemplate('tpl-1', '清怪');
    expect(created).toEqual({ id: 'tpl-1', name: '清怪', emergencyRetreat: DEFAULT_EMERGENCY_RETREAT });
  });

  it('新分頁名稱會避開已用過的', () => {
    expect(nextTemplateName([])).toBe('配置 1');
    expect(nextTemplateName([
      { ...createDefaultTemplate(), name: '配置 1' },
      { ...createDefaultTemplate(), id: 'a', name: '配置 2' },
    ])).toBe('配置 3');
  });

  describe('normalizeScriptTemplates', () => {
    it('空值／空陣列回到只有預設一頁', () => {
      expect(normalizeScriptTemplates(undefined)).toEqual([createDefaultTemplate()]);
      expect(normalizeScriptTemplates([])).toEqual([createDefaultTemplate()]);
    });

    it('缺 id 或 name 的壞資料整份回預設', () => {
      expect(normalizeScriptTemplates([{ name: '沒有 id' }])).toEqual([createDefaultTemplate()]);
    });

    it('舊存檔殘留的三個規則陣列被丟掉，不寫回', () => {
      const result = normalizeScriptTemplates([
        {
          id: DEFAULT_TEMPLATE_ID,
          name: '預設',
          combatRules: [{ id: 'old', enabled: true, condition: { type: 'always' }, action: { type: 'wait' } }],
          persistentRules: [],
          villageRules: [],
        },
      ]);
      expect(result[0]).toEqual(createDefaultTemplate());
      expect(result[0]).not.toHaveProperty('combatRules');
    });

    it('預設 template 不在名單裡時補回來（它不可刪，必須永遠在場）', () => {
      const result = normalizeScriptTemplates([
        { id: 'tpl-1', name: '打王' },
      ]);
      expect(result[0].id).toBe(DEFAULT_TEMPLATE_ID);
      expect(result).toHaveLength(2);
    });
  });

  it('resolveActiveTemplate 指向不存在的 id 時退回第一頁', () => {
    const templates = [createDefaultTemplate(), createScriptTemplate('tpl-1', '打王')];
    expect(resolveActiveTemplate(templates, 'tpl-1').name).toBe('打王');
    expect(resolveActiveTemplate(templates, 'ghost').id).toBe(DEFAULT_TEMPLATE_ID);
  });
});
