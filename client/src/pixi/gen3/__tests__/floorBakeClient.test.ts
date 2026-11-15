/** 地板烘焙排程（`38-map-control.md` § 38.9「第三代實作限制」）：測試環境沒有 Worker，走主執行緒 */
import { describe, expect, it } from 'vitest';
import { TileType, type MapData } from '../../../models/mapControl';
import { floorBounds, type Raster } from '../floorBake';
import { FloorBakeAbortedError, bakeFloorAsync } from '../floorBakeClient';

const ground: Raster = { width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4).fill(200) };
const map: MapData = {
  id: 'gen3-client', name: 'Gen3 Client', width: 2, height: 2, theme: 'grassland',
  spawnPoint: { x: 0, y: 0 },
  tiles: [[TileType.Ground, TileType.Ground], [TileType.Ground, TileType.Ground]],
};

describe('bakeFloorAsync', () => {
  it('回傳烘焙結果', async () => {
    const raster = await bakeFloorAsync(map, { ground }, floorBounds(map), 1);
    expect(raster.width).toBe(floorBounds(map).width);
  });

  it('新請求中止進行中的烘焙', async () => {
    const first = bakeFloorAsync(map, { ground }, floorBounds(map), 1);
    const second = bakeFloorAsync(map, { ground }, floorBounds(map), 2);
    await expect(first).rejects.toBeInstanceOf(FloorBakeAbortedError);
    expect((await second).width).toBe(floorBounds(map).width * 2);
  });
});
