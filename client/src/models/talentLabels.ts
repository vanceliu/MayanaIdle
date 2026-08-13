import {
  COMBAT_CONDITION_LABELS,
  COMBAT_ACTION_LABELS,
  PERSISTENT_CONDITION_LABELS,
  PERSISTENT_ACTION_LABELS,
} from './scriptEngine';
import { VILLAGE_CONDITION_LABELS, VILLAGE_ACTION_LABELS } from './villageScript';
import { PENDING_AFFIX_LABELS, getTalentAffixDef } from '../db/seed/talentSeeds';
import {
  SKILL_POOL_LABELS,
  ITEM_POOL_LABELS,
  type SkillPoolKey,
  type ItemPoolKey,
  type TalentAffixDef,
  type TalentAffixInstance,
} from './talent';

/**
 * 鑲材的顯示名稱。標籤一律取自既有常數，編輯器、Wiki、掉落日誌共用同一份
 * （`43-wiki-system.md` § 4.12）。
 */
export function affixLabelOf(def: TalentAffixDef): string {
  const maps: Record<string, string>[] = def.kind === 'condition'
    ? [COMBAT_CONDITION_LABELS, PERSISTENT_CONDITION_LABELS, VILLAGE_CONDITION_LABELS]
    : [COMBAT_ACTION_LABELS, PERSISTENT_ACTION_LABELS, VILLAGE_ACTION_LABELS];
  for (const m of maps) {
    if (def.ruleId in m) return m[def.ruleId];
  }
  // 尚未接上判定引擎的鑲材，標籤表裡查不到（`talentSeeds.ts`）
  return PENDING_AFFIX_LABELS[def.ruleId] ?? def.ruleId;
}

export function affixLabel(affix: TalentAffixInstance): string {
  const def = getTalentAffixDef(affix.definitionId);
  return def ? affixLabelOf(def) : '未知鑲材';
}

/** 池型 roll 出來的子集顯示名（火系、單體、藥水…）。查不到就不顯示 */
export function boundParamLabel(boundParam: string | null): string | null {
  if (!boundParam) return null;
  return SKILL_POOL_LABELS[boundParam as SkillPoolKey]
    ?? ITEM_POOL_LABELS[boundParam as ItemPoolKey]
    ?? null;
}

/**
 * 掉落日誌用的一行（`51-auto-talent.md` § 51.6.1）。
 * 只有階級的話玩家得開背包翻才知道撿到什麼 —— 同一階有十幾種。
 */
export function affixDropLabel(def: TalentAffixDef, boundParam: string | null): string {
  const bound = boundParamLabel(boundParam);
  return `${affixLabelOf(def)}${bound ? `・${bound}` : ''}（T${def.tier}）`;
}
