/**
 * 鐵匠鋪製作品的詞綴（`06-equipment-acquire.md` § 6A.6、`07-affix.md` § 7.2）：
 * 與商店／掉落同一支 `generateAffixes`，固定 4 條、Tier 依裝備階級範圍加權、無特殊詞綴。
 */
import { generateAffixes, getWeaponBaseDamage, CRAFT_AFFIX_TIER_RANGE, CRAFT_AFFIX_TIER_WEIGHT, type AffixCategory, type Affix } from '../models/affix';
import type { CraftMaterial, EquipmentTemplate } from '../models/equipment';

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
    tierWeights: CRAFT_AFFIX_TIER_WEIGHT,
    noSpecialAffix: true,
    weaponBaseDamage: getWeaponBaseDamage(tpl),
  });
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
