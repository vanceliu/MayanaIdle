import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, collectPatches, type PlayerSession } from '../playerSession';
import { gameLoopTick } from '../../../client/src/systems/gameLoop';
import { tickCombat } from '../../../client/src/systems/combatLoop';
import type { ServerMessage } from '../../../client/src/net/protocol';

describe('PlayerSession（97 § 97.6 一連線一會話）', () => {
  let session: PlayerSession;
  let sent: ServerMessage[];
  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    sent = [];
    session = createPlayerSession(repo, '127.0.0.1', m => sent.push(m));
    session.game.setState({ userId: 1 });
  });

  it('建角後角色在 SQLite，store 互相獨立', async () => {
    await session.game.getState().createCharacter('測試', 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
    const char = session.game.getState().character!;
    expect(char.id).toBe(1);
    expect((await session.repo.listEquipmentByOwner(char.id!)).length).toBeGreaterThan(0);
    expect(session.game).not.toBe(defaultSession.game);
    expect(session.mapMonster).not.toBe(defaultSession.mapMonster);
  });

  it('進入世界後載圖並可跑 tick', async () => {
    await session.game.getState().createCharacter('測試', 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
    await syncWorld(session);
    expect(session.mapControl.getState().currentMap?.id).toBe('neutral-town');
    for (let i = 0; i < 10; i++) {
      gameLoopTick(300, session);
      tickCombat(300, session);
    }
    expect(session.game.getState().character?.hp).toBeGreaterThan(0);
  });

  it('delta 只含變動的頂層鍵', async () => {
    const first = collectPatches(session);
    expect(first.find(p => p.store === 'game')?.data).toHaveProperty('phase');
    expect(collectPatches(session)).toEqual([]);
    session.game.setState({ searchMode: 'manual' });
    const next = collectPatches(session);
    expect(next).toEqual([{ store: 'game', data: { searchMode: 'manual' } }]);
  });

  it('換區時重新載圖', async () => {
    await session.game.getState().createCharacter('測試', 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
    await syncWorld(session);
    session.game.setState({ character: { ...session.game.getState().character!, currentRegion: 'dawn-plains', currentArea: 'dawn-plains' } });
    await syncWorld(session);
    expect(session.mapControl.getState().currentMap?.id).toBe('dawn-plains');
    expect(session.combat.areaTemplates.length).toBeGreaterThan(0);
  });
});
