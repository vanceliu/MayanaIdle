import type { Position, MapData } from '../models/mapControl';
import { canTransition, isInBounds, isSpawnableTile, isWalkableTile } from '../models/mapControl';
import { getDistance, hasLineOfSight, isWithinAttackRange } from './lineOfSight';

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

export const DIRECTIONS: readonly Position[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

export function canMoveBetween(map: MapData, from: Position, to: Position): boolean {
  if (!canTransition(map, from, to)) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 || dy === 0) return true;

  const horizontal = { x: from.x + dx, y: from.y };
  const vertical = { x: from.x, y: from.y + dy };
  return canTransition(map, from, horizontal) && canTransition(map, horizontal, to)
    && canTransition(map, from, vertical) && canTransition(map, vertical, to);
}

export function findPath(map: MapData, start: Position, end: Position, occupied?: Set<string>): Position[] | null {
  const startPos = { x: Math.round(start.x), y: Math.round(start.y) };
  const endPos = { x: Math.round(end.x), y: Math.round(end.y) };
  if (!isWalkableTile(map, startPos) || !isWalkableTile(map, endPos)) return null;
  if (startPos.x === endPos.x && startPos.y === endPos.y) return [];

  const openList: AStarNode[] = [{
    ...startPos, g: 0, h: heuristic(startPos, endPos), f: heuristic(startPos, endPos), parent: null,
  }];
  const closedSet = new Set<string>();

  while (openList.length > 0) {
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) if (openList[i].f < openList[lowestIdx].f) lowestIdx = i;
    const current = openList.splice(lowestIdx, 1)[0];

    if (current.x === endPos.x && current.y === endPos.y) {
      const path: Position[] = [];
      let node: AStarNode | null = current;
      while (node && (node.x !== startPos.x || node.y !== startPos.y)) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closedSet.add(`${current.x},${current.y}`);
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (closedSet.has(key) || !canMoveBetween(map, current, next)) continue;
      if (occupied?.has(key) && (next.x !== endPos.x || next.y !== endPos.y)) continue;

      const g = current.g + (direction.x !== 0 && direction.y !== 0 ? Math.SQRT2 : 1);
      const existing = openList.find(node => node.x === next.x && node.y === next.y);
      if (!existing) {
        const h = heuristic(next, endPos);
        openList.push({ ...next, g, h, f: g + h, parent: current });
      } else if (g < existing.g) {
        existing.g = g;
        existing.f = g + existing.h;
        existing.parent = current;
      }
    }
  }
  return null;
}

/**
 * 找一個「打得到 `target`」的落腳格。回 null 代表附近沒有這種格子。
 *
 * `from` 與 `target` 都收**真實座標**：起點那一格的射程與視線一律用 `from` 原值判，
 * 不用四捨五入後的格心。停在格與格之間時兩者最多差 0.7 格，用格心判會得出
 * 「尋路說已就位、戰鬥判定說超出射程」，雙方靜止不動也不出手。
 */
export function findAttackPosition(
  map: MapData,
  target: Position,
  from: Position,
  range: number,
  occupied?: Set<string>,
): Position | null {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const targetPosition = { x: Math.round(target.x), y: Math.round(target.y) };
  if (!isWalkableTile(map, start)) return null;

  const open: { position: Position; cost: number }[] = [{ position: start, cost: 0 }];
  const bestCosts = new Map<string, number>([[`${start.x},${start.y}`, 0]]);

  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost
      || getDistance(a.position, target) - getDistance(b.position, target)
      || a.position.y - b.position.y
      || a.position.x - b.position.x);
    const current = open.shift()!;
    const currentKey = `${current.position.x},${current.position.y}`;
    if (current.cost !== bestCosts.get(currentKey)) continue;

    const isTarget = current.position.x === targetPosition.x && current.position.y === targetPosition.y;
    const isStart = current.position.x === start.x && current.position.y === start.y;
    const evalFrom = isStart ? from : current.position;
    if (!isTarget
      && isWithinAttackRange(evalFrom, target, range)
      && hasLineOfSight(evalFrom, target, map)) {
      return current.position;
    }

    for (const direction of DIRECTIONS) {
      const next = { x: current.position.x + direction.x, y: current.position.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (next.x === targetPosition.x && next.y === targetPosition.y) continue;
      if (occupied?.has(key) || !canMoveBetween(map, current.position, next)) continue;
      const cost = current.cost + (direction.x !== 0 && direction.y !== 0 ? Math.SQRT2 : 1);
      if (cost >= (bestCosts.get(key) ?? Infinity)) continue;
      bestCosts.set(key, cost);
      open.push({ position: next, cost });
    }
  }

  return null;
}

/** 該格是否打得到 `target` */
export function isAttackPosition(
  map: MapData,
  position: Position,
  target: Position,
  range: number,
  occupied?: Set<string>,
): boolean {
  if (occupied?.has(`${position.x},${position.y}`)) return false;
  return isWithinAttackRange(position, target, range) && hasLineOfSight(position, target, map);
}

export function findAdjacentWalkable(map: MapData, target: Position, from: Position): Position | null {
  return findAttackPosition(map, target, from, Math.SQRT2);
}

export function findNearestWalkable(map: MapData, target: Position, from?: Position): Position | null {
  const rounded = { x: Math.round(target.x), y: Math.round(target.y) };
  const origin = from ? { x: Math.round(from.x), y: Math.round(from.y) } : undefined;
  const visited = new Set<string>();
  const queue: Position[] = [rounded];
  visited.add(`${rounded.x},${rounded.y}`);

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (isWalkableTile(map, current) && (!origin || findPath(map, origin, current) !== null)) return current;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || !isInBounds(map, next)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return null;
}

export function getRandomWalkablePosition(map: MapData, exclude?: Position): Position {
  const candidates: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const position = { x, y };
      if (!isSpawnableTile(map, position)) continue;
      if (exclude && Math.round(exclude.x) === x && Math.round(exclude.y) === y) continue;
      candidates.push(position);
    }
  }
  return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : { ...map.spawnPoint };
}
