/**
 * 管理介面角色查詢的物品格（`97-selfhosted-server.md` § 97.8）：裝備與道具排成遊戲背包同款的格子，
 * 圖示、顏色、簡稱沿用遊戲的 `iconMap`／`equipmentTier`／`bagItem`，詳細內容放在 tooltip。
 */
import { SLOT_NAMES, type EquipmentInstance, type EquipSlot } from '../../client/src/models/equipment';
import { getEquipmentInstanceTierColor } from '../../client/src/models/equipmentTier';
import { getEquipIcon, getItemIconKey, resolveItemIcon } from '../../client/src/models/iconMap';
import { getItemById } from '../../client/src/models/items';
import { getShortName, mapItemCategoryToBagType } from '../../client/src/models/bagItem';
import {
  AFFIX_SOCKETS, countSocketedAffixes, formatAffixDisplay, formatAffixDisplayParts, getAffixCategoryOf, getAffixSockets,
  getWeaponBaseDamage, isSpecialAffixType, shouldBoldAffix, type Affix,
} from '../../client/src/models/affix';
import { formatAbilityDisplay } from '../../client/src/models/ability';
import { formatUniqueAffixDisplay } from '../../client/src/models/uniqueAffix';
import { attributeRequirementEntries } from '../../client/src/models/attributes';
import { equipmentStatRows, getClassDisplay } from '../../client/src/models/equipmentDetail';
import { getEquipmentInstanceTierLevel } from '../../client/src/models/equipmentTier';
import { formatMaterialUsage } from '../../client/src/systems/craftMaterialUsage';
import { roundWeight } from '../../client/src/systems/weight';
import { getCachedTemplates } from '../../client/src/systems/templateSync';
import { ICONS } from './generated/iconsIndex';

/** tooltip 的一行；`cls` 對應管理頁的樣式（詞綴 Tier 色、隨機技能、空洞等，同遊戲 `.equip-detail-*`） */
export interface TipLine {
  cls?: string;
  parts: { text: string; cls?: string }[];
}

export interface ItemCell {
  icon: string;
  color?: string;
  shortName: string;
  name: string;
  amount?: number;
  enhancement?: number;
  /** 裝備中為部位名稱，否則為背包／倉庫 */
  place?: string;
  /** 名稱以下的內容，與遊戲背包 tooltip 相同（`components/EquipmentInfo.tsx`、`BagCell.tsx`） */
  tip: TipLine[];
}

const line = (text: string, cls?: string): TipLine => ({ cls, parts: [{ text }] });

/** 裝備說明（同遊戲 `EquipmentDetail` 完整模式）；素質是否達標與同類去重屬於玩家當下狀態，不列 */
function equipmentTip(e: EquipmentInstance): TipLine[] {
  const templates = getCachedTemplates();
  const tier = getEquipmentInstanceTierLevel(e, templates);
  const category = getAffixCategoryOf(e);
  const weaponBaseDamage = e.smallMonsterDamage || e.largeMonsterDamage ? getWeaponBaseDamage(e) : undefined;
  const affixLine = (a: Affix): TipLine => isSpecialAffixType(a.type)
    ? line(formatAffixDisplay(a), `affix special${a.sealed ? ' sealed' : ''}`)
    : line(
      formatAffixDisplayParts(a, e.quality, weaponBaseDamage, category).filter(p => !p.range).map(p => p.text).join(''),
      `affix tier-${a.tier}${shouldBoldAffix(a, category) ? ' max-roll' : ''}${a.sealed ? ' sealed' : ''}`,
    );
  const affixes = e.affixes ?? [];
  const emptySockets = e.isStarterGear ? 0 : Math.max(0, getAffixSockets(e) - countSocketedAffixes(affixes));
  const brokenSockets = e.isStarterGear ? 0 : AFFIX_SOCKETS - getAffixSockets(e);
  const requirement = e.requiredAttributes ? attributeRequirementEntries(e.requiredAttributes) : [];
  return [
    ...(e.equipped ? [line(`裝備中（${SLOT_NAMES[e.slot as EquipSlot] ?? e.slot}）`, 'equipped')] : []),
    line(`${SLOT_NAMES[e.slot as EquipSlot] ?? ''}${e.isTwoHanded ? '（雙手）' : ''}`, 'slot'),
    ...(tier > 0 ? [line(`裝備Tier: ${tier}`, 'tier')] : []),
    ...equipmentStatRows(e).map(row => ({ cls: 'tip-stat', parts: row.parts.map(p => ({ text: p.text, cls: p.maxRoll ? 'max-roll' : undefined })) })),
    ...(!e.requiredAttributes || (e.requiredClass?.length ?? 0) > 0 ? [line(`可用職業: ${getClassDisplay(e.requiredClass)}`, 'tip-stat')] : []),
    ...(requirement.length ? [line(`素質需求: ${requirement.map(r => `${r.label} ${r.value}`).join(' / ')}`, 'tip-stat')] : []),
    ...(e.ability ? [line(formatAbilityDisplay(e.ability), 'affix ability')] : []),
    ...(e.uniqueAffix ? [line(formatUniqueAffixDisplay(e.uniqueAffix), 'affix unique')] : []),
    ...affixes.filter(a => !a.sealed).map(affixLine),
    ...Array.from({ length: emptySockets }, () => line('空洞', 'affix empty-socket')),
    ...Array.from({ length: brokenSockets }, () => line('已毀壞', 'affix broken-socket')),
    ...affixes.filter(a => a.sealed).map(affixLine),
  ];
}

export interface ItemCells {
  equipped: ItemCell[];
  bag: ItemCell[];
  storage: ItemCell[];
  /** 用到的圖示：名稱 → SVG */
  icons: Record<string, string>;
}

function equipmentCell(e: EquipmentInstance): ItemCell {
  const name = e.name ?? `#${e.templateId}`;
  return {
    icon: getEquipIcon(e.type === 'armor' ? (e.slot || 'chest') : (e.type || 'sword')),
    color: getEquipmentInstanceTierColor(e, getCachedTemplates()),
    shortName: getShortName(name),
    name,
    enhancement: e.enhancement ?? 0,
    place: e.equipped ? (SLOT_NAMES[e.slot as EquipSlot] ?? '裝備中') : e.inStorage ? '倉庫' : '背包',
    tip: equipmentTip(e),
  };
}

/** 背包道具一律依 `itemId` 反查名稱與圖示（`99-ai-constraints.md` § 99.1 第 7 條） */
function itemCell(itemId: number, amount: number): ItemCell {
  const def = getItemById(itemId);
  const name = def?.name ?? `#${itemId}`;
  const { icon, color } = resolveItemIcon(def, getItemIconKey(name, def ? mapItemCategoryToBagType(def.category) : 'material'));
  const usage = formatMaterialUsage(itemId);
  return {
    icon, color, shortName: def?.shortName ?? getShortName(name), name, amount,
    tip: [
      line(`重量: ${roundWeight((def?.weight ?? 0) * amount)}`, 'tip-stat'),
      line(`數量: ${amount}`, 'count'),
      ...(usage ? [line(`⚒ 用途：${usage}`, 'usage')] : []),
    ],
  };
}

/** `equipment` 為已套模板（`resolveEquipment()`）的實例；`bag` 為背包道具的 id 與數量 */
export function buildItemCells(equipment: EquipmentInstance[], bag: { itemId: number; amount: number }[]): ItemCells {
  const cells = {
    equipped: equipment.filter(e => e.equipped).map(equipmentCell),
    bag: [...equipment.filter(e => !e.equipped && !e.inStorage).map(equipmentCell), ...bag.map(b => itemCell(b.itemId, b.amount))],
    storage: equipment.filter(e => !e.equipped && e.inStorage).map(equipmentCell),
  };
  const icons: Record<string, string> = {};
  for (const c of [...cells.equipped, ...cells.bag, ...cells.storage]) {
    if (ICONS[c.icon]) icons[c.icon] = ICONS[c.icon];
  }
  return { ...cells, icons };
}
