import type { ReactNode } from 'react';
import { Tooltip } from '../Tooltip';
import { GameIcon } from '../GameIcon';
import { BagItemTooltipBody, type BagGridItem } from '../BagCell';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getEquipmentInstanceTierColor, getEquipmentTierColor } from '../../models/equipmentTier';
import { getItemById } from '../../models/items';
import { mapItemCategoryToBagType } from '../../models/bagItem';
import { POTION_CONFIG, SPEED_POTION_CONFIG, type PotionType, type SpeedPotionType } from '../../stores/gameStore';
import { getBuffPotionType } from '../../models/buffPotion';
import { isCureItem } from '../../models/cureItem';

/** 清單一列：名稱（hover 顯示完整內容）＋價格＋數量選擇（倉庫／商店共用，`34-ui-guidelines.md` 使用場景表） */
export function ItemListRow({ label, tooltip, price, priceClassName, children }: {
  label: ReactNode;
  tooltip: ReactNode;
  price?: string;
  priceClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="storage-item item-list-row">
      <Tooltip position="right" content={tooltip}>
        <span className="storage-equip-name">{label}</span>
      </Tooltip>
      {price && <span className={`shop-item-price item-list-price${priceClassName ? ` ${priceClassName}` : ''}`}>{price}</span>}
      <div className="storage-item-actions">{children}</div>
    </div>
  );
}

/** 裝備實例名稱：icon＋名稱＋強化，Tier 色 */
export function EquipmentInstanceLabel({ item, templates }: { item: EquipmentInstance; templates: EquipmentTemplate[] }) {
  const color = getEquipmentInstanceTierColor(item, templates);
  const enhancement = item.enhancement ?? 0;
  return (
    <>
      <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={16} color={color} />
      <span className="item-list-name" style={{ color }}>{item.name}{enhancement > 0 ? ` +${enhancement}` : ''}</span>
    </>
  );
}

/** 裝備模板名稱：icon＋名稱，Tier 色 */
export function EquipmentTemplateLabel({ template }: { template: EquipmentTemplate }) {
  const color = getEquipmentTierColor(template);
  return (
    <>
      <GameIcon name={getEquipIcon(template.type === 'armor' ? template.slot : template.type)} size={16} color={color} />
      <span className="item-list-name" style={{ color }}>{template.name}</span>
    </>
  );
}

/** 道具名稱：icon＋名稱＋後綴（數量、用途標記）；空間不足時只截名稱，後綴保留 */
export function ItemLabel({ itemId, name, suffix }: { itemId: number; name: string; suffix?: ReactNode }) {
  const def = getItemById(itemId);
  const { icon, color, glowClass } = resolveItemIcon(def, def?.category === 'scroll' || def?.category === 'dungeon' ? 'scroll' : 'material');
  return (
    <>
      <GameIcon name={icon} size={16} color={color} className={glowClass} />
      <span className="item-list-name">{name}</span>{suffix}
    </>
  );
}

/** 道具 → `BagItemTooltipBody` 的輸入；`count` 省略時 tooltip 不印數量 */
export function itemTooltipCell(itemId: number, count?: number): BagGridItem {
  const def = getItemById(itemId);
  const potionType = (Object.keys(POTION_CONFIG) as PotionType[]).find(k => POTION_CONFIG[k].itemId === itemId);
  const speedPotionType = (Object.keys(SPEED_POTION_CONFIG) as SpeedPotionType[]).find(k => SPEED_POTION_CONFIG[k].itemId === itemId);
  return {
    id: `item-${itemId}`,
    type: def ? mapItemCategoryToBagType(def.category) : 'material',
    name: def?.name ?? `#${itemId}`,
    itemId,
    count,
    potionType,
    speedPotionType,
    buffPotionType: getBuffPotionType(itemId),
    cureItemId: isCureItem(itemId) ? itemId : undefined,
  };
}

/** 道具 tooltip：沿用背包的 `BagItemTooltipBody`；背包版不印說明的類別（卷軸、素材）補一行說明 */
export function ItemTooltip({ itemId, count }: { itemId: number; count?: number }) {
  const cell = itemTooltipCell(itemId, count);
  const bodyHasDescription = cell.potionType != null || cell.cureItemId != null
    || cell.speedPotionType != null || cell.buffPotionType != null;
  const description = getItemById(itemId)?.description;
  return (
    <BagItemTooltipBody
      item={cell}
      templates={[]}
      hint={!bodyHasDescription && description ? <div className="tooltip-stat">{description}</div> : undefined}
    />
  );
}
