import { it, expect } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import { flushTick } from '../tick';
import { applyServerMessage } from '../../../client/src/net/mirror';
import { createCombatState } from '../../../client/src/systems/combatLoop';
import type { ServerMessage } from '../../../client/src/net/protocol';
import type { CombatLog } from '../../../client/src/stores/gameStore';

/** 狀態同步（`97-selfhosted-server.md` § 97.2「狀態同步」）：真實戰鬥中 client 還原結果與 server 一致 */
it('野外戰鬥 200 tick：client 還原的日誌、角色、怪物、怪物血量與 server 相同', async () => {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new SqliteRepository(db);
  defaultSession.repo = repo;
  defaultSession.combat = createCombatState();
  defaultSession.mapMonster.setState({ monsters: [] });
  defaultSession.game.setState({ combatLogs: [], character: null });

  const world = new World();
  const s: PlayerSession = createPlayerSession(repo, '127.0.0.1', (m: ServerMessage) => {
    applyServerMessage(JSON.parse(JSON.stringify(m)) as ServerMessage);
  });
  s.world = world;
  s.userId = 1;
  s.game.setState({ userId: 1 });
  world.sessions.add(s);
  await s.game.getState().createCharacter('往返', 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
  const ch = s.game.getState().character!;
  s.game.setState({ character: { ...ch, currentRegion: 'dawn-plains', currentArea: 'dawn-plains', level: 30, hp: 5000, maxHp: 5000 } });
  await s.game.getState().saveState();
  await syncWorld(s);
  world.onCharacterEnter(s);
  s.mapControl.getState().setAutoMove(true);

  const client = defaultSession;
  const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  let sawMonsters = false;
  let sawLogs = false;

  for (let i = 0; i < 200; i++) {
    if (i === 100) s.game.setState({ combatLogs: [{ message: '整份換掉' } as unknown as CombatLog] });
    await syncWorld(s);
    const visuals = world.tick();
    flushTick(s, visuals.get(s) ?? []);

    const server = s.game.getState();
    expect(client.game.getState().combatLogs).toEqual(roundTrip(server.combatLogs));
    expect(client.game.getState().character).toEqual(roundTrip(server.character));

    const serverMonsters = s.mapMonster.getState().monsters;
    expect(client.mapMonster.getState().monsters.map(m => ({ id: m.id, position: m.position })))
      .toEqual(roundTrip(serverMonsters.map(m => ({ id: m.id, position: m.position }))));

    const serverHp = [...s.combat.monsterInstances].map(([id, inst]) => [id, inst.currentHp, inst.maxHp]);
    expect([...client.combat.monsterInstances].map(([id, inst]) => [id, inst.currentHp, inst.maxHp])).toEqual(serverHp);

    if (serverMonsters.length > 0) sawMonsters = true;
    if (server.combatLogs.length > 1) sawLogs = true;
  }
  expect(sawMonsters).toBe(true);
  expect(sawLogs).toBe(true);
}, 60_000);
