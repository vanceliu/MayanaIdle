import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMapMonsterStore, BOSS_SPAWN_MIN_MINUTES } from '../mapMonsterStore';
import type { MapData, Position } from '../../models/mapControl';

const testMap: MapData = {
  id: 'test-map',
  name: 'Test Map',
  width: 10,
  height: 10,
  spawnPoint: { x: 5, y: 5 },
  tiles: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
};

const playerPos: Position = { x: 5, y: 5 };

function resetStore(hasBossInPool: boolean) {
  useMapMonsterStore.setState({
    monsters: [],
    maxMonsters: 3,
    spawnTimer: 0,
    paused: false,
    combatMonsterIds: [],
    hasBossInPool,
  });
}

/** 每次生成判定都命中：生成機率、數量、Boss 機率、生成格挑選一律取最小值 */
function forceSpawnRolls() {
  vi.spyOn(Math, 'random').mockReturnValue(0);
}

/** 觸發一次生成判定（間隔 1000ms，Pressure 0） */
function tick(elapsedMinutes: number) {
  useMapMonsterStore.getState().spawnTick(1000, testMap, playerPos, 0, elapsedMinutes);
}

describe('Boss 生成門檻（26-spawn-pressure.md § 26.4）', () => {
  beforeEach(() => {
    resetStore(true);
    forceSpawnRolls();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('門檻為 5 分鐘', () => {
    expect(BOSS_SPAWN_MIN_MINUTES).toBe(5);
  });

  it('停留未滿門檻時不生成 Boss', () => {
    tick(BOSS_SPAWN_MIN_MINUTES - 1);

    const monsters = useMapMonsterStore.getState().monsters;
    expect(monsters.length).toBeGreaterThan(0);
    expect(monsters.some(m => m.isBoss)).toBe(false);
  });

  it('停留達門檻且判定命中時生成 Boss', () => {
    tick(BOSS_SPAWN_MIN_MINUTES);

    expect(useMapMonsterStore.getState().monsters.filter(m => m.isBoss)).toHaveLength(1);
  });

  it('該區域無 Boss 怪物池時不生成 Boss', () => {
    resetStore(false);

    tick(BOSS_SPAWN_MIN_MINUTES);

    const monsters = useMapMonsterStore.getState().monsters;
    expect(monsters.length).toBeGreaterThan(0);
    expect(monsters.some(m => m.isBoss)).toBe(false);
  });

  it('地圖上同時最多 1 隻 Boss', () => {
    tick(BOSS_SPAWN_MIN_MINUTES);
    tick(BOSS_SPAWN_MIN_MINUTES);

    expect(useMapMonsterStore.getState().monsters.filter(m => m.isBoss)).toHaveLength(1);
  });
});
