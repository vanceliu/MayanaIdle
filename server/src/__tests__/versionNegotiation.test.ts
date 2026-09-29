import { describe, it, expect } from 'vitest';
import { GameServer } from '../ws';
import { PROTOCOL_VERSION } from '../../../client/src/net/protocol';
import type { ServerMessage } from '../../../client/src/net/protocol';

/**
 * 版本協商有兩道（`97-selfhosted-server.md` § 97.2）：協定版本擋格式不相容，
 * 發布版本擋同格式但行為不同的 client。兩者都必須完全相同。
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

/** `version` 是 server 的發布版本，版本協商比的就是它 */
function serverWith(releaseVersion: string) {
  const server = new GameServer({
    repo: {} as never,
    auth: {} as never,
    // bind 非回送位址：避開單機的 host 自動登入，這裡只驗協商
    config: () => ({ bind: '0.0.0.0', serverName: 'T', registration: 'open' }) as never,
    version: releaseVersion,
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

async function hello(socket: ReturnType<typeof fakeSocket>, release: string, version = PROTOCOL_VERSION) {
  socket.handlers.message(JSON.stringify({ t: 'hello', version, release }));
  await new Promise(r => setTimeout(r, 0));
  return socket.sent;
}

describe('版本協商', () => {
  it('兩個版本都相同就放行', async () => {
    const socket = serverWith('0.7.7');
    const sent = await hello(socket, '0.7.7');

    expect(sent.map(m => m.t)).toContain('hello_ok');
    expect(sent.some(m => m.t === 'version_mismatch')).toBe(false);
  });

  it('協定版本不同就擋，回報 kind=protocol', async () => {
    const socket = serverWith('0.7.7');
    const sent = await hello(socket, '0.7.7', '0');

    expect(sent.find(m => m.t === 'version_mismatch'))
      .toMatchObject({ kind: 'protocol', required: PROTOCOL_VERSION, received: '0' });
    expect(sent.some(m => m.t === 'hello_ok')).toBe(false);
  });

  it('協定版本相同但發布版本不同也要擋，回報 kind=release', async () => {
    const socket = serverWith('0.7.8');
    const sent = await hello(socket, '0.7.7');

    expect(sent.find(m => m.t === 'version_mismatch'))
      .toMatchObject({ kind: 'release', required: '0.7.8', received: '0.7.7' });
    expect(sent.some(m => m.t === 'hello_ok')).toBe(false);
  });

  it('發布版本差一個預發布後綴也擋，字串必須完全相同', async () => {
    const socket = serverWith('0.7.7');
    const sent = await hello(socket, '0.7.7-rc1');

    expect(sent.find(m => m.t === 'version_mismatch')).toMatchObject({ kind: 'release' });
  });

  it('協定版本先判：兩個都不對時回報 protocol', async () => {
    const socket = serverWith('0.7.8');
    const sent = await hello(socket, '0.7.7', '0');

    expect(sent.find(m => m.t === 'version_mismatch')).toMatchObject({ kind: 'protocol' });
  });

  it('hello_ok 回的是 server 的發布版本', async () => {
    const socket = serverWith('0.7.7');
    const sent = await hello(socket, '0.7.7');

    expect(sent.find(m => m.t === 'hello_ok')).toMatchObject({ version: '0.7.7' });
  });
});
