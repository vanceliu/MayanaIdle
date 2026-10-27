import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameConnection, NOT_CONNECTED_MESSAGE, DISCONNECTED_MESSAGE } from '../connection';
import { useOnlineStore } from '../online';
import type { ClientMessage } from '../protocol';

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  serverOpens(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

/** 連線未開啟時遠端 action 立即失敗，不留下永遠等不到回應的請求（`97-selfhosted-server.md` § 97.2） */
describe('連線未開啟時的遠端 action', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.instances = [];
    useOnlineStore.setState({ status: 'offline', error: null, kickedReason: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('連線中（尚未開啟）呼叫：立即以「尚未連線」失敗，不送出', async () => {
    const conn = new GameConnection();
    conn.connect('ws://test/ws');
    const socket = FakeSocket.instances[0];

    await expect(conn.rpc('game', 'useQuickSlot', [0])).rejects.toThrow(NOT_CONNECTED_MESSAGE);

    socket.serverOpens();
    expect(socket.sent.filter(m => m.t === 'action')).toEqual([]);
    conn.disconnect();
  });

  it('重連期間呼叫：立即失敗；重連後新的呼叫照常送出', async () => {
    const conn = new GameConnection();
    conn.connect('ws://test/ws');
    const first = FakeSocket.instances[0];
    first.serverOpens();
    first.close();

    await expect(conn.rpc('trade', 'cancel', [])).rejects.toThrow(NOT_CONNECTED_MESSAGE);

    vi.advanceTimersByTime(1000);
    const second = FakeSocket.instances[1];
    second.serverOpens();
    const pending = conn.rpc('trade', 'cancel', []);
    const sent = second.sent.find(m => m.t === 'action') as { id: number };
    second.receive({ t: 'action_ok', id: sent.id, result: true });
    await expect(pending).resolves.toBe(true);
    conn.disconnect();
  });

  it('等待回應期間斷線：以「連線中斷」失敗', async () => {
    const conn = new GameConnection();
    conn.connect('ws://test/ws');
    const socket = FakeSocket.instances[0];
    socket.serverOpens();

    const pending = conn.rpc('game', 'useQuickSlot', [0]);
    socket.close();

    await expect(pending).rejects.toThrow(DISCONNECTED_MESSAGE);
    conn.disconnect();
  });
});
