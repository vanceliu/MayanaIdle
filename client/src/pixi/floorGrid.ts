import { Graphics } from 'pixi.js';
import type { TerrainDrawItem } from './mapRenderPlan';
import type { MapThemePalette } from './mapThemes';
import { TILE_H, TILE_W, worldToScreen } from './utils/isometric';

/** 地板格線（`38-map-control.md` § 38.9「背景 render 代別」）：牆與邊界以外的每格描菱形 */
export function drawFloorGrid(plan: TerrainDrawItem[], palette: MapThemePalette): Graphics {
  const graphics = new Graphics();
  for (const item of plan) {
    if (item.role === 'boundary' || item.role === 'wall') continue;
    const { sx, sy } = worldToScreen(item.x, item.y, item.elevation);
    graphics.poly([sx, sy - TILE_H / 2, sx + TILE_W / 2, sy, sx, sy + TILE_H / 2, sx - TILE_W / 2, sy])
      .stroke({ color: palette.grid, width: 0.5, alpha: 0.35 });
  }
  return graphics;
}
