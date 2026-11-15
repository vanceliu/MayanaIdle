/**
 * 怪物交戰時的朝向（`25-monster-system.md` § 25.2.2「朝向判定」）：
 * 玩家或隊友在怪物的攻擊距離內時，面向最近的那一位；都不在範圍內回傳 null（依移動方向）。
 */
import type { Position } from '../../../models/mapControl';
import { getDistance, isWithinAttackRange } from '../../../systems/lineOfSight';

/** 射程還沒回填時的近戰距離（同 `gameLoop.ts` 怪物停步距離） */
const DEFAULT_ATTACK_RANGE = 1.2;

export function monsterFacingTarget(monster: Position, attackRange: number | undefined, members: readonly Position[]): Position | null {
  const range = attackRange ?? DEFAULT_ATTACK_RANGE;
  let best: Position | null = null;
  let bestDistance = Infinity;
  for (const member of members) {
    if (!isWithinAttackRange(monster, member, range)) continue;
    const distance = getDistance(monster, member);
    if (distance < bestDistance) {
      best = member;
      bestDistance = distance;
    }
  }
  return best;
}
