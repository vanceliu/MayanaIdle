import { getWeaponRange, isRangedWeapon } from '../models/equipment';
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
  /**
   * **出手判定**：當下這一擊打不打得到。等於腳本此刻選中的動作自己的射程
   * （技能用 `skill.range`，普通攻擊用武器射程）。
   */
  range: number;
  /**
   * **追擊距離**：要走多近才停。等於腳本啟用規則會用到的最遠射程。
   *
   * 與 `range` 分開的理由：技能全在冷卻時 `range` 會塌回武器射程，
   * 若拿它當追擊目標，遠程職業每個冷卻空檔都會往怪身上蹭
   * （`41-arpg-combat.md` § 3.1）。省略時視同 `range`。
   */
  chaseRange?: number;
}

export function getWeaponAttackConfig(weaponType: string | undefined): AttackConfig {
  return {
    attackType: isRangedWeapon(weaponType) ? 'ranged' : 'melee',
    range: getWeaponRange(weaponType),
  };
}

/**
 * 腳本啟用的規則實際會用到的最遠射程 —— 這才是角色該站的位置。
 *
 * **停用的規則不計入**：玩家把「普通攻擊」關掉就代表不打算貼身，
 * 武器的 1.5 格不該再把他拖進近身（這正是原本的缺陷：武器射程是無條件起點）。
 * 一條啟用的攻擊規則都沒有時退回武器射程，因為沒有別的依據。
 */
export function getScriptChaseRange(
  rules: { enabled: boolean; action: { type: string; skillId?: string } }[],
  skills: { id: string; type: string; range?: number }[],
  weaponRange: number,
): number {
  let max = 0;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.action.type === 'normal_attack') {
      max = Math.max(max, weaponRange);
      continue;
    }
    if (rule.action.type !== 'skill' || !rule.action.skillId) continue;
    const skill = skills.find(s => s.id === rule.action.skillId);
    // 只看攻擊技能：buff／heal 的 range 0 是「對自己」，不是站位依據
    if (skill?.type === 'attack' && skill.range) max = Math.max(max, skill.range);
  }
  return max > 0 ? max : weaponRange;
}

export interface PlayerTickResult {
  action: 'none' | 'move_to' | 'attack';
  moveTarget?: Position;
  moveRange?: number;
  attackTargetIdx?: number;
}

/**
 * 追擊中最多能累積到冷卻的幾成。
 * 1 = 走路時間全算（密集怪群下 DPS 會超過攻速面板）、0 = 全部抹掉（走路白走）。
 */
const CHASE_COOLDOWN_CARRY = 0.5;

export function tickPlayerCombat(
  ctx: PlayerCombatContext,
  playerPos: Position,
  monsters: MonsterInfo[],
  attackConfig: AttackConfig,
  map: MapData,
  deltaMs: number,
  isStunned: boolean = false,
  /**
   * 腳本此刻是否有可執行的動作。false 代表技能都在冷卻（或條件不成立），
   * 此時不可用 `range` 當追擊目標，否則會蹭到怪身邊 —— 改用 `chaseRange` 原地等。
   */
  hasExecutableAction: boolean = true,
): PlayerTickResult {
  // 暈眩：攻擊計時器暫停、無法行動（§ 24.5.1）
  if (isStunned) return { action: 'none' };

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

    // 腳本此刻沒有可執行動作 → **不出手**（玩家關掉普通攻擊就代表不打算平A）。
    // 計時器夾在上限而不是歸零，冷卻一結束就能立刻出手，不必再等一個完整攻擊間隔。
    if (!hasExecutableAction) {
      if (ctx.attackTimer >= ctx.attackCooldown) ctx.attackTimer = ctx.attackCooldown;
      return { action: 'none' };
    }

    if (ctx.attackTimer >= ctx.attackCooldown) {
      ctx.attackTimer = 0;
      return { action: 'attack', attackTargetIdx: target.index };
    }
    return { action: 'none' };
  }

  // 沒有可執行動作時，只走到「腳本會用到的最遠射程」為止，不追到武器射程
  const moveRange = hasExecutableAction
    ? attackConfig.range
    : attackConfig.chaseRange ?? attackConfig.range;

  // 已經在該站的位置、視線也通 → 原地等冷卻，不要再往前蹭
  if (dist <= moveRange && hasLos) {
    ctx.state = 'attacking';
    // 計時器照走，冷卻一結束就能立刻出手，不必再等一個完整攻擊間隔
    ctx.attackTimer += deltaMs;
    if (ctx.attackTimer >= ctx.attackCooldown) ctx.attackTimer = ctx.attackCooldown;
    return { action: 'none' };
  }

  // Need to get closer
  ctx.state = 'chasing';
  /**
   * 追擊中計時器**照走，但只累積到冷卻的一半**（`41-arpg-combat.md` § 3.1）。
   *
   * 歸零是錯的：冷卻是「距離上一次出手過了多久」，走路那段時間本來就過去了，
   * 抹掉它等於同一件事算兩次。
   *
   * 但也不能整段照算：一刀一隻的密集怪群下，每次接敵都補滿冷卻，
   * 兩次出手的間隔會被走路時間吃掉一大截，實際 DPS 高於攻速面板。
   * 折半是兩者之間 —— 走路不白走，也不會走到就打。
   *
   * 已經超過一半的不倒扣：那是站定等冷卻累積來的，不該因為怪跑掉而沒收。
   */
  const carried = ctx.attackCooldown * CHASE_COOLDOWN_CARRY;
  if (ctx.attackTimer < carried) {
    ctx.attackTimer = Math.min(ctx.attackTimer + deltaMs, carried);
  }
  return { action: 'move_to', moveTarget: target.position, moveRange };
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
