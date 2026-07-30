export type ItemCategory = 'potion' | 'scroll' | 'material' | 'dungeon' | 'spellbook' | 'other';

export type MaterialIconType = 'ore' | 'fabric' | 'bone' | 'crystal' | 'misc' | 'spellbook-mat' | 'stone' | 'whetstone';

export interface ItemDefinition {
  id: number;
  name: string;
  category: ItemCategory;
  description: string;
  weight: number;
  buyPrice?: number;
  sellPrice?: number;
  healMin?: number;
  healMax?: number;
  cooldown?: number;

  // === 顯示方式 ===
  /** icon 路徑（相對於 assets/icons，不含副檔名）。非素材類道具以此為準。 */
  icon?: string;
  /** icon 著色 */
  iconColor?: string;
  /** 素材類專用：以材質分類決定 icon */
  iconType?: MaterialIconType;
  /** 素材類專用：以稀有度決定顏色 */
  iconTier?: number;
}

import { ITEM_DEFINITIONS } from '../db/seed';

const ITEM_MAP = new Map<string, ItemDefinition>(
  ITEM_DEFINITIONS.map(item => [item.name, item])
);

const ITEM_ID_MAP = new Map<number, ItemDefinition>(
  ITEM_DEFINITIONS.map(item => [item.id, item])
);

export function getItemDefinition(name: string): ItemDefinition | undefined {
  return ITEM_MAP.get(name);
}

export function getItemById(id: number): ItemDefinition | undefined {
  return ITEM_ID_MAP.get(id);
}

export function getItemWeight(name: string): number {
  return ITEM_MAP.get(name)?.weight ?? 0;
}

export function getItemDescription(name: string): string {
  return ITEM_MAP.get(name)?.description ?? '';
}

export function getItemBuyPrice(name: string): number {
  return ITEM_MAP.get(name)?.buyPrice ?? 0;
}
