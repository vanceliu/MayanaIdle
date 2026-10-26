import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameServer, INTERNAL_ERROR_MESSAGE } from '../ws';
import { installRejectionGuard, rejectionGuard } from '../processGuard';
import { PROTOCOL_VERSION } from '../../../client/src/net/protocol';
import type { ServerMessage } from '../../../client/src/net/protocol';

/** 非物件訊息與未處理 rejection 不得終止 server（`97-selfhosted-server.md` § 97.2 硬性要求） */
function fakeSocket() {
  const sent: ServerMessage[] = [];
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    sent,
    handlers,
    readyState: 1,
    OPEN: 1,
    on(ev: string, h: (...args: unknown[]) => void) { handlers[ev] = h; },
    send(raw: string) { sent.push(JSON.parse(raw) as ServerMessage); },
    close() {},
  };
}

function connect() {
  const server = new GameServer({
    repo: {} as never,
    auth: {} as never,
    config: () => ({ bind: '0.0.0.0', serverName: 'T', registration: 'open' }) as never,
    version: '0.0.1',
    hostUsername: 'host',
    mode: 'open',
    leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }),
  });
  const socket = fakeSocket();
  const wss = {
    on: (_ev: string, handler: (s: unknown, r: unknown) => void) => {
      (wss as unknown as { fire: typeof handler }).fire = handler;
    },
  } as unknown as import('ws').WebSocketServer & { fire: (s: unknown, r: unknown) => void };
  server.attach(wss);
  wss.fire(socket, { socket: { remoteAddress: '1.2.3.4' } });
  return socket;
}

async function send(socket: ReturnType<typeof fakeSocket>, raw: string) {
  socket.handlers.message(raw);
  await new Promise(r => setTimeout(r, 0));
}

describe('訊息形狀檢查', () => {
  it.each(['null', '0', '"hello"', 'true', '[]', '[{"t":"hello"}]', '{}', '{"t":1}', '{"t":null}'])(
    '%s 回 bad_message',
    async raw => {
      const socket = connect();
      await send(socket, raw);

      expect(socket.sent).toEqual([{ t: 'error', code: 'bad_message', message: '訊息格式不正確' }]);
    },
  );

  it('不合法 JSON 仍回 bad_json', async () => {
    const socket = connect();
    await send(socket, '{');

    expect(socket.sent.map(m => m.t === 'error' && m.code)).toEqual(['bad_json']);
  });

  it('格式錯誤之後，同一連線的正常訊息照常處理', async () => {
    const socket = connect();
    await send(socket, 'null');
    await send(socket, JSON.stringify({ t: 'hello', version: PROTOCOL_VERSION, release: '0.0.1' }));

    expect(socket.sent.map(m => m.t)).toEqual(['error', 'hello_ok']);
  });

  it('非預期錯誤：回固定字串，不洩漏內部訊息', async () => {
    const socket = connect();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    await send(socket, JSON.stringify({ t: 'resume', token: 'x', id: 9 }));

    expect(socket.sent).toEqual([{ t: 'error', code: 'internal', message: INTERNAL_ERROR_MESSAGE, id: 9 }]);
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('處理失敗時，非數字的 id 不回傳', async () => {
    const socket = connect();
    await send(socket, JSON.stringify({ t: 'leaderboard', id: { x: 1 } }));

    const error = socket.sent.find(m => m.t === 'error');
    expect(error).toBeDefined();
    expect(error && 'id' in error ? error.id : undefined).toBeUndefined();
  });

  it('處理失敗時，數字 id 原樣回傳', async () => {
    const socket = connect();
    await send(socket, JSON.stringify({ t: 'leaderboard', id: 7 }));

    const error = socket.sent.find(m => m.t === 'error');
    expect(error && 'id' in error ? error.id : undefined).toBe(7);
  });
});

describe('rejection guard', () => {
  afterEach(() => {
    process.off('unhandledRejection', rejectionGuard);
    vi.restoreAllMocks();
  });

  it('只記 error log，不拋出', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => rejectionGuard(new TypeError('boom'))).not.toThrow();
    expect(errorLog).toHaveBeenCalledOnce();
  });

  it('安裝多次只掛一個 listener', () => {
    installRejectionGuard();
    installRejectionGuard();

    expect(process.listeners('unhandledRejection').filter(l => l === rejectionGuard)).toHaveLength(1);
  });
});
