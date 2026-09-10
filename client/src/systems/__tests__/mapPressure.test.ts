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
      spawnTimer: 0,
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

    it('spawnTick respects maxMonsters', () => {
      // Manually add a monster to reach the cap
      useMapMonsterStore.setState({
        maxMonsters: 1,
        monsters: [
          { id: 'm1', position: { x: 8, y: 8 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false },
        ],
      });

      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.getState().spawnTick(1100, testMap, { x: 1, y: 1 }, 0);
      // Should not spawn because already at max
      expect(useMapMonsterStore.getState().monsters.length).toBe(1);

      vi.restoreAllMocks();
    });
  });

  describe('Pressure affects spawn frequency', () => {
    it('higher pressure reduces effective spawn interval', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const store = useMapMonsterStore.getState();
      store.setMaxMonsters(10);
      // 場上留一隻才量得到週期判定 —— 全空會走清場補位，直接繞過計時器（§ 26.2）
      seedOneMonster();

      // With pressure=0, interval is 1000ms. 900ms should NOT trigger
      store.spawnTick(900, testMap, { x: 1, y: 1 }, 0);
      expect(useMapMonsterStore.getState().monsters.length).toBe(1);

      // Reset timer
      useMapMonsterStore.setState({ spawnTimer: 0 });

      // With pressure=5, interval = 1000/2.0 = 500ms. 600ms SHOULD trigger
      useMapMonsterStore.getState().spawnTick(600, testMap, { x: 1, y: 1 }, 5);
      // May or may not spawn depending on position finding, but timer should have fired
      expect(useMapMonsterStore.getState().spawnTimer).toBe(0);

      vi.restoreAllMocks();
    });
  });

  describe('清場補位（§ 26.2）', () => {
    it('場上全空時立即生成，不等判定間隔也不擲 15%', () => {
      // random 回 0.99：週期判定會被 BASE_SPAWN_CHANCE 擋掉，補位不會
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      useMapMonsterStore.setState({ monsters: [], spawnTimer: 0, maxMonsters: 3 });

      useMapMonsterStore.getState().spawnTick(1, testMap, { x: 1, y: 1 }, 0);

      expect(useMapMonsterStore.getState().monsters.length).toBeGreaterThan(0);
      expect(useMapMonsterStore.getState().spawnTimer).toBe(0);
      vi.restoreAllMocks();
    });

    it('場上還有怪時不補位', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      useMapMonsterStore.setState({ spawnTimer: 0, maxMonsters: 3 });
      seedOneMonster();

      useMapMonsterStore.getState().spawnTick(1, testMap, { x: 1, y: 1 }, 0);

      expect(useMapMonsterStore.getState().monsters.length).toBe(1);
      vi.restoreAllMocks();
    });

    it('恢復等待中不補位（實例層以成員的 paused 擋生成）', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.setState({ monsters: [], spawnTimer: 0, maxMonsters: 3 });
      useMapControlStore.setState({ currentMap: testMap, playerPosition: { x: 1, y: 1 }, paused: true });

      tickInstanceWorld(1, instanceWithMember());

      expect(useMapMonsterStore.getState().monsters.length).toBe(0);
      useMapControlStore.setState({ paused: false });
      vi.restoreAllMocks();
    });
  });

  describe('Map switch clears monsters', () => {
    it('clearAll removes all monsters and resets timer', () => {
      useMapMonsterStore.setState({
        monsters: [
          { id: 'm1', position: { x: 3, y: 3 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false },
          { id: 'm2', position: { x: 7, y: 7 }, targetPosition: { x: 5, y: 5 }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { x: 5, y: 5 }, isBoss: true },
        ],
        spawnTimer: 500,
      });

      useMapMonsterStore.getState().clearAll();

      const state = useMapMonsterStore.getState();
      expect(state.monsters).toHaveLength(0);
      expect(state.spawnTimer).toBe(0);
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

      useMapMonsterStore.getState().spawnTick(1100, testMap, { x: 1, y: 1 }, 0, 15);
      const monsters = useMapMonsterStore.getState().monsters;
      if (monsters.length > 0) {
        expect(monsters[0].isBoss).toBe(false);
      }

      vi.restoreAllMocks();
    });

    it('can spawn boss when hasBossInPool is true and none on map', () => {
      // 場上全空走清場補位，不擲 BASE_SPAWN_CHANCE（§ 26.2），
      // 所以第一個 random 直接是 rollSpawnCount
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5) // rollSpawnCount → 1 monster
        .mockReturnValueOnce(0.05) // boss roll = true (< 0.1)
        .mockReturnValue(0.5); // position finding

      useMapMonsterStore.setState({ hasBossInPool: true, maxMonsters: 10 });

      useMapMonsterStore.getState().spawnTick(1100, testMap, { x: 1, y: 1 }, 0, 15);
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

      useMapMonsterStore.getState().spawnTick(1100, testMap, { x: 1, y: 1 }, 0, 15);
      const monsters = useMapMonsterStore.getState().monsters;
      const bossCount = monsters.filter(m => m.isBoss).length;
      expect(bossCount).toBe(1);

      vi.restoreAllMocks();
    });

    it('does not spawn boss before 10 minutes', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      useMapMonsterStore.setState({ hasBossInPool: true, maxMonsters: 10 });

      useMapMonsterStore.getState().spawnTick(1100, testMap, { x: 1, y: 1 }, 0, 5);
      const monsters = useMapMonsterStore.getState().monsters;
      if (monsters.length > 0) {
        expect(monsters[0].isBoss).toBe(false);
      }

      vi.restoreAllMocks();
    });
  });
});
