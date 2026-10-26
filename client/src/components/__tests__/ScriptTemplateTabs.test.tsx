// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptEditorContent } from '../ScriptEditorPanel';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID, MAX_SCRIPT_TEMPLATES } from '../../models/scriptTemplate';

vi.mock('../CombatScriptEditor', () => ({ CombatScriptEditor: () => null }));
vi.mock('../PersistentScriptEditor', () => ({ PersistentScriptEditor: () => null }));

/** Template 分頁列（`03-combat.md` § 3.14） */
describe('腳本 template 分頁列', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: null,
      scriptTemplates: [createDefaultTemplate()],
      activeTemplateId: DEFAULT_TEMPLATE_ID,
    });
  });

  it('使用中的分頁帶 aria-selected，不能只靠顏色分辨', () => {
    render(<ScriptEditorContent />);
    expect(screen.getByRole('tab', { name: /預設/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('「＋」新增一個分頁並切過去', () => {
    render(<ScriptEditorContent />);
    fireEvent.click(screen.getByLabelText('新增分頁'));

    expect(useGameStore.getState().scriptTemplates).toHaveLength(2);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /配置 1/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('點分頁即切換使用中的 template', () => {
    render(<ScriptEditorContent />);
    fireEvent.click(screen.getByLabelText('新增分頁'));
    fireEvent.click(screen.getByRole('tab', { name: /預設/ }));

    expect(useGameStore.getState().activeTemplateId).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('預設分頁的刪除鈕是停用的', () => {
    render(<ScriptEditorContent />);
    expect((screen.getByLabelText('刪除分頁') as HTMLButtonElement).disabled).toBe(true);
  });

  it('切到自建分頁後刪除鈕可用，刪掉後退回預設', () => {
    render(<ScriptEditorContent />);
    fireEvent.click(screen.getByLabelText('新增分頁'));

    const removeBtn = screen.getByLabelText('刪除分頁') as HTMLButtonElement;
    expect(removeBtn.disabled).toBe(false);
    fireEvent.click(removeBtn);

    expect(useGameStore.getState().scriptTemplates).toHaveLength(1);
    expect(useGameStore.getState().activeTemplateId).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('更名：按 ✎ 後輸入新名稱，Enter 生效', () => {
    render(<ScriptEditorContent />);
    fireEvent.click(screen.getByLabelText('更名'));

    const input = screen.getByLabelText('分頁名稱');
    fireEvent.change(input, { target: { value: '清怪' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useGameStore.getState().scriptTemplates[0].name).toBe('清怪');
    expect(screen.getByRole('tab', { name: /清怪/ })).toBeDefined();
  });

  it('更名途中按 Esc 不套用', () => {
    render(<ScriptEditorContent />);
    fireEvent.click(screen.getByLabelText('更名'));

    const input = screen.getByLabelText('分頁名稱');
    fireEvent.change(input, { target: { value: '不要這個' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useGameStore.getState().scriptTemplates[0].name).toBe('預設');
  });

  it('複製分頁會多一頁並切過去', () => {
    render(<ScriptEditorContent />);
    fireEvent.click(screen.getByLabelText('複製分頁'));

    expect(useGameStore.getState().scriptTemplates).toHaveLength(2);
    expect(useGameStore.getState().activeTemplateId).not.toBe(DEFAULT_TEMPLATE_ID);
  });

  it(`最多 ${MAX_SCRIPT_TEMPLATES} 個分頁：滿了新增與複製都停用，也不會多出來`, () => {
    render(<ScriptEditorContent />);
    for (let i = 0; i < MAX_SCRIPT_TEMPLATES + 2; i++) fireEvent.click(screen.getByLabelText('新增分頁'));

    expect(useGameStore.getState().scriptTemplates).toHaveLength(MAX_SCRIPT_TEMPLATES);
    expect((screen.getByLabelText('新增分頁') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('複製分頁') as HTMLButtonElement).disabled).toBe(true);

    useGameStore.getState().duplicateScriptTemplate(DEFAULT_TEMPLATE_ID);
    useGameStore.getState().addScriptTemplate();
    expect(useGameStore.getState().scriptTemplates).toHaveLength(MAX_SCRIPT_TEMPLATES);
  });

  it('名稱超過 10 字或不是字串：不改名；輸入框限 10 字', () => {
    render(<ScriptEditorContent />);
    useGameStore.getState().renameScriptTemplate(DEFAULT_TEMPLATE_ID, '一二三四五六七八九十十');
    useGameStore.getState().renameScriptTemplate(DEFAULT_TEMPLATE_ID, 123 as never);
    useGameStore.getState().renameScriptTemplate(DEFAULT_TEMPLATE_ID, '   ');
    expect(useGameStore.getState().scriptTemplates[0].name).toBe('預設');

    useGameStore.getState().renameScriptTemplate(DEFAULT_TEMPLATE_ID, '  一二三四五六七八九十  ');
    expect(useGameStore.getState().scriptTemplates[0].name).toBe('一二三四五六七八九十');

    fireEvent.click(screen.getByLabelText('更名'));
    expect((screen.getByLabelText('分頁名稱') as HTMLInputElement).maxLength).toBe(10);
  });
});
