import type { CraftQuest } from '../models/craftQuest';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../models/craftQuest';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import type { BagItem } from '../models/bagItem';
import { getBagItemAmount } from '../models/bagItem';

/**
 * 製作任務（`36-quest-system.md` § 36.13）
 *
 * 需求評估是**鐵匠鋪製作按鈕與製作任務外框共用的唯一一支判定**（§ 36.13.3）：
 * 兩邊各寫一份的話，只要有人改了其中一邊，任務就會顯示「可製作」但按下去做不出來。
 */

export interface CraftMaterialStatus {
  itemId: number;
  have: number;
  need: number;
  enough: boolean;
}

export interface CraftPrerequisiteStatus {
  templateId: number;
  have: number;
  need: number;
  enough: boolean;
}

export interface CraftRequirementStatus {
  materials: CraftMaterialStatus[];
  /** 配方沒有前置裝備需求時為 null（T4／T6 與防具皆是） */
  prerequisite: CraftPrerequisiteStatus | null;
  /** 素材與前置皆滿足 */
  ready: boolean;
}

/**
 * 評估某配方當下的需求狀態（§ 36.13.3）。
 *
 * 沒有累積進度 —— 每次都由當下背包即時算，
 * 事後把素材或前置裝備賣掉，`ready` 就會跟著掉回 false。
 */
export function evaluateCraftRequirements(
  recipe: EquipmentTemplate,
  bagItems: BagItem[],
  inventory: EquipmentInstance[],
): CraftRequirementStatus {
  const materials: CraftMaterialStatus[] = (recipe.craftMaterials ?? []).map(mat => {
    const have = getBagItemAmount(bagItems, mat.itemId);
    return { itemId: mat.itemId, have, need: mat.amount, enough: have >= mat.amount };
  });

  let prerequisite: CraftPrerequisiteStatus | null = null;
  if (recipe.craftPrerequisiteWeapon) {
    // 前置一律以 templateId 比對，不用名稱（§ 99.1 第 3 條）
    const { templateId, quantity } = recipe.craftPrerequisiteWeapon;
    const have = inventory.filter(i => i.templateId === templateId).length;
    prerequisite = { templateId, have, need: quantity, enough: have >= quantity };
  }

  // 沒有 craftMaterials 的模板不是「零需求配方」，是根本不能製作的模板。
  // 製作費一律 0（§ 6A.3），可製作與否不看 craftGold
  const isCraftable = !!recipe.craftMaterials?.length;
  const ready = isCraftable
    && materials.every(m => m.enough)
    && (prerequisite?.enough ?? true);

  return { materials, prerequisite, ready };
}

/** § 36.13.2：上限 3 個、同一配方只能追蹤一張。無法加入時回傳 null */
export function acceptCraftQuest(
  quests: CraftQuest[],
  templateId: number,
): CraftQuest[] | null {
  if (quests.length >= MAX_ACTIVE_CRAFT_QUESTS) return null;
  if (quests.some(q => q.templateId === templateId)) return null;
  return [...quests, { id: `craft-${templateId}`, templateId }];
}

/** § 36.13.5：取消追蹤，無代價（不動貢獻） */
export function abandonCraftQuest(quests: CraftQuest[], questId: string): CraftQuest[] {
  return quests.filter(q => q.id !== questId);
}

/**
 * § 36.13.5 第 1 點：製作成功後移除同配方的任務。
 * 只比對 templateId —— 玩家沒加進追蹤就直接製作時，這裡是 no-op。
 */
export function removeCraftQuestByTemplate(quests: CraftQuest[], templateId: number): CraftQuest[] {
  return quests.filter(q => q.templateId !== templateId);
}

export function hasCraftQuestFor(quests: CraftQuest[], templateId: number): boolean {
  return quests.some(q => q.templateId === templateId);
}
