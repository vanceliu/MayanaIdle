/** 地板烘焙 Worker（`38-map-control.md` § 38.9「第三代實作限制」） */
import { bakeFloor } from './floorBake';
import type { FloorBakeRequest, FloorBakeResponse } from './floorBakeClient';

self.onmessage = (event: MessageEvent<FloorBakeRequest>) => {
  const { id, map, textures, bounds, scale } = event.data;
  const raster = bakeFloor(map, textures, bounds, scale);
  const response: FloorBakeResponse = { id, raster };
  (self as unknown as Worker).postMessage(response, [raster.data.buffer]);
};
