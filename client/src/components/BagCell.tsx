/**
 * 背包格的長相與 tooltip 內容（`35-inventory-constraints.md` § 35.21.3、§ 35.6.4）。
 *
 * 抽出來是為了讓**交易視窗共用同一份**：交易裡看不到詞綴與數值的話，
 * 玩家等於閉著眼睛按確認。格線（`BagGrid`）與 tooltip 外框（`BagTooltip`）本來就共用，
 * 這裡補上中間那兩層 —— 格子內容與 tooltip 的數值區。
 *
 * **操作提示不在這裡**：「再點一次使用」之類的字是各面板自己的事，由 `hint` 傳進來。
 */
import type { ReactNode } from 'react';
import { GameIcon } from './GameIcon';
import { getShortName } from './BagGrid';
import { getEquipIcon, resolveItemIcon } from '../models/iconMap';
import { getItemById } from '../models/items';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';
import { formatMaterialUsage, hasMaterialUsage } from '../systems/craftMaterialUsage';
import { EquipmentDetail } from './EquipmentInfo';
import { SLOT_NAMES, type EquipmentInstance, type EquipSlot, type EquipmentTemplate } from '../models/equipment';
import { POTION_CONFIG, type PotionType, type SpeedPotionType } from '../stores/gameStore';
import { getCureItem, hasCurableDebuff } from '../models/cureItem';
import { roundWeight } from '../systems/weight';
import type { ActiveEffect } from '../models/effect';

export interface BagGridItem {
  id: string;
  type: 'potion' | 'material' | 'scroll' | 'equipment' | 'spellbook';
  /** 顯示用名稱。背包物品一律由 `itemId` 反查，不從狀態帶舊名 */
  name: string;
  /** 背包物品的道具 id（裝備格沒有） */
  itemId?: number;
  count?: number;
  potionType?: PotionType;
  speedPotionType?: SpeedPotionType;
  cureItemId?: number;
  equipment?: EquipmentInstance;
  /**
   * 這件裝備正穿在哪個部位（§ 35.1）。
   * 有值＝「裝備中」：一樣佔背包格，第二次點擊是卸下而不是穿上，且不可丟棄。
   */
  equippedSlot?: EquipSlot;
}

/** 素材與卷軸類的圖示鍵（裝備另有一套，走 `getEquipIcon`） */
function getItemIconKey(name: string, type: string): string {
  if (type === 'scroll') return 'scroll';
  if (type === 'spellbook') return 'spellbook';
  if (name.includes('磨刀石')) return 'whetstone';
  if (name.includes('石')) return 'stone';
  return 'material';
}

export function itemDef(item: { itemId?: number }) {
  return item.itemId != null ? getItemById(item.itemId) : undefined;
}

/** 堆疊總重。小數重量乘上數量會留浮點尾數並直接印在 tooltip 上，一律先收過 */
export function totalItemWeight(item: { itemId?: number; count?: number }): number {
  return roundWeight((itemDef(item)?.weight ?? 0) * (item.count ?? 1));
}

/** 格子內容：圖示、截短名稱、裝備中標記、數量、素材用途 */
export function BagCellVisual({ item, templates }: { item: BagGridItem; templates: EquipmentTemplate[] }) {
  return (
    <>
      {item.type === 'equipment' ? (
        <GameIcon
          name={getEquipIcon(item.equipment?.type === 'armor' ? (item.equipment?.slot || 'chest') : (item.equipment?.type || 'sword'))}
          size={24}
          color={item.equipment ? getEquipmentInstanceTierColor(item.equipment, templates) : undefined}
        />
      ) : (
        (() => {
          // 顯示方式一律以 item 定義為準（icon / iconColor / iconType / iconTier）
          const { icon, color, glowClass } = resolveItemIcon(itemDef(item), getItemIconKey(item.name, item.type));
          return <GameIcon name={icon} size={24} color={color} className={glowClass} />;
        })()
      )}
      <span className="bag-cell-name">{getShortName(item.name)}</span>
      {item.equippedSlot && (
        <span className="bag-cell-equipped" aria-label={`裝備中：${SLOT_NAMES[item.equippedSlot]}`}>
          裝備中
        </span>
      )}
      {item.count != null && item.count > 1 && (
        <span className="bag-cell-count">×{item.count}</span>
      )}
      {item.itemId != null && hasMaterialUsage(item.itemId) && (
        <span className="bag-cell-craft" title="有用途的素材" aria-label="有用途的素材">⚒</span>
      )}
    </>
  );
}

export interface BagItemTooltipProps {
  item: BagGridItem;
  templates: EquipmentTemplate[];
  /** 解狀態道具要知道現在身上有沒有能解的狀態；沒有就當作沒有 */
  activeEffects?: ActiveEffect[];
  /** 面板自己的操作提示（背包有「再點一次使用」，交易沒有） */
  hint?: ReactNode;
}

/** tooltip 的數值區。各面板的差異只在 `hint` */
export function BagItemTooltipBody({ item, templates, activeEffects = [], hint }: BagItemTooltipProps) {
  if (item.potionType) {
    const config = POTION_CONFIG[item.potionType];
    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">{item.name}</div>
        <div className="tooltip-stat">回復 {config.healMin}~{config.healMax} HP</div>
        <div className="tooltip-stat">冷卻 {config.cooldown}ms</div>
        <div className="tooltip-stat">重量: {totalItemWeight(item)}</div>
        <div className="tooltip-count">數量: {item.count}</div>
        {hint}
      </div>
    );
  }

  if (item.cureItemId != null) {
    const def = getCureItem(item.cureItemId);
    const curable = def ? hasCurableDebuff(def, activeEffects) : false;
    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">{item.name}</div>
        <div className="tooltip-stat">{def?.description ?? itemDef(item)?.description ?? ''}</div>
        <div className="tooltip-stat">重量: {totalItemWeight(item)}</div>
        <div className="tooltip-count">數量: {item.count}</div>
        {curable === false && hint === undefined ? null : hint}
      </div>
    );
  }

  if (item.speedPotionType) {
    return (
      <div className="bag-tooltip-content">
        <div className="tooltip-name">{item.name}</div>
        <div className="tooltip-stat">{itemDef(item)?.description ?? ''}</div>
        <div className="tooltip-stat">重量: {totalItemWeight(item)}</div>
        <div className="tooltip-count">數量: {item.count}</div>
        {hint}
      </div>
    );
  }

  if (item.equipment) {
    return (
      <div className="bag-tooltip-content">
        {item.equippedSlot && (
          <div className="tooltip-equipped">裝備中（{SLOT_NAMES[item.equippedSlot]}）</div>
        )}
        <EquipmentDetail item={item.equipment} templates={templates} />
        {hint}
      </div>
    );
  }

  const craftUsage = item.itemId != null ? formatMaterialUsage(item.itemId) : '';
  return (
    <div className="bag-tooltip-content">
      <div className="tooltip-name">{item.name}</div>
      <div className="tooltip-stat">重量: {totalItemWeight(item)}</div>
      {item.count && <div className="tooltip-count">數量: {item.count}</div>}
      {/* 顏色只表達稀有度，用途另外講明，免得玩家把配方材料賣掉 */}
      {craftUsage && <div className="tooltip-craft-usage">⚒ 用途：{craftUsage}</div>}
      {hint}
    </div>
  );
}
