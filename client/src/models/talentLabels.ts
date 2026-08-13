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
 * 同一個 `ruleId` 橫跨多階時的階級專屬名稱（`51-auto-talent.md`
 * § 51.4.9~51.4.11）。**鍵是定義 id，不是 `ruleId`** ——
 * 可選範圍階梯（指定 → 池 → 自選）共用同一條規則，只有名稱區分得出來。
 *
 * 各階梯的最高階沿用規則標籤本身（`skill` ＝「施放攻擊技能」），不列在這裡。
 */
const AFFIX_LABEL_BY_TIER: Record<number, string> = {
  2003: '施放指定攻擊技能',
  2004: '施放指定系別攻擊技能',
  2103: '施放特定招式',
  2204: '購買指定類別道具至',
  2205: '從倉庫取指定類別道具至',
};

/**
 * 鑲材的顯示名稱。標籤一律取自既有常數，編輯器、Wiki、掉落日誌共用同一份
 * （`43-wiki-system.md` § 4.12）。
 */
export function affixLabelOf(def: TalentAffixDef): string {
  const byTier = AFFIX_LABEL_BY_TIER[def.id];
  if (byTier) return byTier;

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
