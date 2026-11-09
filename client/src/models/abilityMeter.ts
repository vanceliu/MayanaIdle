/**
 * 怒氣、平靜的當下數值（`07-affix-ability.md` § 7S.5），由 buff 的時間與參數推算，不另外同步。
 */
import type { ActiveEffect } from './effect';
import { ABILITY_CALM_MAX } from './ability';

export const RAGE_DECAY_STAT = 'rage_decay';
export const CALM_RATE_STAT = 'calm_rate';
export const ABILITY_CALM_CATEGORY = 'ability-calm';

const modValue = (effect: ActiveEffect, stat: string) => effect.modifiers?.find(m => m.stat === stat)?.value ?? 0;

/** 怒氣：剩餘時間 × 每秒減少量；平靜：已累積秒數 × 每秒累積量（上限 100）。不是這兩種時回 undefined */
export function getAbilityMeterValue(effect: ActiveEffect, now: number): number | undefined {
  const decay = modValue(effect, RAGE_DECAY_STAT);
  if (decay > 0) return Math.max(0, Math.ceil((effect.startTime + effect.duration - now) / 1000 * decay));
  const rate = modValue(effect, CALM_RATE_STAT);
  if (rate > 0) return Math.min(ABILITY_CALM_MAX, Math.floor(Math.max(0, now - effect.startTime) / 1000) * rate);
  return undefined;
}
