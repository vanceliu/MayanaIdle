// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StartScreen } from '../StartScreen';
import { RecoveryCodeModal } from '../RecoveryCodeModal';
import { AccountSettings } from '../AccountSettings';
import { useOnlineStore } from '../../net/online';
import { connection } from '../../net/connection';

/** 救援碼的 client 流程（`97-selfhosted-server.md` § 97.5） */
describe('救援碼', () => {
  beforeEach(() => {
    useOnlineStore.setState({ enabled: true, status: 'login', registration: 'open', error: null, recoveryCode: null, hasRecoveryCode: false, isHost: false, username: 'alice' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('起始畫面登入表單的「忘記密碼」送出救援碼與新密碼', () => {
    const recover = vi.spyOn(connection, 'recover').mockImplementation(() => {});
    render(<StartScreen view={{ kind: 'loginForm' }} />);

    fireEvent.click(screen.getByRole('button', { name: '忘記密碼？' }));
    fireEvent.change(screen.getByLabelText('救援碼'), { target: { value: '3-ABCD-EFGH-JKMN-PQRS' } });
    fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'newpass1' } });
    fireEvent.click(screen.getByRole('button', { name: '重設密碼' }));

    expect(recover).toHaveBeenCalledWith('3-ABCD-EFGH-JKMN-PQRS', 'newpass1');
  });

  it('註冊關閉時仍有「忘記密碼」；返回登入回到登入表單', () => {
    useOnlineStore.setState({ registration: 'closed' });
    render(<StartScreen view={{ kind: 'loginForm' }} />);

    fireEvent.click(screen.getByRole('button', { name: '忘記密碼？' }));
    fireEvent.click(screen.getByRole('button', { name: '返回登入' }));

    expect(screen.getByRole('button', { name: '登入' })).toBeDefined();
  });

  it('有新救援碼時顯示，可直接關閉', () => {
    useOnlineStore.setState({ recoveryCode: '3-ABCD-EFGH-JKMN-PQRS' });
    render(<RecoveryCodeModal />);

    expect(screen.getByTestId('recovery-code').textContent).toBe('3-ABCD-EFGH-JKMN-PQRS');
    fireEvent.click(screen.getByText('關閉'));

    expect(useOnlineStore.getState().recoveryCode).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('沒有救援碼時用目前的密碼產生；host 沒有這個入口', () => {
    const regenerate = vi.spyOn(connection, 'regenerateRecoveryCode').mockResolvedValue();
    const { unmount } = render(<AccountSettings onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('目前的密碼'), { target: { value: 'alicepw1' } });
    fireEvent.click(screen.getByRole('button', { name: '產生救援碼' }));
    expect(regenerate).toHaveBeenCalledWith('alicepw1');
    unmount();

    useOnlineStore.setState({ isHost: true });
    render(<AccountSettings onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /救援碼/ })).toBeNull();
  });

  it('已有救援碼時，重新產生要輸入目前的救援碼', () => {
    useOnlineStore.setState({ hasRecoveryCode: true });
    const regenerate = vi.spyOn(connection, 'regenerateRecoveryCode').mockResolvedValue();
    render(<AccountSettings onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '重新產生救援碼' }));
    expect(regenerate).not.toHaveBeenCalled();
    expect(screen.getByText('請輸入目前的救援碼')).toBeDefined();

    fireEvent.change(screen.getByLabelText('目前的救援碼'), { target: { value: '1-AAAA-BBBB-CCCC-DDDD' } });
    fireEvent.click(screen.getByRole('button', { name: '重新產生救援碼' }));
    expect(regenerate).toHaveBeenCalledWith('1-AAAA-BBBB-CCCC-DDDD');
  });

  it('改密碼要帶目前的密碼或救援碼，失敗時顯示 server 的錯誤', async () => {
    const setPassword = vi.spyOn(connection, 'setPassword').mockRejectedValue(new Error('目前的密碼或救援碼錯誤'));
    render(<AccountSettings onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('目前的密碼或救援碼'), { target: { value: 'oldpass1' } });
    fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'newpass1' } });
    fireEvent.change(screen.getByLabelText('再輸入一次'), { target: { value: 'newpass1' } });
    fireEvent.click(screen.getByRole('button', { name: '設定密碼' }));

    expect(setPassword).toHaveBeenCalledWith('oldpass1', 'newpass1');
    expect(await screen.findByText('目前的密碼或救援碼錯誤')).toBeDefined();
  });

  it('登出分成回到角色清單與登出帳號；host 沒有登出帳號', () => {
    const logout = vi.spyOn(connection, 'logout').mockImplementation(() => {});
    const onClose = vi.fn();
    const { unmount } = render(<AccountSettings onClose={onClose} />);

    expect(screen.getByRole('button', { name: '回到角色清單' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '登出帳號' }));
    expect(onClose).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
    unmount();

    useOnlineStore.setState({ isHost: true });
    render(<AccountSettings onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '回到角色清單' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '登出帳號' })).toBeNull();
  });

  it('非 host 不再顯示「帳號密碼用於登入這個 server」的說明', () => {
    render(<AccountSettings onClose={() => {}} />);
    expect(screen.queryByText(/這組帳號密碼用於登入這個 server/)).toBeNull();
  });
});
