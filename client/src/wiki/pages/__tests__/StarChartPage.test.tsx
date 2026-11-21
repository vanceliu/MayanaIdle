/**
 * @vitest-environment jsdom
 *
 * Wiki 星盤頁（`43-wiki-system.md`）：數值取自 model 常數；配點模擬可點。
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StarChartPage } from '../StarChartPage';
import { STAR_NODES, starPoints } from '../../../models/starChart';

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const renderPage = () => render(<MemoryRouter><StarChartPage /></MemoryRouter>);

describe('StarChartPage', () => {
  it('列出全部命星與點數規則', () => {
    renderPage();
    for (const k of STAR_NODES.filter(n => n.kind === 'keystone')) expect(screen.getByRole('cell', { name: k.name })).toBeTruthy();
    expect(screen.getByText(new RegExp(`Lv\\.100 為 ${starPoints(100)} 點`))).toBeTruthy();
  });

  it('配點模擬：點節點沿路徑點上', () => {
    const { container } = renderPage();
    fireEvent.click(container.querySelector('.star-node[data-id="knight-r300"]')!);
    // 點下的節點仍在 hover 中，顯示為「點一下會取消」的 is-removing
    expect(container.querySelectorAll('.star-node.is-allocated, .star-node.is-removing')).toHaveLength(3);
    expect(container.querySelector('.star-planner-bar')?.textContent).toContain('星點 3 / 46');
  });

  it('星點數值表列出體質、精神轉最大 HP／MP、冷卻縮減與職業起點屬性', () => {
    renderPage();
    expect(screen.getByRole('cell', { name: /其餘每 1 點改為最大 HP／最大 MP \+20/ })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '+1%（與詞綴、buff、智力合計上限 50%）' })).toBeTruthy();
    expect(screen.getByText(/騎士 力量 \+2、體質 \+2/)).toBeTruthy();
  });
});
