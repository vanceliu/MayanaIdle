// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CombatLogPanel } from '../CombatLogPanel';
import { useGameStore } from '../../stores/gameStore';

const LINE_HEIGHT = 20;
const VIEWPORT_HEIGHT = 100;

/** jsdom 不做排版，手動讓 scrollHeight/clientHeight 反映目前行數 */
function stubLayout(el: HTMLElement) {
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT_HEIGHT,
  });
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => el.children.length * LINE_HEIGHT,
  });
}

function setLogs(count: number) {
  act(() => {
    useGameStore.setState({
      combatLogs: Array.from({ length: count }, (_, i) => ({
        text: `log ${i}`,
        type: 'system' as const,
      })),
    });
  });
}

function maxScrollTop(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight;
}

describe('CombatLogPanel 自動捲動', () => {
  beforeEach(() => {
    useGameStore.setState({ combatLogs: [] });
  });

  it('拉桿在底部時，新 log 會跟著捲到最新一筆', () => {
    setLogs(10);
    const { container } = render(<CombatLogPanel className="town-log" />);
    const el = container.querySelector('.combat-log') as HTMLElement;
    stubLayout(el);

    setLogs(20);
    expect(el.scrollTop).toBe(el.scrollHeight);

    setLogs(30);
    expect(el.scrollTop).toBe(el.scrollHeight);
  });

  it('拉桿被手動拉離底部後，新 log 不會搶位置', () => {
    setLogs(20);
    const { container } = render(<CombatLogPanel />);
    const el = container.querySelector('.combat-log') as HTMLElement;
    stubLayout(el);

    // 使用者往上捲
    el.scrollTop = 50;
    fireEvent.scroll(el);

    setLogs(40);
    expect(el.scrollTop).toBe(50);

    setLogs(60);
    expect(el.scrollTop).toBe(50);
  });

  it('手動拉回底部後恢復自動跟隨', () => {
    setLogs(20);
    const { container } = render(<CombatLogPanel />);
    const el = container.querySelector('.combat-log') as HTMLElement;
    stubLayout(el);

    el.scrollTop = 50;
    fireEvent.scroll(el);
    setLogs(40);
    expect(el.scrollTop).toBe(50);

    // 拉回底部
    el.scrollTop = maxScrollTop(el);
    fireEvent.scroll(el);

    setLogs(60);
    expect(el.scrollTop).toBe(el.scrollHeight);
  });

  it('log 達筆數上限、length 不再變動時仍會跟隨最新內容', () => {
    setLogs(200);
    const { container } = render(<CombatLogPanel />);
    const el = container.querySelector('.combat-log') as HTMLElement;
    stubLayout(el);
    el.scrollTop = maxScrollTop(el);
    fireEvent.scroll(el);

    // 模擬滿載後的滾動更新：筆數不變，內容換新
    act(() => {
      useGameStore.setState({
        combatLogs: Array.from({ length: 200 }, (_, i) => ({
          text: `new log ${i}`,
          type: 'system' as const,
        })),
      });
    });

    expect(screen.getByText('new log 199')).toBeTruthy();
    expect(el.scrollTop).toBe(el.scrollHeight);
  });

  it('多個視窗各自持有捲動狀態，互不干擾', () => {
    setLogs(20);
    const { container } = render(
      <>
        <CombatLogPanel className="compact" />
        <CombatLogPanel className="overlay" />
      </>,
    );
    const compact = container.querySelector('.combat-log.compact') as HTMLElement;
    const overlay = container.querySelector('.combat-log.overlay') as HTMLElement;
    stubLayout(compact);
    stubLayout(overlay);

    // 只有 compact 被拉離底部
    compact.scrollTop = 50;
    fireEvent.scroll(compact);

    setLogs(40);
    expect(compact.scrollTop).toBe(50);
    expect(overlay.scrollTop).toBe(overlay.scrollHeight);
  });

  it('無紀錄且有提供 emptyText 時顯示空狀態', () => {
    render(<CombatLogPanel emptyText="目前沒有戰鬥紀錄" />);
    expect(screen.getByText('目前沒有戰鬥紀錄')).toBeTruthy();
  });
});
