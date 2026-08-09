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
import { DEFAULT_COMBAT_SCRIPT, DEFAULT_PERSISTENT_SCRIPT } from '../scriptEngine';

describe('腳本 Template', () => {
  it('預設 template 不可刪，其餘可刪', () => {
    expect(isDeletableTemplate(DEFAULT_TEMPLATE_ID)).toBe(false);
    expect(isDeletableTemplate('tpl-123')).toBe(true);
  });

  it('新分頁用預設腳本開場，不是空白（空腳本＝角色完全不出手）', () => {
    const created = createScriptTemplate('tpl-1', '清怪');
    expect(created.combatRules).toEqual(DEFAULT_COMBAT_SCRIPT);
    expect(created.persistentRules).toEqual(DEFAULT_PERSISTENT_SCRIPT);
  });

  it('新分頁名稱會避開已用過的', () => {
    expect(nextTemplateName([])).toBe('腳本 1');
    expect(nextTemplateName([
      { ...createDefaultTemplate(), name: '腳本 1' },
      { ...createDefaultTemplate(), id: 'a', name: '腳本 2' },
    ])).toBe('腳本 3');
  });

  describe('normalizeScriptTemplates', () => {
    it('空值／空陣列回到只有預設一頁', () => {
      expect(normalizeScriptTemplates(undefined)).toEqual([createDefaultTemplate()]);
      expect(normalizeScriptTemplates([])).toEqual([createDefaultTemplate()]);
    });

    it('缺 id 或 name 的壞資料整份回預設', () => {
      expect(normalizeScriptTemplates([{ name: '沒有 id' }])).toEqual([createDefaultTemplate()]);
    });

    it('template 內的舊格式規則走 scriptEngine 的重置防線', () => {
      const result = normalizeScriptTemplates([
        {
          id: DEFAULT_TEMPLATE_ID,
          name: '預設',
          combatRules: [{ id: 'old', enabled: true, condition: { type: 'always' }, action: { type: 'wait' } }],
          persistentRules: [],
        },
      ]);
      expect(result[0].combatRules).toEqual(DEFAULT_COMBAT_SCRIPT);
    });

    it('預設 template 不在名單裡時補回來（它不可刪，必須永遠在場）', () => {
      const result = normalizeScriptTemplates([
        { id: 'tpl-1', name: '打王', combatRules: [], persistentRules: [] },
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
