import type { Character } from '../models/character';

/** 存量上限 12 小時（`04-character.md` § 4.11） */
export const RESTED_EXP_CAP_MS = 12 * 60 * 60 * 1000;
/** 離線 1 分鐘換 30 秒加倍 */
export const RESTED_EXP_ACCRUAL_RATIO = 0.5;
/** 存量 > 0 時的經驗倍率 */
export const RESTED_EXP_MULTIPLIER = 2;

/**
 * 上線時把離線時長按 `RESTED_EXP_ACCRUAL_RATIO` 換成加倍存量，
 * 超出上限的部分捨棄、不遞延。
 *
 * `lastSeenAt` 缺值（DB v22 以前的角色）視為無離線時間 —— 不追溯發放，
 * 否則舊角色一上線就直接領到滿額。
 */
export function accrueRestedExp(char: Character, now: number): Character {
  const lastSeenAt = char.lastSeenAt;
  const offlineMs = lastSeenAt == null ? 0 : Math.max(0, now - lastSeenAt);
  const gained = Math.floor(offlineMs * RESTED_EXP_ACCRUAL_RATIO);
  const restedExpMs = Math.min(RESTED_EXP_CAP_MS, (char.restedExpMs ?? 0) + gained);

  return { ...char, restedExpMs, lastSeenAt: now };
}

/**
 * UI 用的即時剩餘量：存量每 `RESTED_TICK_MS` 才落帳一次，
 * 直接顯示 `restedExpMs` 會每 10 秒跳一格（`24-buff-debuff.md` § 24.8.6）。
 */
export function getRestedExpRemaining(char: Character, now: number): number {
  const stored = char.restedExpMs ?? 0;
  if (stored <= 0) return 0;
  const sinceLastTick = char.lastSeenAt == null ? 0 : Math.max(0, now - char.lastSeenAt);

  return Math.max(0, stored - sinceLastTick);
}

/** 遊戲進行中以實時扣減，與是否在戰鬥、是否在城鎮無關 */
export function drainRestedExp(char: Character, deltaMs: number, now: number): Character {
  const current = char.restedExpMs ?? 0;
  if (current <= 0) return char.lastSeenAt === now ? char : { ...char, lastSeenAt: now };

  return { ...char, restedExpMs: Math.max(0, current - Math.max(0, deltaMs)), lastSeenAt: now };
}

export function isRestedExpActive(char: Character): boolean {
  return (char.restedExpMs ?? 0) > 0;
}

export function getRestedExpMultiplier(char: Character): number {
  return isRestedExpActive(char) ? RESTED_EXP_MULTIPLIER : 1;
}
