import { describe, it, expect, beforeEach } from 'vitest';
import { useMapMonsterStore, type MapMonster } from '../mapMonsterStore';
import type { MapData, Position } from '../../models/mapControl';

/** 70×40 全開放地圖（外圈牆），足以測到 50 格以上的脫離距離 */
const openMap: MapData = {
  id: 'open-map',
  name: 'Open Map',
  width: 70,
  height: 40,
  spawnPoint: { x: 5, y: 20 },
  tiles: Array.from({ length: 40 }, (_, y) =>
    Array.from({ length: 70 }, (_, x) =>
      x === 0 || y === 0 || x === 69 || y === 39 ? 1 : 0
    )
  ),
};

const playerPos: Position = { x: 5, y: 20 };

function makeMonster(id: string, x: number, y: number): MapMonster {
  return {
    id,
    position: { x, y },
    targetPosition: { ...playerPos },
    speed: 1,
    path: [{ x: x - 1, y }],
    pathIndex: 0,
    pathRecalcTimer: 0,
    moveTimer: 0,
    lastPathPlayerPos: { ...playerPos },
    isBoss: false,
  };
}

function setMonsters(monsters: MapMonster[], combatMonsterIds: string[] = []) {
  useMapMonsterStore.setState({
    monsters,
    maxMonsters: 10,
    spawnTimer: 0,
    paused: false,
    combatMonsterIds,
    hasBossInPool: false,
  });
}

function move() {
  useMapMonsterStore.getState().moveMonsters(1000, openMap, playerPos);
}

describe('追蹤距離與脫離距離（26-spawn-pressure.md § 26.8）', () => {
  beforeEach(() => {
    setMonsters([]);
  });

  it('15 格內：追蹤玩家並移動', () => {
    setMonsters([makeMonster('near', 15, 20)]); // 距離 10
    move();

    const [m] = useMapMonsterStore.getState().monsters;
    expect(m).toBeDefined();
    expect(m.position.x).toBeLessThan(15);
  });

  it('15~50 格：保留在地圖上但原地待機', () => {
    setMonsters([makeMonster('idle', 25, 20)]); // 距離 20
    move();

    const [m] = useMapMonsterStore.getState().monsters;
    expect(m).toBeDefined();
    expect(m.position).toEqual({ x: 25, y: 20 });
    expect(m.path).toEqual([]);
    expect(m.pathIndex).toBe(0);
  });

  it('待機中的怪物在玩家走近後恢復追蹤', () => {
    setMonsters([makeMonster('idle', 25, 20)]);
    move();
    expect(useMapMonsterStore.getState().monsters[0].position).toEqual({ x: 25, y: 20 });

    // 玩家移動到 12 格外
    useMapMonsterStore.getState().moveMonsters(1000, openMap, { x: 13, y: 20 });

    const [m] = useMapMonsterStore.getState().monsters;
    expect(m.position.x).toBeLessThan(25);
  });

  it('超過 50 格：從地圖移除', () => {
    setMonsters([makeMonster('far', 60, 20)]); // 距離 55
    move();

    expect(useMapMonsterStore.getState().monsters).toHaveLength(0);
  });

  it('戰鬥中的怪物不受距離規則影響', () => {
    setMonsters([makeMonster('fighting', 60, 20)], ['fighting']); // 距離 55
    move();

    const [m] = useMapMonsterStore.getState().monsters;
    expect(m).toBeDefined();
    expect(m.position).toEqual({ x: 60, y: 20 });
  });

  it('三段距離同時存在時各自套用對應行為', () => {
    setMonsters([
      makeMonster('near', 15, 20), // 10 → 追蹤
      makeMonster('idle', 45, 20), // 40 → 待機
      makeMonster('far', 60, 20), // 55 → 移除
    ]);
    move();

    const ids = useMapMonsterStore.getState().monsters.map(m => m.id);
    expect(ids).toEqual(['near', 'idle']);
  });
});
