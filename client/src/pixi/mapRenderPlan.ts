import type { MapData, MapTheme, TileVisualRole } from '../models/mapControl';
import { getTileDefinition } from '../models/mapControl';

export interface TerrainDrawItem {
  x: number;
  y: number;
  elevation: 0 | 1;
  role: TileVisualRole;
  theme: MapTheme;
  drawSouthFace: boolean;
  drawEastFace: boolean;
  depth: number;
}

export function createMapRenderPlan(map: MapData): TerrainDrawItem[] {
  const items: TerrainDrawItem[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = getTileDefinition(map.tiles[y][x]);
      if (!tile) continue;
      const south = y + 1 < map.height ? getTileDefinition(map.tiles[y + 1][x]) : undefined;
      const east = x + 1 < map.width ? getTileDefinition(map.tiles[y][x + 1]) : undefined;

      items.push({
        x, y, elevation: tile.elevation, role: tile.role, theme: map.theme ?? 'grassland',
        drawSouthFace: tile.elevation > (south?.elevation ?? 0),
        drawEastFace: tile.elevation > (east?.elevation ?? 0),
        depth: x + y + tile.elevation * 0.01,
      });
    }
  }
  return items;
}
