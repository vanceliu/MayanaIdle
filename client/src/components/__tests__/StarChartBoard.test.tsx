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
