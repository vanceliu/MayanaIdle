/**
 * @vitest-environment jsdom
 *
 * 星盤加成合計（`56-star-chart.md` § 56.5）：冷卻依節點數表的技能顯示目前冷卻秒數。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { StarChartSummary } from '../StarChartPanel';

afterEach(cleanup);

const rendLine = (n: number) => ['boost0', 'level0', 'boost1', 'level1'].slice(0, n).map(k => `knight-magic1-${k}`);

describe('StarChartSummary 技能冷卻', () => {
  it('裂傷斬強化＋等級共 3 點顯示 11s', () => {
    render(<StarChartSummary classId="knight" allocated={new Set(['knight-start', ...rendLine(3)])} />);
    expect(screen.getByText(/裂傷斬 冷卻/).textContent).toBe('裂傷斬 冷卻 11s');
  });

  it('盾擊照百分比顯示', () => {
    render(<StarChartSummary classId="knight" allocated={new Set(['knight-start', 'knight-magic0-boost0'])} />);
    expect(screen.getByText(/盾擊 冷卻/).textContent).toBe('盾擊 冷卻 -10%');
  });
});
