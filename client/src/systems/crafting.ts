/**
 * 鐵匠鋪製作品的詞綴（`06-equipment-acquire.md` § 6A.3、`07-affix.md` § 7.2）：
 * 與商店／掉落同一支 `generateAffixes`，製作版最高 T5、同 Tier、無特殊詞綴。
 */
import { generateAffixes, getWeaponBaseDamage, CRAFT_MAX_AFFIX_TIER, type AffixCategory, type Affix } from '../models/affix';

export function generateCraftAffixes(
  category: AffixCategory,
  tpl?: { smallMonsterDamage?: number | null; largeMonsterDamage?: number | null },
): Affix[] {
  return generateAffixes(category, 1, 4, false, {
    maxTier: CRAFT_MAX_AFFIX_TIER,
    uniformTier: true,
    noSpecialAffix: true,
    ...(tpl ? { weaponBaseDamage: getWeaponBaseDamage(tpl) } : {}),
  });
}
