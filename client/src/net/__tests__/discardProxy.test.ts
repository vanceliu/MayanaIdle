import { describe, it, expect, vi } from 'vitest';
import { installOnlineProxies } from '../mirror';
import { useGameStore } from '../../stores/gameStore';
import type { GameConnection } from '../connection';
// 這幾個 store 在 import 時掛上 defaultSession；App 會全部載入，測試要自己補
import '../../stores/talentStore';
import '../../stores/mailboxStore';
import '../../stores/partyStore';
import '../../stores/tradeStore';

/**
 * 線上模式的丟棄確認（`35-inventory-constraints.md` § 35.5.3）：
 * 開視窗、取消、確認三個 action 都要送到 server ——
 * `confirmDiscard` 在 server 讀 `pendingDiscard`，請求只開在本機的話按「丟棄」不會有反應。
 */
describe('線上模式的丟棄確認', () => {
  it('request／cancel／confirm 都走 RPC，不在本機改狀態', () => {
    const rpc = vi.fn(() => Promise.resolve(undefined));
    installOnlineProxies({ rpc, send: vi.fn() } as unknown as GameConnection);
    useGameStore.setState({ pendingDiscard: null });

    const req = { kind: 'bag' as const, name: '學徒布鞋', itemId: 9, maxAmount: 1 };
    useGameStore.getState().requestDiscard(req);
    useGameStore.getState().confirmDiscard(1);
    useGameStore.getState().cancelDiscard();

    expect(rpc.mock.calls).toEqual([
      ['game', 'requestDiscard', [req]],
      ['game', 'confirmDiscard', [1]],
      ['game', 'cancelDiscard', []],
    ]);
    // 視窗狀態一律由 server 同步回來
    expect(useGameStore.getState().pendingDiscard).toBeNull();
  });
});
