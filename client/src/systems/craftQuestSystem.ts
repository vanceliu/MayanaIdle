import type { CraftQuest } from '../models/craftQuest';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../models/craftQuest';
import type { CraftMaterial, CraftPrerequisiteWeapon, EquipmentInstance, EquipmentTemplate } from '../models/equipment';
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

/**
 * 配方種類：一般製作（`craftMaterials`，§ 6A.3）與獨特製作（`uniqueCraftMaterials`，§ 6A.3.1）。
 * 同模板的兩種配方是兩個配方（`36-quest-system.md` § 36.13.2）。
 */
export type CraftRecipeKind = 'normal' | 'unique';

/** 獨特製作的前置裝備不可用原因（§ 6A.3.1）：製作品 (獨)、擬態品 (擬) */
export type UniqueCraftPrerequisiteBlock = 'uniqueCrafted' | 'mimic';

export const UNIQUE_CRAFT_PREREQUISITE_BLOCK_TEXT: Readonly<Record<UniqueCraftPrerequisiteBlock, string>> = {
  uniqueCrafted: '獨特製作品不可用',
  mimic: '擬態品不可用',
};

export function getUniqueCraftPrerequisiteBlock(item: EquipmentInstance): UniqueCraftPrerequisiteBlock | null {
  if (item.isUniqueCraftedGear) return 'uniqueCrafted';
  if (item.isMimicGear) return 'mimic';
  return null;
}

/** 該配方的材料：一般配方 `craftMaterials`、獨特配方 `uniqueCraftMaterials` */
export function getRecipeMaterials(recipe: EquipmentTemplate, kind: CraftRecipeKind): CraftMaterial[] {
  return (kind === 'unique' ? recipe.uniqueCraftMaterials : recipe.craftMaterials) ?? [];
}

/** 配方可否製作：一般配方看 `craftMaterials`，獨特配方另需 `uniqueCraftMaterials` */
export function isRecipeCraftable(recipe: EquipmentTemplate, kind: CraftRecipeKind): boolean {
  if (!recipe.craftMaterials?.length) return false;
  return kind === 'normal' || !!recipe.uniqueCraftMaterials?.length;
}

/** 前置裝備需求：一般配方取 `craftPrerequisiteWeapon`；獨特配方固定同模板 ×1 */
export function getRecipePrerequisite(recipe: EquipmentTemplate, kind: CraftRecipeKind): CraftPrerequisiteWeapon | undefined {
  return kind === 'unique' ? { templateId: recipe.id!, quantity: 1 } : recipe.craftPrerequisiteWeapon;
}

/** 三處中與前置模板相同的全部實例（含不可用者），依來源順序；以 templateId 比對，不用名稱（§ 99.1 第 3 條） */
export function listCraftPrerequisiteOptions(
  recipe: EquipmentTemplate,
  sources: CraftSources,
  kind: CraftRecipeKind = 'normal',
): CraftPrerequisiteCandidate[] {
  const prereq = getRecipePrerequisite(recipe, kind);
  if (!prereq) return [];
  return CRAFT_SOURCE_ORDER.flatMap(source => sources[source].equipment
    .filter(item => item.templateId === prereq.templateId && !item.equipped)
    .map(item => ({ source, item })));
}

/** 三處中可當前置裝備的實例；獨特配方排除 (獨)、(擬)（§ 6A.3.1） */
export function findCraftPrerequisiteCandidates(
  recipe: EquipmentTemplate,
  sources: CraftSources,
  kind: CraftRecipeKind = 'normal',
): CraftPrerequisiteCandidate[] {
  const options = listCraftPrerequisiteOptions(recipe, sources, kind);
  return kind === 'unique' ? options.filter(c => getUniqueCraftPrerequisiteBlock(c.item) === null) : options;
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
  kind: CraftRecipeKind = 'normal',
): CraftRequirementStatus {
  const materials: CraftMaterialStatus[] = getRecipeMaterials(recipe, kind).map(mat => {
    const bySource = getMaterialStock(sources, mat.itemId);
    const have = bySource.bag + bySource.personal + bySource.shared;
    return { itemId: mat.itemId, have, need: mat.amount, enough: have >= mat.amount, bySource };
  });

  let prerequisite: CraftPrerequisiteStatus | null = null;
  const prereq = getRecipePrerequisite(recipe, kind);
  if (prereq) {
    const { templateId, quantity } = prereq;
    const have = findCraftPrerequisiteCandidates(recipe, sources, kind).length;
    prerequisite = { templateId, have, need: quantity, enough: have >= quantity };
  }

  const goldNeed = recipe.craftGold ?? 0;
  const goldStatus: CraftGoldStatus = { have: gold, need: goldNeed, enough: gold >= goldNeed };

  // 沒有配方材料的模板不是「零需求配方」，是根本不能製作的模板
  const isCraftable = isRecipeCraftable(recipe, kind);
  const ready = isCraftable
    && materials.every(m => m.enough)
    && (prerequisite?.enough ?? true)
    && goldStatus.enough;

  return { materials, prerequisite, gold: goldStatus, ready };
}

/** 追蹤的是哪一種配方；舊資料沒有 `unique` 欄位＝一般配方 */
export function getCraftQuestKind(quest: CraftQuest): CraftRecipeKind {
  return quest.unique ? 'unique' : 'normal';
}

/** 任務 id：一般配方 `craft-<id>`、獨特配方 `craft-unique-<id>` */
export function craftQuestId(templateId: number, kind: CraftRecipeKind = 'normal'): string {
  return kind === 'unique' ? `craft-unique-${templateId}` : `craft-${templateId}`;
}

/** § 36.13.2：上限 3 個、同一配方只能追蹤一張。無法加入時回傳 null */
export function acceptCraftQuest(
  quests: CraftQuest[],
  templateId: number,
  kind: CraftRecipeKind = 'normal',
): CraftQuest[] | null {
  if (quests.length >= MAX_ACTIVE_CRAFT_QUESTS) return null;
  if (hasCraftQuestFor(quests, templateId, kind)) return null;
  const quest: CraftQuest = { id: craftQuestId(templateId, kind), templateId, ...(kind === 'unique' ? { unique: true as const } : {}) };
  return [...quests, quest];
}

/** § 36.13.5：取消追蹤，無代價（不動貢獻） */
export function abandonCraftQuest(quests: CraftQuest[], questId: string): CraftQuest[] {
  return quests.filter(q => q.id !== questId);
}

/**
 * § 36.13.5 第 1 點：製作成功後移除同配方的任務（同模板、同種類）。
 * 玩家沒加進追蹤就直接製作時，這裡是 no-op。
 */
export function removeCraftQuestByTemplate(quests: CraftQuest[], templateId: number, kind: CraftRecipeKind = 'normal'): CraftQuest[] {
  return quests.filter(q => q.templateId !== templateId || getCraftQuestKind(q) !== kind);
}

export function hasCraftQuestFor(quests: CraftQuest[], templateId: number, kind: CraftRecipeKind = 'normal'): boolean {
  return quests.some(q => q.templateId === templateId && getCraftQuestKind(q) === kind);
}
