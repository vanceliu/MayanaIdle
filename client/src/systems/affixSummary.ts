/**
 * 裝備欄詞綴加總（`34-ui-guidelines.md`「裝備欄詞綴加總」）。
 */
import {
  AFFIX_DEFINITIONS,
  BRAND_ELEMENT_ZH,
  collectAffixAttributes,
  collectSpecialAffixTypes,
  getBrandElement,
  getSpecialAffixDefinition,
  isDecimalAffixType,
  isFlatAffixType,
  type AffixBonuses,
} from '../models/affix';
import { ATTRIBUTE_KEYS, ATTRIBUTE_NAMES_ZH } from '../models/attributes';
import { formatUniqueAffixEffect } from '../models/uniqueAffix';
import { formatAbilityEffect } from '../models/ability';
import type { EquipmentInstance } from '../models/equipment';
import { getAffixBonusesFromGear, isUniqueAffixMergedIntoBonuses } from './combat';

export interface AffixSummaryRow {
  name: string;
  /** 無數值的項目（特殊詞綴、獨有詞綴效果）為空字串 */
  value: string;
}

function formatBonus(type: keyof AffixBonuses, value: number): string {
  if (isDecimalAffixType(type)) return `+${value.toFixed(1)}%`;
  if (isFlatAffixType(type)) return `+${value}`;
  return `+${value}%`;
}

/** 傳入的裝備須已過 `getEffectiveGear()`（凍結與同類去重） */
export function summarizeAffixes(gear: EquipmentInstance[]): AffixSummaryRow[] {
  const bonuses = getAffixBonusesFromGear(gear);
  const weapon = gear.find(g => g.slot === 'rightHand');
  const rows: AffixSummaryRow[] = [];

  for (const def of AFFIX_DEFINITIONS) {
    if (def.type === 'bonus_attribute') continue;
    const type = def.type as keyof AffixBonuses;
    const value = bonuses[type];
    if (!value) continue;
    const element = type === 'element_brand' ? getBrandElement(weapon?.affixes) : undefined;
    rows.push({ name: element ? `${def.name}（${BRAND_ELEMENT_ZH[element]}）` : def.name, value: formatBonus(type, value) });
  }

  const attributes = collectAffixAttributes(gear);
  for (const key of ATTRIBUTE_KEYS) {
    if (attributes[key]) rows.push({ name: ATTRIBUTE_NAMES_ZH[key], value: `+${attributes[key]}` });
  }

  for (const type of collectSpecialAffixTypes(gear)) {
    rows.push({ name: getSpecialAffixDefinition(type)?.name ?? type, value: '' });
  }

  for (const item of gear) {
    if (item.uniqueAffix && !isUniqueAffixMergedIntoBonuses(item.uniqueAffix.type)) {
      rows.push({ name: formatUniqueAffixEffect(item.uniqueAffix), value: '' });
    }
  }
  return rows;
}

/** 隨機技能的效果列（§ 7S.7），排在 `summarizeAffixes()` 之後；傳入的裝備須已過 `getEffectiveGear()` */
export function summarizeAbilities(gear: EquipmentInstance[]): AffixSummaryRow[] {
  return gear.filter(g => g.ability).map(g => ({ name: formatAbilityEffect(g.ability!), value: '' }));
}
