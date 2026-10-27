import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import type { PlayerSession } from '../playerSession';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';

/** 隊伍／交易訊息只屬於上一次操作：成功時清除，開啟隊伍面板由 server 清除（`97-selfhosted-server.md` § 97.7.3） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

interface Client {
  session: PlayerSession;
  sent: ServerMessage[];
  act(store: string, name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('隊伍與交易的操作訊息', () => {
  let auth: AuthService;
  let fire: (socket: unknown, req: unknown) => void;
  let server: GameServer;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  async function enter(name: string): Promise<Client> {
    const user = await auth.register(name.toLowerCase(), 'password1');
    const handlers: Record<string, (raw: unknown) => void> = {};
    const sent: ServerMessage[] = [];
    fire({
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { sent.push(JSON.parse(raw) as ServerMessage); },
      close() {},
    }, { socket: { remoteAddress: '1.2.3.4' } });
    const session = [...server.sessions].at(-1)!;
    const send = (msg: unknown) => handlers.message(JSON.stringify(msg));
    send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    send({ t: 'resume', token: await auth.issueSession(user.id) });
    send({ t: 'create_character', name, className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe(name));
    let nextId = 1;
    const act = async (store: string, actionName: string, ...args: unknown[]) => {
      const id = nextId++;
      send({ t: 'action', store, name: actionName, args, id });
      await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
      return sent.find(m => 'id' in m && m.id === id)!;
    };
    return { session, sent, act };
  }

  it('開啟隊伍面板清除訊息後，同樣的失敗再發生會再顯示', async () => {
    const a = await enter('Alice');

    await a.act('party', 'invite', '不存在的人');
    const failure = a.session.party.getState().message;
    expect(failure).toContain('不存在的人');

    await a.act('party', 'clearMessage');
    expect(a.session.party.getState().message).toBeNull();

    const before = a.sent.length;
    await a.act('party', 'invite', '不存在的人');
    expect(a.session.party.getState().message).toBe(failure);
    expect(JSON.stringify(a.sent.slice(before))).toContain(failure!);
  });

  it('隊伍操作成功且沒有訊息時清除上一則', async () => {
    const a = await enter('Alice');
    await a.act('party', 'invite', '不存在的人');
    expect(a.session.party.getState().message).not.toBeNull();

    await a.act('party', 'leave');

    expect(a.session.party.getState().message).toBeNull();
  });

  it('交易操作成功時清除上一則交易訊息', async () => {
    const a = await enter('Alice');
    const b = await enter('Bob');
    await a.act('trade', 'offer', 999_999);
    expect(a.session.trade.getState().message).toBe('對方不在線上');

    await a.act('trade', 'offer', b.session.game.getState().character!.id);

    expect(a.session.trade.getState().message).toBeNull();
  });
});
