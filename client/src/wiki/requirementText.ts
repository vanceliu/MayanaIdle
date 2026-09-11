/**
 * 素質需求的一行文字（`06-equipment.md` § 6A.8.8）。
 *
 * 只有防具與盾牌有需求，武器走職業限制（§ 6A.8），所以武器頁不列這一欄。
 *
 * Wiki 只是列表，沒有角色可以比對達不達標，所以不標紅 ——
 * 遊戲內的 `AttributeRequirement` 才做那件事。兩邊共用同一份項目與名稱。
 */
import { attributeRequirementEntries } from '../models/attributes';
import type { Attributes } from '../models/attributes';

export function requirementText(requirement?: Partial<Attributes>): string {
  if (!requirement) return '-';
  const entries = attributeRequirementEntries(requirement);
  if (entries.length === 0) return '-';
  return entries.map(e => `${e.label} ${e.value}`).join(' / ');
}
