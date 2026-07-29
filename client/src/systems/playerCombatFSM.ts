import type { Position, MapData } from '../models/mapControl';
import { hasLineOfSight, getDistance } from './lineOfSight';

export type PlayerCombatState = 'idle' | 'chasing' | 'attacking';

export interface PlayerCombatContext {
  state: PlayerCombatState;
  targetMonsterId: string | null;
  attackCooldown: number;
  attackTimer: number;
}

export function createPlayerCombatContext(): PlayerCombatContext {
  return {
    state: 'idle',
    targetMonsterId: null,
    attackCooldown: 1200,
    attackTimer: 0,
  };
}

export interface MonsterInfo {
  id: string;
  index: number;
  position: Position;
  alive: boolean;
}

export interface AttackConfig {
  attackType: 'melee' | 'ranged';
  range: number;
}

export function getWeaponAttackConfig(weaponType: string | undefined): AttackConfig {
  switch (weaponType) {
    case 'bow':
      return { attackType: 'ranged', range: 15 };
    default:
      return { attackType: 'melee', range: 1.5 };
  }
}

export interface PlayerTickResult {
  action: 'none' | 'move_to' | 'attack';
  moveTarget?: Position;
  moveRange?: number;
  attackTargetIdx?: number;
}

export function tickPlayerCombat(
  ctx: PlayerCombatContext,
  playerPos: Position,
  monsters: MonsterInfo[],
  attackConfig: AttackConfig,
  map: MapData,
  deltaMs: number,
): PlayerTickResult {
  const aliveMonsters = monsters.filter(m => m.alive);

  // No enemies → idle
  if (aliveMonsters.length === 0) {
    ctx.state = 'idle';
    ctx.targetMonsterId = null;
    return { action: 'none' };
  }

  // Select target if none or current target dead
  const currentTarget = ctx.targetMonsterId
    ? monsters.find(m => m.id === ctx.targetMonsterId)
    : null;

  if (!currentTarget || !currentTarget.alive) {
    const nearest = findNearestMonster(playerPos, aliveMonsters);
    if (!nearest) {
      ctx.state = 'idle';
      ctx.targetMonsterId = null;
      return { action: 'none' };
    }
    ctx.targetMonsterId = nearest.id;
  }

  const target = monsters.find(m => m.id === ctx.targetMonsterId)!;
  const dist = getDistance(playerPos, target.position);
  const inRange = dist <= attackConfig.range;
  const hasLos = hasLineOfSight(playerPos, target.position, map);

  // Can attack?
  if (inRange && hasLos) {
    ctx.state = 'attacking';
    ctx.attackTimer += deltaMs;

    if (ctx.attackTimer >= ctx.attackCooldown) {
      ctx.attackTimer = 0;
      return { action: 'attack', attackTargetIdx: target.index };
    }
    return { action: 'none' };
  }

  // Need to get closer
  ctx.state = 'chasing';
  ctx.attackTimer = 0;
  return { action: 'move_to', moveTarget: target.position, moveRange: attackConfig.range };
}

function findNearestMonster(
  playerPos: Position,
  monsters: MonsterInfo[]
): MonsterInfo | null {
  let nearest: MonsterInfo | null = null;
  let minDist = Infinity;

  for (const m of monsters) {
    const d = getDistance(playerPos, m.position);
    if (d < minDist) {
      minDist = d;
      nearest = m;
    }
  }
  return nearest;
}
