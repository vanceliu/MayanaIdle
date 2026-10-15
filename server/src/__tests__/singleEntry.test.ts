import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { DUPLICATE_ENTRY_REASON, GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 同帳號同時只能有一隻角色在遊戲中，後進場的贏（`97-selfhosted-server.md` § 97.5） */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

interface Client {
  session: PlayerSession;
  sent: ServerMessage[];
  closedWith: number | null;
  send(msg: ClientMessage): void;
}

describe('同帳號單一角色在場', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    // bind 非回送位址：避開單機的 host 自動登入
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  async function connect(userId: number): Promise<Client> {
    const handlers: Record<string, (raw: unknown) => void> = {};
    const client = { sent: [] as ServerMessage[], closedWith: null as number | null } as Client;
    const socket = {
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { client.sent.push(JSON.parse(raw) as ServerMessage); },
      close(code: number) { client.closedWith = code; },
    };
    fire(socket, { socket: { remoteAddress: '1.2.3.4' } });
    client.session = [...server.sessions].at(-1)!;
    client.send = msg => handlers.message(JSON.stringify(msg));
    client.send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    client.send({ t: 'resume', token: auth.issueSession(userId) });
    await vi.waitFor(() => expect(client.sent.some(m => m.t === 'auth_ok')).toBe(true));
    return client;
  }

  function character(client: Client) {
    return client.session.game.getState().character;
  }

  function kicked(client: Client) {
    return client.sent.some(m => m.t === 'kicked' && m.reason === DUPLICATE_ENTRY_REASON);
  }

  async function create(client: Client, name: string): Promise<void> {
    client.send({ t: 'create_character', name, className: 'knight', bonusAttrs: ATTRS });
    await vi.waitFor(() => expect(character(client)?.name).toBe(name));
  }

  async function select(client: Client, id: number): Promise<void> {
    client.send({ t: 'select_character', id });
    await vi.waitFor(() => expect(character(client)?.id).toBe(id));
  }

  async function leave(client: Client): Promise<void> {
    client.send({ t: 'leave_character' });
    await vi.waitFor(() => expect(character(client)).toBeNull());
  }

  it('同帳號另一處進入不同角色：舊連線被踢除，共用倉庫讀到舊連線 flush 後的值', async () => {
    const user = await auth.register('alice', 'alicepw1');
    const setup = await connect(user.id);
    await create(setup, 'Alpha');
    const alpha = character(setup)!.id!;
    await leave(setup);
    await create(setup, 'Beta');
    const beta = character(setup)!.id!;
    await leave(setup);

    const a = await connect(user.id);
    await select(a, alpha);
    a.session.game.setState({ warehouseGold: 500 });

    const b = await connect(user.id);
    await select(b, beta);

    expect(kicked(a)).toBe(true);
    expect(a.closedWith).toBe(4000);
    expect(character(a)).toBeNull();
    expect(b.session.game.getState().warehouseGold).toBe(500);
    expect(kicked(b)).toBe(false);
  });

  it('建角也算進場：同帳號在場的連線被踢除', async () => {
    const user = await auth.register('alan', 'alanpw12');
    const a = await connect(user.id);
    await create(a, 'Able');

    const b = await connect(user.id);
    await create(b, 'Baker');

    expect(kicked(a)).toBe(true);
    expect(character(a)).toBeNull();
  });

  it('同一隻角色重開：新連線讀到舊連線 flush 後的資料', async () => {
    const user = await auth.register('bob', 'bobpw123');
    const a = await connect(user.id);
    await create(a, 'Bravo');
    const id = character(a)!.id!;
    a.session.game.setState({ character: { ...character(a)!, gold: 4321 } });

    const b = await connect(user.id);
    await select(b, id);

    expect(kicked(a)).toBe(true);
    expect(character(b)!.gold).toBe(4321);
  });

  it('同帳號同時送出兩次進場，只留下後到的那條', async () => {
    const user = await auth.register('carol', 'carolpw1');
    const setup = await connect(user.id);
    await create(setup, 'Charlie');
    const id = character(setup)!.id!;

    const a = await connect(user.id);
    const b = await connect(user.id);
    a.send({ t: 'select_character', id });
    b.send({ t: 'select_character', id });
    await vi.waitFor(() => expect(character(b)?.id).toBe(id));

    expect(kicked(a)).toBe(true);
    expect(character(a)).toBeNull();
    const inGame = [...server.sessions].filter(s => s.userId === user.id && s.game.getState().character);
    expect(inGame).toEqual([b.session]);
  });

  it('停在角色選擇畫面的連線與其他帳號不受影響', async () => {
    const user = await auth.register('dave', 'davepw12');
    const other = await auth.register('erin', 'erinpw12');
    const idle = await connect(user.id);
    const stranger = await connect(other.id);
    await create(stranger, 'Echo');

    const a = await connect(user.id);
    await create(a, 'Delta');

    expect(kicked(idle)).toBe(false);
    expect(idle.closedWith).toBeNull();
    expect(kicked(stranger)).toBe(false);
    expect(character(stranger)?.name).toBe('Echo');
  });
});
