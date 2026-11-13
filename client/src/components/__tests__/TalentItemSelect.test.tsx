import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TalentItemSelect } from '../TalentItemSelect';
import { getItemId } from '../../models/items';

/**
 * @vitest-environment jsdom
 *
 * 天賦參數的道具選單（`51-auto-talent.md` § 51.4.10~§ 51.4.11）：類別可收合、可搜尋、單選。
 */
const openMenu = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const groupButton = (label: string) => screen.getByRole('button', { name: new RegExp(`^.?${label}\\s*\\d+$`) });

describe('TalentItemSelect', () => {
  afterEach(cleanup);

  it('打開時類別全部收合；點類別展開', () => {
    render(<TalentItemSelect label="道具" value={undefined} onWrite={() => {}} />);
    openMenu(/未選擇/);
    expect(groupButton('材料').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: '紅色藥水' })).toBeNull();
    fireEvent.click(groupButton('藥水'));
    expect(screen.getByRole('button', { name: '紅色藥水' })).toBeTruthy();
  });

  it('已選道具所在的類別自動展開', () => {
    render(<TalentItemSelect label="道具" value={getItemId('試煉飛龍之鱗')} onWrite={() => {}} />);
    openMenu(/試煉飛龍之鱗/);
    expect(groupButton('材料').getAttribute('aria-expanded')).toBe('true');
    expect(groupButton('藥水').getAttribute('aria-expanded')).toBe('false');
  });

  it('只有一個類別時直接展開', () => {
    render(<TalentItemSelect label="解除道具" pool="cure" value={undefined} onWrite={() => {}} />);
    openMenu(/未選擇/);
    expect(screen.getByRole('button', { name: '解毒藥水' })).toBeTruthy();
  });

  it('搜尋只列名稱含關鍵字的道具，並展開有結果的類別', () => {
    render(<TalentItemSelect label="道具" value={undefined} onWrite={() => {}} />);
    openMenu(/未選擇/);
    fireEvent.change(screen.getByPlaceholderText('搜尋名稱'), { target: { value: '鱗' } });
    expect(screen.getByRole('button', { name: '試煉飛龍之鱗' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^.?藥水/ })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('搜尋名稱'), { target: { value: '不存在的道具' } });
    expect(screen.getByText('沒有符合的道具')).toBeTruthy();
  });

  it('點道具選定並關閉；清除改回未選擇', () => {
    const onWrite = vi.fn();
    const { rerender } = render(<TalentItemSelect label="道具" pool="cure" value={undefined} onWrite={onWrite} />);
    openMenu(/未選擇/);
    fireEvent.click(screen.getByRole('button', { name: '止血繃帶' }));
    expect(onWrite).toHaveBeenLastCalledWith(getItemId('止血繃帶'));
    expect(screen.queryByPlaceholderText('搜尋名稱')).toBeNull();

    rerender(<TalentItemSelect label="道具" pool="cure" value={getItemId('止血繃帶')} onWrite={onWrite} />);
    openMenu(/止血繃帶/);
    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    expect(onWrite).toHaveBeenLastCalledWith(undefined);
  });
});
