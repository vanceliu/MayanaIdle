/** 第三代背景 render 地板烘焙（`38-map-control.md` § 38.9「素材來源」） */
import { describe, expect, it } from 'vitest';
import { TileType, type MapData } from '../../../models/mapControl';
import { worldToScreen } from '../../utils/isometric';
import { bakeFloor, floorBounds, type FloorTextures, type Raster } from '../floorBake';

const { Ground: G, Water: A } = TileType;

function solid(rgb: [number, number, number]): Raster {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
  return { width: 256, height: 256, data };
}

const testMap: MapData = {
  id: 'gen3-floor', name: 'Gen3 Floor', width: 5, height: 5, theme: 'grassland',
  spawnPoint: { x: 0, y: 0 },
  tiles: [
    [G, G, G, G, G],
    [G, A, A, A, G],
    [G, A, A, A, G],
    [G, A, A, A, G],
    [G, G, G, G, G],
  ],
};

const textures: FloorTextures = { ground: solid([100, 150, 50]), water: solid([10, 40, 200]) };

function pixelAt(raster: Raster, bounds: ReturnType<typeof floorBounds>, scale: number, x: number, y: number): number[] {
  const { sx, sy } = worldToScreen(x, y);
  const px = Math.floor((sx - bounds.x) * scale), py = Math.floor((sy - bounds.y) * scale);
  const o = (py * raster.width + px) * 4;
  return [...raster.data.slice(o, o + 4)];
}

describe('bakeFloor', () => {
  const bounds = floorBounds(testMap);

  it('範圍涵蓋整張圖的菱形', () => {
    expect(bounds).toEqual({ x: -160, y: -16, width: 320, height: 160 });
  });

  it('點陣尺寸 = 範圍 × scale', () => {
    const raster = bakeFloor(testMap, textures, bounds, 1.5);
    expect(raster.width).toBe(480);
    expect(raster.height).toBe(240);
  });

  it('地面取地面材質、池中央取池材質、地圖外透明', () => {
    const raster = bakeFloor(testMap, textures, bounds, 2);
    expect(pixelAt(raster, bounds, 2, 0, 0)).toEqual([100, 150, 50, 255]);
    expect(pixelAt(raster, bounds, 2, 2, 2)).toEqual([10, 40, 200, 255]);
    expect(raster.data[3]).toBe(0);
  });

  it('沒有池材質時池格畫成地面', () => {
    const raster = bakeFloor(testMap, { ground: textures.ground }, bounds, 1);
    expect(pixelAt(raster, bounds, 1, 2, 2)).toEqual([100, 150, 50, 255]);
  });
});
