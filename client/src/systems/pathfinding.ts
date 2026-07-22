import type { Position } from '../models/mapControl';
import { TileType } from '../models/mapControl';
import type { MapData } from '../models/mapControl';

interface AStarNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

function heuristic(a: Position, b: Position): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

function isWalkable(map: MapData, x: number, y: number): boolean {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
  return map.tiles[y][x] !== TileType.Wall;
}

const DIRECTIONS: Position[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export function findPath(map: MapData, start: Position, end: Position, occupied?: Set<string>): Position[] | null {
  if (!isWalkable(map, end.x, end.y)) return null;
  if (start.x === end.x && start.y === end.y) return [];

  const openList: AStarNode[] = [];
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };
  openList.push(startNode);

  while (openList.length > 0) {
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) lowestIdx = i;
    }
    const current = openList[lowestIdx];

    if (current.x === end.x && current.y === end.y) {
      const path: Position[] = [];
      let node: AStarNode | null = current;
      while (node && (node.x !== start.x || node.y !== start.y)) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    openList.splice(lowestIdx, 1);
    const key = `${current.x},${current.y}`;
    closedSet.add(key);

    for (const dir of DIRECTIONS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const nKey = `${nx},${ny}`;

      if (!isWalkable(map, nx, ny) || closedSet.has(nKey)) continue;
      // Treat occupied tiles as blocked (except the final destination — movement will stop at adjacent)
      if (occupied && occupied.has(nKey) && !(nx === end.x && ny === end.y)) continue;

      const isDiagonal = dir.x !== 0 && dir.y !== 0;
      if (isDiagonal) {
        if (!isWalkable(map, current.x + dir.x, current.y) ||
            !isWalkable(map, current.x, current.y + dir.y)) {
          continue;
        }
      }

      const cost = isDiagonal ? Math.SQRT2 : 1;
      const g = current.g + cost;
      const existing = openList.find(n => n.x === nx && n.y === ny);

      if (!existing) {
        const h = heuristic({ x: nx, y: ny }, end);
        openList.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
      } else if (g < existing.g) {
        existing.g = g;
        existing.f = g + existing.h;
        existing.parent = current;
      }
    }
  }

  return null;
}

export function findAdjacentWalkable(map: MapData, target: Position, from: Position): Position | null {
  let best: Position | null = null;
  let bestDist = Infinity;

  for (const dir of DIRECTIONS) {
    const nx = target.x + dir.x;
    const ny = target.y + dir.y;
    if (!isWalkable(map, nx, ny)) continue;
    const d = Math.sqrt((nx - from.x) ** 2 + (ny - from.y) ** 2);
    if (d < bestDist) {
      bestDist = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

export function findNearestWalkable(map: MapData, target: Position): Position | null {
  if (isWalkable(map, target.x, target.y)) return target;

  const visited = new Set<string>();
  const queue: Position[] = [target];
  visited.add(`${target.x},${target.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dir of DIRECTIONS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
      if (isWalkable(map, nx, ny)) return { x: nx, y: ny };
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

export function getRandomWalkablePosition(map: MapData, exclude?: Position): Position {
  const walkable: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkable(map, x, y)) {
        if (exclude && exclude.x === x && exclude.y === y) continue;
        walkable.push({ x, y });
      }
    }
  }
  return walkable[Math.floor(Math.random() * walkable.length)];
}
