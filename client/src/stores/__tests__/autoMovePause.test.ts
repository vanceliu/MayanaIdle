import { describe, it, expect, beforeEach } from 'vitest';
import { useMapControlStore } from '../mapControlStore';
import { useMapMonsterStore } from '../mapMonsterStore';
import type { MapData } from '../../models/mapControl';

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

function resetStores(paused: boolean) {
  useMapMonsterStore.setState({
    monsters: [],
    maxMonsters: 3,
    spawnTimer: 0,
    paused,
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
}

describe('setAutoMove 與戰鬥後恢復等待', () => {
  beforeEach(() => {
    resetStores(false);
  });

  it('恢復等待中切回自動搜尋不會排路徑（不會自動走一次）', () => {
    resetStores(true);

    useMapControlStore.getState().setAutoMove(true);

    const state = useMapControlStore.getState();
    expect(state.autoMove).toBe(true);
    expect(state.isMoving).toBe(false);
    expect(state.currentPath).toHaveLength(0);
    expect(state.targetPosition).toBeNull();
  });

  it('切手動再切回自動，仍在等待中就維持不動', () => {
    resetStores(true);

    useMapControlStore.getState().setAutoMove(false);
    useMapControlStore.getState().setAutoMove(true);

    const state = useMapControlStore.getState();
    expect(state.isMoving).toBe(false);
    expect(state.currentPath).toHaveLength(0);
  });

  it('未在等待中時切回自動會正常起步', () => {
    resetStores(false);

    useMapControlStore.getState().setAutoMove(true);

    const state = useMapControlStore.getState();
    expect(state.autoMove).toBe(true);
    expect(state.isMoving).toBe(true);
    expect(state.currentPath.length).toBeGreaterThan(0);
  });

  it('恢復完成解除暫停後再啟動自動移動會起步', () => {
    resetStores(true);

    useMapControlStore.getState().setAutoMove(true);
    expect(useMapControlStore.getState().isMoving).toBe(false);

    // gameLoopTick 的 aboveResume 分支：解除暫停後重新啟動自動移動
    useMapMonsterStore.getState().setPaused(false);
    useMapControlStore.getState().setAutoMove(true);

    expect(useMapControlStore.getState().isMoving).toBe(true);
  });
});
