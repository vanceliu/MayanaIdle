/** 怒氣、平靜的當下數值（`07-affix-ability.md` § 7S.5） */
import { describe, it, expect } from 'vitest';
import { getAbilityMeterValue, RAGE_DECAY_STAT, CALM_RATE_STAT } from '../abilityMeter';
import type { ActiveEffect } from '../effect';

const effect = (stat: string, value: number, duration: number): ActiveEffect => ({
  id: 'x', sourceSkillId: 'x', sourceSkillName: 'x', category: 'x', type: 'buff', target: 'player',
  modifiers: [{ stat, value, isPercent: false }], startTime: 1000, duration, tags: [], name: 'x', description: '',
});

describe('getAbilityMeterValue', () => {
  it('怒氣＝剩餘秒數 × 每秒減少量', () => {
    const rage = effect(RAGE_DECAY_STAT, 10, 8000);
    expect(getAbilityMeterValue(rage, 1000)).toBe(80);
    expect(getAbilityMeterValue(rage, 4500)).toBe(45);
    expect(getAbilityMeterValue(rage, 20000)).toBe(0);
  });

  it('平靜＝滿 1 秒累積一次，上限 100', () => {
    const calm = effect(CALM_RATE_STAT, 7, 3_600_000);
    expect(getAbilityMeterValue(calm, 3900)).toBe(14);
    expect(getAbilityMeterValue(calm, 60_000)).toBe(100);
  });

  it('其他 buff 回 undefined', () => {
    expect(getAbilityMeterValue(effect('defense', 5, 1000), 1000)).toBeUndefined();
  });
});
