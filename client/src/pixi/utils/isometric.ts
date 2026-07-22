import type { Position } from '../../models/mapControl';

export const TILE_W = 64;
export const TILE_H = 32;
export const WALL_HEIGHT = TILE_H * 0.6;

export function worldToScreen(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2),
  };
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
    y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
  };
}

export function getDepth(pos: Position): number {
  return pos.x + pos.y;
}

export function getEntityDepth(pos: Position): number {
  return pos.x + pos.y + 0.5;
}
