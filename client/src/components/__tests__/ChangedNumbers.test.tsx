// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChangedNumbers } from '../ChangedNumbers';

const highlighted = (base: string, value: string) => {
  const { container } = render(<ChangedNumbers base={base} value={value} />);
  return { text: container.textContent, marked: Array.from(container.querySelectorAll('.stat-changed')).map(e => e.textContent) };
};

describe('ChangedNumbers（`07-affix-ability.md` § 7S.7）', () => {
  it('只標出改變的數字', () => {
    expect(highlighted('減速 (無法行動, 5s)', '減速 (無法行動, 7s)')).toEqual({ text: '減速 (無法行動, 7s)', marked: ['7'] });
    expect(highlighted('半徑 6 格 / 最多 6 隻', '半徑 6 格 / 最多 8 隻')).toEqual({ text: '半徑 6 格 / 最多 8 隻', marked: ['8'] });
    expect(highlighted('8.5s', '8.5s').marked).toEqual([]);
  });

  it('文字結構不同時，原本沒有的數值才標色', () => {
    expect(highlighted('', '暈眩 (無法行動, 1.5s)').marked).toEqual(['1.5']);
    expect(highlighted('依已損失血量提升攻擊力，最高 +50%', '攻擊力 +20%').marked).toEqual(['20']);
    expect(highlighted('受到傷害的 30% 改由 MP 承擔', '受到傷害的 30% 改由 MP 承擔，減傷 10%').marked).toEqual(['10']);
  });
});
