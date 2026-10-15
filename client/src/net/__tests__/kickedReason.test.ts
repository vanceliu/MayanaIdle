import { describe, it, expect, beforeEach } from 'vitest';
import { GameConnection } from '../connection';
import { useOnlineStore } from '../online';
import type { ServerMessage } from '../protocol';

/** 踢除原因要撐過自動重連，回到角色選擇畫面時還看得到（`97-selfhosted-server.md` § 97.5） */
describe('踢除原因', () => {
  beforeEach(() => {
    useOnlineStore.setState({ error: null, kickedReason: null });
  });

  it('收到 kicked 記下原因，重連後的 auth_ok 不清掉', () => {
    const conn = new GameConnection();
    const handle = (msg: ServerMessage) => (conn as unknown as { handle(m: ServerMessage): void }).handle(msg);

    handle({ t: 'kicked', reason: '此帳號已在其他地方進入遊戲' });
    handle({ t: 'auth_ok', token: 't', username: 'u', userId: 1, hasPassword: true, isHost: false });

    expect(useOnlineStore.getState().kickedReason).toBe('此帳號已在其他地方進入遊戲');
    expect(useOnlineStore.getState().error).toBeNull();
  });
});
