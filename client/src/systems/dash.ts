/**
 * 突進位移的可施放判定與落點（`41-arpg-combat.md` § 3.6）。
 *
 * 天賦選招、引擎出手與調校頁共用這一份。
 */
import type { MapData, Position } from '../models/mapControl';
import { isWalkableTile } from '../models/mapControl';
import { MELEE_WEAPON_RANGE } from '../models/equipment';
import { canMoveBetween, DIRECTIONS } from './pathfinding';
import { getDistance, hasLineOfSight, isWithinAttackRange } from './lineOfSight';

export interface DashPlan {
  /** 落點。`moves` 為 false 時就是原位置 */
  landing: Position;
  /** 目標已在相鄰格時不移動 */
  moves: boolean;
}

const tileOf = (p: Position): Position => ({ x: Math.round(p.x), y: Math.round(p.y) });

/**
 * 突進計畫。回 null ＝ 不可施放（超出射程、沒有視線、沒有可通行的落點）。
 * `occupied` 是排除自己之後的佔位表（`x,y` 字串）。
 */
export function planDash(
  map: MapData,
  from: Position,
  target: Position,
  range: number,
  occupied?: Set<string>,
): DashPlan | null {
  if (isWithinAttackRange(from, target, MELEE_WEAPON_RANGE)) {
    return { landing: { ...from }, moves: false };
  }
  if (getDistance(from, target) > range) return null;
  if (!hasLineOfSight(from, target, map)) return null;

  const start = tileOf(from);
  const targetTile = tileOf(target);
  const candidates = DIRECTIONS
    .map(d => ({ x: targetTile.x + d.x, y: targetTile.y + d.y }))
    .filter(p => isWalkableTile(map, p) && !occupied?.has(`${p.x},${p.y}`))
    .sort((a, b) => getDistance(from, a) - getDistance(from, b) || a.y - b.y || a.x - b.x);

  for (const landing of candidates) {
    if (isStraightPathWalkable(map, start, landing)) return { landing, moves: true };
  }
  return null;
}

/**
 * 後退落點（`41-arpg-combat.md` § 3.6 後退）：沿「目標 → 自身」方向依序試 `distance`…1 格，
 * 取第一個直線可通行、未被佔用、對目標有視線的格子。回 null ＝ 不移動。
 */
export function planRetreat(
  map: MapData,
  from: Position,
  target: Position,
  distance: number,
  occupied?: Set<string>,
): Position | null {
  const dx = from.x - target.x;
  const dy = from.y - target.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;

  const start = tileOf(from);
  for (let d = distance; d >= 1; d--) {
    const landing = tileOf({ x: from.x + (dx / len) * d, y: from.y + (dy / len) * d });
    if (landing.x === start.x && landing.y === start.y) continue;
    if (occupied?.has(`${landing.x},${landing.y}`)) continue;
    if (!isStraightPathWalkable(map, start, landing)) continue;
    if (!hasLineOfSight(landing, target, map)) continue;
    return landing;
  }
  return null;
}

/**
 * 起點格到落點格的直線是否每一步都可通行（不跨越水池／岩漿與實體障礙，`38-map-control.md` § 38.4）。
 * 斜向移動沿用尋路的切角規則（`canMoveBetween`）。
 */
export function isStraightPathWalkable(map: MapData, from: Position, to: Position): boolean {
  if (!isWalkableTile(map, from) || !isWalkableTile(map, to)) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 4));

  let prev = from;
  for (let i = 1; i <= steps; i++) {
    const tile = tileOf({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps });
    if (tile.x === prev.x && tile.y === prev.y) continue;
    if (!canMoveBetween(map, prev, tile)) return false;
    prev = tile;
  }
  return true;
}
