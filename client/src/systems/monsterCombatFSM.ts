import type { Position, MapData } from '../models/mapControl';
import { hasLineOfSight, getDistance } from './lineOfSight';
import type { MonsterAttackType } from '../models/monster';

export type MonsterCombatState = 'roaming' | 'chasing' | 'attacking';

export interface MonsterCombatContext {
  state: MonsterCombatState;
  attackTimer: number;
  aggroRange: number;
  leashRange: number;
}

export interface MonsterAttackConfig {
  attackType: MonsterAttackType;
  attackRange: number;
  attackInterval: number;
}

export const DEFAULT_MONSTER_ATTACK_CONFIG: MonsterAttackConfig = {
  attackType: 'melee',
  attackRange: 1.5,
  attackInterval: 1200,
};

export function createMonsterCombatContext(): MonsterCombatContext {
  return {
    state: 'roaming',
    attackTimer: 0,
    aggroRange: 8,
    leashRange: 15,
  };
}

export interface MonsterTickResult {
  action: 'none' | 'chase' | 'attack' | 'leash';
  moveTarget?: Position;
}

export function tickMonsterCombat(
  ctx: MonsterCombatContext,
  monsterPos: Position,
  playerPos: Position,
  config: MonsterAttackConfig,
  map: MapData,
  deltaMs: number,
  isStunned: boolean = false,
): MonsterTickResult {
  const dist = getDistance(monsterPos, playerPos);

  // Stunned: can't move or attack
  if (isStunned) {
    return { action: 'none' };
  }

  switch (ctx.state) {
    case 'roaming': {
      if (dist <= ctx.aggroRange) {
        ctx.state = 'chasing';
        return { action: 'chase', moveTarget: playerPos };
      }
      return { action: 'none' };
    }

    case 'chasing': {
      if (dist > ctx.leashRange) {
        ctx.state = 'roaming';
        return { action: 'leash' };
      }

      const inRange = dist <= config.attackRange;
      const hasLos = hasLineOfSight(monsterPos, playerPos, map);

      if (inRange && hasLos) {
        ctx.state = 'attacking';
        ctx.attackTimer = 0;
        return { action: 'none' };
      }

      return { action: 'chase', moveTarget: playerPos };
    }

    case 'attacking': {
      if (dist > ctx.leashRange) {
        ctx.state = 'roaming';
        return { action: 'leash' };
      }

      const inRange = dist <= config.attackRange;
      const hasLos = hasLineOfSight(monsterPos, playerPos, map);

      if (!inRange || !hasLos) {
        ctx.state = 'chasing';
        return { action: 'chase', moveTarget: playerPos };
      }

      ctx.attackTimer += deltaMs;
      if (ctx.attackTimer >= config.attackInterval) {
        ctx.attackTimer = 0;
        return { action: 'attack' };
      }
      return { action: 'none' };
    }
  }
}
