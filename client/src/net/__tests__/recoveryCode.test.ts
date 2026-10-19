import { describe, it, expect, beforeEach } from 'vitest';
import { GameConnection } from '../connection';
import { useOnlineStore } from '../online';
import type { ServerMessage } from '../protocol';

/** 救援碼與改密碼的連線處理（`97-selfhosted-server.md` § 97.5） */
describe('救援碼連線處理', () => {
  const conn = new GameConnection();
  const handle = (msg: ServerMessage) => (conn as unknown as { handle(m: ServerMessage): void }).handle(msg);

  beforeEach(() => {
    useOnlineStore.setState({ error: null, kickedReason: null, recoveryCode: null, hasRecoveryCode: false });
  });

  it('auth_ok 帶救援碼時記下待顯示，沒帶時不覆蓋', () => {
    handle({ t: 'auth_ok', token: 't', username: 'u', userId: 1, hasPassword: true, hasRecoveryCode: true, isHost: false, recoveryCode: '1-AAAA-BBBB-CCCC-DDDD' });
    expect(useOnlineStore.getState().recoveryCode).toBe('1-AAAA-BBBB-CCCC-DDDD');
    expect(useOnlineStore.getState().hasRecoveryCode).toBe(true);

    handle({ t: 'auth_ok', token: 't', username: 'u', userId: 1, hasPassword: true, hasRecoveryCode: true, isHost: false });
    expect(useOnlineStore.getState().recoveryCode).toBe('1-AAAA-BBBB-CCCC-DDDD');
  });

  it('recovery_code 記下待顯示並標記已有救援碼', () => {
    handle({ t: 'recovery_code', code: '2-AAAA-BBBB-CCCC-DDDD' });
    expect(useOnlineStore.getState().recoveryCode).toBe('2-AAAA-BBBB-CCCC-DDDD');
    expect(useOnlineStore.getState().hasRecoveryCode).toBe(true);
  });

  it('因改密碼被踢、session 失效後，登入畫面顯示踢除原因', () => {
    handle({ t: 'kicked', reason: '密碼已變更，請重新登入' });
    handle({ t: 'error', code: 'session_expired', message: '登入已過期' });

    expect(useOnlineStore.getState().status).toBe('login');
    expect(useOnlineStore.getState().error).toBe('密碼已變更，請重新登入');
    expect(useOnlineStore.getState().kickedReason).toBeNull();
  });
});
