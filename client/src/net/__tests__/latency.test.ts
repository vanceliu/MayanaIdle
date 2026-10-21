import { describe, it, expect, beforeEach } from 'vitest';
import { GameConnection } from '../connection';
import { useOnlineStore } from '../online';
import type { ServerMessage } from '../protocol';

/** 連線心跳量到的往返時間（`97-selfhosted-server.md` § 97.2） */
describe('連線延遲', () => {
  beforeEach(() => {
    useOnlineStore.setState({ latencyMs: null });
  });

  it('收到 latency 記下毫秒數', () => {
    const conn = new GameConnection();
    const handle = (msg: ServerMessage) => (conn as unknown as { handle(m: ServerMessage): void }).handle(msg);

    handle({ t: 'latency', ms: 87 });

    expect(useOnlineStore.getState().latencyMs).toBe(87);
  });
});
