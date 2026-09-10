import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import type { ServerMessage } from '../../../client/src/net/protocol';
import type { MonsterInstance } from '../../../client/src/models/monster';
import { handleMonsterDeath } from '../../../client/src/systems/combatLoop';
import { waitForPendingDrops } from '../../../client/src/stores/gameStore';

/** § 97.7.1 隊伍實例：同隊同圖共用怪物與 Pressure，經驗平分、掉落給一人 */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never;

describe('World（隊伍與地圖實例）', () => {
  let world: World;
  let repo: SqliteRepository;
  const sent = new Map<number, ServerMessage[]>();

  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    world = new World();
    sent.clear();
  });

  async function enter(userId: number, name: string, region = 'dawn-plains'): Promise<PlayerSession> {
    const s = createPlayerSession(repo, '127.0.0.1', m => {
      const list = sent.get(s.connectionId) ?? [];
      list.push(m);
      sent.set(s.connectionId, list);
    });
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId });
    world.sessions.add(s);
    await s.game.getState().createCharacter(name, 'knight', ATTRS);
    const ch = s.game.getState().character!;
    s.game.setState({ character: { ...ch, currentRegion: region, currentArea: region, level: 30, hp: 500, maxHp: 500, expToNext: 1_000_000 } });
    await s.game.getState().saveState();
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  }

  async function party(a: PlayerSession, b: PlayerSession) {
    const r1 = await world.handlePartyAction(a, 'invite', [b.game.getState().character!.id]);
    expect(r1.ok).toBe(true);
    const inv = b.party.getState().invites[0];
    expect(inv).toBeDefined();
    const r2 = await world.handlePartyAction(b, 'accept', [inv.id]);
    expect(r2.ok).toBe(true);
  }

  /** § 97.7.3 邀請入口：名單上點選傳角色 id，隊伍面板的輸入格傳角色名稱 */
  it('邀請可用角色名稱指定，大小寫不分', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob', 'neutral-town');

    const r = await world.handlePartyAction(a, 'invite', ['bob']);
    expect(r).toMatchObject({ ok: true, message: '已邀請 Bob' });
    expect(b.party.getState().invites).toHaveLength(1);
  });

  it('邀請：名稱查無此人、對方離線都回報找不到，不當成角色 id', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob', 'neutral-town');

    const miss = await world.handlePartyAction(a, 'invite', ['不存在的人']);
    expect(miss.ok).toBe(false);
    expect(miss.message).toContain('不存在的人');

    world.onCharacterLeave(b);
    world.sessions.delete(b);
    expect((await world.handlePartyAction(a, 'invite', ['Bob'])).ok).toBe(false);
    // 名單上的邀請照舊用角色 id
    expect((await world.handlePartyAction(a, 'invite', [b.game.getState().character!.id])).ok).toBe(false);
  });

  /** § 97.7.1 名單不透露隊籍：邀出去被擋才知道 */
  it('本地圖名單預設不標隊籍，邀請被回絕後才標，對方離隊即取消', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob');
    const c = await enter(3, 'Carol');
    await party(b, c);

    const onMap = () => a.party.getState().onMap;
    world.syncPartyViews([a]);
    expect(onMap().map(p => [p.name, p.inParty])).toEqual([['Bob', false], ['Carol', false]]);

    const rejected = await world.handlePartyAction(a, 'invite', ['Bob']);
    expect(rejected).toMatchObject({ ok: false, message: 'Bob 已在隊伍中' });
    expect(onMap().find(p => p.name === 'Bob')?.inParty).toBe(true);
    // 沒邀過的 Carol 同樣有隊伍，但 Alice 不該看得出來
    expect(onMap().find(p => p.name === 'Carol')?.inParty).toBe(false);

    await world.handlePartyAction(b, 'leave', []);
    world.syncPartyViews([a]);
    expect(onMap().find(p => p.name === 'Bob')?.inParty).toBe(false);
  });

  it('邀請自己一律拒絕（不論用 id 還是名稱）', async () => {
    const a = await enter(1, 'Alice');
    expect((await world.handlePartyAction(a, 'invite', ['Alice'])).ok).toBe(false);
    expect((await world.handlePartyAction(a, 'invite', [a.game.getState().character!.id])).ok).toBe(false);
  });

  it('沒有隊伍時各自一人實例；成隊後同圖共用實例，原一人實例銷毀', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    expect(a.instance).not.toBe(b.instance);
    expect(world.instances.count()).toBe(2);

    await party(a, b);
    expect(a.instance).toBe(b.instance);
    expect(a.instance.members).toHaveLength(2);
    expect(a.mapMonster).toBe(b.mapMonster);
    expect(a.combat.monsterInstances).toBe(b.combat.monsterInstances);
    expect(world.instances.count()).toBe(1);
    expect(a.instance.key.startsWith('party:')).toBe(true);
    expect(a.party.getState().party?.members.map(m => m.characterId)).toEqual([1, 2]);
    expect(b.party.getState().teammates.map(t => t.characterId)).toEqual([1]);
  });

  it('入隊時該地圖已有隊伍實例：切入並在入口重生', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    b.mapControl.setState({ playerPosition: { x: 3, y: 3 } });
    await party(a, b);
    const spawn = b.mapControl.getState().currentMap!.spawnPoint;
    expect(b.mapControl.getState().playerPosition).toEqual(spawn);
  });

  it('跨地圖：不同地圖的成員各自屬於不同實例', async () => {
    const a = await enter(1, 'A', 'dawn-plains');
    const b = await enter(2, 'B', 'neutral-town');
    await party(a, b);
    expect(a.instance).not.toBe(b.instance);
    expect(a.instance.key.startsWith('party:')).toBe(true);
    expect(b.instance.key.startsWith('party:')).toBe(true);
  });

  it('離隊後回到一人實例，留下的人沿用原實例', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    await party(a, b);
    const shared = a.instance;
    shared.kills = 700;
    await world.handlePartyAction(b, 'leave', []);
    expect(a.party.getState().party).toBeNull();
    expect(a.instance).toBe(shared);
    expect(a.instance.kills).toBe(700);
    expect(a.instance.key.startsWith('solo:')).toBe(true);
    expect(b.instance).not.toBe(shared);
    expect(b.instance.members).toEqual([b]);
  });

  it('斷線只標記離線，隊籍保留；回線接續原實例', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    await party(a, b);
    const shared = a.instance;
    const bId = b.game.getState().character!.id!;
    world.onCharacterLeave(b);
    await b.game.getState().logout();
    world.sessions.delete(b);
    expect(world.parties.partyOf(bId)!.members.get(bId)!.online).toBe(false);
    expect(shared.members).toEqual([a]);

    const b2 = createPlayerSession(repo, '127.0.0.1', () => {});
    b2.world = world;
    b2.userId = 2;
    b2.game.setState({ userId: 2 });
    world.sessions.add(b2);
    await b2.game.getState().selectCharacter(bId);
    await syncWorld(b2);
    world.onCharacterEnter(b2);
    expect(b2.instance).toBe(shared);
    expect(world.parties.partyOf(bId)!.members.get(bId)!.online).toBe(true);
  });

  it('擊殺：經驗在同實例參與者間平分，掉落只給一人；不同地圖的成員不分經驗', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    const c = await enter(3, 'C', 'neutral-town');
    await party(a, b);
    const rc = await world.handlePartyAction(a, 'invite', [c.game.getState().character!.id]);
    expect(rc.ok).toBe(true);
    await world.handlePartyAction(c, 'accept', [c.party.getState().invites[0].id]);
    expect(world.parties.partyOf(1)!.members.size).toBe(3);

    const dead: MonsterInstance = {
      templateId: 1, name: '史萊姆', level: 1, currentHp: 0, maxHp: 10, attackMin: 1, attackMax: 2, defense: 0,
      exp: 100, race: 'normal', size: 'small', element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    };
    const expBefore = [a, b, c].map(s => s.game.getState().character!.exp);
    handleMonsterDeath(dead, 0, 'm1', a);
    await waitForPendingDrops();
    const gained = [a, b, c].map((s, i) => s.game.getState().character!.exp - expBefore[i]);
    // 基礎 ×3 ÷ 2 人
    expect(gained[0]).toBe(150);
    expect(gained[1]).toBe(150);
    expect(gained[2]).toBe(0);
    expect(a.instance.kills).toBe(1);
    expect(a.game.getState().character!.areaKills).toBe(1);
    expect(b.game.getState().character!.areaKills).toBe(1);
    const killed = [a, b].map(s => s.game.getState().statistics.monstersKilled);
    expect(killed).toEqual([1, 1]);
  });

  it('隊伍實例的怪物上限：2 人 P=0 為 5', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    await party(a, b);
    world.tick();
    expect(a.mapMonster.getState().maxMonsters).toBe(5);
  });
});
