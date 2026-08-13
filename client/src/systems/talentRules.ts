/**
 * 天賦格 → 既有的規則形狀（`51-auto-talent.md`）。
 *
 * **判定邏輯完全不動。** `evaluateCombatScript` / `evaluatePersistentScript` /
 * `evaluateVillageScript` 吃的還是 `CombatRule[]` 那些形狀，這裡只負責
 * 「規則從哪裡來」—— 從玩家寫的陣列改成從天賦格組出來。
 *
 * 這也是 `16-tech-frontend-architecture.md` § 32.18 要的分工：
 * runner 只看天賦格設了什麼，不查持有清單。
 */
import type { CombatRule, PersistentRule } from '../models/scriptEngine';
import type { VillageRule } from '../models/villageScript';
import { isSlotInstalled, type TalentSlot, type TalentSlotEntry, type TalentType } from '../models/talent';
import { getTalentRuleDef } from '../db/seed/talentSeeds';
import { getParamFields } from '../models/talentParams';

/** 組出來的一條規則（三種類型共用同一個形狀，差別只在 type 字串） */
interface BuiltRule {
  id: string;
  enabled: boolean;
  conditions: Record<string, unknown>[];
  action: Record<string, unknown>;
}

/**
 * 把槽位攤平成 `{ type, ...params }`。
 *
 * 參數一律來自玩家設定（§ 51.4.1）—— 沒有 roll 出來的綁定值要蓋。
 */
function toRulePart(entry: TalentSlotEntry): Record<string, unknown> | null {
  const def = getTalentRuleDef(entry.ruleId);
  if (!def || def.blocked) return null;

  const part: Record<string, unknown> = { type: def.ruleId, ...(entry.params ?? {}) };
  /*
   * `keep` 是巢狀物件，但槽位的 params 是平的，所以用 `keepXxx` 前綴宣告再組回來
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
  return part;
}

/**
 * 技能／道具還沒選定的動作 —— 這條規則放不出來（§ 51.3.1）。
 *
 * 數值與選單型的參數設定時就有預設值，只有技能與道具沒有：
 * 開局三格「施放攻擊技能」都是未選定的，沒選之前這條規則必須跳過（§ 51.7）。
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
function buildSlotRule(slot: TalentSlot): BuiltRule | SlotSkipReason {
  if (!slot.action) return 'no-action';

  const action = toRulePart(slot.action);
  if (!action) return 'no-action';
  if (isUnresolved(action, slot.action.ruleId)) return 'unresolved';

  const conditions: Record<string, unknown>[] = [];
  for (const entry of slot.conditions) {
    // 空槽視為恆真（§ 51.3.1）
    if (!entry) continue;
    const part = toRulePart(entry);
    if (!part) continue;
    if (isUnresolved(part, entry.ruleId)) return 'unresolved';
    conditions.push(part);
  }

  return {
    id: `slot-${slot.id}`,
    enabled: slot.enabled,
    conditions,
    action,
  };
}

/** 編輯器用：這一列有沒有進判定 */
export function slotSkipReason(slot: TalentSlot): SlotSkipReason | null {
  const built = buildSlotRule(slot);
  return typeof built === 'string' ? built : null;
}

/**
 * 組出某個類型的規則列表。
 *
 * 跳過的情況：
 * - 天賦格未安裝（躺在背包，§ 51.3.4）
 * - **動作槽留空** —— 該天賦格不參與判定（§ 51.3.1）
 * - **技能／道具還沒選定**（動作或條件）—— 判定往下一條走
 */
export function buildRules(
  type: TalentType,
  slots: TalentSlot[],
  templateId: string,
): BuiltRule[] {
  return slots
    .filter(s => isSlotInstalled(s) && s.assignedType === type && s.templateId === templateId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(buildSlotRule)
    .filter((r): r is BuiltRule => typeof r !== 'string');
}

export function buildCombatRules(slots: TalentSlot[], templateId: string): CombatRule[] {
  return buildRules('combat', slots, templateId) as unknown as CombatRule[];
}

export function buildPersistentRules(slots: TalentSlot[], templateId: string): PersistentRule[] {
  return buildRules('persistent', slots, templateId) as unknown as PersistentRule[];
}

export function buildVillageRules(slots: TalentSlot[], templateId: string): VillageRule[] {
  return buildRules('supply', slots, templateId) as unknown as VillageRule[];
}
