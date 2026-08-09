import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, selectCombatRules, selectPersistentRules, selectActiveTemplate } from '../gameStore';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../../models/scriptTemplate';
import { DEFAULT_COMBAT_SCRIPT } from '../../models/scriptEngine';
import type { CombatRule } from '../../models/scriptEngine';

const ONLY_WAIT: CombatRule[] = [
  { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'wait' } },
];

describe('腳本 template：store 行為', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: null,
      scriptTemplates: [createDefaultTemplate()],
      activeTemplateId: DEFAULT_TEMPLATE_ID,
    });
  });

  it('編輯腳本寫進使用中的那一頁，不會外溢到其他頁', () => {
    useGameStore.getState().addScriptTemplate();
    const newId = useGameStore.getState().activeTemplateId;
    useGameStore.getState().setCombatRules(ONLY_WAIT);

    expect(selectCombatRules(useGameStore.getState())).toEqual(ONLY_WAIT);

    useGameStore.getState().setActiveTemplate(DEFAULT_TEMPLATE_ID);
    expect(selectCombatRules(useGameStore.getState())).toEqual(DEFAULT_COMBAT_SCRIPT);

    useGameStore.getState().setActiveTemplate(newId);
    expect(selectCombatRules(useGameStore.getState())).toEqual(ONLY_WAIT);
  });

  it('新增分頁會立刻切過去，名稱不重複', () => {
    useGameStore.getState().addScriptTemplate();
    useGameStore.getState().addScriptTemplate();
    const { scriptTemplates, activeTemplateId } = useGameStore.getState();

    expect(scriptTemplates).toHaveLength(3);
    expect(activeTemplateId).toBe(scriptTemplates[2].id);
    expect(new Set(scriptTemplates.map(t => t.name)).size).toBe(3);
  });

  it('複製分頁會帶走內容但拿到新 id', () => {
    useGameStore.getState().setCombatRules(ONLY_WAIT);
    useGameStore.getState().duplicateScriptTemplate(DEFAULT_TEMPLATE_ID);

    const copy = selectActiveTemplate(useGameStore.getState());
    expect(copy.id).not.toBe(DEFAULT_TEMPLATE_ID);
    expect(copy.combatRules).toEqual(ONLY_WAIT);
    // 來源沒有被動到
    useGameStore.getState().setActiveTemplate(DEFAULT_TEMPLATE_ID);
    expect(selectCombatRules(useGameStore.getState())).toEqual(ONLY_WAIT);
  });

  it('預設分頁不可刪除', () => {
    useGameStore.getState().removeScriptTemplate(DEFAULT_TEMPLATE_ID);
    expect(useGameStore.getState().scriptTemplates).toHaveLength(1);
    expect(useGameStore.getState().scriptTemplates[0].id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('刪掉使用中的分頁會退回第一頁', () => {
    useGameStore.getState().addScriptTemplate();
    const newId = useGameStore.getState().activeTemplateId;

    useGameStore.getState().removeScriptTemplate(newId);

    expect(useGameStore.getState().scriptTemplates).toHaveLength(1);
    expect(useGameStore.getState().activeTemplateId).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('更名會去頭尾空白，空字串不生效', () => {
    useGameStore.getState().renameScriptTemplate(DEFAULT_TEMPLATE_ID, '  清怪  ');
    expect(selectActiveTemplate(useGameStore.getState()).name).toBe('清怪');

    useGameStore.getState().renameScriptTemplate(DEFAULT_TEMPLATE_ID, '   ');
    expect(selectActiveTemplate(useGameStore.getState()).name).toBe('清怪');
  });

  it('切到不存在的 id 不動作（避免面板指向空白頁）', () => {
    useGameStore.getState().setActiveTemplate('ghost');
    expect(useGameStore.getState().activeTemplateId).toBe(DEFAULT_TEMPLATE_ID);
    expect(selectPersistentRules(useGameStore.getState())).toHaveLength(1);
  });
});
