// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StartScreen, titleViewOf } from '../StartScreen';
import { useOnlineStore } from '../../net/online';
import { connection } from '../../net/connection';
import { PATCH_NOTES } from '../../db/seed/patchNotes';

const BASE = {
  enabled: true, status: 'authed', awaitingEnter: true, worldMode: 'open', isHost: false,
  username: 'alice', mismatchKind: null, requiredVersion: null,
} as const;

/** `19-account-character.md` § 19.3 起始畫面 */
describe('起始畫面狀態', () => {
  it('依連線狀態決定顯示內容', () => {
    expect(titleViewOf({ ...BASE, status: 'connecting' }, 'title')).toEqual({ kind: 'connecting' });
    expect(titleViewOf({ ...BASE, status: 'disconnected' }, 'explore')).toEqual({ kind: 'reconnecting' });
    expect(titleViewOf({ ...BASE, status: 'login' }, 'title')).toEqual({ kind: 'loginForm' });
    expect(titleViewOf({ ...BASE, status: 'version_mismatch', mismatchKind: 'release', requiredVersion: '9.9.9' }, 'title'))
      .toEqual({ kind: 'versionMismatch', mismatch: 'release', requiredVersion: '9.9.9' });
  });

  it('已登入等「進入」：開放世界帶帳號名，單機 host 不帶', () => {
    expect(titleViewOf(BASE, 'title')).toEqual({ kind: 'signedIn', username: 'alice' });
    expect(titleViewOf({ ...BASE, worldMode: 'solo', isHost: true, username: 'host' }, 'title')).toEqual({ kind: 'signedIn', username: null });
  });

  it('已按進入等角色清單顯示載入中；離開 title phase 後不再顯示起始畫面', () => {
    expect(titleViewOf({ ...BASE, awaitingEnter: false }, 'title')).toEqual({ kind: 'loading' });
    expect(titleViewOf(BASE, 'characterSelect')).toBeNull();
  });
});

describe('起始畫面操作', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('開放世界已登入：顯示帳號名，「進入」與「切換帳號」接到連線', () => {
    useOnlineStore.setState({ enabled: true, worldMode: 'open', serverName: '測試服', error: null });
    const enter = vi.spyOn(connection, 'enterFromTitle').mockImplementation(() => {});
    const logout = vi.spyOn(connection, 'logout').mockImplementation(() => {});
    render(<StartScreen view={{ kind: 'signedIn', username: 'alice' }} />);

    expect(screen.getByText('測試服')).toBeDefined();
    expect(screen.getByText('alice')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '進入' }));
    fireEvent.click(screen.getByRole('button', { name: '切換帳號' }));

    expect(enter).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('單機：只有「進入」，不顯示 server 名稱與切換帳號', () => {
    useOnlineStore.setState({ enabled: true, worldMode: 'solo', serverName: 'MayanaIdle', error: null });
    render(<StartScreen view={{ kind: 'signedIn', username: null }} />);

    expect(screen.getByRole('button', { name: '進入' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '切換帳號' })).toBeNull();
    expect(screen.queryByText('MayanaIdle')).toBeNull();
  });

  it('登入表單送出帳密', () => {
    useOnlineStore.setState({ enabled: true, worldMode: 'open', registration: 'open', error: null });
    const login = vi.spyOn(connection, 'login').mockImplementation(() => {});
    render(<StartScreen view={{ kind: 'loginForm' }} />);

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pw123456' } });
    fireEvent.click(screen.getByRole('button', { name: '登入' }));

    expect(login).toHaveBeenCalledWith('alice', 'pw123456');
  });

  it('改版資訊依序顯示每一版的版本號與日期，新版在上', () => {
    useOnlineStore.setState({ enabled: true, worldMode: 'open', error: null });
    render(<StartScreen view={{ kind: 'connecting' }} />);

    const notes = screen.getByRole('complementary', { name: '改版資訊' });
    const headings = [...notes.querySelectorAll('h3')].map(h => h.textContent);
    expect(headings).toEqual(PATCH_NOTES.map(n => `v${n.version}${n.date}`));
  });
});
