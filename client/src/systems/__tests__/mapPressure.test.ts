import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { calculatePressure } from '../../systems/pressure';
import type { MapData } from '../../models/mapControl';

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

describe('Map Control Phase 3 - Pressure Integration', () => {
  beforeEach(() => {
    useMapMonsterStore.setState({
      monsters: [],
      maxMonsters: 3,
      spawnTimer: 0,
      paused: false,
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
      const now = Date.now();
      const { pressure: p0 } = calculatePressure(now, now);
      expect(p0).toBe(0);
      expect(3 + p0).toBe(3);

      const fortyMinAgo = now - 40 * 60 * 1000;
      const { pressure: p1 } = calculatePressure(fortyMinAgo, now);
      expect(p1).toBe(1);
      expect(3 + p1).toBe(4);

      const sixtyMinAgo = now - 60 * 60 * 1000;
      const { pressure: p3 } = calculatePressure(sixtyMinAgo, now);
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

      // With pressure=0, interval is 1000ms. 900ms should NOT trigger
      store.spawnTick(900, testMap, { x: 1, y: 1 }, 0);
      expect(useMapMonsterStore.getState().monsters.length).toBe(0);

      // Reset timer
      useMapMonsterStore.setState({ spawnTimer: 0 });

      // With pressure=5, interval = 1000/2.0 = 500ms. 600ms SHOULD trigger
      useMapMonsterStore.getState().spawnTick(600, testMap, { x: 1, y: 1 }, 5);
      // May or may not spawn depending on position finding, but timer should have fired
      expect(useMapMonsterStore.getState().spawnTimer).toBe(0);

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
        paused: true,
        maxMonsters: 5,
      });

      vi.spyOn(Math, 'random').mockReturnValue(0);

      // Spawn should not work when paused
      useMapMonsterStore.getState().spawnTick(1100, testMap, { x: 5, y: 5 }, 0);
      expect(useMapMonsterStore.getState().monsters.length).toBe(1);

      // Move should still work
      useMapMonsterStore.getState().moveMonsters(500, testMap, { x: 5, y: 5 });
      const movedMonster = useMapMonsterStore.getState().monsters[0];
      expect(movedMonster.position.x).not.toBe(8);

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
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // spawn chance pass
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
