import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    paused,
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
    useMapControlStore.getState().setPaused(false);
    useMapControlStore.getState().setAutoMove(true);

    expect(useMapControlStore.getState().isMoving).toBe(true);
  });
});

/** 抵達後的延遲重選目標：期間點地圖、關閉自動移動或換圖就不執行（`38-map-control.md` § 38.5） */
describe('抵達後延遲重選目標', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores(false);
    useMapControlStore.setState({ autoMove: true, isMoving: true, currentPath: [{ x: 6, y: 5 }], pathIndex: 0 });
    useMapControlStore.getState().tick(1000);
    expect(useMapControlStore.getState().isMoving).toBe(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('等待期間點地圖：照點擊的目的地走，不被重選覆蓋', () => {
    useMapControlStore.getState().moveToTarget({ x: 2, y: 2 });

    vi.advanceTimersByTime(2000);

    expect(useMapControlStore.getState().targetPosition).toEqual({ x: 2, y: 2 });
  });

  it('等待期間關閉自動移動：不再起步', () => {
    useMapControlStore.getState().setAutoMove(false);

    vi.advanceTimersByTime(2000);

    expect(useMapControlStore.getState().isMoving).toBe(false);
  });

  it('等待期間換圖：不在新圖上起步', () => {
    useMapControlStore.setState({ currentMap: { ...testMap, id: 'other-map' } });

    vi.advanceTimersByTime(2000);

    expect(useMapControlStore.getState().isMoving).toBe(false);
  });

  it('沒有任何變動：照常重選目標', () => {
    vi.advanceTimersByTime(2000);

    expect(useMapControlStore.getState().isMoving).toBe(true);
  });
});
