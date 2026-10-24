import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatencyIndicator, latencyLevel } from '../LatencyIndicator';
import { GameToolbar } from '../GameToolbar';
import { useOnlineStore } from '../../net/online';

/**
 * @vitest-environment jsdom
 */

/** 工具列的連線延遲（`47-mobile.md` § 47.6） */
describe('連線延遲顯示', () => {
  beforeEach(() => {
    useOnlineStore.setState({ enabled: true, latencyMs: null });
  });

  it('分級：低於 100 綠、100～300 黃、超過 300 紅', () => {
    expect(latencyLevel(0)).toBe('good');
    expect(latencyLevel(99)).toBe('good');
    expect(latencyLevel(100)).toBe('fair');
    expect(latencyLevel(300)).toBe('fair');
    expect(latencyLevel(301)).toBe('poor');
  });

  it('顯示毫秒數並套用分級', () => {
    useOnlineStore.setState({ latencyMs: 180 });
    render(<LatencyIndicator />);

    const el = screen.getByTitle('連線延遲');
    expect(el.textContent).toBe('180 ms');
    expect(el.classList.contains('is-fair')).toBe(true);
  });

  it('尚未量到時顯示 -- ms', () => {
    render(<LatencyIndicator />);

    expect(screen.getByTitle('連線延遲：尚未量測').textContent).toBe('-- ms');
  });

  it('單機版不顯示', () => {
    useOnlineStore.setState({ enabled: false, latencyMs: 42 });
    const { container } = render(<LatencyIndicator />);

    expect(container.textContent).toBe('');
  });

  it('排在 ⚙ 左邊', () => {
    useOnlineStore.setState({ latencyMs: 42 });
    render(<GameToolbar />);

    const indicator = screen.getByTitle('連線延遲');
    const settings = screen.getByRole('button', { name: '系統設定' });
    expect(indicator.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
