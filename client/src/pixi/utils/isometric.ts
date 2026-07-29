import type { MapData, Position } from '../../models/mapControl';
import { getElevation, getRenderedElevation, isInBounds, isWalkableTile } from '../../models/mapControl';

export const TILE_W = 64;
export const TILE_H = 32;
export const LEVEL_HEIGHT = TILE_H * 0.75;
export const WALL_HEIGHT = TILE_H * 0.6;

export function worldToScreen(x: number, y: number, elevation = 0): { sx: number; sy: number } {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2) - elevation * LEVEL_HEIGHT,
  };
}

export function mapPositionToScreen(map: MapData, position: Position): { sx: number; sy: number } {
  return worldToScreen(position.x, position.y, getRenderedElevation(map, position));
}

export function screenToMapTile(map: MapData, sx: number, sy: number): Position | null {
  for (const elevation of [1, 0] as const) {
    const world = screenToWorld(sx, sy, elevation);
    const candidate = { x: Math.round(world.x), y: Math.round(world.y) };
    if (!isInBounds(map, candidate) || getElevation(map, candidate) !== elevation || !isWalkableTile(map, candidate)) continue;
    const center = worldToScreen(candidate.x, candidate.y, elevation);
    const normalized = Math.abs(sx - center.sx) / (TILE_W / 2) + Math.abs(sy - center.sy) / (TILE_H / 2);
    if (normalized <= 1) return candidate;
  }
  return null;
}

export function screenToWorld(sx: number, sy: number, elevation = 0): { x: number; y: number } {
  const adjustedY = sy + elevation * LEVEL_HEIGHT;
  return {
    x: (sx / (TILE_W / 2) + adjustedY / (TILE_H / 2)) / 2,
    y: (adjustedY / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
  };
}

export function getDepth(pos: Position, elevation = 0): number {
  return pos.x + pos.y + elevation * 0.01;
}

export function getEntityDepth(pos: Position, elevation = 0): number {
  return getDepth(pos, elevation) + 0.5;
}
