/** 第三代背景 render 地板（`38-map-control.md` § 38.9） */
import { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { TileType, type MapData } from '../../../models/mapControl';
import { FloorLayerGen3, floorChunks } from '../FloorLayerGen3';

const testMap: MapData = {
  id: 'floor-gen3', name: 'Floor Gen3', width: 3, height: 3, theme: 'cave',
  spawnPoint: { x: 1, y: 1 },
  tiles: Array.from({ length: 3 }, () => [TileType.Ground, TileType.Ground, TileType.Ground]),
};

describe('floorChunks', () => {
  it('切塊不超過上限且剛好鋪滿', () => {
    const chunks = floorChunks(4480, 2300, 2048);
    expect(chunks).toHaveLength(6);
    expect(chunks.every(c => c.width <= 2048 && c.height <= 2048)).toBe(true);
    expect(chunks.reduce((sum, c) => sum + c.width * c.height, 0)).toBe(4480 * 2300);
  });
});

describe('FloorLayerGen3', () => {
  it('底色與格線；格線依設定顯示，重建沿用設定', () => {
    const floor = new FloorLayerGen3();
    floor.showPlaceholder(testMap);
    const grid = floor.container.children[1];
    expect(grid.visible).toBe(false);
    floor.setGridVisible(true);
    expect(grid.visible).toBe(true);
    floor.showPlaceholder(testMap);
    expect(floor.container.children).toHaveLength(2);
    expect(floor.container.children[1].visible).toBe(true);
    floor.destroy();
  });

  it('換上烘焙結果：每塊一個 Sprite，位置換算回世界座標', () => {
    const floor = new FloorLayerGen3();
    floor.showPlaceholder(testMap);
    const raster = { width: 10, height: 6, data: new Uint8ClampedArray(10 * 6 * 4) };
    floor.setBaked(raster, { x: -96, y: -16, width: 5, height: 3 }, 2);
    const base = floor.container.children[0];
    expect(base.children).toHaveLength(1);
    const sprite = base.children[0] as Sprite;
    expect(sprite.position.x).toBe(-96);
    expect(sprite.scale.x).toBe(0.5);
    floor.destroy();
  });
});
