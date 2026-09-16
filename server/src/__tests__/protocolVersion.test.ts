import { describe, it, expect } from 'vitest';
import { GameServer } from '../ws';
import { PROTOCOL_VERSION } from '../../../client/src/net/protocol';
import type { ServerMessage } from '../../../client/src/net/protocol';

/**
 * 版本協商比的是**協定版本**，不是遊戲顯示版本（`97-selfhosted-server.md` § 97.2）。
 *
 * 綁在一起的話，每次改版號就把所有還開著的 client 擋在門外，
 * 即使線上訊息格式一個字都沒變。
 */
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

/** `version` 是 server 的**顯示**版本，故意與協定版本不同，用來證明它不參與判定 */
function serverWith(displayVersion: string) {
  const server = new GameServer({
    repo: {} as never,
    auth: {} as never,
    // bind 非回送位址：避開單機的 host 自動登入，這裡只驗協商
    config: () => ({ bind: '0.0.0.0', serverName: 'T', registration: 'open' }) as never,
    version: displayVersion,
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

async function hello(socket: ReturnType<typeof fakeSocket>, version: string) {
  socket.handlers.message(JSON.stringify({ t: 'hello', version }));
  await new Promise(r => setTimeout(r, 0));
  return socket.sent;
}

describe('協定版本協商', () => {
  it('協定版本相同就放行，顯示版本不同也沒關係', async () => {
    const socket = serverWith('9.9.9');
    const sent = await hello(socket, PROTOCOL_VERSION);

    expect(sent.map(m => m.t)).toContain('hello_ok');
    expect(sent.some(m => m.t === 'version_mismatch')).toBe(false);
  });

  it('協定版本不同就拒連，並回報需要的協定版本', async () => {
    const socket = serverWith(PROTOCOL_VERSION);
    const sent = await hello(socket, '0');

    const mismatch = sent.find(m => m.t === 'version_mismatch');
    expect(mismatch).toBeTruthy();
    expect(mismatch).toMatchObject({ required: PROTOCOL_VERSION, received: '0' });
  });

  it('hello_ok 回的是 server 的顯示版本（給介面看，不參與判定）', async () => {
    const socket = serverWith('9.9.9');
    const sent = await hello(socket, PROTOCOL_VERSION);

    expect(sent.find(m => m.t === 'hello_ok')).toMatchObject({ version: '9.9.9' });
  });
});
