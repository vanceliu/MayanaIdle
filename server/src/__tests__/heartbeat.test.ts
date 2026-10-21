import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, startHeartbeat } from '../heartbeat';

/** 連線心跳（`97-selfhosted-server.md` § 97.2） */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  pings = 0;
  terminated = false;
  sent: unknown[] = [];
  ping() { this.pings++; }
  terminate() { this.terminated = true; }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
}

class FakeServer extends EventEmitter {
  clients = new Set<FakeSocket>();
  connect(): FakeSocket {
    const socket = new FakeSocket();
    this.clients.add(socket);
    this.emit('connection', socket);
    return socket;
  }
}

function setup() {
  const wss = new FakeServer();
  startHeartbeat(wss as never);
  return wss;
}

describe('連線心跳', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('間隔是 30 秒', () => {
    expect(HEARTBEAT_MS).toBe(30_000);
  });

  it('每輪對每條連線送一次 ping', () => {
    const wss = setup();
    const a = wss.connect();
    const b = wss.connect();

    vi.advanceTimersByTime(HEARTBEAT_MS - 1);
    expect(a.pings).toBe(0);

    vi.advanceTimersByTime(1);
    expect(a.pings).toBe(1);
    expect(b.pings).toBe(1);
  });

  it('有回 pong 的連線保持連線', () => {
    const wss = setup();
    const socket = wss.connect();

    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(HEARTBEAT_MS);
      socket.emit('pong');
    }

    expect(socket.terminated).toBe(false);
    expect(socket.pings).toBe(3);
  });

  it('上一輪的 ping 到下一輪仍沒收到 pong 就中斷', () => {
    const wss = setup();
    const socket = wss.connect();

    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(socket.terminated).toBe(false);

    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(socket.terminated).toBe(true);
    expect(socket.pings).toBe(1);
  });

  it('收到 pong 時把往返時間以 latency 推給該連線', () => {
    const wss = setup();
    const socket = wss.connect();

    vi.advanceTimersByTime(HEARTBEAT_MS);
    vi.advanceTimersByTime(42);
    socket.emit('pong');

    expect(socket.sent).toEqual([{ t: 'latency', ms: 42 }]);
  });

  it('沒有對應 ping 的 pong 不回報延遲', () => {
    const wss = setup();
    const socket = wss.connect();

    socket.emit('pong');

    expect(socket.sent).toEqual([]);
  });

  it('server 關閉後不再送 ping', () => {
    const wss = setup();
    const socket = wss.connect();
    wss.emit('close');

    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(socket.pings).toBe(0);
  });
});
