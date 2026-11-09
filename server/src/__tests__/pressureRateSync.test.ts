import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession } from '../playerSession';
import { collectStoreDeltas } from '../sync';
import { GameServer } from '../ws';
import { resetRates, setRates } from '../../../client/src/core/rates';

/** 探索列的 Pressure 顯示依 server 的全域 Pressure 倍率（`26-spawn-pressure.md` § 26.3、`19-account-character.md` § 19.9） */
describe('Pressure 倍率推送', () => {
  afterEach(() => resetRates());

  function setup() {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    const server = new GameServer({
      repo,
      auth: {} as never,
      config: () => ({}) as never,
      version: 'test',
      hostUsername: 'host',
      mode: 'open',
      leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }),
    });
    const session = createPlayerSession(repo, '127.0.0.1', () => {});
    server.sessions.add(session);
    return { server, session };
  }

  it('新 session 帶 server 啟動時的倍率', () => {
    setRates({ pressure: 2 });
    const { session } = setup();
    expect(collectStoreDeltas(session)?.game?.set?.pressureRate).toBe(2);
  });

  it('倍率即時變更後推給在線 session', () => {
    const { server, session } = setup();
    collectStoreDeltas(session);

    setRates({ pressure: 0.5 });
    server.refreshPressureRate();

    expect(session.game.getState().pressureRate).toBe(0.5);
    expect(collectStoreDeltas(session)?.game?.set?.pressureRate).toBe(0.5);
  });
});
