import type { Position, MapData } from '../models/mapControl';
import { getElevation, getTileAt, isInBounds } from '../models/mapControl';

export type RayPurpose = 'sight' | 'projectile';

export function traceTerrainRay(from: Position, to: Position, map: MapData, purpose: RayPurpose = 'sight'): boolean {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const end = { x: Math.round(to.x), y: Math.round(to.y) };
  if (!isInBounds(map, start) || !isInBounds(map, end)) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return true;

  const steps = Math.max(1, Math.ceil(distance * 4));
  let previous = start;

  for (let index = 1; index < steps; index++) {
    const ratio = index / steps;
    const position = {
      x: Math.round(from.x + dx * ratio),
      y: Math.round(from.y + dy * ratio),
    };
    if (!isInBounds(map, position)) return false;
    const tile = getTileAt(map, position);
    if (!tile) return false;
    if (purpose === 'projectile' ? tile.blocksProjectiles : tile.blocksSight) return false;

    const previousElevation = getElevation(map, previous);
    const currentElevation = tile.elevation;
    // Since all tiles now have elevation 0, elevation changes should not occur
    if (currentElevation !== previousElevation) {
      return false;
    }
    previous = position;
  }
  return true;
}

export function hasLineOfSight(from: Position, to: Position, map: MapData): boolean {
  return traceTerrainRay(from, to, map, 'sight');
}

export function hasProjectilePath(from: Position, to: Position, map: MapData): boolean {
  return traceTerrainRay(from, to, map, 'projectile');
}

export function getDistance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function findTargetsInRadius(
  center: Position,
  radius: number,
  candidates: { position: Position; index: number }[],
  maxTargets?: number,
  excludeIndex?: number,
): number[] {
  const inRange = candidates
    .filter(candidate => excludeIndex === undefined || candidate.index !== excludeIndex)
    .filter(candidate => getDistance(center, candidate.position) <= radius)
    .sort((a, b) => getDistance(center, a.position) - getDistance(center, b.position));
  return (maxTargets === undefined ? inRange : inRange.slice(0, maxTargets)).map(candidate => candidate.index);
}
