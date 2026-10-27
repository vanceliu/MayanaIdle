import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import { isWalkableTile, type Position } from '../../../client/src/models/mapControl';

/** 點地圖移動不被搜尋模式的套用覆蓋（`38-map-control.md` § 38.5、`97-selfhosted-server.md` § 97.2） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

interface Client {
  session: PlayerSession;
  act(store: string, name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('線上模式點地圖移動', () => {
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

  async function enterField(): Promise<Client> {
    const user = await auth.register('walker', 'password1');
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
    send({ t: 'create_character', name: 'Walker', className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Walker'));

    const ch = session.game.getState().character!;
    session.game.setState({ character: { ...ch, currentRegion: 'dawn-plains', currentArea: 'dawn-plains', currentFloor: null, mapPositionX: undefined, mapPositionY: undefined } });
    await syncWorld(session);

    let nextId = 1;
    const act = async (store: string, actionName: string, ...args: unknown[]) => {
      const id = nextId++;
      send({ t: 'action', store, name: actionName, args, id });
      await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
      return sent.find(m => 'id' in m && m.id === id)!;
    };
    return { session, act };
  }

  function walkableTileAwayFrom(session: PlayerSession): Position {
    const { currentMap, playerPosition } = session.mapControl.getState();
    const from = { x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) };
    for (let d = 4; d < 30; d++) {
      for (const tile of [{ x: from.x + d, y: from.y }, { x: from.x - d, y: from.y }, { x: from.x, y: from.y + d }, { x: from.x, y: from.y - d }]) {
        if (isWalkableTile(currentMap!, tile)) return tile;
      }
    }
    throw new Error('找不到可通行格');
  }

  it.each(['manual', 'auto'] as const)('%s 搜尋：點擊格就是移動目的地', async mode => {
    const player = await enterField();
    await player.act('game', 'setSearchMode', mode);
    const target = walkableTileAwayFrom(player.session);

    const reply = await player.act('mapControl', 'moveToTarget', target);

    expect(reply).toMatchObject({ t: 'action_ok' });
    const after = player.session.mapControl.getState();
    expect(after.isMoving).toBe(true);
    expect(after.targetPosition).toEqual(target);
    expect(after.currentPath.at(-1)).toEqual(target);
    expect(after.autoMove).toBe(mode === 'auto');
  });

  it('其他 action 不中斷點擊移動', async () => {
    const player = await enterField();
    await player.act('game', 'setSearchMode', 'manual');
    const target = walkableTileAwayFrom(player.session);
    await player.act('mapControl', 'moveToTarget', target);

    await player.act('game', 'setAfterCombatThreshold', 'afterCombatHpThreshold', 25);

    expect(player.session.mapControl.getState().targetPosition).toEqual(target);
  });

  it('切換搜尋模式照常開關自動移動', async () => {
    const player = await enterField();

    await player.act('game', 'setSearchMode', 'auto');
    expect(player.session.mapControl.getState().autoMove).toBe(true);
    expect(player.session.mapControl.getState().isMoving).toBe(true);

    await player.act('game', 'setSearchMode', 'manual');
    expect(player.session.mapControl.getState().autoMove).toBe(false);
    expect(player.session.mapControl.getState().isMoving).toBe(false);
  });
});

describe('自動搜尋中回到城鎮', () => {
  it('野外自動移動中回城：城鎮不自動移動（`13-town.md` § 13.2.1）', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    const session = createPlayerSession(repo, '127.0.0.1', () => {});
    session.game.setState({ userId: 1 });
    await session.game.getState().createCharacter('Walker', 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
    const toRegion = async (regionId: string) => {
      session.game.setState({ character: { ...session.game.getState().character!, currentRegion: regionId, currentArea: regionId, currentFloor: null, mapPositionX: undefined, mapPositionY: undefined } });
      await syncWorld(session);
    };
    await toRegion('dawn-plains');
    session.game.getState().setSearchMode('auto');
    await syncWorld(session);
    expect(session.mapControl.getState().autoMove).toBe(true);

    await toRegion('neutral-town');

    expect(session.mapControl.getState().currentMap?.theme).toBe('town');
    expect(session.mapControl.getState().autoMove).toBe(false);
  });
});
