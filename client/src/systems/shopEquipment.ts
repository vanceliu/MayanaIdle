/**
 * 商店裝備的購買生成（§ 6A.6）
 *
 * 武器店與防具店共用：商店裝在購買當下隨機生成 4 個詞綴，Tier 均等落在 T1~T3，
 * 並記錄 `maxAffixTier` 讓鐵匠鋪的詞綴強化也升不過 T3。
 * 購物車一次買多件時整批寫入，避免逐件 await 造成多次 DB 往返。
 */

import { db } from '../db/database';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import { generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage, SHOP_MAX_AFFIX_TIER } from '../models/affix';
import { resolveEquipment, rollNewInstanceFields } from './templateSync';

/**
 * 依模板清單生成裝備實例並寫入 DB，回傳解析完成的實例（順序與傳入清單一致）。
 * 同一個模板要買多件時，就在清單裡重複出現幾次。
 */
export async function createShopEquipment(
  templates: EquipmentTemplate[],
  charLevel: number,
  ownerId: number,
): Promise<EquipmentInstance[]> {
  if (templates.length === 0) return [];

  const drafts = templates.map(template => {
    // 武器詞綴的傷害係數要看武器基礎傷害；防具池不吃這個參數，別亂傳
    const isWeapon = template.slot === 'rightHand';
    const affixes = generateAffixes(
      getAffixCategoryForSlot(template.slot, template.type),
      charLevel,
      4,
      false,
      {
        maxTier: SHOP_MAX_AFFIX_TIER,
        uniformTier: true,
        noSpecialAffix: true,
        ...(isWeapon ? { weaponBaseDamage: getWeaponBaseDamage(template) } : {}),
      },
    );
    return { template, affixes };
  });

  const ids = await db.equipmentInstances.bulkAdd(
    drafts.map(d => ({
      templateId: d.template.id!,
      slot: d.template.slot,
      quality: 0,
      enhancement: 0,
      ...rollNewInstanceFields(d.template),
      affixes: d.affixes,
      maxAffixTier: SHOP_MAX_AFFIX_TIER,
      ownerId,
      equipped: false,
    })) as any,
    { allKeys: true },
  );

  return drafts.map((d, i) => resolveEquipment({
    id: (ids as unknown as number[])[i],
    templateId: d.template.id!,
    name: d.template.name,
    type: d.template.type,
    slot: d.template.slot,
    isTwoHanded: d.template.isTwoHanded,
    quality: 0,
    enhancement: 0,
    ...rollNewInstanceFields(d.template),
    affixes: d.affixes,
    maxAffixTier: SHOP_MAX_AFFIX_TIER,
    ownerId,
    equipped: false,
  }));
}
