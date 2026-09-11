import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NoticeBanner } from '../NoticeBanner';
import { useNoticeStore, NOTICE_DURATION_MS } from '../../stores/noticeStore';
import { applyServerMessage } from '../../net/mirror';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 *
 * server 公告（`97-selfhosted-server.md` § 97.8）：關服倒數這類訊息不走聊天頻道，
 * 橫幅與系統紀錄各留一份 —— 只放橫幅會被切走視窗的人錯過，只寫紀錄會被戰鬥洗掉。
 */
beforeEach(() => {
  useNoticeStore.getState().clear();
  useGameStore.setState({ combatLogs: [] });
});
afterEach(() => vi.useRealTimers());

describe('公告橫幅', () => {
  it('沒有公告時不畫任何東西', () => {
    const { container } = render(<NoticeBanner />);
    expect(container.querySelector('.notice-banner')).toBeNull();
  });

  it('收到 notice 就同時上橫幅與系統紀錄', () => {
    render(<NoticeBanner />);

    act(() => applyServerMessage({ t: 'notice', text: 'server 將在 60 秒後關閉' }));

    expect(screen.getByText('server 將在 60 秒後關閉')).toBeTruthy();
    expect(useGameStore.getState().combatLogs.at(-1)?.text).toBe('server 將在 60 秒後關閉');
  });

  it('過期自己收掉', () => {
    vi.useFakeTimers();
    const { container } = render(<NoticeBanner />);

    act(() => { useNoticeStore.getState().show('倒數 10 秒'); });
    expect(container.querySelector('.notice-banner')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(NOTICE_DURATION_MS + 1); });
    expect(container.querySelector('.notice-banner')).toBeNull();
  });

  it('後一則直接蓋掉前一則（倒數是連著來的）', () => {
    render(<NoticeBanner />);

    act(() => { useNoticeStore.getState().show('60 秒'); });
    act(() => { useNoticeStore.getState().show('30 秒'); });

    expect(screen.queryByText('60 秒')).toBeNull();
    expect(screen.getByText('30 秒')).toBeTruthy();
  });
});
