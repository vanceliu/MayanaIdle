import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { calculatePressure } from '../../systems/pressure';
import { tickInstanceWorld } from '../../systems/gameLoop';
import { createMapInstance, type MapInstance } from '../../systems/mapInstance';
import type { Session } from '../../stores/session';
import type { MapData } from '../../models/mapControl';

/** 一位在場成員（角色 id 1）的實例，怪物 store 沿用 `useMapMonsterStore` */
function instanceWithMember(): MapInstance {
  const instance = createMapInstance('test', useMapMonsterStore);
  const member = {
    game: { getState: () => ({ character: { id: 1, hp: 100 } }) },
    mapControl: useMapControlStore,
  } as unknown as Session;
  instance.members.push(member);
  return instance;
}

const testMap: MapData = {
  id: 'test-map',
  name: 'Test Map',
  width: 20,
  height: 15,
  spawnPoint: { x: 10, y: 7 },
  tiles: [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
};

function seedOneMonster() {
  useMapMonsterStore.setState({
    monsters: [
      { id: 'seed', position: { x: 12, y: 12 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false },
    ],
  });
}

describe('Map Control Phase 3 - Pressure Integration', () => {
  beforeEach(() => {
    useMapMonsterStore.setState({
      monsters: [],
      maxMonsters: 3,
      combatMonsterIds: [],
      hasBossInPool: false,
    });
    useMapControlStore.setState({
      currentMap: testMap,
      playerPosition: { x: 5, y: 5 },
      targetPosition: null,
      currentPath: [],
      pathIndex: 0,
      isMoving: false,
      autoMove: false,
    });
  });

  describe('Pressure affects monster cap', () => {
    it('maxMonsters = 3 + pressure', () => {
      const { pressure: p0 } = calculatePressure(0);
      expect(p0).toBe(0);
      expect(3 + p0).toBe(3);

      const { pressure: p1 } = calculatePressure(640);
      expect(p1).toBe(1);
      expect(3 + p1).toBe(4);

      const { pressure: p3 } = calculatePressure(960);
      expect(p3).toBe(3);
      expect(3 + p3).toBe(6);
    });

    it('setMaxMonsters updates the store', () => {
      useMapMonsterStore.getState().setMaxMonsters(5);
      expect(useMapMonsterStore.getState().maxMonsters).toBe(5);
    });

    it('場上還有怪就不生（沒有平時補位）', () => {
      // Manually add a monster to reach the cap
      useMapMonsterStore.setState({
        maxMonsters: 1,
        monsters: [
          { id: 'm1', position: { x: 8, y: 8 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false },
        ],
      });

      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0);
      expect(useMapMonsterStore.getState().monsters.length).toBe(1);

      vi.restoreAllMocks();
    });
  });

  describe('一波的隻數＝停留時間分布 ＋ Pressure（§ 26.2）', () => {
    /** 第一個 random 是 rollSpawnCount，其餘給找位置用 */
    function mockRolls(first: number) {
      vi.spyOn(Math, 'random').mockReturnValueOnce(first).mockReturnValue(0.5);
    }

    it('Pressure 0、剛進區：80% 是 1 隻', () => {
      mockRolls(0.5);
      useMapMonsterStore.setState({ monsters: [], maxMonsters: 3 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0, 0);

      expect(useMapMonsterStore.getState().monsters.length).toBe(1);
      vi.restoreAllMocks();
    });

    it('同一張表在停留 20 分鐘後擲得出 3 隻', () => {
      mockRolls(0.9);
      useMapMonsterStore.setState({ monsters: [], maxMonsters: 3 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0, 25);

      expect(useMapMonsterStore.getState().monsters.length).toBe(3);
      vi.restoreAllMocks();
    });

    it('Pressure 直接加在擲出的隻數上', () => {
      mockRolls(0.5); // 剛進區 → 1 隻
      useMapMonsterStore.setState({ monsters: [], maxMonsters: 6 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 3, 0);

      expect(useMapMonsterStore.getState().monsters.length).toBe(4);
      vi.restoreAllMocks();
    });

    it('加完仍夾在上限內', () => {
      mockRolls(0.99); // 3 隻
      useMapMonsterStore.setState({ monsters: [], maxMonsters: 4 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 3, 25);

      expect(useMapMonsterStore.getState().monsters.length).toBe(4);
      vi.restoreAllMocks();
    });

    it('打到剩一隻也不會被補位 —— 要清空才有下一波', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      useMapMonsterStore.setState({ maxMonsters: 6 });
      seedOneMonster();

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0);
      expect(useMapMonsterStore.getState().monsters.length).toBe(1);
      vi.restoreAllMocks();
    });
  });

  describe('下一波（§ 26.1）', () => {
    it('場上清空就立刻出下一波，不等任何間隔', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      useMapMonsterStore.setState({ monsters: [], maxMonsters: 3 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0);

      expect(useMapMonsterStore.getState().monsters.length).toBeGreaterThan(0);
      vi.restoreAllMocks();
    });

    it('場上還有怪時不生', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      useMapMonsterStore.setState({ maxMonsters: 3 });
      seedOneMonster();

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0);

      expect(useMapMonsterStore.getState().monsters.length).toBe(1);
      vi.restoreAllMocks();
    });

    it('恢復等待中不生（實例層以成員的 paused 擋生成）', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.setState({ monsters: [], maxMonsters: 3 });
      useMapControlStore.setState({ currentMap: testMap, playerPosition: { x: 1, y: 1 }, paused: true });

      tickInstanceWorld(1, instanceWithMember());

      expect(useMapMonsterStore.getState().monsters.length).toBe(0);
      useMapControlStore.setState({ paused: false });
      vi.restoreAllMocks();
    });
  });

  describe('Map switch clears monsters', () => {
    it('clearAll removes all monsters', () => {
      useMapMonsterStore.setState({
        monsters: [
          { id: 'm1', position: { x: 3, y: 3 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false },
          { id: 'm2', position: { x: 7, y: 7 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: true },
        ],
      });

      useMapMonsterStore.getState().clearAll();

      expect(useMapMonsterStore.getState().monsters).toHaveLength(0);
    });
  });

  describe('Paused state management', () => {
    it('paused stops spawning but not movement', () => {
      useMapMonsterStore.setState({
        monsters: [
          { id: 'm1', position: { x: 8, y: 8 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [{ x: 7, y: 7 }], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false },
        ],
        maxMonsters: 5,
      });
      useMapControlStore.setState({ currentMap: testMap, playerPosition: { x: 5, y: 5 }, paused: true });

      vi.spyOn(Math, 'random').mockReturnValue(0);

      // 恢復等待中不生成，但怪物照樣移動
      tickInstanceWorld(1100, instanceWithMember());
      expect(useMapMonsterStore.getState().monsters.length).toBe(1);
      const movedMonster = useMapMonsterStore.getState().monsters[0];
      expect(movedMonster.position.x).not.toBe(8);

      useMapControlStore.setState({ paused: false });
      vi.restoreAllMocks();
    });
  });

  describe('Boss spawn logic', () => {
    it('does not spawn boss when hasBossInPool is false', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.setState({ hasBossInPool: false, maxMonsters: 10 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0, 15);
      const monsters = useMapMonsterStore.getState().monsters;
      if (monsters.length > 0) {
        expect(monsters[0].isBoss).toBe(false);
      }

      vi.restoreAllMocks();
    });

    it('can spawn boss when hasBossInPool is true and none on map', () => {
      // 第一個 random 是波次隻數（§ 26.2），第二個才是 Boss 判定（§ 26.4）
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5) // rollSpawnCount → 1 隻
        .mockReturnValueOnce(0.05) // boss roll = true (< 0.1)
        .mockReturnValue(0.5); // position finding

      useMapMonsterStore.setState({ hasBossInPool: true, maxMonsters: 10 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0, 15);
      const monsters = useMapMonsterStore.getState().monsters;
      if (monsters.length > 0) {
        expect(monsters[0].isBoss).toBe(true);
      }

      vi.restoreAllMocks();
    });

    it('does not spawn second boss when one already exists', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.setState({
        hasBossInPool: true,
        maxMonsters: 10,
        monsters: [
          { id: 'm_boss', position: { x: 3, y: 3 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: true },
        ],
      });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0, 15);
      const monsters = useMapMonsterStore.getState().monsters;
      const bossCount = monsters.filter(m => m.isBoss).length;
      expect(bossCount).toBe(1);

      vi.restoreAllMocks();
    });

    it('does not spawn boss before 10 minutes', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.setState({ hasBossInPool: true, maxMonsters: 10 });

      useMapMonsterStore.getState().spawnTick(testMap, { x: 1, y: 1 }, 0, 5);
      const monsters = useMapMonsterStore.getState().monsters;
      if (monsters.length > 0) {
        expect(monsters[0].isBoss).toBe(false);
      }

      vi.restoreAllMocks();
    });
  });
});
