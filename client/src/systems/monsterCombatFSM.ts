import type { Position, MapData } from '../models/mapControl';
import { hasLineOfSight, getDistance, isWithinAttackRange } from './lineOfSight';
import type { MonsterAttackType } from '../models/monster';

/** 怪物戰鬥 FSM。`casting` 是詠唱前搖（`25-monster-system.md` § 25.11） */
export type MonsterCombatState = 'roaming' | 'chasing' | 'attacking' | 'casting';

/** 每次出手機會有多少比例走詠唱（§ 25.11） */
export const CAST_CHANCE = 0.3;

/** 詠唱時間範圍（毫秒）。每次出手獨立 roll */
export const CAST_TIME_MIN = 900;
export const CAST_TIME_MAX = 1500;

/** 詠唱攻擊的傷害倍率範圍，對應 `CAST_TIME_MIN`~`CAST_TIME_MAX` */
export const CAST_DAMAGE_MULT_MIN = 1;
export const CAST_DAMAGE_MULT_MAX = 1.5;

/** 詠唱時間 → 傷害倍率，線性換算並夾在區間內（§ 25.11） */
export function castDamageMultiplier(castTime: number): number {
  const span = CAST_TIME_MAX - CAST_TIME_MIN;
  const t = Math.max(0, Math.min((castTime - CAST_TIME_MIN) / span, 1));
  return CAST_DAMAGE_MULT_MIN + t * (CAST_DAMAGE_MULT_MAX - CAST_DAMAGE_MULT_MIN);
}

export interface MonsterCombatContext {
  state: MonsterCombatState;
  attackTimer: number;
  aggroRange: number;
  leashRange: number;
  /** 這次詠唱已經讀了多久。非 `casting` 時無意義 */
  castTimer: number;
  /** 這次詠唱要讀多久，出手當下 roll。0 ＝ 沒有在詠唱 */
  castTime: number;
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
    castTimer: 0,
    castTime: 0,
  };
}

export interface MonsterTickResult {
  action: 'none' | 'chase' | 'attack' | 'leash';
  moveTarget?: Position;
  /** 詠唱攻擊的傷害倍率。瞬發攻擊不帶，由呼叫端當 1 處理 */
  damageMultiplier?: number;
}

/** 可注入的亂數，讓詠唱機率與讀條長度測得起來 */
export type Rng = () => number;
const defaultRng: Rng = () => Math.random();

/** 詠唱進度 0~1，給頭上的詠唱條用。沒在詠唱回 0 */
export function castProgress(ctx: MonsterCombatContext): number {
  if (ctx.state !== 'casting' || ctx.castTime <= 0) return 0;
  return Math.max(0, Math.min(ctx.castTimer / ctx.castTime, 1));
}

/** 中止詠唱並回到指定狀態。射程或視線斷掉時用 */
function abortCast(ctx: MonsterCombatContext, next: MonsterCombatState): void {
  ctx.state = next;
  ctx.castTimer = 0;
  ctx.castTime = 0;
}

export function tickMonsterCombat(
  ctx: MonsterCombatContext,
  monsterPos: Position,
  playerPos: Position,
  config: MonsterAttackConfig,
  map: MapData,
  deltaMs: number,
  isStunned: boolean = false,
  rng: Rng = defaultRng,
): MonsterTickResult {
  const dist = getDistance(monsterPos, playerPos);

  /* 暈眩期間不得出手，讀條暫停而非中止（§ 25.11.1）—— 早退讓 `castTimer` 不前進 */
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

      const inRange = isWithinAttackRange(monsterPos, playerPos, config.attackRange);
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

      const inRange = isWithinAttackRange(monsterPos, playerPos, config.attackRange);
      const hasLos = hasLineOfSight(monsterPos, playerPos, map);

      if (!inRange || !hasLos) {
        ctx.state = 'chasing';
        return { action: 'chase', moveTarget: playerPos };
      }

      ctx.attackTimer += deltaMs;
      if (ctx.attackTimer >= config.attackInterval) {
        ctx.attackTimer = 0;
        if (rng() < CAST_CHANCE) {
          ctx.state = 'casting';
          ctx.castTimer = 0;
          ctx.castTime = CAST_TIME_MIN + rng() * (CAST_TIME_MAX - CAST_TIME_MIN);
          return { action: 'none' };
        }
        return { action: 'attack' };
      }
      return { action: 'none' };
    }

    case 'casting': {
      if (dist > ctx.leashRange) {
        abortCast(ctx, 'roaming');
        return { action: 'leash' };
      }

      const inRange = isWithinAttackRange(monsterPos, playerPos, config.attackRange);
      const hasLos = hasLineOfSight(monsterPos, playerPos, map);

      if (!inRange || !hasLos) {
        abortCast(ctx, 'chasing');
        return { action: 'chase', moveTarget: playerPos };
      }

      ctx.castTimer += deltaMs;
      if (ctx.castTimer >= ctx.castTime) {
        const damageMultiplier = castDamageMultiplier(ctx.castTime);
        abortCast(ctx, 'attacking');
        ctx.attackTimer = 0;
        return { action: 'attack', damageMultiplier };
      }
      return { action: 'none' };
    }
  }
}
