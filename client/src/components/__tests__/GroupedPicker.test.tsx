import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GroupedPicker, type PickerGroup } from '../GroupedPicker';
import { itemPickerGroups } from '../ItemPicker';
import { getItemById, getItemId } from '../../models/items';

/**
 * @vitest-environment jsdom
 *
 * 分組單選選單：自動天賦道具參數、拍賣場詞綴篩選與道具標價共用
 */
const GROUPS: PickerGroup<string>[] = [
  { key: 'atk', label: '攻擊類', options: [{ value: 'attack', label: '攻擊力' }, { value: 'crit_rate', label: '爆擊率' }] },
  { key: 'def', label: '防禦類', options: [{ value: 'defense', label: '防禦力' }] },
  { key: 'empty', label: '空組', options: [] },
];
const groupButton = (label: string) => screen.getByRole('button', { name: new RegExp(`^.?${label}\\s*\\d+$`) });

describe('GroupedPicker', () => {
  afterEach(cleanup);

  it('空的組不顯示；數量顯示在組標題', () => {
    render(<GroupedPicker groups={GROUPS} buttonText="＋ 詞綴" emptyText="沒有符合的詞綴" onPick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /＋ 詞綴/ }));
    expect(groupButton('攻擊類').textContent).toContain('2');
    expect(screen.queryByRole('button', { name: /空組/ })).toBeNull();
  });

  it('點組標題收合、展開', () => {
    render(<GroupedPicker groups={GROUPS} buttonText="＋ 詞綴" emptyText="沒有符合的詞綴" onPick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /＋ 詞綴/ }));
    fireEvent.click(groupButton('攻擊類'));
    expect(screen.getByRole('button', { name: '爆擊率' })).toBeTruthy();
    fireEvent.click(groupButton('攻擊類'));
    expect(screen.queryByRole('button', { name: '爆擊率' })).toBeNull();
  });

  it('沒有 onClear 時不顯示清除', () => {
    render(<GroupedPicker groups={GROUPS} value="attack" buttonText="攻擊力" emptyText="無" onPick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /攻擊力/ }));
    expect(screen.queryByRole('button', { name: '清除' })).toBeNull();
  });

  it('搜尋無結果顯示 emptyText；選定後關閉', () => {
    const onPick = vi.fn();
    render(<GroupedPicker groups={GROUPS} buttonText="＋ 詞綴" emptyText="沒有符合的詞綴" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /＋ 詞綴/ }));
    fireEvent.change(screen.getByPlaceholderText('搜尋名稱'), { target: { value: '不存在' } });
    expect(screen.getByText('沒有符合的詞綴')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('搜尋名稱'), { target: { value: '防禦' } });
    fireEvent.click(screen.getByRole('button', { name: '防禦力' }));
    expect(onPick).toHaveBeenLastCalledWith('defense');
    expect(screen.queryByPlaceholderText('搜尋名稱')).toBeNull();
  });
});

describe('itemPickerGroups', () => {
  it('依道具類別分組，順序為類別第一次出現的順序', () => {
    const items = ['試煉飛龍之鱗', '紅色藥水', '解毒藥水'].map(name => getItemById(getItemId(name)!)!);
    const groups = itemPickerGroups(items);
    expect(groups.map(g => g.label)).toEqual(['材料', '藥水']);
    expect(groups[1].options.map(o => o.label)).toEqual(['紅色藥水', '解毒藥水']);
  });
});
