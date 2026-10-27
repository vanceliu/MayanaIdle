import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 遠端 action 允許清單（`97-selfhosted-server.md` § 97.2 硬性要求） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

const REMOVED = [
  'addEffect', 'removeEffect', 'saveState', 'changeArea', 'refreshQuestBoard',
  'setScriptRules', 'usePotion', 'startExploring', 'stopExploring', 'setPhase', 'initQuestBoard', 'pushSystemLog',
];

interface Client {
  session: PlayerSession;
  sent: ServerMessage[];
  act(name: string, ...args: unknown[]): Promise<ServerMessage>;
  actIn(store: string, name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('遠端 action 允許清單', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    defaultSession.repo = new SqliteRepository(db);
    auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo: defaultSession.repo as SqliteRepository, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  async function enter(): Promise<Client> {
    const user = await auth.register('alice', 'password1');
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
    send({ t: 'create_character', name: 'Alice', className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Alice'));
    let nextId = 1;
    const act = (name: string, ...args: unknown[]) => actIn('game', name, ...args);
    const actIn = async (store: string, name: string, ...args: unknown[]) => {
      const id = nextId++;
      send({ t: 'action', store, name, args, id });
      await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
      return sent.find(m => 'id' in m && m.id === id)!;
    };
    return { session, sent, act, actIn };
  }

  it.each(REMOVED)('%s 不可遠端呼叫', async name => {
    const client = await enter();
    const reply = await client.act(name);

    expect(reply).toMatchObject({ t: 'error', code: 'action_denied' });
  });

  it.each([
    ['game', 'castQuickSlotSkill'], ['game', 'castSelfSkill'], ['game', 'rememberHuntLocation'],
    ['mapControl', 'stopMoving'], ['combatCommand', 'requestSkill'], ['mailbox', 'refresh'],
    ['game', 'restoreInTrainingGround'],
  ])('client 未呼叫的 %s.%s 不可遠端呼叫', async (store, name) => {
    const client = await enter();
    const reply = await client.actIn(store, name);

    expect(reply).toMatchObject({ t: 'error', code: 'action_denied' });
  });

  it.each(['summonDummies', 'clearAll'])('mapMonster.%s 不可遠端呼叫，場上怪物不變', async name => {
    const client = await enter();
    const before = client.session.mapMonster.getState().monsters;

    const reply = await client.actIn('mapMonster', name, { defense: 0, hp: 100, level: 1, size: 'small', element: 'none' }, [{ x: 10, y: 7 }]);

    expect(reply).toMatchObject({ t: 'error', code: 'action_denied' });
    expect(client.session.mapMonster.getState().monsters).toBe(before);
  });

  it('addEffect 被拒後狀態不變', async () => {
    const client = await enter();
    await client.act('addEffect', { id: 'x', type: 'buff', target: 'player', invincible: true, modifiers: [], startTime: 0, duration: 1e15 });

    expect(client.session.game.getState().activeEffects).toEqual([]);
  });

  describe('ensureQuestBoardForTown', () => {
    it('任務板已屬於目前城鎮：不重新產生', async () => {
      const client = await enter();
      const board = client.session.game.getState().adventurerQuestBoard;

      await client.act('ensureQuestBoardForTown');

      expect(client.session.game.getState().adventurerQuestBoard).toBe(board);
    });

    it('任務板屬於別的城鎮：重新產生並標成目前城鎮', async () => {
      const client = await enter();
      const town = client.session.game.getState().character!.currentArea;
      client.session.game.setState({ questBoardTownId: null });
      const board = client.session.game.getState().adventurerQuestBoard;

      await client.act('ensureQuestBoardForTown');

      expect(client.session.game.getState().adventurerQuestBoard).not.toBe(board);
      expect(client.session.game.getState().questBoardTownId).toBe(town);
    });
  });

  describe('setAfterCombatThreshold', () => {
    it('合法鍵與數值照常寫入（夾在 0~100）', async () => {
      const client = await enter();
      await client.act('setAfterCombatThreshold', 'afterCombatHpThreshold', 150);

      expect(client.session.game.getState().afterCombatHpThreshold).toBe(100);
    });

    it.each(['warehouseGold', 'activeEffects', 'lastPotionCooldown', '__proto__'])('非門檻鍵 %s 不寫入', async key => {
      const client = await enter();
      const before = { ...client.session.game.getState() } as Record<string, unknown>;

      await client.act('setAfterCombatThreshold', key, 100);

      expect((client.session.game.getState() as unknown as Record<string, unknown>)[key]).toEqual(before[key]);
    });

    it.each([['字串', '50'], ['null', null], ['物件', {}]])('值為%s：不寫入', async (_label, value) => {
      const client = await enter();
      const before = client.session.game.getState().afterCombatHpThreshold;

      await client.act('setAfterCombatThreshold', 'afterCombatHpThreshold', value);

      expect(client.session.game.getState().afterCombatHpThreshold).toBe(before);
    });
  });
});
