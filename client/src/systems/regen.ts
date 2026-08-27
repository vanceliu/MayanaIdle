import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { ActiveEffect } from '../models/effect';
import { getTotalAttributes, getEffectiveVIT, getEffectiveSPI } from '../models/character';
import { getAffixBonusesFromGear } from './combat';

export function getHpRegen(char: Character, inCombat: boolean, gear: (EquipmentInstance | null)[] = [], activeEffects: ActiveEffect[] = []): number {
  const attrs = getTotalAttributes(char, activeEffects, gear);
  const effVIT = getEffectiveVIT(attrs.VIT);
  const base = Math.floor(effVIT / 2);
  // 模板值（飾品／腰帶）＋「回血」詞綴（防具唯一來源，`07-affix.md` § 7.3.1）
  const equipBonus = gear.reduce((sum, g) => sum + (g?.hpRegen ?? 0), 0)
    + getAffixBonusesFromGear(gear).hp_regen;
  const total = base + equipBonus;
  if (total <= 0) return 0;
  if (inCombat) return Math.max(1, Math.floor(total / 2));
  return total;
}

export function getMpRegen(char: Character, inCombat: boolean, gear: (EquipmentInstance | null)[] = [], activeEffects: ActiveEffect[] = []): number {
  const attrs = getTotalAttributes(char, activeEffects, gear);
  const effSPI = getEffectiveSPI(attrs.SPI);
  const base = Math.floor(effSPI / 2);
  const equipBonus = gear.reduce((sum, g) => sum + (g?.mpRegen ?? 0), 0)
    + getAffixBonusesFromGear(gear).mp_regen;
  const total = base + equipBonus;
  if (total <= 0) return 0;
  if (inCombat) return Math.max(1, Math.floor(total / 2));
  return total;
}

export const HP_REGEN_INTERVAL_MS = 5000;
export const MP_REGEN_INTERVAL_MS = 6000;
