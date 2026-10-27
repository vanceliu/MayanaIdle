import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installOnlineProxies } from '../mirror';
import { useGameStore } from '../../stores/gameStore';
import { useTradeStore } from '../../stores/tradeStore';
import type { GameConnection } from '../connection';
import '../../stores/talentStore';
import '../../stores/mailboxStore';
import '../../stores/partyStore';

/** 遠端 action 失敗寫一行本機系統訊息，錯誤照常拋給呼叫端（`97-selfhosted-server.md` § 97.2） */
describe('遠端 action 失敗提示', () => {
  beforeEach(() => {
    useGameStore.setState({ combatLogs: [] });
  });

  it('server 拒絕：錯誤訊息寫進系統訊息，呼叫端仍收到錯誤', async () => {
    const rpc = vi.fn(() => Promise.reject(new Error('金幣不足')));
    installOnlineProxies({ rpc, send: vi.fn() } as unknown as GameConnection);

    await expect(useGameStore.getState().restAtInn('full')).rejects.toThrow('金幣不足');

    expect(useGameStore.getState().combatLogs.at(-1)).toMatchObject({ text: '金幣不足', type: 'system' });
  });

  it('非 game store 的 action 一樣提示', async () => {
    const rpc = vi.fn(() => Promise.reject(new Error('放入的內容不合法')));
    installOnlineProxies({ rpc, send: vi.fn() } as unknown as GameConnection);

    await expect(useTradeStore.getState().setOffer({ equipmentIds: [], items: [], gold: 1 })).rejects.toThrow();

    expect(useGameStore.getState().combatLogs.at(-1)).toMatchObject({ text: '放入的內容不合法', type: 'system' });
  });

  it('成功不寫系統訊息', async () => {
    const rpc = vi.fn(() => Promise.resolve(true));
    installOnlineProxies({ rpc, send: vi.fn() } as unknown as GameConnection);

    await useGameStore.getState().restAtInn('full');

    expect(useGameStore.getState().combatLogs).toEqual([]);
  });
});
