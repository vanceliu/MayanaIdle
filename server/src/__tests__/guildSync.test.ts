import { it, expect } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { SqliteGuildStorage } from '../db/guildStorage';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import { flushTick } from '../tick';
import { applyServerMessage } from '../../../client/src/net/mirror';
import { useGuildStore } from '../../../client/src/stores/guildStore';
import { usePartyStore } from '../../../client/src/stores/partyStore';
import { ACTION_ALLOWLIST, type ServerMessage } from '../../../client/src/net/protocol';
import { MIRRORED } from '../sync';

/** 公會狀態經 `frame` 鏡像（`97-selfhosted-server.md` § 97.2「狀態同步」）：JSON 往返後 client 與 server 相同 */
it('公會分頁、邀請、在線名單的公會名稱經 JSON 往返後與 server 一致', async () => {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new SqliteRepository(db);
  defaultSession.repo = repo;
  const world = new World(new SqliteGuildStorage(db));

  const enter = async (userId: number, name: string, toClient: boolean): Promise<PlayerSession> => {
    const s = createPlayerSession(repo, '127.0.0.1', (m: ServerMessage) => {
      if (toClient) applyServerMessage(JSON.parse(JSON.stringify(m)) as ServerMessage);
    });
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId });
    world.sessions.add(s);
    await s.game.getState().createCharacter(name, 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
    const ch = s.game.getState().character!;
    s.game.setState({ character: { ...ch, level: 10, currentRegion: 'neutral-town', currentArea: 'neutral-town' } });
    await s.game.getState().saveState();
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  };

  expect(MIRRORED).toContain('guild');
  expect(ACTION_ALLOWLIST.guild.has('create')).toBe(true);

  const me = await enter(1, '鏡像者', true);
  const leader = await enter(2, '盟主', false);
  const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const push = () => {
    world.tick();
    flushTick(me, []);
  };

  expect((await world.handleGuildAction(leader, 'create', ['星辰'])).ok).toBe(true);
  expect((await world.handleGuildAction(leader, 'invite', [me.game.getState().character!.id])).ok).toBe(true);
  push();
  expect(useGuildStore.getState().invites).toEqual(roundTrip(me.guild.getState().invites));
  expect(useGuildStore.getState().invites[0].guildName).toBe('星辰');
  expect(usePartyStore.getState().onMap.find(p => p.name === '盟主')?.guildName).toBe('星辰');

  expect((await world.handleGuildAction(me, 'accept', [useGuildStore.getState().invites[0].id])).ok).toBe(true);
  push();
  expect(useGuildStore.getState().guild).toEqual(roundTrip(me.guild.getState().guild));
  expect(useGuildStore.getState().guild!.members.map(m => m.name)).toEqual(['盟主', '鏡像者']);
  expect(useGuildStore.getState().invites).toEqual([]);

  expect((await world.handleGuildAction(leader, 'disband', [])).ok).toBe(true);
  push();
  expect(useGuildStore.getState().guild).toBeNull();
  // store 的 action 不是資料，不得出現在 frame 裡
  expect(typeof useGuildStore.getState().create).toBe('function');
});
