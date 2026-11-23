import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';

/** `26-spawn-pressure.md` § 26.4.1：server 每 tick 以 wall clock 判定定時出現的獨特魔物 */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never;

/** 遊戲時間（UTC+8）hh:mm:ss.ms 的 epoch ms */
function gameTime(h: number, m: number, s = 0, ms = 0): number {
  return Date.UTC(2026, 10, 23, h - 8, m, s, ms);
}

/** 第一次回 `first`（判定擲骰），之後依序散開，生成格不會重複 */
function mockRollsFrom(first: number) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => (i++ === 0 ? first : (i * 0.137) % 1));
}

describe('World.tick：定時獨特魔物', () => {
  let world: World;
  let repo: SqliteRepository;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    world = new World();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function enter(userId: number, name: string, region: string, floor: number | null): Promise<PlayerSession> {
    const s = createPlayerSession(repo, '127.0.0.1', () => {});
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId });
    world.sessions.add(s);
    await s.game.getState().createCharacter(name, 'knight', ATTRS);
    const ch = s.game.getState().character!;
    s.game.setState({ character: { ...ch, currentRegion: region, currentArea: region, currentFloor: floor, level: 50, hp: 5000, mp: 5000 } });
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  }

  const timed = (s: PlayerSession) => s.mapMonster.getState().monsters.filter(m => m.timedUnique);

  it('跨過整點半點：halfHourGroup 地圖的實例名單全部出現；同一格界不重複', async () => {
    const s = await enter(1, 'Alice', 'dragon-valley', 3);
    world.tick(gameTime(10, 29, 59, 900));
    expect(timed(s)).toHaveLength(0);
    mockRollsFrom(0);
    world.tick(gameTime(10, 30, 0, 200));
    const spawned = timed(s).map(m => m.timedUnique!.templateId);
    expect(spawned).toEqual([252, 254, 256]);
    world.tick(gameTime(10, 30, 0, 500));
    expect(timed(s)).toHaveLength(3);
  });

  it('第一個 tick 只記下時刻，不判定', async () => {
    const s = await enter(1, 'Alice', 'ivory-tower', 3);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    world.tick(gameTime(10, 10));
    expect(timed(s)).toHaveLength(0);
    world.tick(gameTime(10, 10, 0, 300));
    expect(timed(s)).toHaveLength(0);
    mockRollsFrom(0.3);
    world.tick(gameTime(10, 20, 0, 100));
    expect(timed(s)).toHaveLength(1);
  });

  it('全域 Boss 生成倍率 0：不生成', async () => {
    const { setRates, resetRates } = await import('../../../client/src/core/rates');
    setRates({ bossSpawn: 0 });
    try {
      const s = await enter(1, 'Alice', 'ancient-dungeon', 1);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      world.tick(gameTime(10, 9, 59, 900));
      world.tick(gameTime(10, 10, 0, 200));
      expect(timed(s)).toHaveLength(0);
    } finally {
      resetRates();
    }
  });

  it('實例銷毀（在場人數歸零）時一併消失', async () => {
    const s = await enter(1, 'Alice', 'ivory-tower', 4);
    world.tick(gameTime(10, 9, 59, 900));
    mockRollsFrom(0.3);
    world.tick(gameTime(10, 10, 0, 200));
    const inst = s.instance;
    expect(timed(s)).toHaveLength(1);
    world.onCharacterLeave(s);
    expect(inst.mapMonster.getState().monsters).toHaveLength(0);
  });
});
