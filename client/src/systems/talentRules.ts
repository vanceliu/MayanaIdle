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
import { getParamFields } from '../models/talentParams';

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
  /*
   * `keep` 是巢狀物件，但鑲材的 params 是平的，所以用 `keepXxx` 前綴宣告再組回來
   * （§ 49.4 的保留條件）。
   */
  if ('keepClassUsable' in part || 'keepAffixTierAbove' in part) {
    part.keep = {
      classUsable: part.keepClassUsable === true,
      affixTierAbove: typeof part.keepAffixTierAbove === 'number' ? part.keepAffixTierAbove : undefined,
    };
    delete part.keepClassUsable;
    delete part.keepAffixTierAbove;
  }
  if (def.form === 'fixed' && affix.boundParam !== null) {
    part.skillId = affix.boundParam;
  }
  return part;
}

/**
 * 技能／道具還沒選定的實作 —— 這條規則放不出來（§ 51.3.1）。
 *
 * 數值與選單型的參數鑲入時就有預設值，只有技能與道具沒有：
 * 指定型要玩家選定、自選型要玩家挑，沒選之前這條規則必須跳過。
 */
function isUnresolved(part: Record<string, unknown>, ruleId: string): boolean {
  return getParamFields(ruleId).some(f =>
    (f.kind === 'skill' || f.kind === 'item')
    && !f.optional
    && (part[f.key] === undefined || part[f.key] === null || part[f.key] === ''));
}

/** 這個天賦格不參與判定的原因（§ 51.3.1）。null ＝ 有參與 */
export type SlotSkipReason = 'no-action' | 'unresolved';

/** 組出單一天賦格的規則；不參與判定時回傳原因 */
function buildSlotRule(slot: TalentSlot, inSlot: TalentAffixInstance[]): BuiltRule | SlotSkipReason {
  const actionAffix = inSlot.find(a => a.slotIndex === null);
  if (!actionAffix) return 'no-action';

  const action = toRulePart(actionAffix);
  if (!action) return 'no-action';
  const actionDef = getTalentAffixDef(actionAffix.definitionId)!;
  if (isUnresolved(action, actionDef.ruleId)) return 'unresolved';

  const conditions: Record<string, unknown>[] = [];
  const conditionAffixes = inSlot
    .filter(a => a.slotIndex !== null)
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  for (const affix of conditionAffixes) {
    const part = toRulePart(affix);
    if (!part) continue;
    const def = getTalentAffixDef(affix.definitionId)!;
    if (isUnresolved(part, def.ruleId)) return 'unresolved';
    conditions.push(part);
  }

  return {
    id: `slot-${slot.id}`,
    enabled: slot.enabled,
    // 條件槽全空＝恆真（§ 51.3.1）
    conditions,
    action,
  };
}

/** 編輯器用：這一列有沒有進判定 */
export function slotSkipReason(
  slot: TalentSlot, affixes: TalentAffixInstance[],
): SlotSkipReason | null {
  const built = buildSlotRule(slot, affixes.filter(a => a.slotId === slot.id));
  return typeof built === 'string' ? built : null;
}

/**
 * 組出某個類型的規則列表。
 *
 * 跳過的情況：
 * - 天賦格未安裝（躺在背包，§ 51.3.4）
 * - **實作槽留空** —— 該天賦格不參與判定（§ 51.3.1）
 * - **技能／道具還沒選定**（實作或條件）—— 判定往下一條走
 */
export function buildRules(
  type: TalentType,
  slots: TalentSlot[],
  affixes: TalentAffixInstance[],
  templateId: string,
): BuiltRule[] {
  return slots
    .filter(s => isSlotInstalled(s) && s.assignedType === type && s.templateId === templateId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(slot => buildSlotRule(slot, affixes.filter(a => a.slotId === slot.id)))
    .filter((r): r is BuiltRule => typeof r !== 'string');
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
