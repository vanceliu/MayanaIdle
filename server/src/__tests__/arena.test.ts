import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { SqliteArenaRecords, MemoryArenaRecords, type ArenaRecordStorage } from '../db/arenaRecords';
import { ArenaRegistry } from '../arena';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import { leaveArenaRun } from '../../../client/src/systems/arenaRun';
import { ARENA_REGION_ID, arenaGoldCost, arenaSlotStart, getArenaTier, arenaMaterialIds } from '../../../client/src/models/arena';
import { addBagItem, getBagItemAmount } from '../../../client/src/models/bagItem';
import type { ArenaExitRecord } from '../../../client/src/systems/arenaRun';
import type { DatabaseSync } from 'node:sqlite';

/** 競技場進場與作廢（`55-arena.md` § 55.1／§ 55.4／§ 55.6） */
const NOW = new Date(2026, 10, 13, 10, 30).getTime();
const T5_MATERIALS = arenaMaterialIds(getArenaTier(5)!);

let repo: SqliteRepository;
let db: DatabaseSync;

async function player(name: string, level = 55): Promise<PlayerSession> {
  const s = createPlayerSession(repo, '127.0.0.1', () => {});
  s.game.setState({ userId: 1 });
  await s.game.getState().createCharacter(name, 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
  const ch = s.game.getState().character!;
  s.game.setState({
    character: { ...ch, level, gold: 1_000_000, currentRegion: 'elsarth-town', currentArea: 'elsarth-town', currentFloor: null },
    bagItems: addBagItem(addBagItem([], T5_MATERIALS[0], 3), T5_MATERIALS[1], 4),
  });
  return s;
}

const gs = (s: PlayerSession) => s.game.getState();

describe('ArenaRegistry 進場', () => {
  let registry: ArenaRegistry;
  let exits: ArenaExitRecord[];

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    exits = [];
    registry = new ArenaRegistry(r => exits.push(r));
  });

  it('T7 未開放', async () => {
    const a = await player('A', 80);
    expect(registry.enter([a], a, 7, NOW)).toEqual({ ok: false, message: 'T7 競技場尚未開放' });
  });

  it('等級未達或不在城鎮不能進場', async () => {
    const a = await player('A', 49);
    expect(registry.enter([a], a, 5, NOW).message).toBe('A 未達 Lv.50');
    const b = await player('B');
    b.game.setState({ character: { ...gs(b).character!, currentRegion: 'dawn-plains' } });
    expect(registry.enter([b], b, 5, NOW).message).toBe('B 不在城鎮');
  });

  it('票券場：扣金幣與 5 個材料、記時段、傳送進場', async () => {
    const a = await player('A');
    expect(registry.enter([a], a, 5, NOW)).toEqual({ ok: true });
    expect(gs(a).character!.gold).toBe(1_000_000 - arenaGoldCost(5));
    expect(getBagItemAmount(gs(a).bagItems, T5_MATERIALS[0]) + getBagItemAmount(gs(a).bagItems, T5_MATERIALS[1])).toBe(2);
    expect(gs(a).arenaRun).toMatchObject({ tier: 5, ticketRun: true, returnRegion: 'elsarth-town', slotStart: arenaSlotStart(NOW) });
    expect(gs(a).arenaSlots).toEqual({ slotStart: arenaSlotStart(NOW), tiers: [5] });
    expect(gs(a).character!.currentRegion).toBe(ARENA_REGION_ID);
  });

  it('同時段第二次進場不收費、不給票券', async () => {
    const a = await player('A');
    registry.enter([a], a, 5, NOW);
    a.game.setState({ arenaRun: null, character: { ...gs(a).character!, currentRegion: 'elsarth-town' } });
    const gold = gs(a).character!.gold;
    expect(registry.enter([a], a, 5, NOW + 60_000).ok).toBe(true);
    expect(gs(a).character!.gold).toBe(gold);
    expect(gs(a).arenaRun!.ticketRun).toBe(false);
  });

  it('材料不足不進場、不扣費', async () => {
    const a = await player('A');
    a.game.setState({ bagItems: addBagItem([], T5_MATERIALS[0], 4) });
    expect(registry.enter([a], a, 5, NOW).message).toBe('入場材料不足');
    expect(gs(a).character!.gold).toBe(1_000_000);
    expect(gs(a).arenaRun).toBeNull();
  });

  it('組隊：隊長付一次費用，全員同一場次', async () => {
    const a = await player('A');
    const b = await player('B');
    expect(registry.enter([a, b], a, 5, NOW).ok).toBe(true);
    expect(gs(a).character!.gold).toBe(1_000_000 - arenaGoldCost(5));
    expect(gs(b).character!.gold).toBe(1_000_000);
    expect(gs(b).arenaRun!.runKey).toBe(gs(a).arenaRun!.runKey);
    expect(gs(b).arenaRun!.ticketRun).toBe(true);
  });

  it('隊員等級未達則全隊不能進場', async () => {
    const a = await player('A');
    const b = await player('B', 40);
    expect(registry.enter([a, b], a, 5, NOW).message).toBe('B 未達 Lv.50');
    expect(gs(a).arenaRun).toBeNull();
  });

  it('server 重啟後場次作廢：退還時段、回城', async () => {
    const a = await player('A');
    registry.enter([a], a, 5, NOW);
    const restarted = new ArenaRegistry(() => {});
    expect(restarted.attach(a, null)).toBe(false);
    expect(gs(a).arenaRun).toBeNull();
    expect(gs(a).arenaSlots.tiers).toEqual([]);
    expect(gs(a).character!.currentRegion).toBe('elsarth-town');
  });

  it('場次存在時掛上實例', async () => {
    const a = await player('A');
    registry.enter([a], a, 5, NOW);
    const instance = {} as never as { arena?: unknown };
    expect(registry.attach(a, instance as never)).toBe(true);
    expect((instance.arena as { runKey: string }).runKey).toBe(gs(a).arenaRun!.runKey);
  });
});

function record(characterId: number, wave: number, timeMs: number, over: Partial<ArenaExitRecord> = {}): ArenaExitRecord {
  return { characterId, name: `P${characterId}`, className: 'knight', tier: 5, party: false, wave, timeMs, reason: 'death', ...over };
}

describe.each<[string, () => ArenaRecordStorage]>([
  ['Memory', () => new MemoryArenaRecords()],
  ['Sqlite', () => { const d = openDatabase(':memory:'); migrate(d); return new SqliteArenaRecords(d); }],
])('競技場排行榜（%s，§ 55.7）', (_, make) => {
  it('每人只留最佳；波次高者在前、同波次時間短者在前', async () => {
    const store = make();
    await store.save(record(1, 30, 900_000), 1);
    await store.save(record(1, 20, 100_000), 2);
    await store.save(record(2, 30, 800_000), 3);
    await store.save(record(3, 45, 2_000_000), 4);
    expect(store.top({ tier: 5, party: false }, 50).map(r => [r.name, r.wave])).toEqual([['P3', 45], ['P2', 30], ['P1', 30]]);
  });

  it('依段位、單人／組隊、職業分榜', async () => {
    const store = make();
    await store.save(record(1, 10, 1), 1);
    await store.save(record(2, 10, 1, { party: true }), 1);
    await store.save(record(3, 10, 1, { tier: 6 }), 1);
    await store.save(record(4, 10, 1, { className: 'elf' }), 1);
    expect(store.top({ tier: 5, party: false }, 50).map(r => r.name)).toEqual(['P1', 'P4']);
    expect(store.top({ tier: 5, party: true }, 50).map(r => r.name)).toEqual(['P2']);
    expect(store.top({ tier: 5, party: false, className: 'elf' }, 50).map(r => r.name)).toEqual(['P4']);
  });
});

describe('刪除角色', () => {
  it('一併刪除競技場紀錄', async () => {
    const d = openDatabase(':memory:');
    migrate(d);
    const store = new SqliteArenaRecords(d);
    await store.save(record(7, 10, 1), 1);
    await new SqliteRepository(d).deleteCharacter(7);
    expect(store.top({ tier: 5, party: false }, 50)).toEqual([]);
  });
});

describe('World：離開競技場', () => {
  const TOWN_SCROLL = 4;

  async function inWorld(world: World): Promise<PlayerSession> {
    const s = await player('A');
    s.world = world;
    s.userId = 1;
    world.sessions.add(s);
    s.game.setState({
      character: { ...gs(s).character!, currentRegion: 'neutral-town', currentArea: 'neutral-town' },
      bagItems: addBagItem(gs(s).bagItems, TOWN_SCROLL, 2),
    });
    await syncWorld(s);
    world.onCharacterEnter(s);
    expect(world.handleArenaAction(s, 'enter', [5]).result.ok).toBe(true);
    await syncWorld(s);
    expect(s.instance?.arena).toBeDefined();
    return s;
  }

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
  });

  it('回城卷軸撤退：城鎮實例不帶競技場場次與怪物', async () => {
    const world = new World();
    const s = await inWorld(world);
    const arenaInstance = s.instance!;
    gs(s).useTownScroll(TOWN_SCROLL);
    await syncWorld(s);
    expect(gs(s).character!.currentRegion).toBe('neutral-town');
    expect(s.instance).not.toBe(arenaInstance);
    expect(s.instance?.arena).toBeUndefined();
    expect(s.instance?.mapMonster.getState().monsters).toEqual([]);
  });

  it('死亡回城：城鎮實例不帶競技場場次', async () => {
    const world = new World();
    const s = await inWorld(world);
    leaveArenaRun(s, 'death');
    await syncWorld(s);
    expect(gs(s).character!.currentRegion).toBe('neutral-town');
    expect(s.instance?.arena).toBeUndefined();
  });
});

describe('World：組隊在競技場', () => {
  let world: World;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    world = new World();
  });

  async function join(name: string, userId: number): Promise<PlayerSession> {
    const s = await player(name);
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId, character: { ...gs(s).character!, userId, currentRegion: 'neutral-town', currentArea: 'neutral-town' } });
    world.sessions.add(s);
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  }

  async function partyInArena(): Promise<[PlayerSession, PlayerSession]> {
    const a = await join('A', 1);
    const b = await join('B', 2);
    await world.handlePartyAction(a, 'invite', [gs(b).character!.id]);
    await world.handlePartyAction(b, 'accept', [b.party.getState().invites[0].id]);
    expect(world.handleArenaAction(a, 'enter', [5]).result.ok).toBe(true);
    await syncWorld(a);
    await syncWorld(b);
    expect(a.instance).toBe(b.instance);
    return [a, b];
  }

  it('場內退隊：仍留在同一場的實例', async () => {
    const [a, b] = await partyInArena();
    const arena = a.instance!;
    await world.handlePartyAction(b, 'leave', []);
    expect(b.instance).toBe(arena);
    expect(arena.members).toContain(b);
  });

  it('場內被踢且隊友已離線：放回帶著同一場次的新實例', async () => {
    const [a, b] = await partyInArena();
    const runKey = a.instance!.arena!.runKey;
    world.onCharacterLeave(a);
    await world.handlePartyAction(b, 'leave', []);
    expect(b.instance?.members).toContain(b);
    expect(b.instance?.arena?.runKey).toBe(runKey);
  });

  it('在場的人全部離場：清掉斷線未回的隊員，上線時回城、不歸還次數', async () => {
    const records: ArenaExitRecord[] = [];
    world.onArenaExit = r => records.push(r);
    const [a, b] = await partyInArena();
    const runKey = gs(b).arenaRun!.runKey;
    world.onCharacterLeave(b);
    world.sessions.delete(b);

    leaveArenaRun(a, 'retreat');
    expect(records.map(r => [r.name, r.reason])).toEqual([['A', 'retreat'], ['B', 'abandon']]);

    world.sessions.add(b);
    b.loadedWorldKey = null;
    await syncWorld(b);
    await syncWorld(b);
    expect(gs(b).arenaRun).toBeNull();
    expect(gs(b).character!.currentRegion).toBe('neutral-town');
    expect(gs(b).arenaSlots.tiers).toEqual([5]);
    expect(b.instance?.arena?.runKey).not.toBe(runKey);
  });

  it('還有隊員在場時離場不清理；最後一位離場才清掉斷線的隊員', async () => {
    const records: ArenaExitRecord[] = [];
    world.onArenaExit = r => records.push(r);
    const a = await join('A', 1);
    const b = await join('B', 2);
    const c = await join('C', 3);
    for (const m of [b, c]) {
      await world.handlePartyAction(a, 'invite', [gs(m).character!.id]);
      await world.handlePartyAction(m, 'accept', [m.party.getState().invites[0].id]);
    }
    expect(world.handleArenaAction(a, 'enter', [5]).result.ok).toBe(true);
    for (const m of [a, b, c]) await syncWorld(m);
    world.onCharacterLeave(b);
    world.sessions.delete(b);

    leaveArenaRun(a, 'retreat');
    expect(records.map(r => r.name)).toEqual(['A']);
    leaveArenaRun(c, 'retreat');
    expect(records.map(r => [r.name, r.reason])).toEqual([['A', 'retreat'], ['C', 'retreat'], ['B', 'abandon']]);
  });

  it('場內顯示隊友；同圖名單只列同一場的人', async () => {
    const [a, b] = await partyInArena();
    const c = await join('C', 3);
    expect(world.handleArenaAction(c, 'enter', [5]).result.ok).toBe(true);
    await syncWorld(c);
    world.syncPartyViews([a, b, c]);
    expect(a.party.getState().teammates.map(t => t.name)).toEqual(['B']);
    expect(a.party.getState().onMap.map(p => p.name)).toEqual(['B']);
    expect(c.party.getState().onMap).toEqual([]);
  });
});

describe('ArenaRegistry 清理', () => {
  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
  });

  it('不在競技場卻帶著場次：場次已不存在時清掉並歸還時段次數', async () => {
    const a = await player('A');
    new ArenaRegistry(() => {}).enter([a], a, 5, NOW);
    a.game.setState({ character: { ...gs(a).character!, currentRegion: 'elsarth-town' } });
    new ArenaRegistry(() => {}).clearStale(a);
    expect(gs(a).arenaRun).toBeNull();
    expect(gs(a).arenaSlots.tiers).toEqual([]);
    a.game.setState({ bagItems: addBagItem(gs(a).bagItems, T5_MATERIALS[0], 5) });
    expect(new ArenaRegistry(() => {}).enter([a], a, 5, NOW).ok).toBe(true);
  });

  it('刪除角色：從場次移除，沒人的場次丟掉', async () => {
    const a = await player('A');
    const registry = new ArenaRegistry(() => {});
    registry.enter([a], a, 5, NOW);
    registry.forgetCharacter(gs(a).character!.id!);
    expect(registry.attach(a, null)).toBe(false);
  });
});
