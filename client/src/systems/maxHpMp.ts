/**
 * 最大 HP／MP（`20-attributes.md` § 20.4、§ 20.5）。
 * `gear` 傳生效中的裝備（已套素質需求凍結）；buff 不計入。
 */
import type { Character, ClassName } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import { getTotalAttributes } from '../models/character';
import { starTotalsOf } from '../models/starChart';
import { getAffixBonusesFromGear } from './combat';

export const CLASS_HP_MP_FORMULA: Record<ClassName, { hpRatio: number; hpBonus: number; mpRatio: number; mpBonus: number }> = {
  knight:       { hpRatio: 0.7, hpBonus: 19, mpRatio: 0.4, mpBonus: 6 },
  elf:          { hpRatio: 0.6, hpBonus: 22, mpRatio: 0.5, mpBonus: 4 },
  thief:        { hpRatio: 0.5, hpBonus: 25, mpRatio: 0.5, mpBonus: 5 },
  elementalist: { hpRatio: 0.4, hpBonus: 26, mpRatio: 0.7, mpBonus: 0 },
  priest:       { hpRatio: 0.4, hpBonus: 26, mpRatio: 0.7, mpBonus: 2 },
};

function liveGear(gear: readonly (EquipmentInstance | null)[]): EquipmentInstance[] {
  return gear.filter((g): g is EquipmentInstance => g != null);
}

function compute(attr: number, ratio: number, bonus: number, flat: number, starPct: number, level: number): number {
  return Math.floor((Math.floor(level * attr * ratio) + bonus + flat) * (1 + starPct / 100));
}

export function getMaxHp(char: Character, gear: readonly (EquipmentInstance | null)[]): number {
  const items = liveGear(gear);
  const f = CLASS_HP_MP_FORMULA[char.className];
  const vit = getTotalAttributes(char, undefined, items).VIT;
  const flat = items.reduce((sum, g) => sum + (g.bonusHp ?? 0), 0) + getAffixBonusesFromGear(items).max_hp;
  const pct = starTotalsOf(char.starChart, char.className).totals.get('hpPct') ?? 0;
  return compute(vit, f.hpRatio, f.hpBonus, flat, pct, char.level);
}

export function getMaxMp(char: Character, gear: readonly (EquipmentInstance | null)[]): number {
  const items = liveGear(gear);
  const f = CLASS_HP_MP_FORMULA[char.className];
  const spi = getTotalAttributes(char, undefined, items).SPI;
  const flat = items.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0) + getAffixBonusesFromGear(items).max_mp;
  const pct = starTotalsOf(char.starChart, char.className).totals.get('mpPct') ?? 0;
  return compute(spi, f.mpRatio, f.mpBonus, flat, pct, char.level);
}
