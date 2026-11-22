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

/** 製作可取用的來源，依扣除順序排列（`06-equipment-acquire.md` § 6A.3「取用來源」）；公會倉庫不算 */
export const CRAFT_SOURCE_ORDER = ['bag', 'personal', 'shared'] as const;
export type CraftSourceKind = typeof CRAFT_SOURCE_ORDER[number];

export interface CraftSourceStock {
  materials: BagItem[];
  equipment: EquipmentInstance[];
}

export type CraftSources = Record<CraftSourceKind, CraftSourceStock>;

/** 由 store 欄位組出製作來源：背包、個人倉庫、帳號倉庫 */
export function getCraftSources(state: {
  bagItems: BagItem[];
  inventory: EquipmentInstance[];
  personalStoredMaterials: BagItem[];
  personalStoredEquipment: EquipmentInstance[];
  storedMaterials: BagItem[];
  storedEquipment: EquipmentInstance[];
}): CraftSources {
  return {
    bag: { materials: state.bagItems, equipment: state.inventory },
    personal: { materials: state.personalStoredMaterials, equipment: state.personalStoredEquipment },
    shared: { materials: state.storedMaterials, equipment: state.storedEquipment },
  };
}

/** 某道具在各來源的存量 */
export function getMaterialStock(sources: CraftSources, itemId: number): Record<CraftSourceKind, number> {
  return {
    bag: getBagItemAmount(sources.bag.materials, itemId),
    personal: getBagItemAmount(sources.personal.materials, itemId),
    shared: getBagItemAmount(sources.shared.materials, itemId),
  };
}

/** 某道具三處合計 */
export function getMaterialTotal(sources: CraftSources, itemId: number): number {
  const stock = getMaterialStock(sources, itemId);
  return stock.bag + stock.personal + stock.shared;
}

export interface CraftMaterialStatus {
  itemId: number;
  /** 三處合計 */
  have: number;
  need: number;
  enough: boolean;
  bySource: Record<CraftSourceKind, number>;
}

export interface CraftPrerequisiteStatus {
  templateId: number;
  have: number;
  need: number;
  enough: boolean;
}

export interface CraftGoldStatus {
  have: number;
  need: number;
  enough: boolean;
}

export interface CraftRequirementStatus {
  materials: CraftMaterialStatus[];
  /** 配方沒有前置裝備需求時為 null（T4／T6 與防具皆是） */
  prerequisite: CraftPrerequisiteStatus | null;
  /** 製作費（`06-equipment-acquire.md` § 6A.3） */
  gold: CraftGoldStatus;
  /** 素材、前置與金幣皆滿足 */
  ready: boolean;
}

export interface CraftPrerequisiteCandidate {
  source: CraftSourceKind;
  item: EquipmentInstance;
}

/** 三處中可當前置裝備的實例，依來源順序；前置一律以 templateId 比對，不用名稱（§ 99.1 第 3 條） */
export function findCraftPrerequisiteCandidates(
  recipe: EquipmentTemplate,
  sources: CraftSources,
): CraftPrerequisiteCandidate[] {
  const prereq = recipe.craftPrerequisiteWeapon;
  if (!prereq) return [];
  return CRAFT_SOURCE_ORDER.flatMap(source => sources[source].equipment
    .filter(item => item.templateId === prereq.templateId)
    .map(item => ({ source, item })));
}

/**
 * 評估某配方當下的需求狀態（§ 36.13.3）。
 *
 * 沒有累積進度 —— 每次都由當下背包、倉庫與金幣即時算，
 * 事後把素材、前置裝備或金幣花掉，`ready` 就會跟著掉回 false。
 */
export function evaluateCraftRequirements(
  recipe: EquipmentTemplate,
  sources: CraftSources,
  gold: number,
): CraftRequirementStatus {
  const materials: CraftMaterialStatus[] = (recipe.craftMaterials ?? []).map(mat => {
    const bySource = getMaterialStock(sources, mat.itemId);
    const have = bySource.bag + bySource.personal + bySource.shared;
    return { itemId: mat.itemId, have, need: mat.amount, enough: have >= mat.amount, bySource };
  });

  let prerequisite: CraftPrerequisiteStatus | null = null;
  if (recipe.craftPrerequisiteWeapon) {
    const { templateId, quantity } = recipe.craftPrerequisiteWeapon;
    const have = findCraftPrerequisiteCandidates(recipe, sources).length;
    prerequisite = { templateId, have, need: quantity, enough: have >= quantity };
  }

  const goldNeed = recipe.craftGold ?? 0;
  const goldStatus: CraftGoldStatus = { have: gold, need: goldNeed, enough: gold >= goldNeed };

  // 沒有 craftMaterials 的模板不是「零需求配方」，是根本不能製作的模板
  const isCraftable = !!recipe.craftMaterials?.length;
  const ready = isCraftable
    && materials.every(m => m.enough)
    && (prerequisite?.enough ?? true)
    && goldStatus.enough;

  return { materials, prerequisite, gold: goldStatus, ready };
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
