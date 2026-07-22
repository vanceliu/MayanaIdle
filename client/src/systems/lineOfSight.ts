import type { Position, MapData } from '../models/mapControl';
import { TileType } from '../models/mapControl';

export function hasLineOfSight(
  from: Position,
  to: Position,
  map: MapData
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) return true;

  const steps = Math.ceil(dist * 2);
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 1; i < steps; i++) {
    const checkX = Math.floor(from.x + stepX * i);
    const checkY = Math.floor(from.y + stepY * i);

    if (checkX < 0 || checkX >= map.width || checkY < 0 || checkY >= map.height) {
      return false;
    }

    if (map.tiles[checkY][checkX] === TileType.Wall) {
      return false;
    }
  }

  return true;
}

export function getDistance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function findTargetsInRadius(
  center: Position,
  radius: number,
  candidates: { position: Position; index: number }[],
  maxTargets?: number,
  excludeIndex?: number
): number[] {
  const inRange = candidates
    .filter(c => {
      if (excludeIndex !== undefined && c.index === excludeIndex) return false;
      return getDistance(center, c.position) <= radius;
    })
    .sort((a, b) => getDistance(center, a.position) - getDistance(center, b.position));

  if (maxTargets !== undefined) {
    return inRange.slice(0, maxTargets).map(c => c.index);
  }
  return inRange.map(c => c.index);
}
