/**
 * 天賦格 ＋ 鑲材 → 既有的規則形狀（`51-auto-talent.md`）。
 *
 * **判定邏輯完全不動。** `evaluateCombatScript` / `evaluatePersistentScript` /
 * `evaluateVillageScript` 吃的還是 `CombatRule[]` 那些形狀，這裡只負責
 * 「規則從哪裡來」—— 從玩家寫的陣列改成從天賦格組出來。
 *
 * 這也是 `16-tech-frontend-architecture.md` § 32.18 要的分工：
 * runner 只看天賦格鑲了什麼，不查持有清單。
 */
import type { CombatRule, PersistentRule } from '../models/scriptEngine';
import type { VillageRule } from '../models/villageScript';
import { isSlotInstalled, type TalentAffixInstance, type TalentSlot, type TalentType } from '../models/talent';
import { getTalentAffixDef } from '../db/seed/talentSeeds';

/** 組出來的一條規則（三種類型共用同一個形狀，差別只在 type 字串） */
interface BuiltRule {
  id: string;
  enabled: boolean;
  conditions: Record<string, unknown>[];
  action: Record<string, unknown>;
}

/**
 * 把鑲材攤平成 `{ type, ...params }`。
 *
 * `fixed` 型的綁定值蓋過玩家參數 —— 那是掉落時 roll 死的，玩家不可更改（§ 51.4.1）。
 * 目前只有技能類會用到綁定值；日後的指定類別道具在這裡加分支。
 */
function toRulePart(affix: TalentAffixInstance): Record<string, unknown> | null {
  const def = getTalentAffixDef(affix.definitionId);
  if (!def || def.blocked) return null;

  const part: Record<string, unknown> = { type: def.ruleId, ...(affix.params ?? {}) };
  if (def.form === 'fixed' && affix.boundParam !== null) {
    part.skillId = affix.boundParam;
  }
  return part;
}

/**
 * 組出某個類型的規則列表。
 *
 * 跳過的情況：
 * - 天賦格未安裝（躺在背包，§ 51.3.4）
 * - 停用
 * - **實作槽留空** —— 該天賦格不參與判定（§ 51.3.1）
 */
export function buildRules(
  type: TalentType,
  slots: TalentSlot[],
  affixes: TalentAffixInstance[],
  templateId: string,
): BuiltRule[] {
  const mine = slots
    .filter(s => isSlotInstalled(s) && s.assignedType === type && s.templateId === templateId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const rules: BuiltRule[] = [];
  for (const slot of mine) {
    const inSlot = affixes.filter(a => a.slotId === slot.id);
    const actionAffix = inSlot.find(a => a.slotIndex === null);
    if (!actionAffix) continue; // 實作槽留空＝不參與判定

    const action = toRulePart(actionAffix);
    if (!action) continue;

    const conditions = inSlot
      .filter(a => a.slotIndex !== null)
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
      .map(toRulePart)
      .filter((p): p is Record<string, unknown> => p !== null);

    rules.push({
      id: `slot-${slot.id}`,
      enabled: slot.enabled,
      // 條件槽全空＝恆真（§ 51.3.1）。空陣列在既有 evaluator 就是「永遠」
      conditions,
      action,
    });
  }
  return rules;
}

export function buildCombatRules(
  slots: TalentSlot[], affixes: TalentAffixInstance[], templateId: string,
): CombatRule[] {
  return buildRules('combat', slots, affixes, templateId) as unknown as CombatRule[];
}

export function buildPersistentRules(
  slots: TalentSlot[], affixes: TalentAffixInstance[], templateId: string,
): PersistentRule[] {
  return buildRules('persistent', slots, affixes, templateId) as unknown as PersistentRule[];
}

export function buildVillageRules(
  slots: TalentSlot[], affixes: TalentAffixInstance[], templateId: string,
): VillageRule[] {
  return buildRules('supply', slots, affixes, templateId) as unknown as VillageRule[];
}
