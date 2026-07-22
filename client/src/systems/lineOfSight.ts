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

  // Check every 0.25 tiles along the line for better accuracy
  const steps = Math.max(1, Math.ceil(dist * 4));
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 1; i < steps; i++) {
    const px = from.x + stepX * i;
    const py = from.y + stepY * i;

    // Check both floor and round to catch edge cases
    const tileX = Math.round(px);
    const tileY = Math.round(py);

    if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
      return false;
    }

    if (map.tiles[tileY][tileX] === TileType.Wall) {
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
