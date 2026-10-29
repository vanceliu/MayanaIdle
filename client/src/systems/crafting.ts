/**
 * 鐵匠鋪製作品的詞綴（`06-equipment-acquire.md` § 6A.6、`07-affix.md` § 7.2）：
 * 與商店／掉落同一支 `generateAffixes`，固定 4 條、Tier 依裝備階級均等、無特殊詞綴。
 */
import { generateAffixes, getWeaponBaseDamage, CRAFT_AFFIX_TIER_RANGE, type AffixCategory, type Affix } from '../models/affix';

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
    noSpecialAffix: true,
    weaponBaseDamage: getWeaponBaseDamage(tpl),
  });
}
