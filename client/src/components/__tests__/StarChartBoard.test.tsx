/**
 * @vitest-environment jsdom
 *
 * 星盤盤面（`56-star-chart.md`）：滑鼠移到節點顯示 tooltip，移開即收起。
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { StarChartBoard } from '../StarChartBoard';

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function renderBoard() {
  return render(
    <StarChartBoard classId="knight" allocated={new Set(['knight-start'])} remaining={10} costPerPoint={1000} onActivate={() => {}} />,
  );
}

describe('StarChartBoard 篩選', () => {
  it('輸入 hp：最大 HP 節點與帶 HP 的命星高亮，其餘（含命星）變暗；清空恢復', () => {
    const { container, getByLabelText } = renderBoard();
    const input = getByLabelText('篩選星點');
    fireEvent.change(input, { target: { value: 'hp' } });
    const node = (id: string) => container.querySelector(`.star-node[data-id="${id}"]`)!;
    expect(node('knight-r300').classList.contains('is-match')).toBe(true);
    expect(node('center-240-k').classList.contains('is-match')).toBe(true);
    expect(node('knight-r360').classList.contains('is-dimmed')).toBe(true);
    expect(node('knight-keystone').classList.contains('is-dimmed')).toBe(true);
    expect(node('knight-r300').querySelector('.star-node-match')).not.toBeNull();
    expect(container.querySelector('.star-board.is-filtering')).not.toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    expect(container.querySelector('.is-dimmed, .is-match')).toBeNull();
  });
});

describe('StarChartBoard tooltip', () => {
  it('滑鼠移到節點顯示，移開收起', () => {
    const { container } = renderBoard();
    const node = container.querySelector('.star-node[data-id="knight-r360"]')!;
    fireEvent.pointerEnter(node, { pointerType: 'mouse' });
    expect(container.querySelector('.star-tooltip')?.textContent).toContain('力量');
    fireEvent.pointerLeave(node, { pointerType: 'mouse' });
    expect(container.querySelector('.star-tooltip')).toBeNull();
  });
});
