import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { ActiveEffect } from '../models/effect';
import { getTotalAttributes, getEffectiveVIT, getEffectiveSPI } from '../models/character';
import { getAffixBonusesFromGear } from './combat';
import { gameNow } from '../core/clock';

/** 回魔 buff 的修正值 stat：每次回魔另加有效最大 MP 的 X%，戰鬥中不減半（`23-class-magic.md` § 23.5 魔力湧泉） */
export const MP_REGEN_MAX_PERCENT_STAT = 'mp_regen_max_percent';

/** 生效中的回魔 buff 百分比加總 */
function getMpRegenMaxPercent(activeEffects: ActiveEffect[]): number {
  const now = gameNow();
  let percent = 0;
  for (const e of activeEffects) {
    if (e.type !== 'buff' || e.target !== 'player' || now - e.startTime >= e.duration) continue;
    for (const m of e.modifiers ?? []) if (m.stat === MP_REGEN_MAX_PERCENT_STAT) percent += m.value;
  }
  return percent;
}

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
  const regen = total <= 0 ? 0 : inCombat ? Math.max(1, Math.floor(total / 2)) : total;
  const percent = getMpRegenMaxPercent(activeEffects);
  if (percent <= 0) return regen;
  // 有效最大 MP，同 `gameStore.ts` 的 `getEffectiveMaxMp`（`gear` 已是生效中的裝備）
  const items = gear.filter((g): g is EquipmentInstance => g != null);
  const maxMp = char.maxMp + items.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0) + getAffixBonusesFromGear(items).max_mp;
  return regen + Math.floor(maxMp * percent / 100);
}

export const HP_REGEN_INTERVAL_MS = 5000;
export const MP_REGEN_INTERVAL_MS = 6000;
