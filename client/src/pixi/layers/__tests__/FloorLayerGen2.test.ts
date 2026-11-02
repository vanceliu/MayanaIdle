/** 第二代背景 render 地板（`38-map-control.md` § 38.9） */
import { describe, expect, it } from 'vitest';
import { TileType, type MapData } from '../../../models/mapControl';
import { FloorLayerGen2 } from '../FloorLayerGen2';

const { Ground: G, Lava: L, Boundary: B } = TileType;

const testMap: MapData = {
  id: 'floor-gen2', name: 'Floor Gen2', width: 4, height: 3, theme: 'dragon',
  spawnPoint: { x: 1, y: 1 },
  tiles: [
    [B, B, B, B],
    [B, G, L, B],
    [B, B, B, B],
  ],
};

describe('FloorLayerGen2', () => {
  it('地板、格線、地形邊線三層', () => {
    const floor = new FloorLayerGen2();
    floor.buildFromMap(testMap);
    expect(floor.container.children).toHaveLength(3);
    floor.destroy();
  });

  it('格線預設不顯示，切換即時生效', () => {
    const floor = new FloorLayerGen2();
    floor.buildFromMap(testMap);
    const grid = floor.container.children[1];
    expect(grid.visible).toBe(false);
    floor.setGridVisible(true);
    expect(grid.visible).toBe(true);
    floor.destroy();
  });

  it('重建地圖沿用格線設定，不殘留舊圖層', () => {
    const floor = new FloorLayerGen2();
    floor.setGridVisible(true);
    floor.buildFromMap(testMap);
    floor.buildFromMap(testMap);
    expect(floor.container.children).toHaveLength(3);
    expect(floor.container.children[1].visible).toBe(true);
    floor.destroy();
  });
});
