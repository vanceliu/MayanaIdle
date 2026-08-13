import {
  COMBAT_CONDITION_LABELS,
  COMBAT_ACTION_LABELS,
  PERSISTENT_CONDITION_LABELS,
  PERSISTENT_ACTION_LABELS,
} from './scriptEngine';
import { VILLAGE_CONDITION_LABELS, VILLAGE_ACTION_LABELS } from './villageScript';
import { PENDING_RULE_LABELS, getTalentRuleDef } from '../db/seed/talentSeeds';
import type { TalentRuleDef } from './talent';

/**
 * 條件／動作的顯示名稱。標籤一律取自既有常數，編輯器與 Wiki 共用同一份
 * （`43-wiki-system.md` § 4.12）。
 *
 * 能力階梯塌成完整版之後**不再有階級專屬名稱**（§ 51.4.1）——
 * 一個 `ruleId` 只有一個名字。
 */
export function ruleLabelOf(def: TalentRuleDef): string {
  const maps: Record<string, string>[] = def.kind === 'condition'
    ? [COMBAT_CONDITION_LABELS, PERSISTENT_CONDITION_LABELS, VILLAGE_CONDITION_LABELS]
    : [COMBAT_ACTION_LABELS, PERSISTENT_ACTION_LABELS, VILLAGE_ACTION_LABELS];
  for (const m of maps) {
    if (def.ruleId in m) return m[def.ruleId];
  }
  // 尚未接上判定引擎的，標籤表裡查不到（`talentSeeds.ts`）
  return PENDING_RULE_LABELS[def.ruleId] ?? def.ruleId;
}

export function ruleLabel(ruleId: string): string {
  const def = getTalentRuleDef(ruleId);
  return def ? ruleLabelOf(def) : ruleId;
}
