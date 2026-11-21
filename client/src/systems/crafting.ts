/**
 * 鐵匠鋪製作品的詞綴（`06-equipment-acquire.md` § 6A.6、`07-affix.md` § 7.2）：
 * 與商店／掉落同一支 `generateAffixes`，固定 4 條、Tier 依裝備階級範圍加權、無特殊詞綴。
 */
import { generateAffixes, getWeaponBaseDamage, CRAFT_AFFIX_TIER_RANGE, getCraftAffixTierWeights, type AffixCategory, type Affix } from '../models/affix';
import type { CraftMaterial, EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import { abilityToCrystal, yieldsAbilityCrystal, type AbilityCrystal } from '../models/abilityCrystal';
import { consumeBagItem, getBagItemAmount, type BagItem } from '../models/bagItem';
import {
  CRAFT_SOURCE_ORDER, findCraftPrerequisiteCandidates,
  type CraftPrerequisiteCandidate, type CraftSourceKind, type CraftSources,
} from './craftQuestSystem';

export function generateCraftAffixes(
  category: AffixCategory,
  tpl: { tier?: number; smallMonsterDamage?: number | null; largeMonsterDamage?: number | null },
): Affix[] {
  const range = CRAFT_AFFIX_TIER_RANGE[tpl.tier ?? 0];
  if (!range) throw new Error(`T${tpl.tier} 沒有製作詞綴範圍`);
  return generateAffixes(category, 1, 4, false, {
    minTier: range.min,
    maxTier: range.max,
    uniformTier: true,
    tierWeights: getCraftAffixTierWeights(range),
    noSpecialAffix: true,
    weaponBaseDamage: getWeaponBaseDamage(tpl),
  });
}

/**
 * 依來源順序扣製作素材（`06-equipment-acquire.md` § 6A.3「取用來源」），回傳扣完後各來源的素材。
 * 呼叫前須已確認三處合計足夠。
 */
export function drawCraftMaterials(
  materials: CraftMaterial[],
  sources: CraftSources,
): Record<CraftSourceKind, BagItem[]> {
  const result = {
    bag: sources.bag.materials,
    personal: sources.personal.materials,
    shared: sources.shared.materials,
  };
  for (const mat of materials) {
    let remaining = mat.amount;
    for (const source of CRAFT_SOURCE_ORDER) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, getBagItemAmount(result[source], mat.itemId));
      if (take <= 0) continue;
      result[source] = consumeBagItem(result[source], mat.itemId, take);
      remaining -= take;
    }
    if (remaining > 0) throw new Error(`素材 #${mat.itemId} 不足`);
  }
  return result;
}

/**
 * 玩家指定的前置裝備（§ 6A.3「取用來源」）。配方無前置回 []；
 * 未指定、件數不符、重複或不在背包／個人／帳號倉庫的候選內回 null。
 */
export function pickCraftPrerequisites(
  recipe: EquipmentTemplate,
  sources: CraftSources,
  prerequisiteIds: unknown,
): CraftPrerequisiteCandidate[] | null {
  const prereq = recipe.craftPrerequisiteWeapon;
  if (!prereq) return [];
  if (!Array.isArray(prerequisiteIds) || prerequisiteIds.length !== prereq.quantity) return null;
  if (new Set(prerequisiteIds).size !== prerequisiteIds.length) return null;
  const candidates = findCraftPrerequisiteCandidates(recipe, sources);
  const picked = prerequisiteIds.map(id => candidates.find(c => c.item.id === id));
  return picked.every(c => c !== undefined) ? picked as CraftPrerequisiteCandidate[] : null;
}

/** 拆解退還比例（`06-equipment-acquire.md` § 6A.3「拆解」），每種材料無條件進位 */
export const DISMANTLE_RETURN_RATE = 0.5;

/** 拆解退還的材料；無配方（非 `acquireType: 'craft'`）回 null。前置裝備不退 */
export function getDismantleYield(
  tpl: Pick<EquipmentTemplate, 'acquireType' | 'craftMaterials'> | undefined,
): CraftMaterial[] | null {
  if (!tpl || tpl.acquireType !== 'craft' || !tpl.craftMaterials?.length) return null;
  return tpl.craftMaterials.map(m => ({ itemId: m.itemId, amount: Math.ceil(m.amount * DISMANTLE_RETURN_RATE) }));
}

/** 拆解產出（§ 6A.3「拆解」、`07-affix-ability.md` § 7S.8）。兩者皆無＝不可拆 */
export interface DismantleOutcome {
  yields: CraftMaterial[] | null;
  crystal?: AbilityCrystal;
}

export function getDismantleOutcome(item: EquipmentInstance, template: EquipmentTemplate | undefined): DismantleOutcome {
  // 競技場擬態品不可拆（`55-arena.md` § 55.9）
  if (item.isMimicGear) return { yields: null };
  const crystal = template && yieldsAbilityCrystal(item) ? abilityToCrystal(item.ability!, template) : undefined;
  return { yields: getDismantleYield(template), crystal };
}
