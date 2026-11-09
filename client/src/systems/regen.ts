import type { Character } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { ActiveEffect } from '../models/effect';
import { getTotalAttributes, getEffectiveVIT, getEffectiveSPI } from '../models/character';
import { getAffixBonusesFromGear, getBuffFlatBonus } from './combat';
import { gameNow } from '../core/clock';
import { ABILITY_LOW_RESOURCE_PERCENT, sumAbilityParam } from '../models/ability';

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

function liveGear(gear: (EquipmentInstance | null)[]): EquipmentInstance[] {
  return gear.filter((g): g is EquipmentInstance => g != null);
}

/** 低血／低魔回復（`07-affix-ability.md` § 7S.5）：低於有效最大值 50% 時才加，多件加總 */
function lowResourceBonus(current: number, max: number, gear: (EquipmentInstance | null)[], type: 'low_hp_regen' | 'low_mp_regen'): number {
  if (max <= 0 || current * 100 >= max * ABILITY_LOW_RESOURCE_PERCENT) return 0;
  return sumAbilityParam(gear, type, 'regen');
}

export function getHpRegen(char: Character, inCombat: boolean, gear: (EquipmentInstance | null)[] = [], activeEffects: ActiveEffect[] = []): number {
  const attrs = getTotalAttributes(char, activeEffects, gear);
  const effVIT = getEffectiveVIT(attrs.VIT);
  const base = Math.floor(effVIT / 2);
  // 模板值（飾品／腰帶）＋「回血」詞綴（防具唯一來源，`07-affix.md` § 7.3.1）
  // 回血藥水（`30-items.md` § 30.4a）同裝備，戰鬥中隨總量減半
  const equipBonus = gear.reduce((sum, g) => sum + (g?.hpRegen ?? 0), 0)
    + getAffixBonusesFromGear(gear).hp_regen + getBuffFlatBonus(activeEffects, 'hp_regen');
  // 有效最大 HP，同 `gameStore.ts` 的 `getEffectiveMaxHp`（`gear` 已是生效中的裝備）
  const items = liveGear(gear);
  const maxHp = char.maxHp + items.reduce((sum, g) => sum + (g.bonusHp ?? 0), 0) + getAffixBonusesFromGear(items).max_hp;
  const total = base + equipBonus + lowResourceBonus(char.hp, maxHp, gear, 'low_hp_regen');
  if (total <= 0) return 0;
  if (inCombat) return Math.max(1, Math.floor(total / 2));
  return total;
}

export function getMpRegen(char: Character, inCombat: boolean, gear: (EquipmentInstance | null)[] = [], activeEffects: ActiveEffect[] = []): number {
  const attrs = getTotalAttributes(char, activeEffects, gear);
  const effSPI = getEffectiveSPI(attrs.SPI);
  const base = Math.floor(effSPI / 2);
  const equipBonus = gear.reduce((sum, g) => sum + (g?.mpRegen ?? 0), 0)
    + getAffixBonusesFromGear(gear).mp_regen + getBuffFlatBonus(activeEffects, 'mp_regen');
  // 有效最大 MP，同 `gameStore.ts` 的 `getEffectiveMaxMp`（`gear` 已是生效中的裝備）
  const items = liveGear(gear);
  const maxMp = char.maxMp + items.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0) + getAffixBonusesFromGear(items).max_mp;
  const total = base + equipBonus + lowResourceBonus(char.mp, maxMp, gear, 'low_mp_regen');
  const regen = total <= 0 ? 0 : inCombat ? Math.max(1, Math.floor(total / 2)) : total;
  const percent = getMpRegenMaxPercent(activeEffects);
  if (percent <= 0) return regen;
  return regen + Math.floor(maxMp * percent / 100);
}

export const HP_REGEN_INTERVAL_MS = 5000;
export const MP_REGEN_INTERVAL_MS = 6000;
