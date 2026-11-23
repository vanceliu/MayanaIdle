import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dueTimedUniqueModes, hasRandomUnique, rollTimedUniqueSpawn, tickTimedUniqueSpawns, timedUniqueRoster,
} from '../uniqueSpawn';
import { getTimedUniqueSpawnChance, getBossSpawnChance } from '../globalRates';
import { crossedGameSlot, formatGameTime } from '../../models/gameClock';
import { getMonsterTemplates } from '../../models/monsterTemplates';
import { MONSTER_SEEDS } from '../../db/seed';
import { setRates, resetRates } from '../../core/rates';
import {
  BOSS_SPAWN_MIN_MINUTES, DESPAWN_DISTANCE, createMapMonsterStore, type MapMonster,
} from '../../stores/mapMonsterStore';
import { createMapControlStore } from '../../stores/mapControlStore';
import { createLoopState, type Session } from '../../stores/session';
import { attachInstance, createMapInstance, type MapInstance } from '../mapInstance';
import { createMonsterFromTemplate } from '../monsterSpawn';
import { moveMonstersSafe } from '../gameLoop';
import { OccupationManager } from '../occupationManager';
import type { MapData, Position } from '../../models/mapControl';

/** 遊戲時間（UTC+8）的某日 hh:mm:ss.ms 對應的 epoch ms */
function gameTime(h: number, m: number, s = 0, ms = 0): number {
  return Date.UTC(2026, 10, 23, h - 8, m, s, ms);
}

/** 40×40 全開放地圖（外圈牆） */
function openMap(size = 40): MapData {
  return {
    id: 'open', name: 'open', width: size, height: size, spawnPoint: { x: 1, y: 1 },
    tiles: Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => (x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 1 : 0))),
  };
}

function fakeSession(id: number, map: MapData | null, pos: Position): Session {
  const state = { character: { id, areaKills: 0, areaEnteredAt: 0, hp: 100 }, pressureMembers: 1 };
  const s = {
    loop: createLoopState(),
    game: { getState: () => state, setState: (patch: Partial<typeof state>) => { Object.assign(state, patch); } },
  } as unknown as Session;
  s.mapControl = createMapControlStore(s);
  s.mapMonster = createMapMonsterStore(s);
  s.mapControl.setState({ currentMap: map, playerPosition: pos });
  return s;
}

function instanceIn(areaId: string, members: Session[]): MapInstance {
  const inst = createMapInstance(`party:${areaId}`);
  for (const m of members) attachInstance(m, inst);
  inst.areaTemplates.push(...getMonsterTemplates(areaId));
  return inst;
}

function normalMonster(id: string, pos: Position, over: Partial<MapMonster> = {}): MapMonster {
  return {
    id, position: { ...pos }, targetPosition: { ...pos }, speed: 1, path: [], pathIndex: 0,
    pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { ...pos }, isBoss: false, ...over,
  };
}

function mockRolls(...values: number[]) {
  let i = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)]);
}

afterEach(() => {
  vi.restoreAllMocks();
  resetRates();
});

describe('定時判定時刻（26-spawn-pressure.md § 26.4.1，UTC+8）', () => {
  it('每 10 分鐘整：tick 跨過格界即判定，格界落在本 tick 時刻也算', () => {
    expect(dueTimedUniqueModes(gameTime(10, 9, 59, 900), gameTime(10, 10, 0, 200))).toEqual(['every10min']);
    expect(dueTimedUniqueModes(gameTime(10, 9, 59, 700), gameTime(10, 10, 0, 0))).toEqual(['every10min']);
    expect(formatGameTime(gameTime(10, 10))).toBe('10:10');
  });

  it('整點與半點：兩種出現方式同時判定；非半點的 10 分鐘格只判定 every10min', () => {
    expect(dueTimedUniqueModes(gameTime(10, 29, 59, 900), gameTime(10, 30, 0, 200))).toEqual(['every10min', 'halfHourGroup']);
    expect(dueTimedUniqueModes(gameTime(10, 59, 59, 900), gameTime(11, 0, 0, 200))).toEqual(['every10min', 'halfHourGroup']);
    expect(dueTimedUniqueModes(gameTime(10, 19, 59, 900), gameTime(10, 20, 0, 200))).toEqual(['every10min']);
  });

  it('UTC+8 換日（UTC 16:00）照常判定', () => {
    expect(dueTimedUniqueModes(gameTime(23, 59, 59, 900), gameTime(24, 0, 0, 200))).toEqual(['every10min', 'halfHourGroup']);
    expect(formatGameTime(gameTime(24, 0))).toBe('00:00');
  });

  it('格界正好是上一 tick 的時刻：本 tick 不重複判定', () => {
    expect(dueTimedUniqueModes(gameTime(10, 30, 0, 0), gameTime(10, 30, 0, 300))).toEqual([]);
  });

  it('300ms 連續 tick 跨過一個格界：每種出現方式各只判定一次', () => {
    const fired: string[] = [];
    let prev = gameTime(10, 29, 50);
    for (let now = prev + 300; now <= gameTime(10, 31); now += 300) {
      fired.push(...dueTimedUniqueModes(prev, now));
      prev = now;
    }
    expect(fired).toEqual(['every10min', 'halfHourGroup']);
  });

  it('格內不判定', () => {
    expect(dueTimedUniqueModes(gameTime(10, 11), gameTime(10, 19, 59, 999))).toEqual([]);
    expect(crossedGameSlot(gameTime(10, 31), gameTime(10, 59, 59), 30)).toBe(false);
  });
});

describe('定時判定機率：min(100%, 50% × 全域 Boss 生成倍率)', () => {
  const roster = timedUniqueRoster(getMonsterTemplates('ivory-tower-3f'), 'every10min');

  it('倍率 0 / 1 / 大於 2', () => {
    expect(getTimedUniqueSpawnChance(0)).toBe(0);
    expect(getTimedUniqueSpawnChance(1)).toBe(0.5);
    expect(getTimedUniqueSpawnChance(10)).toBe(1);
  });

  it('倍率 0：亂數最小也不生成', () => {
    mockRolls(0);
    expect(rollTimedUniqueSpawn(roster, 'every10min', 0)).toEqual([]);
  });

  it('倍率 1：亂數 < 0.5 生成、≥ 0.5 不生成', () => {
    mockRolls(0.4999, 0);
    expect(rollTimedUniqueSpawn(roster, 'every10min', 1)).toHaveLength(1);
    mockRolls(0.5);
    expect(rollTimedUniqueSpawn(roster, 'every10min', 1)).toEqual([]);
  });

  it('倍率很大：一定生成', () => {
    mockRolls(0.9999, 0);
    expect(rollTimedUniqueSpawn(roster, 'every10min', 10)).toHaveLength(1);
  });

  it('未給倍率時讀 server 設定的全域倍率', () => {
    setRates({ bossSpawn: 0 });
    mockRolls(0);
    expect(rollTimedUniqueSpawn(roster, 'every10min')).toEqual([]);
  });
});

describe('名單與抽選', () => {
  it('every10min：命中後從名單均等抽 1 隻', () => {
    const roster = timedUniqueRoster(getMonsterTemplates('ivory-tower-3f'), 'every10min');
    expect(roster.map(t => t.name)).toEqual(['霜甲隊長', '象牙魔導長']);
    mockRolls(0, 0.2);
    expect(rollTimedUniqueSpawn(roster, 'every10min', 1)).toEqual([roster[0].id]);
    mockRolls(0, 0.7);
    expect(rollTimedUniqueSpawn(roster, 'every10min', 1)).toEqual([roster[1].id]);
  });

  it('halfHourGroup：命中後名單全部', () => {
    const roster = timedUniqueRoster(getMonsterTemplates('dragon-valley-4f'), 'halfHourGroup');
    expect(roster.map(t => t.name)).toEqual(['大莫蜘蛛女王', '骷髏神射將', '骷髏親衛隊長']);
    mockRolls(0);
    expect(rollTimedUniqueSpawn(roster, 'halfHourGroup', 1)).toEqual(roster.map(t => t.id));
  });

  it('名單為空不擲亂數', () => {
    const spy = mockRolls(0);
    expect(rollTimedUniqueSpawn([], 'every10min', 1)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('seed：random 地圖沒有定時名單、定時地圖沒有 random 獨特魔物與 Boss', () => {
    const areas = new Set(MONSTER_SEEDS.filter(t => t.isUnique).map(t => t.area));
    for (const area of areas) {
      const templates = getMonsterTemplates(area);
      const timed = templates.filter(t => t.isUnique && t.spawnMode !== 'random');
      expect(templates.some(t => t.isBoss)).toBe(false);
      expect(hasRandomUnique(templates) && timed.length > 0).toBe(false);
    }
    expect(hasRandomUnique(getMonsterTemplates('dawn-plains'))).toBe(false);
    expect(hasRandomUnique(getMonsterTemplates('dragon-valley-1f'))).toBe(true);
  });
});

describe('tickTimedUniqueSpawns：隊伍實例逐一判定', () => {
  const map = openMap();
  const at = gameTime(10, 30, 0, 100);
  const before = gameTime(10, 29, 59, 800);

  it('halfHourGroup 判定命中：名單全部出現，與每位在場成員距離 ≥ 5 格', () => {
    const a = fakeSession(1, map, { x: 10, y: 10 });
    const b = fakeSession(2, map, { x: 30, y: 30 });
    const inst = instanceIn('dragon-valley-3f', [a, b]);
    mockRolls(0.2, 0.25, 0.5, 0.75);
    tickTimedUniqueSpawns([inst], before, at);
    const monsters = inst.mapMonster.getState().monsters;
    expect(monsters).toHaveLength(3);
    const roster = timedUniqueRoster(inst.areaTemplates, 'halfHourGroup');
    expect(monsters.map(m => m.timedUnique?.templateId)).toEqual(roster.map(t => t.id));
    for (const m of monsters) {
      expect(m.isUnique).toBe(true);
      expect(m.isBoss).toBe(false);
      for (const p of [{ x: 10, y: 10 }, { x: 30, y: 30 }]) {
        expect(Math.hypot(m.position.x - p.x, m.position.y - p.y)).toBeGreaterThanOrEqual(5);
      }
    }
    expect(new Set(monsters.map(m => `${m.position.x},${m.position.y}`)).size).toBe(3);
  });

  it('every10min 判定命中：只出現 1 隻，模板指定且建得出實例', () => {
    const inst = instanceIn('ivory-tower-3f', [fakeSession(1, map, { x: 10, y: 10 })]);
    mockRolls(0.1);
    tickTimedUniqueSpawns([inst], before, at);
    const monsters = inst.mapMonster.getState().monsters;
    expect(monsters).toHaveLength(1);
    const created = createMonsterFromTemplate(monsters[0], inst.areaTemplates);
    expect(created?.name).toBe('霜甲隊長');
    expect(created?.isUnique).toBe(true);
  });

  it('不受怪物上限與 1 隻 Boss 限制、也不被「場上還有怪」擋下', () => {
    const inst = instanceIn('dragon-valley-3f', [fakeSession(1, map, { x: 10, y: 10 })]);
    const full = Array.from({ length: 10 }, (_, i) => normalMonster(`n${i}`, { x: 20 + i, y: 30 }, i === 0 ? { isBoss: true } : {}));
    inst.mapMonster.setState({ monsters: full, maxMonsters: 10, hasBossInPool: true });
    mockRolls(0, 0.1, 0.2, 0.3);
    tickTimedUniqueSpawns([inst], before, at);
    expect(inst.mapMonster.getState().monsters.filter(m => m.timedUnique)).toHaveLength(3);
    expect(inst.mapMonster.getState().monsters).toHaveLength(13);
  });

  it('實例沒有在場成員：不判定', () => {
    const inst = instanceIn('ivory-tower-3f', [fakeSession(1, null, { x: 10, y: 10 })]);
    const spy = mockRolls(0);
    tickTimedUniqueSpawns([inst], before, at);
    expect(inst.mapMonster.getState().monsters).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('沒有定時名單的地圖：不擲亂數、不生成', () => {
    const insts = ['dawn-plains', 'dragon-valley-1f'].map(area => instanceIn(area, [fakeSession(1, map, { x: 10, y: 10 })]));
    const spy = mockRolls(0);
    tickTimedUniqueSpawns(insts, before, at);
    for (const i of insts) expect(i.mapMonster.getState().monsters).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('沒跨過判定時刻：不判定', () => {
    const inst = instanceIn('ivory-tower-3f', [fakeSession(1, map, { x: 10, y: 10 })]);
    mockRolls(0);
    tickTimedUniqueSpawns([inst], at, at + 300);
    expect(inst.mapMonster.getState().monsters).toHaveLength(0);
  });

  it('判定未命中：不生成', () => {
    const inst = instanceIn('ivory-tower-3f', [fakeSession(1, map, { x: 10, y: 10 })]);
    mockRolls(0.5);
    tickTimedUniqueSpawns([inst], before, at);
    expect(inst.mapMonster.getState().monsters).toHaveLength(0);
  });

  it('單一實例出錯交給 onFault，其他實例照常', () => {
    const bad = instanceIn('ivory-tower-3f', [fakeSession(1, map, { x: 10, y: 10 })]);
    bad.mapMonster.setState({ spawnTimedUniques: () => { throw new Error('boom'); } });
    const good = instanceIn('ivory-tower-4f', [fakeSession(2, map, { x: 10, y: 10 })]);
    mockRolls(0);
    const faults: MapInstance[] = [];
    tickTimedUniqueSpawns([bad, good], before, at, i => faults.push(i));
    expect(faults).toEqual([bad]);
    expect(good.mapMonster.getState().monsters).toHaveLength(1);
  });
});

describe('定時獨特魔物與波次、脫離距離', () => {
  const map = openMap(70);
  const player: Position = { x: 5, y: 20 };

  it('場上只剩定時獨特魔物時照常生下一波，且不計入一波隻數', () => {
    const store = createMapMonsterStore();
    store.setState({ monsters: [normalMonster('u', { x: 30, y: 20 }, { isUnique: true, timedUnique: { templateId: 230 } })], maxMonsters: 3 });
    mockRolls(0);
    store.getState().spawnTick(openMap(), { x: 10, y: 10 }, 0, 0);
    expect(store.getState().monsters.filter(m => !m.timedUnique)).toHaveLength(1);
  });

  it('不受 > 50 格脫離移除；一般怪照常移除', () => {
    const store = createMapMonsterStore();
    store.setState({
      monsters: [
        normalMonster('far-normal', { x: 60, y: 20 }),
        normalMonster('far-unique', { x: 60, y: 21 }, { isUnique: true, timedUnique: { templateId: 230 } }),
      ],
    });
    expect(60 - player.x).toBeGreaterThan(DESPAWN_DISTANCE);
    moveMonstersSafe(300, map, () => player, store.getState(), new OccupationManager());
    expect(store.getState().monsters.map(m => m.id)).toEqual(['far-unique']);

    store.getState().moveMonsters(300, map, player);
    expect(store.getState().monsters.map(m => m.id)).toEqual(['far-unique']);
  });
});

describe('random 獨特魔物佔 Boss 名額（§ 26.4）', () => {
  const map = openMap();
  const player: Position = { x: 10, y: 10 };
  let store: ReturnType<typeof createMapMonsterStore>;

  beforeEach(() => {
    store = createMapMonsterStore();
    store.setState({ monsters: [], maxMonsters: 10, hasBossInPool: false, hasRandomUniqueInPool: true });
  });

  const uniques = () => store.getState().monsters.filter(m => m.isUnique);

  it('停留未滿 5 分鐘不生成', () => {
    mockRolls(0);
    store.getState().spawnTick(map, player, 5, BOSS_SPAWN_MIN_MINUTES - 0.01);
    expect(store.getState().monsters.length).toBeGreaterThan(1);
    expect(uniques()).toHaveLength(0);
  });

  it('滿 5 分鐘：機率 10%，同時最多 1 隻，不是 Boss 也不是定時', () => {
    mockRolls(0);
    store.getState().spawnTick(map, player, 5, BOSS_SPAWN_MIN_MINUTES);
    expect(store.getState().monsters.length).toBeGreaterThan(1);
    expect(uniques()).toHaveLength(1);
    expect(uniques()[0].isBoss).toBe(false);
    expect(uniques()[0].timedUnique).toBeUndefined();
    expect(store.getState().monsters.some(m => m.isBoss)).toBe(false);
  });

  it('機率邊界：亂數 < 10% 命中、= 10% 不命中', () => {
    expect(getBossSpawnChance(1)).toBe(0.1);
    mockRolls(0.5, 0.0999, 0);
    store.getState().spawnTick(map, player, 0, BOSS_SPAWN_MIN_MINUTES);
    expect(uniques()).toHaveLength(1);

    store.setState({ monsters: [] });
    mockRolls(0.5, 0.1, 0);
    store.getState().spawnTick(map, player, 0, BOSS_SPAWN_MIN_MINUTES);
    expect(uniques()).toHaveLength(0);
  });

  it('全域 Boss 生成倍率 0：不生成', () => {
    setRates({ bossSpawn: 0 });
    mockRolls(0);
    store.getState().spawnTick(map, player, 5, 60);
    expect(uniques()).toHaveLength(0);
  });

  it('場上的定時獨特魔物不佔 random 名額', () => {
    store.setState({ monsters: [normalMonster('t', { x: 30, y: 30 }, { isUnique: true, timedUnique: { templateId: 230 } })] });
    mockRolls(0);
    store.getState().spawnTick(map, player, 0, BOSS_SPAWN_MIN_MINUTES);
    expect(uniques().filter(m => !m.timedUnique)).toHaveLength(1);
  });

  it('建實例時只從 random 獨特魔物抽', () => {
    const templates = getMonsterTemplates('dragon-valley-1f');
    mockRolls(0);
    store.getState().spawnTick(map, player, 0, BOSS_SPAWN_MIN_MINUTES);
    const created = createMonsterFromTemplate(uniques()[0], templates);
    expect(created?.name).toBe('骷髏軍團長');
    expect(created?.isUnique).toBe(true);
  });

  it('區域同時有 Boss 池：維持 Boss 行為', () => {
    store.setState({ hasBossInPool: true });
    mockRolls(0);
    store.getState().spawnTick(map, player, 5, BOSS_SPAWN_MIN_MINUTES);
    expect(store.getState().monsters.filter(m => m.isBoss)).toHaveLength(1);
    expect(uniques()).toHaveLength(0);
  });
});

describe('沒有獨特魔物的區域維持原行為', () => {
  it('無 Boss、無 random 獨特魔物：不多擲亂數，一波只有一般怪', () => {
    const store = createMapMonsterStore();
    store.setState({ monsters: [], maxMonsters: 10, hasBossInPool: false, hasRandomUniqueInPool: false });
    const spy = mockRolls(0);
    store.getState().spawnTick(openMap(), { x: 10, y: 10 }, 2, 60);
    const monsters = store.getState().monsters;
    expect(monsters).toHaveLength(3);
    // 擲隻數 1 次 ＋ 每隻選生成格 1 次
    expect(spy).toHaveBeenCalledTimes(1 + monsters.length);
    for (const m of monsters) {
      expect(m.isBoss).toBe(false);
      expect('isUnique' in m).toBe(false);
      expect('timedUnique' in m).toBe(false);
    }
  });

  it('有 Boss 池：每隻多擲 1 次 Boss 判定，與以前相同', () => {
    const store = createMapMonsterStore();
    store.setState({ monsters: [], maxMonsters: 10, hasBossInPool: true, hasRandomUniqueInPool: false });
    const spy = mockRolls(0.5);
    store.getState().spawnTick(openMap(), { x: 10, y: 10 }, 2, 60);
    const monsters = store.getState().monsters;
    expect(monsters).toHaveLength(4);
    expect(spy).toHaveBeenCalledTimes(1 + monsters.length * 2);
    expect(monsters.some(m => m.isBoss || m.isUnique)).toBe(false);
  });
});
