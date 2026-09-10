/**
 * 怪物目標選擇（`97-selfhosted-server.md` § 97.7.1「怪物目標」）。
 *
 * 目標只在判定時刻變更，判定間隔 5 秒；每隻怪對每位成員維護最近 5 秒受傷量。
 * 一人隊伍的候選永遠只有一人，行為與單機相同。
 */
import type { Position } from '../models/mapControl';
import { getDistance } from './lineOfSight';

export const TARGET_DECISION_INTERVAL_MS = 5000;
export const DAMAGE_WINDOW_MS = 5000;

export interface MemberCandidate {
  id: number;
  position: Position;
}

interface DamageSample {
  at: number;
  amount: number;
}

export interface MonsterTargetState {
  targetId: number | null;
  /** 上次判定時刻；`targetId` 為 null 時無意義 */
  decidedAt: number;
  damage: Map<number, DamageSample[]>;
}

export function createMonsterTargetState(): MonsterTargetState {
  return { targetId: null, decidedAt: -Infinity, damage: new Map() };
}

export function recordMonsterDamage(state: MonsterTargetState, memberId: number, amount: number, now: number): void {
  if (amount <= 0) return;
  const list = state.damage.get(memberId) ?? [];
  list.push({ at: now, amount });
  state.damage.set(memberId, list);
}

/** 該成員最近 5 秒對這隻怪的傷害；順手丟掉過期樣本 */
export function recentDamage(state: MonsterTargetState, memberId: number, now: number): number {
  const list = state.damage.get(memberId);
  if (!list) return 0;
  let i = 0;
  while (i < list.length && now - list[i].at > DAMAGE_WINDOW_MS) i++;
  if (i > 0) list.splice(0, i);
  let total = 0;
  for (const s of list) total += s.amount;
  return total;
}

export function nearestCandidate(monsterPos: Position, candidates: MemberCandidate[]): MemberCandidate | null {
  let best: MemberCandidate | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = getDistance(monsterPos, c.position);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * 決定這個 tick 的目標。
 *
 * | 時機 | 規則 |
 * |---|---|
 * | 未激活（roaming） | 最近的成員，每 tick 更新 |
 * | 目標死亡／離線／離開實例 | 立即取最近的成員 |
 * | 距上次判定滿 5 秒 | 脫離範圍內、最近 5 秒受傷最高者；無候選取最近 |
 * | 其餘 | 不換 |
 */
export function resolveMonsterTarget(
  state: MonsterTargetState,
  monsterPos: Position,
  candidates: MemberCandidate[],
  engaged: boolean,
  leashRange: number,
  now: number,
): number | null {
  if (candidates.length === 0) {
    state.targetId = null;
    return null;
  }
  const current = state.targetId !== null ? candidates.find(c => c.id === state.targetId) : undefined;

  if (!engaged || !current) {
    state.targetId = nearestCandidate(monsterPos, candidates)!.id;
    state.decidedAt = now;
    return state.targetId;
  }

  if (now - state.decidedAt < TARGET_DECISION_INTERVAL_MS) return state.targetId;

  let best: MemberCandidate | null = null;
  let bestDamage = 0;
  for (const c of candidates) {
    if (getDistance(monsterPos, c.position) > leashRange) continue;
    const dmg = recentDamage(state, c.id, now);
    if (dmg > bestDamage) {
      bestDamage = dmg;
      best = c;
    }
  }
  state.targetId = (best ?? nearestCandidate(monsterPos, candidates)!).id;
  state.decidedAt = now;
  return state.targetId;
}
